import assert from "node:assert/strict";
import type { PublicStory } from "../src/lib/server/d1";
import { formatTraceNowDate, selectTraceNowStories } from "../src/lib/trace-now";

function story(id: number, slug: string, headline = `Story ${id}`): PublicStory {
  return {
    id,
    slug,
    headline,
    summary: "Summary",
    editorialAnalysis: null,
    whyItMatters: null,
    headlineImageUrl: null,
    topic: "Research",
    evidenceStatus: "confirmed",
    sourceClass: "primary",
    publicationStatus: "published",
    publishedAt: "2026-09-05T12:00:00.000Z",
    lastCheckedAt: "2026-09-05T12:00:00.000Z",
    reviewedBy: "publisher",
    reviewedAt: "2026-09-05T12:00:00.000Z",
    sourceCount: 1,
    primarySourceUrl: "https://example.com/story",
    primarySourceName: "Example",
  };
}

const first = story(1, "first");
const second = story(2, "second");
const duplicateId = story(1, "first-again");
const duplicateSlug = story(3, "second");

assert.deepEqual(selectTraceNowStories([first, second, duplicateId, duplicateSlug]), [first, second]);
assert.deepEqual(selectTraceNowStories([first, second], 1), [first]);
assert.deepEqual(selectTraceNowStories([first, second], 0), []);
assert.deepEqual(selectTraceNowStories([]), []);
assert.equal(formatTraceNowDate(first.publishedAt), "5 Sept");
assert.equal(formatTraceNowDate(null), null);
assert.equal(formatTraceNowDate("not-a-date"), null);

console.log("trace-now-ticker tests passed");
