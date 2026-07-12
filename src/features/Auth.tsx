import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/** Tracks the current Supabase auth session (null when configured but signed out). */
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

/** Email + password sign-in / sign-up. */
export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErr(error.message);
        // on success, useSession's onAuthStateChange swaps the UI automatically
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setErr(error.message);
        else if (!data.session) {
          // Email confirmation is ON in Supabase → a confirmation mail was sent.
          setMsg("확인 메일을 보냈어요. 메일의 링크를 누르면 가입 완료 → 다시 로그인하세요. (즉시 로그인하려면 Supabase에서 Confirm email 끄기)");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const input: React.CSSProperties = {
    flex: 1,
    minWidth: 220,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={input}
      />
      <input
        type="password"
        placeholder="비밀번호 (6자 이상)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && email && password && submit()}
        style={input}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={submit} disabled={!email || !password || busy} style={btn}>
          {busy ? "…" : mode === "in" ? "로그인" : "회원가입"}
        </button>
        <button
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setErr(null);
            setMsg(null);
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {mode === "in" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </div>
      {err && <p style={{ color: "#f85149", margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>{msg}</p>}
    </div>
  );
}

export const btn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
