// Shared data contracts between the frontend, Supabase, and the HF render worker.
// The EDL (Edit Decision List) is the single source of truth that flows through
// the whole pipeline — adapted from browser-use/video-use.

/** One kept segment of a source clip on the output timeline. */
export interface EdlRange {
  source: string; // key into Edl.sources
  start: number; // seconds, in source
  end: number; // seconds, in source
  beat?: string; // e.g. "HOOK", "SOLUTION"
  quote?: string; // transcript text for this range
  reason?: string; // why this take/range was chosen
}

/** A rendered animation clip overlaid on the output. */
export interface EdlOverlay {
  file: string; // storage path to the rendered clip
  start_in_output: number; // seconds, on output timeline
  duration: number; // seconds
}

/** The complete edit decision — what the render worker consumes. */
export interface Edl {
  version: 1;
  sources: Record<string, string>; // id -> storage path / signed url
  ranges: EdlRange[];
  grade?: string; // preset name or raw ffmpeg filter chain
  overlays?: EdlOverlay[];
  subtitles?: string | null; // storage path to .srt, applied LAST
  total_duration_s?: number;
}

/** A phrase-level line of a packed transcript (the LLM's primary reading view). */
export interface TranscriptPhrase {
  start: number;
  end: number;
  speaker: string; // e.g. "S0"
  text: string;
}

export type JobStatus =
  | "queued"
  | "transcribing"
  | "reasoning"
  | "rendering"
  | "evaluating"
  | "done"
  | "error";
