import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { useSession, SignIn } from "./features/Auth";
import { Studio } from "./features/Studio";

export default function App() {
  const { session, loading } = useSession();
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 20px" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 32, margin: 0, letterSpacing: -1 }}>
          videoUse<span style={{ color: "var(--accent)" }}>.studio</span>
        </h1>
        {session && (
          <button
            onClick={() => supabase?.auth.signOut()}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        )}
      </header>
      <p style={{ color: "var(--muted)", marginTop: 6 }}>
        영상을 <em>보지 않고</em> 읽는다 — 전사 기반 대화형 영상 편집.
      </p>

      {!isSupabaseConfigured ? (
        <SetupGate workerUrl={workerUrl} />
      ) : loading ? (
        <p style={{ color: "var(--muted)" }}>불러오는 중…</p>
      ) : !session ? (
        <section style={card}>
          <h2 style={h2}>로그인</h2>
          <SignIn />
        </section>
      ) : (
        <div style={{ marginTop: 24 }}>
          <Studio />
        </div>
      )}
    </main>
  );
}

function SetupGate({ workerUrl }: { workerUrl?: string }) {
  return (
    <section style={card}>
      <h2 style={h2}>설정이 필요합니다</h2>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        <code>.env.local</code>에 아래 값을 채우면 앱이 활성화됩니다:
      </p>
      <Row label="VITE_SUPABASE_URL / ANON_KEY" ok={false} />
      <Row label="VITE_WORKER_URL (HF Space)" ok={Boolean(workerUrl)} />
      <Row label="ANTHROPIC_API_KEY (Vercel 서버 env)" ok={false} />
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 0 }}>
        자세한 내용은 <code>README.md</code> / <code>docs/ARCHITECTURE.md</code>.
      </p>
    </section>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <span
        style={{ width: 10, height: 10, borderRadius: 999, background: ok ? "#3fb950" : "#6e7681" }}
      />
      <span>{label}</span>
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
