// Production dependency gate. Runs `npm audit --omit=dev --json` and fails on any
// advisory at or above the configured threshold unless an owner-approved,
// advisory-scoped exception covers it. An exception only counts while it has
// not expired and its reachability guards still hold in the working tree.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export const GUARDS = {
  "astro-image-service-passthrough": (root) =>
    /imageService:\s*["']passthrough["']/.test(readFileSync(join(root, "astro.config.ts"), "utf8")),
  "no-astro-assets-imports": (root) => !filesUnder(join(root, "src")).some((file) => /["']astro:assets["']/.test(readFileSync(file, "utf8"))),
  "no-remote-image-patterns": (root) => !/remotePatterns|image\s*:\s*\{[^}]*domains/s.test(readFileSync(join(root, "astro.config.ts"), "utf8")),
};

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [/\.(astro|ts|tsx|js|mjs)$/.test(entry) ? path : []].flat();
  });
}

/** Unique advisories from an npm audit v2 JSON report. */
export function advisoriesFrom(report) {
  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const id = String(via.url ?? "").split("/").pop() || String(via.source);
      advisories.set(`${via.name}:${id}`, { id, package: via.name, severity: via.severity, title: via.title ?? "" });
    }
  }
  return [...advisories.values()];
}

export function evaluateAudit({ report, policy, today, guardResults }) {
  if (!report || typeof report !== "object" || report.error || !report.vulnerabilities) {
    return { ok: false, blocking: [`npm audit did not return a usable report${report?.error ? `: ${JSON.stringify(report.error)}` : ""}`], excepted: [], stale: [] };
  }
  const threshold = SEVERITY_RANK[policy.threshold];
  if (threshold === undefined) return { ok: false, blocking: [`unknown threshold ${policy.threshold}`], excepted: [], stale: [] };
  const advisories = advisoriesFrom(report);
  const blocking = [];
  const excepted = [];
  for (const advisory of advisories) {
    if ((SEVERITY_RANK[advisory.severity] ?? 4) < threshold) continue;
    const exception = policy.exceptions.find((candidate) => candidate.advisory === advisory.id && candidate.package === advisory.package);
    if (!exception) { blocking.push(`${advisory.severity} ${advisory.package} ${advisory.id} has no exception`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires) || today > exception.expires) { blocking.push(`${advisory.package} ${advisory.id} exception expired on ${exception.expires}`); continue; }
    const failedGuards = (exception.guards ?? []).filter((guard) => guardResults[guard] !== true);
    if (failedGuards.length) { blocking.push(`${advisory.package} ${advisory.id} exception guards no longer hold: ${failedGuards.join(", ")}`); continue; }
    excepted.push(`${advisory.severity} ${advisory.package} ${advisory.id} (expires ${exception.expires})`);
  }
  const present = new Set(advisories.map((advisory) => `${advisory.package}:${advisory.id}`));
  const stale = policy.exceptions.filter((exception) => !present.has(`${exception.package}:${exception.advisory}`)).map((exception) => `${exception.package} ${exception.advisory}`);
  return { ok: blocking.length === 0, blocking, excepted, stale };
}

function main() {
  const root = process.cwd();
  const policy = JSON.parse(readFileSync(join(root, "scripts/audit-exceptions.json"), "utf8"));
  let raw;
  try {
    // Fixed command string: no interpolated input reaches the shell.
    raw = execSync("npm audit --omit=dev --json", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    raw = error.stdout; // npm audit exits 1 whenever vulnerabilities exist
  }
  let report;
  try { report = JSON.parse(raw); } catch { report = null; }
  const guardNames = [...new Set(policy.exceptions.flatMap((exception) => exception.guards ?? []))];
  const guardResults = Object.fromEntries(guardNames.map((name) => [name, Boolean(GUARDS[name]?.(root))]));
  const result = evaluateAudit({ report, policy, today: new Date().toISOString().slice(0, 10), guardResults });
  for (const line of result.excepted) console.log(`excepted: ${line}`);
  for (const line of result.stale) console.warn(`stale exception (advisory no longer reported; remove it): ${line}`);
  if (!result.ok) {
    console.error(result.blocking.map((line) => `- ${line}`).join("\n"));
    process.exit(1);
  }
  console.log(`Production dependency gate passed at threshold "${policy.threshold}".`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
