import type { PublicStory } from "./server/d1";

export const TRACE_NOW_STORY_LIMIT = 10;

/**
 * Keep the public-story query's established order. The homepage query already
 * applies TRACE's publication/evidence ordering, so this helper only bounds
 * the set and protects the ticker from duplicate records.
 */
export function selectTraceNowStories(
  stories: readonly PublicStory[],
  limit = TRACE_NOW_STORY_LIMIT,
): PublicStory[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : TRACE_NOW_STORY_LIMIT;
  if (boundedLimit === 0) return [];

  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();

  return stories
    .filter((story) => {
      if (seenIds.has(story.id) || seenSlugs.has(story.slug)) return false;
      seenIds.add(story.id);
      seenSlugs.add(story.slug);
      return Boolean(story.slug && story.headline);
    })
    .slice(0, boundedLimit);
}

export function formatTraceNowDate(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}
