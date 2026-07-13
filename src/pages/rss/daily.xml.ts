import rss from "@astrojs/rss";
import type { APIContext } from "astro";

export const prerender = false;

const briefingItems = [
  {
    title: "New frontier model announced — vendor claims coding SOTA",
    description: "First major release in six weeks. Independent benchmarks not yet available. Approach with caution. Rating: Vendor-reported.",
    link: "/stories/new-frontier-model-july-2026",
    pubDate: new Date("2026-07-12"),
    categories: ["Frontier Models"],
  },
  {
    title: "Open-weight model beats proprietary models on local hardware under 16 GB",
    description: "Multiple independent tests confirm. Practical impact for local-model users is high. Rating: Confirmed.",
    link: "/stories/open-weight-model-16gb-july-2026",
    pubDate: new Date("2026-07-11"),
    categories: ["Open-weight Models"],
  },
  {
    title: "Critical prompt injection vulnerability in popular agent framework — patch now",
    description: "Affects widely deployed agent systems. Exploit is straightforward. Patches available. Rating: Confirmed.",
    link: "/stories/prompt-injection-advisory-july-2026",
    pubDate: new Date("2026-07-11"),
    categories: ["Security"],
  },
  {
    title: "Provider API pricing drops 40% on mid-tier — comparison tables updated",
    description: "Significant cost reduction for developers. Multiple providers competing on price. Rating: Confirmed.",
    link: "/stories/provider-pricing-drop-july-2026",
    pubDate: new Date("2026-07-10"),
    categories: ["Provider Updates"],
  },
  {
    title: "EU AI Act implementation guidance published",
    description: "Regulatory clarity for EU deployments. Classification thresholds and compliance timelines detailed. Rating: Confirmed.",
    link: "/stories/eu-ai-act-guidance-july-2026",
    pubDate: new Date("2026-07-10"),
    categories: ["Regulation"],
  },
];

export async function GET(context: APIContext) {
  return rss({
    title: "The Trace Manifest — Daily Briefing",
    description: "Evidence-linked AI intelligence. What changed, what is credible, what is disputed, and what people should actually use.",
    site: context.site ?? "https://thetracemanifest.com",
    items: briefingItems.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      pubDate: item.pubDate,
      categories: item.categories,
    })),
    customData: `<language>en</language>`,
  });
}
