import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getPublishedStories } from "../../lib/server/d1";

export const prerender = false;

export async function GET(context: APIContext) {
  let stories: Awaited<ReturnType<typeof getPublishedStories>> = [];
  try {
    stories = await getPublishedStories(context.locals.runtime.env.DB, { limit: 20 });
  } catch {
    console.error(JSON.stringify({ message: "RSS feed query failed" }));
  }
  return rss({
    title: "The Trace Manifest",
    description: "Evidence-linked AI intelligence. What changed, what is credible, what is disputed, and what people should actually use.",
    site: context.site ?? "https://thetracemanifest.com",
    items: stories.map((story) => ({
      title: story.headline,
      description: [
        story.summary || "",
        `Evidence: ${story.evidenceStatus}`,
        story.primarySourceName ? `Source: ${story.primarySourceName}` : "",
        `${story.sourceCount} source${story.sourceCount !== 1 ? "s" : ""}`,
      ].filter(Boolean).join(" | "),
      link: `/stories/${story.slug}`,
      pubDate: story.publishedAt ? new Date(story.publishedAt) : new Date(),
      categories: story.topic ? [story.topic] : undefined,
    })),
    customData: `<language>en</language>`,
  });
}
