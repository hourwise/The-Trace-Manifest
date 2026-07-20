// Hugging Face API fetcher — Trending Models
// Uses the public HF API to discover trending open-weight models.
// Maps model metadata to feed items for ingestion.

import type { Source } from "../types";

const HF_API = "https://huggingface.co/api/models";
const MAX_ITEMS = 20;
const TIMEOUT_MS = 20_000;

export async function fetchHuggingFaceModels(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  const url = `${HF_API}?sort=trending&limit=${MAX_ITEMS}&full=false`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "TheTraceManifest/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HF API returned ${response.status}`);
  }

  const models = await response.json() as Array<{
    id: string;
    modelId?: string;
    author?: string;
    pipeline_tag?: string;
    tags?: string[];
    downloads?: number;
    likes?: number;
    lastModified?: string;
    sha?: string;
    cardData?: { language?: string; license?: string; base_model?: string };
  }>;

  return models.slice(0, MAX_ITEMS).map((model) => {
    const modelId = model.modelId || model.id;
    const modelUrl = `https://huggingface.co/${modelId}`;
    const author = model.author || modelId.split("/")[0];
    const pipeline = model.pipeline_tag || "unknown";
    const downloads = model.downloads?.toLocaleString("en-GB") ?? "?";
    const likes = model.likes?.toLocaleString("en-GB") ?? "?";

    const title = `${author}/${modelId.split("/").pop()}: trending HF model (${pipeline})`;
    const summary = [
      `Pipeline: ${pipeline}`,
      `Downloads: ${downloads}`,
      `Likes: ${likes}`,
      model.cardData?.language ? `Language: ${model.cardData.language}` : null,
      model.cardData?.license ? `License: ${model.cardData.license}` : null,
    ].filter(Boolean).join(". ");

    return {
      external_id: `hf:${modelId}:${model.sha?.slice(0, 12) ?? "unknown"}`,
      url: modelUrl,
      title,
      summary,
      content_excerpt: summary,
      author,
      published_at: model.lastModified ?? null,
      raw_metadata: {
        source: "huggingface_api",
        modelId,
        pipeline_tag: pipeline,
        downloads: model.downloads,
        likes: model.likes,
        tags: model.tags ?? [],
        lastModified: model.lastModified,
        sha: model.sha,
      },
    };
  });
}
