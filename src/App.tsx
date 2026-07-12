import { isSupabaseConfigured } from "./lib/supabase";

const PIPELINE = [
  { step: "Upload", desc: "원본 영상을 Supabase Storage에 올린다" },
  { step: "Transcribe", desc: "HF Space가 Whisper로 단어 단위 전사 + 화자분리" },
  { step: "Read & Reason", desc: "Claude가 전사 텍스트로 컷을 결정 → EDL" },
  { step: "Render", desc: "HF 워커가 ffmpeg로 EDL을 final.mp4로 렌더" },
  { step: "Self-Eval", desc: "컷 경계마다 렌더 결과를 재검증 (최대 3회)" },
];

export default function App() {
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 40, margin: 0, letterSpacing: -1 }}>
        videoUse<span style={{ color: "var(--accent)" }}>.studio</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 18, marginTop: 8 }}>
        영상을 <em>보지 않고</em> 읽는다 — 전사 기반 대화형 영상 편집.
      </p>

      <section style={card}>
        <h2 style={h2}>Pipeline</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          {PIPELINE.map((p) => (
            <li key={p.step}>
              <strong>{p.step}</strong>{" "}
              <span style={{ color: "var(--muted)" }}>— {p.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section style={card}>
        <h2 style={h2}>연결 상태</h2>
        <Row label="Supabase" ok={isSupabaseConfigured} />
        <Row label="Render worker (HF)" ok={Boolean(workerUrl)} />
        {!isSupabaseConfigured && (
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 0 }}>
            <code>.env.local</code>에 <code>VITE_SUPABASE_URL</code>,{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>를 채우면 연결됩니다.
          </p>
        )}
      </section>
    </main>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: ok ? "#3fb950" : "#6e7681",
        }}
      />
      <span>{label}</span>
      <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 14 }}>
        {ok ? "connected" : "not configured"}
      </span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: "20px 24px",
  marginTop: 24,
};

const h2: React.CSSProperties = {
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "var(--muted)",
  marginTop: 0,
};
