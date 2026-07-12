"""videoUse.studio — render worker (Hugging Face Space).

Runs the heavy compute the browser/serverless can't: Whisper transcription
and the ffmpeg render pipeline. Deploy as an HF Space (Docker/FastAPI) and
point the frontend at it via VITE_WORKER_URL.

Endpoints:
  GET  /health       liveness
  POST /transcribe   audio → word-level transcript + diarization
  POST /render       EDL (src/lib/types.ts) → final.mp4 (uploaded, path returned)
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

import render as render_mod
import transcribe as transcribe_mod

app = FastAPI(title="videoUse.studio worker")

WORKER_TOKEN = os.environ.get("WORKER_TOKEN")  # shared secret with the backend


def _auth(token: str | None) -> None:
    if WORKER_TOKEN and token != WORKER_TOKEN:
        raise HTTPException(401, "bad worker token")


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return dest


class TranscribeRequest(BaseModel):
    source_url: str          # signed Supabase Storage URL
    language: str | None = None
    num_speakers: int | None = None


class RenderRequest(BaseModel):
    edl: dict[str, Any]      # matches Edl in src/lib/types.ts
    # source_urls: signed URLs keyed by the same ids as edl.sources
    source_urls: dict[str, str]
    upload_url: str | None = None   # presigned PUT for the result (optional)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
def transcribe(req: TranscribeRequest, x_worker_token: str | None = Header(None)) -> dict[str, Any]:
    _auth(x_worker_token)
    with tempfile.TemporaryDirectory() as tmp:
        src = _download(req.source_url, Path(tmp) / "source.mp4")
        result = transcribe_mod.transcribe_file(
            src, language=req.language, num_speakers=req.num_speakers
        )
    return result  # {"words": [...], "text": "...", "duration": ...}


@app.post("/render")
def render(req: RenderRequest, x_worker_token: str | None = Header(None)) -> dict[str, Any]:
    _auth(x_worker_token)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        # Download each source referenced by the EDL.
        local: dict[str, Path] = {}
        for sid, url in req.source_urls.items():
            local[sid] = _download(url, work / "src" / f"{sid}.mp4")

        out = work / "final.mp4"
        render_mod.render_edl(
            req.edl, out, work / "render",
            resolve_source=lambda sid: local[sid],
        )

        if req.upload_url:
            # Supabase presigned upload URL (from createSignedUploadUrl) — raw PUT.
            with open(out, "rb") as f:
                put = requests.put(
                    req.upload_url, data=f, timeout=300,
                    headers={"content-type": "video/mp4", "x-upsert": "true"},
                )
                put.raise_for_status()
            return {"status": "done", "uploaded": True}

        # No upload target: return size only (caller should provide upload_url
        # in production; local dev can add a static-file mount).
        return {"status": "done", "size_bytes": out.stat().st_size, "id": str(uuid.uuid4())}
