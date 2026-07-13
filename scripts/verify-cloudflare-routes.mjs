import { readFileSync } from "node:fs";

const routes = JSON.parse(readFileSync("dist/_routes.json", "utf8"));
const requiredRoutes = ["/api/admin/ai-triage", "/api/trace/ask"];

function patternMatches(pattern, route) {
  if (pattern.endsWith("/*")) return route.startsWith(pattern.slice(0, -1));
  return pattern === route;
}

for (const route of requiredRoutes) {
  const included = routes.include.some(pattern => patternMatches(pattern, route));
  const excluded = routes.exclude.some(pattern => patternMatches(pattern, route));
  if (!included || excluded) {
    throw new Error(`Cloudflare build does not route ${route} to the Pages Function.`);
  }
}

for (const modulePath of [
  "dist/_worker.js/pages/api/admin/ai-triage.astro.mjs",
  "dist/_worker.js/pages/api/trace/ask.astro.mjs",
]) {
  const moduleSource = readFileSync(modulePath, "utf8");
  if (moduleSource.includes("Contents removed by Astro as it's used for prerendering only")) {
    throw new Error(`${modulePath} was stripped during prerendering.`);
  }
  if (!moduleSource.includes("const prerender = false")) {
    throw new Error(`${modulePath} is not configured for on-demand rendering.`);
  }
}

const endpointSource = readFileSync("src/pages/api/admin/ai-triage.ts", "utf8");
if (endpointSource.includes("api.deepseek.com")) {
  throw new Error("AI triage endpoint bypasses the TRACE model gateway.");
}

console.log("Verified Cloudflare API routing and TRACE gateway boundary.");
