# Render worker (Hugging Face Space)

Heavy compute for videoUse.studio: **Whisper transcription** + **ffmpeg render**.
Vercel serverless can't run long ffmpeg jobs, so this lives on an HF Space and is
called as an async job API.

## Endpoints

| Method | Path          | Purpose                                        |
| ------ | ------------- | ---------------------------------------------- |
| GET    | `/health`     | liveness                                       |
| POST   | `/transcribe` | audio → word-level transcript + diarization    |
| POST   | `/render`     | EDL (`src/lib/types.ts`) → `final.mp4`         |

## Deploy as an HF Space

1. Create a Space → SDK: **Docker** (or FastAPI template).
2. Ensure `ffmpeg` is installed (apt package in the Dockerfile).
3. Push this folder; set `WORKER_TOKEN` as a Space secret.
4. Point the frontend at it: `VITE_WORKER_URL=https://<user>-<space>.hf.space`.

## Porting reference logic

The real implementation ports these from `browser-use/video-use`:

- `/transcribe` ← `helpers/transcribe.py` (swap ElevenLabs Scribe → Whisper)
- `/render` ← `helpers/render.py` (per-segment extract, 30ms fades, concat, subtitles)

## Local run

```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 7860
```
