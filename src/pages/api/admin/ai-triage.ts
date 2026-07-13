// The Trace Manifest — AI Triage Admin Endpoint
// POST /api/admin/ai-triage
// Standalone DeepSeek call — no gateway dependency to avoid Cloudflare bundler issues.
// Requires ADMIN_API_TOKEN + DEEPSEEK_API_KEY as Cloudflare Pages secrets.

import type { APIRoute } from "astro";

function getSecret(name: string): string {
  try {
    return ((import.meta as any).env?.[name] as string) ?? "";
  } catch {
    return "";
  }
}

export const POST: APIRoute = async ({ request }) => {
  // Auth
  const token = getSecret("ADMIN_API_TOKEN");
  const auth = request.headers.get("Authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // API key
  const apiKey = getSecret("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "DEEPSEEK_API_KEY not set on Cloudflare Pages." }, { status: 503 });
  }

  // Parse body
  let body: { sources?: { title: string; excerpt: string | null }[] };
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.sources?.length) {
    return Response.json({ error: "sources array is required" }, { status: 400 });
  }

  // Build prompt
  const sourceText = body.sources.slice(0, 10).map((s, i) =>
    `[SOURCE ${i + 1}]\nTITLE: ${s.title}\n${s.excerpt || "[No excerpt]"}`
  ).join("\n\n");

  const systemPrompt = `You are an AI news analyst for The Trace Manifest, an evidence-linked AI intelligence platform.
Your job: analyze source material and determine if it's newsworthy.
Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.`;

  const userPrompt = `Analyze these sources and respond with this exact JSON structure:
{
  "isNewsworthy": true,
  "headline": "Factual headline (max 100 chars)",
  "summary": "Neutral 2-3 sentence summary of what happened",
  "whyItMatters": "One sentence on practical significance",
  "keyFacts": ["fact 1", "fact 2", "fact 3"]
}

Rules:
- If this is a routine patch/minor version bump/doc update, set isNewsworthy: false and explain briefly in summary.
- No hype words (revolutionary, game-changing, breakthrough).
- Don't invent facts not in the sources.
- If sources are thin, say so.

SOURCE MATERIAL:
${sourceText}`;

  // Call DeepSeek directly
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`DeepSeek API error ${res.status}: ${errText}`);
      return Response.json({ error: `DeepSeek API returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return Response.json({ error: "DeepSeek returned empty response" }, { status: 502 });
    }

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return Response.json({ error: "Failed to parse AI response", raw: content.slice(0, 500) }, { status: 502 });
    }

    return Response.json({
      isNewsworthy: parsed.isNewsworthy !== false,
      headline: (parsed.headline || body.sources[0]?.title || "").slice(0, 150),
      summary: (parsed.summary || "").slice(0, 500),
      whyItMatters: (parsed.whyItMatters || "").slice(0, 200),
      keyFacts: (Array.isArray(parsed.keyFacts) ? parsed.keyFacts : []).slice(0, 5),
    });

  } catch (e: any) {
    console.error("AI triage fetch failed:", e.message);
    return Response.json({ error: "Failed to reach DeepSeek API" }, { status: 502 });
  }
};
