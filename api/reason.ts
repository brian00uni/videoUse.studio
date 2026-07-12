// Vercel serverless function: read a packed transcript, decide the cuts, emit an EDL.
// Uses Groq (free tier, OpenAI-compatible) for the LLM reasoning — the LLM never
// sees the video, only the transcript.

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Vercel Hobby allows up to 60s; Groq is fast but give headroom.
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM = `You are a video editor. You read a packed transcript (phrase-level
lines with [start-end] timestamps per source) and decide which ranges to keep,
producing an Edit Decision List (EDL).

Rules:
- Cut filler words (um, uh, false starts) and dead space between takes.
- Cuts land on phrase/word boundaries from the transcript — never mid-phrase.
- When multiple takes of the same line exist, keep the cleanest one.
- Preserve punchlines, laughs, and emphasis beats; extend past them to include reactions.
- Order the kept ranges into a coherent final cut that matches the user's brief.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{
  "ranges": [
    {"source": "<one of the given source ids>", "start": <sec number>, "end": <sec number>,
     "beat": "<short label e.g. HOOK>", "quote": "<transcript text>", "reason": "<one line>"}
  ],
  "grade": "<preset name like clean|warm_cinematic|neutral_punch, or empty string>",
  "total_duration_s": <number>
}
'start'/'end' are seconds within the named source.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(500).json({ error: "GROQ_API_KEY not set" });
    return;
  }

  const { packed, sourceIds, brief, target, currentRanges, feedback } = req.body ?? {};
  if (!packed || !Array.isArray(sourceIds) || !sourceIds.length) {
    res.status(400).json({ error: "packed (string) and sourceIds (string[]) required" });
    return;
  }

  const revision =
    Array.isArray(currentRanges) && currentRanges.length
      ? [
          "",
          "Current EDL (revise this, don't start from scratch):",
          JSON.stringify(currentRanges, null, 2),
          "",
          `User feedback: ${feedback ?? "(none)"}`,
        ].join("\n")
      : "";

  const userMsg = [
    `Source ids: ${sourceIds.join(", ")}`,
    target ? `Target: ${target}` : "",
    brief ? `Brief: ${brief}` : "Brief: tighten into a clean cut; remove filler and dead space.",
    "",
    "Packed transcript:",
    packed,
    revision,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!r.ok) {
      const body = await r.text();
      res.status(r.status === 429 ? 429 : 502).json({ error: `groq ${r.status}: ${body.slice(0, 300)}` });
      return;
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: "no content from groq" });
      return;
    }
    const decision = JSON.parse(content);
    if (!Array.isArray(decision.ranges)) {
      res.status(502).json({ error: "model did not return ranges[]" });
      return;
    }

    res.status(200).json({
      version: 1,
      ranges: decision.ranges,
      grade: decision.grade || undefined,
      total_duration_s: decision.total_duration_s,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
