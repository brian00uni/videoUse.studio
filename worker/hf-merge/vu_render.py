"""Render an EDL to mp4 — ported from browser-use/video-use helpers/render.py.

Pipeline (order matters):
  1. Per-segment extract: scale to 1080p + optional grade + 30ms audio fades
  2. Lossless -c copy concat into base.mp4
  3. If subtitles: burn them LAST via the subtitles filter

Overlays, auto-grade analysis, and two-pass loudnorm are deferred to later
phases; the EDL schema already carries the fields so adding them is additive.

Usable two ways:
  - imported:  render_edl(edl_dict, out_path, work_dir)   # from app.py
  - CLI:       python render.py edl.json -o final.mp4     # local testing
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# HDR (PQ / HLG) → SDR tone map. iPhone/mirrorless often ship HDR; without this
# an 8-bit downconvert keeps HDR transfer metadata and looks blown out.
HDR_TRANSFERS = {"smpte2084", "arib-std-b67"}
TONEMAP_CHAIN = (
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
    "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
)

# Proven subtitle style (2-word UPPERCASE chunks land via the SRT; this is the look).
SUB_FORCE_STYLE = (
    "FontName=Helvetica,FontSize=18,Bold=1,"
    "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,"
    "BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=90"
)


def _probe(video: Path, entries: str) -> str:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", entries, "-of", "csv=p=0", str(video)],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def is_hdr(video: Path) -> bool:
    try:
        return _probe(video, "stream=color_transfer") in HDR_TRANSFERS
    except Exception:
        return False


def is_portrait(video: Path) -> bool:
    try:
        w, h = map(int, _probe(video, "stream=width,height").split(","))
        return h > w
    except Exception:
        return False


def resolve_grade(grade: str | None) -> str:
    """EDL 'grade' is a raw ffmpeg filter or a small set of named presets."""
    if not grade:
        return ""
    presets = {
        "warm_cinematic": "eq=contrast=1.06:saturation=1.05:gamma=0.98,curves=preset=increase_contrast",
        "neutral_punch": "eq=contrast=1.08:saturation=1.02",
        "clean": "eq=contrast=1.03:saturation=0.98",
    }
    if re.fullmatch(r"[a-zA-Z0-9_\-]+", grade):
        return presets.get(grade, "")
    return grade  # raw filter chain


def extract_segment(source: Path, start: float, duration: float,
                    grade_filter: str, out_path: Path) -> None:
    """One EDL range → its own mp4 with scale + grade + 30ms audio fades baked in."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    scale = "scale=-2:1920" if is_portrait(source) else "scale=1920:-2"

    vf_parts = []
    if is_hdr(source):
        vf_parts.append(TONEMAP_CHAIN)
    vf_parts.append(scale)
    if grade_filter:
        vf_parts.append(grade_filter)
    vf = ",".join(vf_parts)

    fade_out = max(0.0, duration - 0.03)
    af = f"afade=t=in:st=0:d=0.03,afade=t=out:st={fade_out:.3f}:d=0.03"

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{duration:.3f}",
        "-vf", vf, "-af", af,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "24",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def concat(segments: list[Path], out_path: Path, work_dir: Path) -> None:
    """Lossless concat via the concat demuxer — no re-encode."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    listing = work_dir / "_concat.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in segments))
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c", "copy", "-movflags", "+faststart", str(out_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    listing.unlink(missing_ok=True)


def burn_subtitles(base: Path, srt: Path, out_path: Path) -> None:
    subs = str(srt.resolve()).replace(":", r"\:").replace("'", r"\'")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(base),
         "-vf", f"subtitles='{subs}':force_style='{SUB_FORCE_STYLE}'",
         "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "copy", "-movflags", "+faststart", str(out_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )


def render_edl(edl: dict, out_path: Path, work_dir: Path,
               resolve_source=None) -> Path:
    """Render an EDL dict to out_path.

    resolve_source(source_id) -> local Path. Defaults to treating the EDL's
    sources map values as local paths (the HF worker passes a downloader that
    fetches signed Supabase URLs to a temp dir).
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    sources = edl["sources"]
    if resolve_source is None:
        def resolve_source(sid: str) -> Path:  # type: ignore
            return Path(sources[sid])

    grade_filter = resolve_grade(edl.get("grade"))

    segments: list[Path] = []
    for i, r in enumerate(edl["ranges"]):
        src = resolve_source(r["source"])
        start = float(r["start"])
        duration = float(r["end"]) - start
        seg = work_dir / f"seg_{i:02d}.mp4"
        extract_segment(src, start, duration, grade_filter, seg)
        segments.append(seg)

    base = work_dir / "base.mp4"
    concat(segments, base, work_dir)

    subs = edl.get("subtitles")
    if subs:
        srt = Path(subs)
        if srt.exists():
            burn_subtitles(base, srt, out_path)
            return out_path

    subprocess.run(["ffmpeg", "-y", "-i", str(base), "-c", "copy", str(out_path)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return out_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Render a video from an EDL")
    ap.add_argument("edl", type=Path)
    ap.add_argument("-o", "--output", type=Path, required=True)
    ap.add_argument("--work-dir", type=Path)
    args = ap.parse_args()

    if not args.edl.exists():
        sys.exit(f"edl not found: {args.edl}")
    edl = json.loads(args.edl.read_text())
    work_dir = args.work_dir or args.output.resolve().parent / "_work"
    out = render_edl(edl, args.output.resolve(), work_dir)
    size = out.stat().st_size / (1024 * 1024)
    print(f"done: {out} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
