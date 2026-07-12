"""videoUse.studio worker routes — drop into the existing Eraser Studio Space.

Adds /transcribe and /render to that Space's FastAPI app without touching its
existing /remove endpoint. ffmpeg is already installed in that image.

Wire-up (in the Space's app.py):
    from vu_routes import router as vu_router
    app.include_router(vu_router)
"""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from typing import Any

import requests
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

import vu_render as render_mod
import vu_transcribe as transcribe_mod

router = APIRouter()

import os

WORKER_TOKEN = os.environ.get("WORKER_TOKEN")


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
    source_url: str
    language: str | None = None
    num_speakers: int | None = None


class RenderRequest(BaseModel):
    edl: dict[str, Any]
    source_urls: dict[str, str]
    upload_url: str | None = None


@router.get("/vu-health")
def vu_health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/transcribe")
def transcribe(req: TranscribeRequest, x_worker_token: str | None = Header(None)) -> dict[str, Any]:
    _auth(x_worker_token)
    with tempfile.TemporaryDirectory() as tmp:
        src = _download(req.source_url, Path(tmp) / "source.mp4")
        return transcribe_mod.transcribe_file(
            src, language=req.language, num_speakers=req.num_speakers
        )


@router.post("/render")
def render(req: RenderRequest, x_worker_token: str | None = Header(None)) -> dict[str, Any]:
    _auth(x_worker_token)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        local: dict[str, Path] = {}
        for sid, url in req.source_urls.items():
            local[sid] = _download(url, work / "src" / f"{sid}.mp4")

        out = work / "final.mp4"
        render_mod.render_edl(
            req.edl, out, work / "render",
            resolve_source=lambda sid: local[sid],
        )

        if req.upload_url:
            with open(out, "rb") as f:
                put = requests.put(
                    req.upload_url, data=f, timeout=300,
                    headers={"content-type": "video/mp4", "x-upsert": "true"},
                )
                put.raise_for_status()
            return {"status": "done", "uploaded": True}

        return {"status": "done", "size_bytes": out.stat().st_size, "id": str(uuid.uuid4())}
