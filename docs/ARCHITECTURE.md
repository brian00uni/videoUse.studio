# Architecture

## 핵심 원칙 (참고 레포에서 계승)

1. **텍스트 + 온디맨드 비주얼.** 프레임을 통째로 LLM에 넣지 않는다. 전사가 1차 표면.
2. **오디오 우선, 영상은 따라온다.** 컷은 발화 경계와 무음 구간에서 나온다.
3. **묻고 → 확인 → 실행 → 자가검증 → 저장.** 전략 승인 없이 컷을 건드리지 않는다.
4. **콘텐츠 타입 무가정.** 먼저 보고, 묻고, 편집한다.

## 데이터 흐름

```
[1] Upload      브라우저 → Supabase Storage (원본 영상)
[2] Transcribe  Vercel API → HF Worker /transcribe → Whisper 단어단위+화자분리
                결과를 sources.transcript(jsonb)에 캐시
[3] Pack        전사를 phrase 단위 마크다운으로 압축 (LLM 읽기 뷰)
[4] Reason      Vercel API → Claude API : packed 전사 읽고 EDL 생성
                edls(edl jsonb, status)에 저장
[5] Render      Vercel API → HF Worker /render → ffmpeg → final.mp4
                Supabase Storage 업로드, edls.output_path 갱신
[6] Self-Eval   컷 경계마다 렌더 결과 재검증 (최대 3회), 실패 시 수정 후 재렌더
[7] Persist     세션 요약을 sessions 테이블에 append (참고: project.md)
```

잡 상태는 `edls.status` (JobStatus)로 추적하고 Supabase **Realtime**으로
프론트에 푸시한다.

## 왜 3-서비스인가

- **ffmpeg/Whisper는 무겁고 오래 걸린다.** Vercel 서버리스는 실행시간·바이너리
  제약이 커서 부적합 → **HF Space**가 워커.
- **Vercel**은 프론트 + 가벼운 오케스트레이션(인증 검증, Claude 호출, 잡 디스패치).
- **Supabase**가 상태·파일·인증의 단일 소스.

## 참고 레포 → 웹 매핑

| video-use (CLI) | videoUse.studio (웹) |
| --- | --- |
| ElevenLabs Scribe | HF Whisper (`worker/app.py /transcribe`) |
| `helpers/render.py` | `worker/app.py /render` |
| Claude Code 대화 추론 | Claude API (Vercel API 라우트) |
| `takes_packed.md` | 전사 pack 유틸 (Phase 2) |
| `edl.json` | `edls.edl` (jsonb) / `src/lib/types.ts` |
| `project.md` | `sessions` 테이블 |
| 로컬 파일시스템 | Supabase Storage |

## 미해결/결정 필요 (다음 단계)

- **전사 모델 선택**: faster-whisper(CPU 경제적) vs transformers 파이프라인.
  화자분리(diarization)는 pyannote 등 별도 필요 여부 검토.
- **잡 큐**: HF Space 단일 요청으로 시작 → 부하 생기면 큐(예: Supabase 테이블
  폴링 or 외부 큐) 도입.
- **HF 무료 티어 sleep**: 콜드스타트/스토리지 휘발성 → 프로덕션 시 유료 티어 또는
  전용 컨테이너 이전 검토.
