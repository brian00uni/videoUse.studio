# videoUse.studio

영상을 **보지 않고 읽는다** — 전사(transcript) 기반 대화형 영상 편집 웹 앱.

[browser-use/video-use](https://github.com/browser-use/video-use)의 핵심 발상
("LLM은 영상을 프레임으로 보지 않고, 구조화된 텍스트로 읽는다")를 웹 제품으로
옮긴 프로젝트입니다.

## 아키텍처

```
Vercel (React + API)  ──►  Claude API      : 전사를 읽고 컷 결정(EDL) 추론
       │
       ├──►  Supabase   : Auth · Postgres(projects/sources/edls/sessions) · Storage · Realtime
       │
       └──►  HF Space   : Whisper 전사 + ffmpeg 렌더 (무거운 연산)
```

| 서비스 | 역할 |
| --- | --- |
| **Vercel** | React 프론트엔드 + 오케스트레이션 API 라우트 |
| **Supabase** | 로그인, DB, 영상/결과물 저장, 잡 상태 실시간 푸시 |
| **Hugging Face** | 전사(Whisper) + ffmpeg 렌더 워커 (`worker/`) |

파이프라인의 공통 데이터 계약은 **EDL(Edit Decision List)** 입니다 —
`src/lib/types.ts` 참고.

## 폴더 구조

```
src/                 React 프론트엔드
  lib/types.ts       EDL·전사 등 공통 타입 (프론트↔DB↔워커 계약)
  lib/supabase.ts    Supabase 클라이언트
supabase/migrations/ DB 스키마 (RLS 포함)
worker/              HF Space 렌더 워커 (FastAPI + ffmpeg)
docs/ARCHITECTURE.md 설계 상세 + 로드맵
```

## 시작하기

```bash
npm install
cp .env.example .env.local   # Supabase / HF 값 채우기
npm run dev                  # http://localhost:5173
```

Supabase 스키마 적용:

```bash
# supabase CLI 사용 시
supabase db push
# 또는 supabase/migrations/0001_init.sql 을 SQL 에디터에 붙여넣기
```

## 라이브로 돌리기 (Phase 1 MVP)

프론트엔드 플로우(업로드 → 전사 → 컷 제안 → 렌더 → 다운로드)는 구현돼 있고,
아래 3개 외부 서비스만 연결하면 동작합니다:

1. **Supabase 프로젝트** — `supabase/migrations/0001_init.sql` 적용, Storage에
   `sources` 버킷 생성, `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 설정.
2. **HF Space 워커** — `worker/`를 Docker Space로 배포하고 `VITE_WORKER_URL` 설정
   (`worker/README.md` 참고).
3. **Claude API** — Vercel 프로젝트 env에 `ANTHROPIC_API_KEY` 설정
   (`/api/reason`가 사용).

> 렌더 결과 다운로드를 켜려면 워커 `/render`에 `upload_url`(Supabase presigned PUT)을
> 넘기고, 그 경로를 앱에서 서명해 링크로 노출하면 됩니다.

## 로드맵

- **Phase 1 (MVP)** — 업로드 → 전사 → 필러/공백 자동 컷 제안 → 렌더 → 다운로드
- **Phase 2** — 대화형 편집 + 세션 메모리
- **Phase 3** — 자막 번인 + 자동 컬러그레이딩
- **Phase 4** — 애니메이션 오버레이 + 자가검증 루프

자세한 내용은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
