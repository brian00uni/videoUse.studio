import { useState } from "react";
import { supabase } from "../lib/supabase";
import { packPhrases, renderPacked } from "../lib/pack";
import { reasonEdl, transcribe, render } from "../lib/api";
import { createProject, addSource, saveEdl, appendSession } from "../lib/db";
import type { Edl, EdlRange } from "../lib/types";
import { btn } from "./Auth";

const BUCKET = "sources";
const RENDERS = "renders";
const SOURCE_ID = "S0"; // single-source MVP; multi-source is additive

type Stage = "upload" | "transcribing" | "ready" | "reasoning" | "edl" | "rendering" | "done";

interface Transcript {
  words: { type?: string; text: string; start: number; end: number; speaker?: string }[];
  duration?: number;
}

export function Studio() {
  const [stage, setStage] = useState<Stage>("upload");
  const [err, setErr] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [brief, setBrief] = useState("");
  const [feedback, setFeedback] = useState("");
  const [ranges, setRanges] = useState<EdlRange[]>([]);
  const [grade, setGrade] = useState<string | undefined>();
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setErr(String(e instanceof Error ? e.message : e));
  };

  async function signedUrl(p: string): Promise<string> {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async function onUpload(file: File) {
    setErr(null);
    if (!supabase) return fail("Supabase not configured");
    const key = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(key, file);
    if (error) return fail(error);
    setPath(key);
    setStage("transcribing");
    try {
      const url = await signedUrl(key);
      const tr = await transcribe(url);
      setTranscript(tr);
      // Best-effort persistence (never blocks the pipeline).
      const pid = await createProject(file.name);
      setProjectId(pid);
      if (pid) await addSource(pid, key, file.name, tr.duration, tr);
      setStage("ready");
    } catch (e) {
      fail(e);
      setStage("upload");
    }
  }

  const packed =
    transcript &&
    renderPacked(SOURCE_ID, packPhrases(transcript), transcript.duration);

  async function onPropose() {
    if (!packed) return;
    setStage("reasoning");
    setErr(null);
    try {
      const res = await reasonEdl({ packed, sourceIds: [SOURCE_ID], brief });
      setRanges(res.ranges);
      setGrade(res.grade);
      setStage("edl");
    } catch (e) {
      fail(e);
      setStage("ready");
    }
  }

  async function onReedit() {
    if (!packed || !feedback.trim()) return;
    setStage("reasoning");
    setErr(null);
    try {
      const res = await reasonEdl({
        packed,
        sourceIds: [SOURCE_ID],
        brief,
        currentRanges: ranges,
        feedback,
      });
      setRanges(res.ranges);
      setGrade(res.grade);
      setFeedback("");
      setStage("edl");
    } catch (e) {
      fail(e);
      setStage("edl");
    }
  }

  async function onRender() {
    if (!path || !supabase) return;
    setStage("rendering");
    setErr(null);
    try {
      const url = await signedUrl(path);
      const edl: Edl = { version: 1, sources: { [SOURCE_ID]: url }, ranges, grade };

      // Presigned PUT target for the worker to upload the finished mp4 into.
      const outPath = `${Date.now()}-final.mp4`;
      const up = await supabase.storage.from(RENDERS).createSignedUploadUrl(outPath);
      if (up.error) throw up.error;

      await render(edl, { [SOURCE_ID]: url }, up.data.signedUrl);

      // Sign a GET url for download.
      const dl = await supabase.storage.from(RENDERS).createSignedUrl(outPath, 3600);
      if (dl.error) throw dl.error;
      setResultUrl(dl.data.signedUrl);

      // Persist the final EDL + a session-memory entry (best-effort).
      if (projectId) {
        await saveEdl(projectId, edl, "done", outPath);
        await appendSession(projectId, {
          strategy: brief || "auto: filler/dead-space removal",
          decisions: `${ranges.length} ranges kept, grade=${grade ?? "none"}`,
        });
      }
      setStage("done");
    } catch (e) {
      fail(e);
      setStage("edl");
    }
  }

  return (
    <div>
      <Steps stage={stage} />
      {err && <p style={{ color: "#f85149" }}>⚠️ {err}</p>}

      {stage === "upload" && (
        <label style={{ ...btn, display: "inline-block" }}>
          영상 업로드
          <input
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
      )}

      {stage === "transcribing" && <p style={{ color: "var(--muted)" }}>전사 중… (HF 워커)</p>}

      {packed && (stage === "ready" || stage === "reasoning") && (
        <>
          <Panel title="전사 (편집 읽기 뷰)">
            <pre style={pre}>{packed}</pre>
          </Panel>
          <textarea
            placeholder="편집 브리프 (예: 30초 런칭 영상으로, 필러 제거하고 임팩트 있게)"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            style={{ ...pre, width: "100%", minHeight: 60, marginTop: 12 }}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={onPropose} disabled={stage === "reasoning"} style={btn}>
              {stage === "reasoning" ? "Claude가 컷 결정 중…" : "컷 제안 받기"}
            </button>
          </div>
        </>
      )}

      {(stage === "edl" || stage === "rendering" || stage === "done") && (
        <Panel title={`EDL — ${ranges.length}개 구간 (grade: ${grade ?? "none"})`}>
          {ranges.map((r, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>{r.beat ?? `#${i}`}</strong>{" "}
              <span style={{ color: "var(--muted)" }}>
                {r.source} {r.start.toFixed(2)}–{r.end.toFixed(2)}s
              </span>
              {r.quote && <div style={{ fontSize: 14 }}>“{r.quote}”</div>}
              {r.reason && <div style={{ fontSize: 13, color: "var(--muted)" }}>{r.reason}</div>}
            </div>
          ))}
          {stage === "edl" && (
            <>
              <textarea
                placeholder="대화로 다시 편집 (예: 더 짧게, 마지막 웃는 부분 살려줘, 인트로 빼줘)"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                style={{ ...pre, width: "100%", minHeight: 48, marginTop: 12 }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={onReedit} disabled={!feedback.trim()} style={ghostBtn}>
                  다시 편집
                </button>
                <button onClick={onRender} style={btn}>
                  렌더링
                </button>
              </div>
            </>
          )}
          {stage === "rendering" && <p style={{ color: "var(--muted)" }}>렌더 중… (HF 워커)</p>}
          {stage === "done" &&
            (resultUrl ? (
              <a href={resultUrl} download style={{ ...btn, marginTop: 12, display: "inline-block" }}>
                final.mp4 다운로드
              </a>
            ) : (
              <p style={{ color: "var(--muted)", marginTop: 12 }}>
                렌더 완료 — 워커에 upload_url을 연결하면 다운로드 링크가 여기 표시됩니다.
              </p>
            ))}
        </Panel>
      )}
    </div>
  );
}

function Steps({ stage }: { stage: Stage }) {
  const order: Stage[] = ["upload", "transcribing", "ready", "reasoning", "edl", "rendering", "done"];
  const labels: Record<Stage, string> = {
    upload: "업로드",
    transcribing: "전사",
    ready: "전사",
    reasoning: "컷 결정",
    edl: "컷 결정",
    rendering: "렌더",
    done: "완료",
  };
  const shown = ["업로드", "전사", "컷 결정", "렌더", "완료"];
  const idx = order.indexOf(stage);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
      {shown.map((s) => {
        const active = labels[stage] === s || (s === "완료" && stage === "done");
        const passed = shown.indexOf(s) < shown.indexOf(labels[order[idx]] ?? "업로드");
        return (
          <span
            key={s}
            style={{
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 999,
              background: active ? "var(--accent)" : "var(--surface)",
              color: active ? "#fff" : passed ? "var(--text)" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {s}
          </span>
        );
      })}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 20px",
        marginTop: 16,
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: 14, color: "var(--muted)" }}>{title}</h3>
      {children}
    </section>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontWeight: 600,
  cursor: "pointer",
};

const pre: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 12,
  color: "var(--text)",
  overflowX: "auto",
};
