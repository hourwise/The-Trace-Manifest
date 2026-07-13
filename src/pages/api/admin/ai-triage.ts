// The Trace Manifest — AI Triage Admin Endpoint
// POST /api/admin/ai-triage
// Phase 5E.7: Uses the TRACE AI gateway to analyze source material
// and draft editorial summaries for story clusters.
// Requires ADMIN_API_TOKEN in Authorization header.

import type { APIRoute } from "astro";

// Lazy-load the gateway — avoids startup failures in Cloudflare runtime
let gatewayReady = false;
async function initGateway(): Promise<boolean> {
  if (gatewayReady) return true;
  try {
    const { ensureInitialised } = await import("../../../ai/config");
    ensureInitialised();
    gatewayReady = true;
    return true;
  } catch (e: any) {
    console.error("AI gateway init failed:", e.message);
    return false;
  }
}

// ============================================================
// Auth — reads ADMIN_API_TOKEN from Cloudflare Pages secrets
// ============================================================

function getAdminToken(): string {
  // Cloudflare Pages Functions: secrets available via import.meta.env (Astro) or runtime context
  try {
    // @ts-ignore — Astro + Cloudflare adapter injects env
    return (import.meta as any).env?.ADMIN_API_TOKEN ?? "";
  } catch {
    return "";
  }
}

// ============================================================
// POST handler
// ============================================================

export const POST: APIRoute = async ({ request }) => {
  // Auth check
  const auth = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${getAdminToken()}`;
  if (!auth || auth !== expected || !getAdminToken()) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: { sources?: { title: string; excerpt: string }[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.sources || !Array.isArray(body.sources) || body.sources.length === 0) {
    return new Response(JSON.stringify({ error: "sources array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build source material for the AI
  const sourceMaterial = body.sources.slice(0, 10).map((s, i) => ({
    sourceId: `source-${i + 1}`,
    text: `TITLE: ${s.title}\n\n${s.excerpt || "[No excerpt available]"}`,
    sourceClassification: "ingestion-feed",
  }));

  const instruction = `
You are analyzing source material from an AI intelligence feed to determine if this is a newsworthy story worth publishing.

Analyze the following source material and provide:

1. IS THIS NEWS? (yes/no) — Is this a meaningful development in AI/ML, or just a routine update/release note?
2. HEADLINE — A factual, non-hype headline for this story (max 100 chars). Use the primary source's own framing where possible.
3. NEUTRAL SUMMARY — A concise neutral summary of what happened (2-3 sentences). Stick to facts from the sources.
4. WHY IT MATTERS — One sentence explaining the practical significance. If it's a minor update, say so honestly.
5. KEY FACTS — 2-4 bullet points of the most important concrete facts.

IMPORTANT:
- If this is a routine patch release, minor version bump, or documentation update with no new capabilities, say "IS THIS NEWS?: no" and explain briefly why.
- Do not invent information not present in the sources.
- Do not use hype language like "revolutionary", "game-changing", or "breakthrough".
- If sources are thin or unclear, say so rather than guessing.
`.trim();

  // Init gateway lazily
  const ok = await initGateway();
  if (!ok) {
    return new Response(JSON.stringify({
      error: "AI gateway unavailable. DEEPSEEK_API_KEY may not be set on Cloudflare Pages.",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Dynamic import to avoid top-level failures
  const { generateEditorial } = await import("../../../ai/trace-model-gateway");

  // Call the AI gateway
  const result = await generateEditorial(instruction, sourceMaterial);

  if (result.status !== "ok" || !result.draft) {
    return new Response(JSON.stringify({
      error: result.error ?? "AI analysis unavailable. The model gateway may not be configured.",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse the AI response into structured fields
  const analysis = result.draft.analysis ?? result.draft.summary ?? "";
  const lines = analysis.split("\n").map((l: string) => l.trim());

  let isNews = true;
  let headline = "";
  let summary = "";
  let whyItMatters = "";
  const keyFacts: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("is this news?")) {
      isNews = !lower.includes("no") || lower.includes("yes");
      continue;
    }
    if (lower.startsWith("headline:")) {
      currentSection = "headline";
      headline = line.slice(line.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "");
      continue;
    }
    if (lower.startsWith("neutral summary:") || lower.startsWith("summary:")) {
      currentSection = "summary";
      summary = line.slice(line.indexOf(":") + 1).trim();
      continue;
    }
    if (lower.startsWith("why it matters:")) {
      currentSection = "why";
      whyItMatters = line.slice(line.indexOf(":") + 1).trim();
      continue;
    }
    if (lower.startsWith("key facts:")) {
      currentSection = "facts";
      continue;
    }

    // Accumulate multi-line sections
    if (currentSection === "headline" && line && !line.startsWith("#")) {
      headline += " " + line;
    }
    if (currentSection === "summary" && line && !line.startsWith("#")) {
      summary += " " + line;
    }
    if (currentSection === "why" && line && !line.startsWith("#")) {
      whyItMatters += " " + line;
    }
    if (currentSection === "facts" && line.startsWith("-")) {
      keyFacts.push(line.slice(1).trim());
    }
  }

  // Fallback: if parsing failed, use the raw analysis
  if (!summary && result.draft.summary) {
    summary = result.draft.summary;
  }
  if (!headline && body.sources[0]) {
    headline = body.sources[0].title.slice(0, 100);
  }

  return new Response(JSON.stringify({
    isNewsworthy: isNews,
    headline: headline.slice(0, 150),
    summary: summary.slice(0, 500),
    whyItMatters: whyItMatters.slice(0, 200),
    keyFacts: keyFacts.slice(0, 5),
    rawAnalysis: analysis.slice(0, 1000), // For debugging
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
