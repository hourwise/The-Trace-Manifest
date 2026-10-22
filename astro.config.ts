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
    // TRACE has no astro:assets usage. Passthrough keeps the Sharp image
    // service (GHSA-26w7-cxv4-gfx2, AVIF decoding) out of build and runtime.
    imageService: "passthrough",
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
