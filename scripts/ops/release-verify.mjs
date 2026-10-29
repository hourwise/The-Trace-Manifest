#!/usr/bin/env node
// TRACE-OPS-01 one-command release verification. Read-only: anonymous GETs to
// the profile's allowlisted hosts, optional read-only GitHub and Cloudflare
// APIs, and offline comparison of operator-supplied database snapshots. It
// never deploys, migrates, rolls back, enables Cron or sends a POST.
//
//   node scripts/ops/release-verify.mjs --manifest <file> [--commit <sha>]
//        [--github] [--cloudflare] [--before <json> --after <json> [--audit-delta <json>]]
//        [--offline] [--out-dir <dir>]
//   node scripts/ops/release-verify.mjs --print-snapshot-sql
//   node scripts/ops/release-verify.mjs --print-audit-delta-sql <baseline max audit id>
//
// Exit: 0 PASS, 1 FAIL, 2 mandatory verification incomplete, 3 usage/manifest error.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CheckLog, STATUS, buildReceipt, exitCode, renderMarkdown, sha256 } from "./lib/report.mjs";
import { RequestBudget } from "./lib/http.mjs";
import { runSiteChecks } from "./lib/site-checks.mjs";
import { cloudflareCredentials, verifyBranchHead, verifyCloudflare, verifyGithubDeployment } from "./lib/deployment.mjs";
import { auditDeltaSql, compareSnapshots, parseSnapshot } from "./lib/snapshot.mjs";
import { validateManifest, validateProfile } from "./lib/manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOL = { name: "trace-ops-release-verify", version: "1.0.0" };
const TOOL_FILES = ["release-verify.mjs", "lib/report.mjs", "lib/http.mjs", "lib/site-checks.mjs", "lib/deployment.mjs", "lib/snapshot.mjs", "lib/manifest.mjs"];

