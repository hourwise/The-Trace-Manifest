import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const textExtensions = new Set([".ts", ".astro", ".js", ".mjs", ".json", ".toml", ".md", ".sql", ".yml", ".yaml"]);

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory)) {
    if (["node_modules", "dist", ".git"].includes(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) output.push(...filesUnder(path));
    else if (textExtensions.has(extname(path))) output.push(path);
  }
  return output;
}

const files = ["src", "workers", "scripts"].flatMap((directory) => filesUnder(join(root, directory)));
const sources = new Map(files.map((file) => [relative(root, file).replaceAll("\\", "/"), readFileSync(file, "utf8")]));
const isRuntimeSource = (path) => path.startsWith("src/") || path.startsWith("workers/");

function forbid(pattern, message, predicate = () => true) {
  for (const [path, source] of sources) {
    if (predicate(path) && pattern.test(source)) failures.push(`${message}: ${path}`);
    pattern.lastIndex = 0;
  }
}

forbid(/api\.deepseek\.com/i, "direct provider URL outside the server adapter", (path) => isRuntimeSource(path) && path !== "src/ai/providers/deepseek.ts");
forbid(/DeepSeekProvider/, "provider adapter imported outside the model gateway", (path) => isRuntimeSource(path) && !["src/ai/providers/deepseek.ts", "src/ai/trace-model-gateway.ts"].includes(path));
forbid(/ADMIN_API_TOKEN|MASTER_ADMIN_TOKEN|X-Session-Id/i, "retired authentication or quota-bypass contract", isRuntimeSource);
forbid(/sessionStorage|localStorage/i, "browser persistence is forbidden in admin or AI paths", (path) => path.startsWith("src/pages/admin") || path.startsWith("src/pages/api"));
forbid(/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/i, "wildcard CORS policy");
forbid(/sk-[A-Za-z0-9_-]{20,}/, "provider-shaped plaintext secret in the working tree");

for (const retired of ["src/ai/budget-policy.ts", "src/ai/circuit-breaker.ts", "src/ai/usage-ledger.ts"]) {
  if (existsSync(join(root, retired))) failures.push(`retired in-memory enforcement file still exists: ${retired}`);
}

const config = readFileSync(join(root, "src/ai/config.ts"), "utf8");
if (!config.includes('env("TRACE_AI_PUBLIC_ENABLED") === "true"')) failures.push("public AI does not default fail-closed");
if (!config.includes('env("TRACE_AI_EDITORIAL_ENABLED") === "true"')) failures.push("editorial AI does not default fail-closed");
if (!config.includes("maxRetries: 0") || !config.includes("maxModelCallsPerRequest: 1")) failures.push("single-attempt gateway policy is missing");

const migration = readFileSync(join(root, "db/migration-stabilisation-security.sql"), "utf8");
for (const table of ["ai_requests", "ai_budget_reservations", "ai_usage_ledger", "ai_quota_usage", "ai_concurrency_leases", "ai_circuit_breakers", "admin_request_nonces", "admin_audit_log"]) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`durable control table is missing: ${table}`);
}

try {
  const history = execFileSync("git", ["log", "-p", "--all", "--no-ext-diff", "--", ".", ":!package-lock.json"], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const secretPatterns = [
    /sk-[A-Za-z0-9_-]{32,}/,
    /gh[pousr]_[A-Za-z0-9]{36,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  for (const pattern of secretPatterns) if (pattern.test(history)) failures.push(`secret-shaped value found in Git history: ${pattern}`);
} catch (error) {
  failures.push(`Git history scan could not run: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Security boundary checks passed across ${sources.size} source files and Git history.`);
