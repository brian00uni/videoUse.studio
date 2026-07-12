"""videoUse.studio — render worker (Hugging Face Space).

Runs the heavy compute the browser/serverless can't: Whisper transcription
and the ffmpeg render pipeline. Deploy as an HF Space (FastAPI SDK) and point
the frontend at it via VITE_WORKER_URL.

This is a STUB with the real endpoint contract wired up. The ffmpeg / Whisper
logic is ported from browser-use/video-use helpers/ (transcribe.py, render.py).
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="videoUse.studio worker")

WORKER_TOKEN = os.environ.get("WORKER_TOKEN")  # shared secret with the backend


class TranscribeRequest(BaseModel):
    source_url: str          # signed Supabase Storage URL
    language: str | None = None
    num_speakers: int | None = None


class RenderRequest(BaseModel):
    edl: dict[str, Any]      # matches Edl in src/lib/types.ts
    preview: bool = False


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
def transcribe(req: TranscribeRequest) -> dict[str, Any]:
    """Extract 16kHz mono audio, run Whisper w/ word timestamps + diarization.

    TODO: port helpers/transcribe.py — ffmpeg extract → whisper/insanely-fast
    → return word-level entries. Cache in Supabase `sources.transcript`.
    """
    raise HTTPException(501, "transcribe not implemented yet")


@app.post("/render")
def render(req: RenderRequest) -> dict[str, Any]:
    """Render an EDL to mp4.

    TODO: port helpers/render.py — per-segment extract w/ grade + 30ms audio
    fades → lossless concat → overlays + subtitles filter graph → upload to
    Supabase Storage, return output path.
    """
    raise HTTPException(501, "render not implemented yet")