export function parseArgs(argv) {
  const flags = new Set(["--github", "--cloudflare", "--offline", "--print-snapshot-sql"]);
  const valued = new Set(["--manifest", "--commit", "--before", "--after", "--audit-delta", "--out-dir", "--print-audit-delta-sql", "--profile"]);
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (flags.has(a)) args[a.slice(2)] = true;
    else if (valued.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      args[a.slice(2)] = v;
    } else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

/** Runs every requested check. `deps` lets tests inject fetch, env, clock and file reads. */
export async function verifyRelease(args, deps = {}) {
  const { fetchImpl = globalThis.fetch, env = process.env, readText = (p) => readFileSync(p, "utf8"), retryDelayMs, pollIntervalMs } = deps;
  const manifestText = readText(args.manifest);
  const manifest = JSON.parse(manifestText);
  const { commit, commitSource } = validateManifest(manifest, { commitOverride: args.commit ?? null });
  const profilePath = args.profile ?? resolve(HERE, "profiles", `${manifest.profile}.json`);
  if (!/^[a-z0-9-]+$/.test(manifest.profile)) throw new Error("manifest.profile must be a profile name");
  const profileText = readText(profilePath);
  const profile = JSON.parse(profileText);
  validateProfile(profile, manifest.target);

  const log = new CheckLog();
  const budgets = {
    site: new RequestBudget("site", profile.limits.max_site_requests),
    github: new RequestBudget("github", profile.limits.max_github_requests),
    cloudflare: new RequestBudget("cloudflare", profile.limits.max_cloudflare_requests),
  };
  const scope = { deployment: true, public: true, access: true, ...(manifest.mandatory_scope ?? {}) };
  const evidence = [
    { path: args.manifest, sha256: sha256(manifestText) },
    // Repository-relative, so receipts never carry a local home-directory path.
    { path: relative(process.cwd(), profilePath).split(sep).join("/"), sha256: sha256(profileText) },
  ];
  log.record({ id: "manifest.valid", mandatory: true, status: STATUS.PASS, summary: `manifest ${manifest.release_id} and profile ${manifest.profile} validated; commit from ${commitSource}`, evidence: {} });

  let pagesObserved = null;
  let cloudflareObserved = {};
  if (args.offline) {
    for (const id of ["deployment.reported", ...profile.public_routes.map((r) => r.id), ...profile.admin_routes.map((r) => r.id)]) {
      const mandatory = id.startsWith("public.") ? scope.public : id.startsWith("access.") ? scope.access : scope.deployment;
      log.record({ id, mandatory, status: STATUS.NOT_RUN, summary: "offline run: no network checks", evidence: {} });
    }
  } else {
    if (args.github) {
      pagesObserved = await verifyGithubDeployment({
        repo: profile.repo, commit, log, budget: budgets.github, fetchImpl, token: env.GITHUB_TOKEN,
        attempts: profile.limits.deployment_poll_attempts, intervalMs: pollIntervalMs ?? profile.limits.deployment_poll_interval_ms,
        expectedDeploymentId: manifest.pages.expected_deployment_id ?? null, mandatory: scope.deployment,
      });
      await verifyBranchHead({ repo: profile.repo, branch: profile.branch, commit, log, budget: budgets.github, fetchImpl, token: env.GITHUB_TOKEN });
    } else {
      log.record({ id: "deployment.reported", mandatory: scope.deployment, status: STATUS.NOT_RUN, summary: "deployment identity not checked (run with --github or --cloudflare); a merge alone does not prove a deployment", evidence: {} });
    }
    await runSiteChecks({ profile, log, budget: budgets.site, fetchImpl, publicMandatory: scope.public, accessMandatory: scope.access, retryDelayMs });
  }
  cloudflareObserved = await verifyCloudflare({ manifest, profile, commit, log, budget: budgets.cloudflare, fetchImpl, credentials: cloudflareCredentials(env), enabled: Boolean(args.cloudflare) && !args.offline });

  // Database snapshot comparison (offline).
  const dbMandatory = manifest.database.snapshot_required;
  if (args.before && args.after) {
    const beforeText = readText(args.before), afterText = readText(args.after);
    evidence.push({ path: args.before, sha256: sha256(beforeText) }, { path: args.after, sha256: sha256(afterText) });
    let delta = null;
    if (args["audit-delta"]) {
      const deltaText = readText(args["audit-delta"]);
      evidence.push({ path: args["audit-delta"], sha256: sha256(deltaText) });
      delta = parseSnapshot(deltaText, "audit delta");
    }
    const rules = { metrics: manifest.database.approved_changes === "none" ? {} : manifest.database.approved_changes, audit_delta_allow: manifest.database.audit_delta_allow };
    const result = compareSnapshots(parseSnapshot(beforeText, "before"), parseSnapshot(afterText, "after"), rules, delta);
    log.record({
      id: "database.snapshot", mandatory: dbMandatory, status: result.status,
      summary: `${result.counts.UNCHANGED} unchanged, ${result.counts.EXPECTED} expected, ${result.counts.UNEXPECTED} unexpected, ${result.counts.UNVERIFIED} unverified`,
      evidence: { differences: result.differences }, stop: result.status === STATUS.FAIL ? "UNEXPECTED_DATABASE_CHANGE" : null,
    });
  } else {
    log.record({ id: "database.snapshot", mandatory: dbMandatory, status: STATUS.NOT_RUN, summary: args.before || args.after ? "both --before and --after are required" : "no snapshots supplied", evidence: {} });
  }

  const toolHashes = Object.fromEntries(TOOL_FILES.map((f) => [f, sha256(readFileSync(join(HERE, f)))]));
  return buildReceipt({
    tool: { ...TOOL, source_sha256: toolHashes },
    target: manifest.target,
    releaseId: manifest.release_id,
    approvalReference: manifest.approval_reference,
    identities: {
      expected_commit: commit, commit_source: commitSource,
      pages: { project: manifest.pages.project, expected_deployment_id: manifest.pages.expected_deployment_id ?? null, observed_deployment_id: pagesObserved?.short_id ?? cloudflareObserved.pages_latest?.short_id ?? null },
      worker: manifest.worker ? { name: manifest.worker.name, expected_version_id: manifest.worker.expected_version_id ?? null, observed_version_id: cloudflareObserved.worker_version ?? null } : null,
    },
    mode: { github: Boolean(args.github), cloudflare: Boolean(args.cloudflare), snapshots: Boolean(args.before && args.after), offline: Boolean(args.offline) },
    budget: Object.fromEntries(Object.entries(budgets).map(([k, b]) => [k, b.toJSON()])),
    log,
    evidenceFiles: evidence,
  });
}

export function writeReceipt(receipt, outDir) {
  mkdirSync(outDir, { recursive: true });
  const stamp = receipt.generated_at.replace(/[:.]/g, "-");
  const base = join(outDir, `release-${receipt.target}-${receipt.identities.expected_commit.slice(0, 7)}-${stamp}`);
  const json = JSON.stringify(receipt, null, 2) + "\n";
  writeFileSync(`${base}.json`, json, { flag: "wx" });
  writeFileSync(`${base}.md`, renderMarkdown({ ...receipt, evidence_files: [...receipt.evidence_files] }), { flag: "wx" });
  return { json: `${base}.json`, markdown: `${base}.md`, json_sha256: sha256(json) };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 3; }
  if (args["print-snapshot-sql"]) { process.stdout.write(readFileSync(join(HERE, "release-snapshot.sql"), "utf8")); return 0; }
  if (args["print-audit-delta-sql"]) {
    try { console.log(auditDeltaSql(Number(args["print-audit-delta-sql"]))); return 0; } catch (e) { console.error(e.message); return 3; }
  }
  if (!args.manifest) { console.error("--manifest is required"); return 3; }
  let receipt;
  try { receipt = await verifyRelease(args); } catch (e) { console.error(`refused: ${e.message}`); return 3; }
  const files = writeReceipt(receipt, args["out-dir"] ?? "ops-receipts");
  console.log(`${receipt.verdict.text}\nreceipt: ${files.json} (sha256 ${files.json_sha256})\nreport:  ${files.markdown}`);
  return exitCode(receipt.verdict);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
