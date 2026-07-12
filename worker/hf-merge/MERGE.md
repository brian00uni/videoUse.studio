# Eraser Studio Space에 워커 합치기

기존 `brian00uni/studioProj` (Eraser Studio) Space에 videoUse.studio의
`/transcribe`·`/render` 엔드포인트를 **추가**합니다. 기존 `/remove`는 그대로 둡니다.
이 Space는 이미 FastAPI + ffmpeg + Docker(포트 7860)라서 새 슬롯이 필요 없습니다.

## 1. 파일 3개를 Space 저장소 최상위에 복사

이 폴더의 파일을 Eraser Studio Space repo 루트(app.py 있는 곳)에 올립니다:

- `vu_render.py`
- `vu_transcribe.py`
- `vu_routes.py`

> `vu_` 접두어로 네임스페이스해서 기존 파일과 충돌하지 않습니다.

## 2. app.py에 2줄 추가 (배치 순서 중요!)

- `from vu_routes import router as vu_router` → 파일 상단 import 근처 (아무 데나 OK)
- `app.include_router(vu_router)` → **반드시 `app = FastAPI(...)` 아래.
  헷갈리면 그냥 파일 맨 끝(마지막 줄)에 두세요.**

```python
from fastapi import FastAPI
from vu_routes import router as vu_router   # 상단 import

app = FastAPI(...)        # 기존 app 생성
# ... 기존 라우트들 (/, /remove) ...

app.include_router(vu_router)   # ← app 생성 뒤 / 파일 끝
```

> ⚠️ `app.include_router`를 `app = FastAPI()` **위에** 두면
> `NameError: name 'app' is not defined` 로 죽습니다.
> (변수명이 `app`이 아니면 Dockerfile의 `uvicorn <module>:<name>` 의 `<name>`에 맞추세요.)

## 3. requirements.txt에 추가

```
faster-whisper
requests
```

- `ffmpeg`는 이미 Dockerfile에 있으니 손댈 필요 없음.
- `requests`가 이미 있으면 중복 무시.
- `fastapi`/`pydantic`/`uvicorn`도 이미 있음.

## 4. Space에 push → 자동 재빌드

빌드 후 엔드포인트 확인:
- `GET  /vu-health` → `{"status":"ok"}` (합쳐졌는지 확인용)
- `POST /transcribe`, `POST /render` 활성화
- 기존 `GET /`, `POST /remove`는 그대로

## 5. 프론트 연결

Vercel 환경변수 `VITE_WORKER_URL` 을 이 Space 주소로:

```
VITE_WORKER_URL = https://brian00uni-studioproj.hf.space
```

(정확한 주소는 Space 페이지 오른쪽 위 ⋮ → "Embed this Space" 또는 Direct URL에서 확인)

---

## 참고 / 주의

- **첫 전사 요청은 느립니다.** `faster-whisper`가 최초 호출 때 Whisper `base` 모델
  (~150MB)을 다운로드합니다. 이후 캐시되지만, Space가 factory rebuild되면 다시 받습니다.
- CPU 무료 티어라 긴 영상은 오래 걸립니다. **짧은 클립(30초~1분)으로 테스트** 권장.
- 모델 크기를 바꾸려면 `vu_transcribe.py`의 `model_size="base"` 조정 (tiny=빠름/낮은품질).
- 토큰 검증을 켜려면 Space Secret에 `WORKER_TOKEN` 설정 + 프론트에서 헤더 전송 추가
  (기본은 미사용이라 지금은 신경 안 써도 됨).
