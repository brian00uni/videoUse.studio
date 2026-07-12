"""Transcribe a video with faster-whisper — the HF replacement for ElevenLabs Scribe.

Extracts mono 16kHz audio via ffmpeg, runs Whisper with word-level timestamps,
and emits the SAME shape the reference pipeline used so the SRT builder and the
transcript packer work unchanged:

    {
      "text": "...",
      "duration": 43.0,
      "words": [
        {"type": "word", "text": "Ninety", "start": 2.52, "end": 2.78, "speaker": "S0"},
        ...
      ]
    }

Speaker diarization is a single speaker ("S0") for now. Multi-speaker (pyannote)
is additive — see the TODO below.

CLI: python transcribe.py <video> [--model base] [--language en]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

_MODEL_CACHE: dict[str, Any] = {}


def extract_audio(video: Path, dest: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", str(dest)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _get_model(model_size: str):
    if model_size not in _MODEL_CACHE:
        from faster_whisper import WhisperModel  # imported lazily; heavy dep

        # int8 keeps it CPU-friendly for a free/basic HF Space.
        _MODEL_CACHE[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _MODEL_CACHE[model_size]


def transcribe_file(
    video: Path,
    model_size: str = "base",
    language: str | None = None,
    num_speakers: int | None = None,  # reserved for pyannote diarization
) -> dict[str, Any]:
    model = _get_model(model_size)

    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "audio.wav"
        extract_audio(video, wav)
        segments, info = model.transcribe(
            str(wav), language=language, word_timestamps=True,
            vad_filter=True,  # trims non-speech, tightens word boundaries
        )

        words: list[dict[str, Any]] = []
        text_parts: list[str] = []
        for seg in segments:
            text_parts.append(seg.text)
            for w in (seg.words or []):
                words.append({
                    "type": "word",
                    "text": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "speaker": "S0",  # TODO: pyannote diarization when num_speakers>1
                })

    return {
        "text": "".join(text_parts).strip(),
        "duration": round(getattr(info, "duration", 0.0), 3),
        "language": getattr(info, "language", language),
        "words": words,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Transcribe a video with faster-whisper")
    ap.add_argument("video", type=Path)
    ap.add_argument("--model", default="base")
    ap.add_argument("--language")
    ap.add_argument("-o", "--output", type=Path)
    args = ap.parse_args()

    if not args.video.exists():
        sys.exit(f"video not found: {args.video}")
    result = transcribe_file(args.video, model_size=args.model, language=args.language)
    out = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(out)
        print(f"wrote {args.output} ({len(result['words'])} words)")
    else:
        print(out)


if __name__ == "__main__":
    main()
