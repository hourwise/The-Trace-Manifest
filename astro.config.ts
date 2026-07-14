import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://thetracemanifest.com",
  integrations: [sitemap()],
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
  build: {
    format: "directory",
  },
});
