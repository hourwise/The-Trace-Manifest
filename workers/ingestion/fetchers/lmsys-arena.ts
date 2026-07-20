// LMSYS Chatbot Arena fetcher
// Fetches model ranking data from the LMSYS Gradio leaderboard API.
// The leaderboard is now hosted at https://arena.ai/leaderboard

import type { Source } from "../types";

const LMSYS_API = "https://arena-leaderboard.hf.space/gradio_api/call/predict";
const TIMEOUT_MS = 25_000;
const MAX_MODELS = 25;

export async function fetchLMSYSArena(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  // LMSYS leaderboard uses Gradio. We call the predict endpoint to get the leaderboard data.
  // The leaderboard component index is typically 0.
  const body = JSON.stringify({
    data: [0], // component index for the leaderboard table
    event_data: null,
    fn_index: 0,
    session_hash: crypto.randomUUID(),
  });

  const response = await fetch(LMSYS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "TheTraceManifest/1.0",
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`LMSYS API returned ${response.status}`);
  }

  // Gradio returns an event stream — parse the JSON from the event
  const text = await response.text();
  const lines = text.split("\n").filter(line => line.startsWith("data:"));
  
  let result: any = null;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.slice(5).trim());
      if (parsed.msg === "process_completed" && parsed.output?.data) {
        result = parsed.output.data;
        break;
      }
    } catch { continue; }
  }

  if (!result || !Array.isArray(result) || result.length < 2) {
    throw new Error("LMSYS API returned unexpected format");
  }

  // The leaderboard data is typically in result[1] as a list of [headers, ...rows]
  const leaderboard = result[1];
  if (!Array.isArray(leaderboard) || leaderboard.length < 2) {
    throw new Error("LMSYS leaderboard data not found");
  }

  const headers = leaderboard[0] as string[];
  const rows = leaderboard.slice(1) as Array<Array<string | number>>;

  // Find column indices
  const rankIdx = headers.findIndex(h => h.toLowerCase().includes("rank"));
  const modelIdx = headers.findIndex(h => h.toLowerCase().includes("model"));
  const eloIdx = headers.findIndex(h => h.toLowerCase().includes("elo") || h.toLowerCase().includes("arena score"));
  const ciIdx = headers.findIndex(h => h.toLowerCase().includes("95% ci"));
  const votesIdx = headers.findIndex(h => h.toLowerCase().includes("vote"));

  const items = rows.slice(0, MAX_MODELS).map((row) => {
    const rank = rankIdx >= 0 ? row[rankIdx] : "?";
    const modelName = modelIdx >= 0 ? String(row[modelIdx] ?? "Unknown") : "Unknown";
    const elo = eloIdx >= 0 ? row[eloIdx] : null;
    const ci = ciIdx >= 0 ? row[ciIdx] : null;
    const votes = votesIdx >= 0 ? row[votesIdx] : null;

    const title = `LMSYS Arena: #${rank} — ${modelName} (ELO ${elo ?? "?"})`;
    const summary = [
      `Rank: #${rank}`,
      elo ? `Arena ELO: ${elo}` : null,
      ci ? `95% CI: ${ci}` : null,
      votes ? `Votes: ${votes}` : null,
      "Source: LMSYS Chatbot Arena — blind human preference evaluation",
    ].filter(Boolean).join(". ");

    return {
      external_id: `lmsys:${String(modelName).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      url: "https://arena.ai/leaderboard",
      title,
      summary,
      content_excerpt: summary,
      author: "LMSYS Org",
      published_at: new Date().toISOString().slice(0, 10),
      raw_metadata: {
        source: "lmsys_arena",
        rank,
        modelName,
        elo,
        ci95: ci,
        votes,
        fetchedAt: new Date().toISOString(),
      },
    };
  });

  return items;
}
