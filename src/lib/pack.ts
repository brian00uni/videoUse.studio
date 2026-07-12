// Pack a word-level transcript into a phrase-level reading view — the LLM's
// primary surface (ported from browser-use/video-use pack_transcripts.py).
// Phrases break on any silence >= silenceThreshold OR a speaker change.

import type { TranscriptPhrase } from "./types";

interface Word {
  type?: string;
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

interface Transcript {
  words: Word[];
  duration?: number;
}

export function packPhrases(
  transcript: Transcript,
  silenceThreshold = 0.5,
): TranscriptPhrase[] {
  const words = transcript.words.filter((w) => (w.type ?? "word") === "word");
  const phrases: TranscriptPhrase[] = [];
  let cur: Word[] = [];

  const flush = () => {
    if (!cur.length) return;
    phrases.push({
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      speaker: cur[0].speaker ?? "S0",
      text: cur.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    cur = [];
  };

  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const gap = w.start - prev.end;
      const speakerChange = (w.speaker ?? "S0") !== (prev.speaker ?? "S0");
      if (gap >= silenceThreshold || speakerChange) flush();
    }
    cur.push(w);
  }
  flush();
  return phrases;
}

/** Render one source's phrases as the markdown block the LLM reads. */
export function renderPacked(
  sourceId: string,
  phrases: TranscriptPhrase[],
  durationS?: number,
): string {
  const header =
    `## ${sourceId}  (duration: ${durationS?.toFixed(1) ?? "?"}s, ` +
    `${phrases.length} phrases)`;
  const lines = phrases.map(
    (p) =>
      `  [${p.start.toFixed(2)}-${p.end.toFixed(2)}] ${p.speaker} ${p.text}`,
  );
  return [header, ...lines].join("\n");
}
