# SETUP — 직접 해야 할 부분

코드는 전부 구현·push 돼 있습니다. 아래 **외부 서비스 3개**만 연결하면 앱이 동작합니다.
순서대로 따라 하세요. 예상 소요: 20~30분.

---

## 1. Supabase (인증 · DB · 파일 저장)

### 1-1. 프로젝트 생성
1. https://supabase.com → 새 프로젝트 생성 (region은 가까운 곳, 예: Seoul).
2. Project Settings → **API** 에서 두 값 복사:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

### 1-2. DB 스키마 적용
Supabase 대시보드 → **SQL Editor** → `supabase/migrations/0001_init.sql` 내용을
붙여넣고 실행. (projects/sources/edls/sessions 테이블 + RLS 생성)

### 1-3. Storage 버킷 2개 생성
대시보드 → **Storage** → New bucket:
- `sources` (원본 영상) — **Private**
- `renders` (결과물) — **Private**

### 1-4. Storage 접근 정책 (SQL Editor에 붙여넣기)
로그인한 사용자가 자기 파일을 업로드/다운로드할 수 있게 합니다:

```sql
create policy "auth upload sources" on storage.objects
  for insert to authenticated with check (bucket_id = 'sources');
create policy "auth read sources" on storage.objects
  for select to authenticated using (bucket_id = 'sources');

create policy "auth upload renders" on storage.objects
  for insert to authenticated with check (bucket_id = 'renders');
create policy "auth read renders" on storage.objects
  for select to authenticated using (bucket_id = 'renders');
```

> presigned URL로 워커가 업로드하므로 `renders` insert 정책이 필요합니다.

### 1-5. 이메일 로그인 (기본 켜져 있음)
Authentication → Providers → **Email** 활성 확인. 매직링크가 기본입니다.
로컬 개발 시 Authentication → URL Configuration → Site URL을
`http://localhost:5173`로 설정.

---

## 2. Hugging Face Space (전사 + ffmpeg 렌더 워커)

1. https://huggingface.co → **New Space** → SDK: **Docker**.
2. 이 저장소의 `worker/` 폴더 내용을 Space 저장소에 올립니다
   (`app.py`, `render.py`, `transcribe.py`, `requirements.txt`, `Dockerfile`).
3. Space가 빌드되면 URL을 확인: `https://<user>-<space>.hf.space`
   → 이 값이 `VITE_WORKER_URL`.
4. (선택) Space Settings → **Secrets** 에 `WORKER_TOKEN` 추가하면
   워커 호출에 토큰 검증이 걸립니다. (현재 프론트는 토큰 미전송이므로,
   토큰을 켰다면 `src/lib/api.ts`에 헤더 추가 필요 — 처음엔 생략 권장.)

> 무료 CPU 티어는 유휴 시 sleep + 첫 요청이 느립니다. Whisper `base` 모델 기준
> 짧은 영상은 수십 초. 프로덕션은 유료 티어 권장.

---

## 3. Vercel (프론트 배포 + Claude 호출)

1. https://vercel.com → **Import Git Repository** → `brian00uni/videoUse.studio`.
2. Framework는 자동으로 **Vite** 감지. `/api`도 자동으로 서버리스 함수로 배포됩니다.
3. **Environment Variables** 에 추가:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_WORKER_URL`
   - `ANTHROPIC_API_KEY`  ← Claude API 키 (https://console.anthropic.com)
4. Deploy.

---

## 로컬에서 먼저 돌려보기 (선택)

```bash
cp .env.example .env.local
# .env.local 에 VITE_SUPABASE_URL / ANON_KEY / WORKER_URL 채우기
# 주의: 로컬에서 /api/reason(Claude)까지 돌리려면 `vercel dev` 사용 (ANTHROPIC_API_KEY 필요)
npm install
npx vercel dev     # 프론트 + /api 함수 함께 실행
# 또는 프론트만: npm run dev  (이 경우 컷 제안은 배포본에서 테스트)
```

---

## 체크리스트

- [ ] Supabase 프로젝트 + URL/anon key 확보
- [ ] `0001_init.sql` 실행
- [ ] `sources`, `renders` 버킷 생성 + 정책 SQL 실행
- [ ] HF Space 배포 + URL 확보
- [ ] Anthropic API 키 발급
- [ ] Vercel에 env 4개 등록 + 배포

전부 끝나면: 로그인 → 영상 업로드 → 전사 → 컷 제안 → (대화로 재편집) → 렌더 → 다운로드.
