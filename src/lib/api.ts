// Client-side callers for the two compute surfaces:
//  - /api/reason  (Vercel function → Claude EDL reasoning)
//  - the HF worker (transcribe + render)

import type { Edl, EdlRange } from "./types";

const WORKER = import.meta.env.VITE_WORKER_URL;

export interface ReasonResult {
  version: 1;
  ranges: EdlRange[];
  grade?: string;
  total_duration_s?: number;
}

/** Ask Claude for cut decisions given a packed transcript. */
export async function reasonEdl(input: {
  packed: string;
  sourceIds: string[];
  brief?: string;
  target?: string;
}): Promise<ReasonResult> {
  const r = await fetch("/api/reason", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`reason failed (${r.status}): ${await r.text()}`);
  return r.json();
}

/** Transcribe one source via the HF worker. Returns the word-level transcript. */
export async function transcribe(sourceUrl: string, opts?: { language?: string }) {
  if (!WORKER) throw new Error("VITE_WORKER_URL not configured");
  const r = await fetch(`${WORKER}/transcribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source_url: sourceUrl, language: opts?.language }),
  });
  if (!r.ok) throw new Error(`transcribe failed (${r.status})`);
  return r.json();
}

/** Render an EDL via the HF worker. `sourceUrls` are signed URLs keyed by EDL source id. */
export async function render(edl: Edl, sourceUrls: Record<string, string>, uploadUrl?: string) {
  if (!WORKER) throw new Error("VITE_WORKER_URL not configured");
  const r = await fetch(`${WORKER}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edl, source_urls: sourceUrls, upload_url: uploadUrl }),
  });
  if (!r.ok) throw new Error(`render failed (${r.status})`);
  return r.json();
}
