// Vercel serverless function: read a packed transcript, decide the cuts, emit an EDL.
// This is the "LLM reasons over text" step of the pipeline — Claude never sees
// the video, only the transcript.

import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const SYSTEM = `You are a video editor. You read a packed transcript (phrase-level
lines with [start-end] timestamps per source) and decide which ranges to keep,
producing an Edit Decision List (EDL).

Rules:
- Cut filler words (um, uh, false starts) and dead space between takes.
- Cuts land on phrase/word boundaries from the transcript — never mid-phrase.
- When multiple takes of the same line exist, keep the cleanest one.
- Preserve punchlines, laughs, and emphasis beats; extend past them to include reactions.
- Order the kept ranges into a coherent final cut that matches the user's brief.
- 'start'/'end' are seconds within the named source. 'source' must be one of the given source ids.
- Report a one-line 'reason' per range explaining the choice.`;

// The EDL ranges Claude produces. `sources` is supplied by the app, not the model.
const RANGES_SCHEMA = {
  type: "object",
  properties: {
    ranges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          beat: { type: "string" },
          quote: { type: "string" },
          reason: { type: "string" },
        },
        required: ["source", "start", "end", "beat", "quote", "reason"],
        additionalProperties: false,
      },
    },
    grade: { type: "string" },
    total_duration_s: { type: "number" },
  },
  required: ["ranges", "grade", "total_duration_s"],
  additionalProperties: false,
} as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const { packed, sourceIds, brief, target } = req.body ?? {};
  if (!packed || !Array.isArray(sourceIds) || !sourceIds.length) {
    res.status(400).json({ error: "packed (string) and sourceIds (string[]) required" });
    return;
  }

  const userMsg = [
    `Source ids: ${sourceIds.join(", ")}`,
    target ? `Target: ${target}` : "",
    brief ? `Brief: ${brief}` : "Brief: tighten into a clean cut; remove filler and dead space.",
    "",
    "Packed transcript:",
    packed,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: RANGES_SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      res.status(502).json({ error: "no structured output", stop: response.stop_reason });
      return;
    }
    const decision = JSON.parse(text.text);

    // Assemble the full EDL contract (src/lib/types.ts). App fills `sources`.
    res.status(200).json({
      version: 1,
      ranges: decision.ranges,
      grade: decision.grade,
      total_duration_s: decision.total_duration_s,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "rate limited" });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(err.status ?? 500).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
}
