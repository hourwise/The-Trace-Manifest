import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const routes = JSON.parse(readFileSync("dist/_routes.json", "utf8"));
const requiredRoutes = ["/api/admin/ai-triage", "/api/admin/publish-story", "/api/trace/ask", "/admin"];

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

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:m?js)$/.test(path) ? [path] : [];
  });
}

const workerSource = sourceFiles("dist/_worker.js").map((path) => readFileSync(path, "utf8")).join("\n");
for (const marker of ["Ask TRACE is not currently enabled", "Admin service is not configured", "Cf-Access-Jwt-Assertion"]) {
  if (!workerSource.includes(marker)) throw new Error(`Cloudflare worker bundle is missing runtime boundary: ${marker}`);
}

const browserSource = sourceFiles("dist/_astro").map((path) => readFileSync(path, "utf8")).join("\n");
for (const marker of [
  "DEEPSEEK_API_KEY", "TRACE_INTERNAL_SERVICE_SECRET", "CF_ACCESS_AUD",
  "api.deepseek.com", "DeepSeekProvider",
]) {
  if (browserSource.includes(marker)) throw new Error(`Browser bundle contains server-only marker: ${marker}`);
}

const endpointSource = readFileSync("src/pages/api/admin/ai-triage.ts", "utf8");
if (endpointSource.includes("api.deepseek.com")) {
  throw new Error("AI triage endpoint bypasses the TRACE model gateway.");
}

console.log("Verified Cloudflare API routing and TRACE gateway boundary.");
