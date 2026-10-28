// TRACE-OPS-01: release verification against mocked HTTP. No test contacts
// Production, GitHub or Cloudflare: every request goes to an injected fetch,
// and any URL the mock does not know fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyRelease, parseArgs } from "../../scripts/ops/release-verify.mjs";
import { exitCode, renderMarkdown, STATUS } from "../../scripts/ops/lib/report.mjs";
import { compareSnapshots, parseSnapshot, auditDeltaSql } from "../../scripts/ops/lib/snapshot.mjs";
import { validateManifest } from "../../scripts/ops/lib/manifest.mjs";
import { boundedGet, RequestBudget } from "../../scripts/ops/lib/http.mjs";

const COMMIT = "9da92ece6d51d1bfeed9b7eb1289f891a548421c";
const SITE = "https://thetracemanifest.com";
const ACCESS = "https://team.cloudflareaccess.com/cdn-cgi/access/login/thetracemanifest.com?kid=x&redirect_url=%2Fadmin";
const html = (body, extra = "") => `<!doctype html><html><head>${extra}<title>Page — The Trace Manifest</title></head><body><h1>Intelligence Feed</h1>${body}</body></html>`;
const PAGES = {
  "/": () => new Response(html("home"), { headers: { "content-type": "text/html" } }),
  "/feed": () => new Response(html("feed"), { headers: { "content-type": "text/html" } }),
  "/rss/daily.xml": () => new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>', { headers: { "content-type": "application/xml" } }),
  "/stories/google-announces-fairwind-program-for-government-cyber-defense-tools": () => new Response(html("<h1>Story</h1>"), { headers: { "content-type": "text/html" } }),
  "/stories/hugging-face-hub-migrates-from-git-lfs-to-xet-storage": () => new Response(html('<section data-retired-notice="withdrawn">Withdrawn</section>', '<meta name="robots" content="noindex">'), { headers: { "content-type": "text/html" } }),
};
const ADMIN = ["/admin", "/admin/desk", "/admin/review", "/api/admin/candidates"];
const accessRedirect = () => new Response(null, { status: 302, headers: { location: ACCESS } });
const checkRun = (conclusion = "success", status = "completed") => Response.json({ check_runs: [{ name: "Cloudflare Pages", head_sha: COMMIT, status, conclusion, started_at: "2026-10-28T21:21:18Z", completed_at: "2026-10-28T21:21:18Z", details_url: "https://dash.cloudflare.com/?to=/acct/pages/view/the-trace-manifest/a98c3f18-50e0-45b6-8890-9b1ad00367bf", output: { title: "Deployed successfully" } }] });

/** A mock world: per-path overrides; records every request; unknown URLs throw. */
function world(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, redirect: init.redirect });
    assert.equal(init.method, "GET", "only GET is ever sent");
    assert.equal(init.redirect, "manual", "redirects are never followed");
    const u = new URL(url);
    const key = u.origin === SITE ? u.pathname : u.origin + u.pathname;
    const handler = overrides[key] ?? (u.origin === SITE ? (PAGES[u.pathname] ?? (ADMIN.includes(u.pathname) ? accessRedirect : null)) : null)
      ?? (key === `https://api.github.com/repos/hourwise/The-Trace-Manifest/commits/${COMMIT}/check-runs` ? () => checkRun() : null)
      ?? (key === "https://api.github.com/repos/hourwise/The-Trace-Manifest/branches/main" ? () => Response.json({ commit: { sha: COMMIT } }) : null);
    if (!handler) throw new Error(`unexpected request ${url}`);
    return handler(init, calls.length);
  };
  return { fetchImpl, calls };
}

const files = {
  "manifest.json": readFileSync("scripts/ops/manifests/post-merge-production.json", "utf8"),
  "pr19.json": readFileSync("scripts/ops/manifests/example-pr19-production.json", "utf8"),
};
const readText = (p) => files[p] ?? readFileSync(p, "utf8");
const run = (args, w, extra = {}) => verifyRelease({ manifest: "manifest.json", commit: COMMIT, github: true, ...args }, { fetchImpl: w.fetchImpl, env: {}, readText, retryDelayMs: 1, pollIntervalMs: 1, ...extra });
const byId = (r, id) => r.checks.find((c) => c.id === id);

test("healthy release: every mandatory check passes; Cloudflare-only checks stay NOT_VERIFIED and optional", async () => {
  const w = world();
  const r = await run({}, w);
  assert.equal(r.verdict.status, STATUS.PASS, r.verdict.text);
  assert.equal(exitCode(r.verdict), 0);
  assert.equal(byId(r, "deployment.reported").status, STATUS.PASS);
  assert.equal(r.identities.pages.observed_deployment_id, "a98c3f18");
  for (const id of ["cron.production", "cron.preview", "deployment.serving"]) { assert.equal(byId(r, id).status, STATUS.NOT_VERIFIED); assert.equal(byId(r, id).mandatory, false); }
  assert.ok(w.calls.every((c) => c.method === "GET"));
  assert.ok(w.calls.length <= 5 + 4 + 2, `request count ${w.calls.length}`);
  assert.match(renderMarkdown(r), /# TRACE release verification: PASS/);
  assert.ok(r.evidence_files.every((f) => !/^([A-Za-z]:|\/)/.test(f.path) && !f.path.includes("\\")), "receipts hold repository-relative paths only");
});

test("homepage 5xx fails (after bounded retries); a transient 503 that recovers passes and is reported", async () => {
  let n = 0;
  const down = await run({}, world({ "/": () => new Response("boom", { status: 502 }) }));
  assert.equal(down.verdict.status, STATUS.FAIL);
  assert.equal(byId(down, "public.home").attempts, 3);
  assert.ok(down.stop_conditions.includes("PUBLIC_ROUTE_UNAVAILABLE"));
  const flaky = await run({}, world({ "/": () => (++n === 1 ? new Response("warming", { status: 503 }) : PAGES["/"]()) }));
  assert.equal(flaky.verdict.status, STATUS.PASS);
  assert.match(byId(flaky, "public.home").summary, /recovered after 1 transient failure/);
});

test("RSS error, malformed content and a withdrawn page without noindex fail", async () => {
  const rss = await run({}, world({ "/rss/daily.xml": () => new Response("Not found", { status: 404 }) }));
  assert.equal(byId(rss, "public.rss").status, STATUS.FAIL);
  const malformed = await run({}, world({ "/feed": () => new Response("<html>maintenance</html>", { headers: { "content-type": "text/html" } }) }));
  assert.equal(byId(malformed, "public.feed").status, STATUS.FAIL);
  assert.ok(malformed.stop_conditions.includes("PUBLIC_CONTENT_UNEXPECTED"));
  const noindex = await run({}, world({ "/stories/hugging-face-hub-migrates-from-git-lfs-to-xet-storage": () => new Response(html('<section data-retired-notice="withdrawn">x</section>'), { headers: { "content-type": "text/html" } }) }));
  assert.equal(byId(noindex, "public.story.withdrawn").status, STATUS.FAIL);
  const wrongType = await run({}, world({ "/rss/daily.xml": () => new Response("<rss><channel>", { headers: { "content-type": "text/html" } }) }));
  assert.equal(byId(wrongType, "public.rss").status, STATUS.FAIL);
});

test("an admin route reachable anonymously fails immediately with ADMIN_EXPOSED and is not retried", async () => {
  const w = world({ "/admin/desk": () => new Response(html("TRACE Desk"), { headers: { "content-type": "text/html" } }) });
  const r = await run({}, w);
  assert.equal(r.verdict.status, STATUS.FAIL);
  assert.equal(byId(r, "access.admin_desk").status, STATUS.FAIL);
  assert.ok(r.stop_conditions.includes("ADMIN_EXPOSED"));
  assert.equal(w.calls.filter((c) => c.url.endsWith("/admin/desk")).length, 1);
});

test("an Access redirect replaced by a 403, a foreign redirect or a non-login Access path fails", async () => {
  for (const [response, stop] of [
    [() => new Response("Forbidden", { status: 403 }), "ACCESS_BEHAVIOUR_CHANGED"],
    [() => new Response(null, { status: 302, headers: { location: "https://evil.example/login" } }), "ACCESS_BEHAVIOUR_CHANGED"],
    [() => new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com/somewhere-else" } }), "ACCESS_BEHAVIOUR_CHANGED"],
    [() => new Response(null, { status: 302, headers: { location: "https://thetracemanifest.com.cloudflareaccess.com.evil.example/cdn-cgi/access/login/thetracemanifest.com" } }), "ACCESS_BEHAVIOUR_CHANGED"],
  ]) {
    const r = await run({}, world({ "/api/admin/candidates": response }));
    assert.equal(byId(r, "access.api_admin").status, STATUS.FAIL);
    assert.ok(r.stop_conditions.includes(stop));
  }
});

test("a public route redirected off the allowlist fails and the redirect is not followed", async () => {
  const w = world({ "/feed": () => new Response(null, { status: 301, headers: { location: "https://evil.example/feed" } }) });
  const r = await run({}, w);
  assert.equal(byId(r, "public.feed").status, STATUS.FAIL);
  assert.ok(!w.calls.some((c) => c.url.includes("evil.example")));
});

test("timeouts fail; the request is aborted at the bound", async () => {
  const hang = (init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const started = Date.now();
  const budget = new RequestBudget("site", 5);
  const r = await boundedGet(`${SITE}/`, { fetchImpl: (u, init) => hang(init), timeoutMs: 50, budget, allowHosts: ["thetracemanifest.com"] });
  assert.equal(r.error, "timeout");
  assert.ok(Date.now() - started < 2000);
  const fast = JSON.parse(readFileSync("scripts/ops/profiles/production.json", "utf8"));
  fast.limits.timeout_ms = 50;
  files["fast-profile.json"] = JSON.stringify(fast);
  const verify = await run({ profile: "fast-profile.json" }, world({ "/admin": hang }));
  assert.equal(byId(verify, "access.admin").status, STATUS.FAIL);
  assert.ok(verify.stop_conditions.includes("ADMIN_PROTECTION_UNCONFIRMED"));
});

test("response bodies are capped; hosts outside the allowlist and plain HTTP are refused without a request", async () => {
  const budget = new RequestBudget("site", 5);
  const big = await boundedGet(`${SITE}/`, { fetchImpl: async () => new Response("x".repeat(5000)), maxBytes: 100, budget, allowHosts: ["thetracemanifest.com"] });
  assert.equal(big.truncated, true);
  assert.equal(big.bytes, 100);
  let called = 0;
  const f = async () => { called += 1; return new Response("x"); };
  assert.equal((await boundedGet("https://thetracemanifest.com.evil.example/", { fetchImpl: f, budget, allowHosts: ["thetracemanifest.com"] })).error, "host_not_allowed");
  assert.equal((await boundedGet("http://thetracemanifest.com/", { fetchImpl: f, budget, allowHosts: ["thetracemanifest.com"] })).error, "insecure_scheme");
  assert.equal(called, 0);
});

test("deployment not established within the bounded window is NOT_VERIFIED, never PASS (exit 2)", async () => {
  const w = world({ [`https://api.github.com/repos/hourwise/The-Trace-Manifest/commits/${COMMIT}/check-runs`]: () => checkRun(null, "in_progress") });
  const r = await run({}, w);
  assert.equal(byId(r, "deployment.reported").status, STATUS.NOT_VERIFIED);
  assert.equal(r.verdict.status, STATUS.NOT_VERIFIED);
  assert.equal(exitCode(r.verdict), 2);
  assert.equal(w.calls.filter((c) => c.url.includes("check-runs")).length, 20, "bounded polling");
});

test("transient propagation: a deployment that completes on a later poll passes", async () => {
  let polls = 0;
  const r = await run({}, world({ [`https://api.github.com/repos/hourwise/The-Trace-Manifest/commits/${COMMIT}/check-runs`]: () => (++polls < 3 ? Response.json({ check_runs: [] }) : checkRun()) }));
  assert.equal(byId(r, "deployment.reported").status, STATUS.PASS);
  assert.equal(byId(r, "deployment.reported").attempts, 3);
});

test("a failed Cloudflare deployment fails; a moved main is reported, not hidden", async () => {
  const failed = await run({}, world({ [`https://api.github.com/repos/hourwise/The-Trace-Manifest/commits/${COMMIT}/check-runs`]: () => checkRun("failure") }));
  assert.equal(failed.verdict.status, STATUS.FAIL);
  assert.ok(failed.stop_conditions.includes("DEPLOYMENT_FAILED"));
  const moved = await run({}, world({ "https://api.github.com/repos/hourwise/The-Trace-Manifest/branches/main": () => Response.json({ commit: { sha: "f".repeat(40) } }) }));
  assert.equal(byId(moved, "deployment.branch_head").status, STATUS.NOT_VERIFIED);
  assert.match(byId(moved, "deployment.branch_head").summary, /moved to fffffff/);
});

test("without --github the deployment is NOT_RUN, so a merge alone never yields PASS", async () => {
  const r = await run({ github: false }, world());
  assert.equal(byId(r, "deployment.reported").status, STATUS.NOT_RUN);
  assert.equal(r.verdict.status, STATUS.NOT_VERIFIED);
});

// ---- Cloudflare manual mode ----
const CF = "https://api.cloudflare.com/client/v4/accounts/" + "a".repeat(32);
function cfWorld({ version = "b09096c6-07f1-43d6-a92c-a6b1ce20db42", schedules = [], bindings = [{ name: "DB", type: "d1" }, { name: "RAW_STORE", type: "r2_bucket" }], pagesCommit = COMMIT } = {}) {
  return world({
    [`${CF}/pages/projects/the-trace-manifest/deployments`]: () => Response.json({ success: true, result: [{ short_id: "a98c3f18", latest_stage: { status: "success" }, deployment_trigger: { metadata: { commit_hash: pagesCommit } } }] }),
    [`${CF}/workers/scripts/trace-manifest-ingestion/deployments`]: () => Response.json({ success: true, result: { deployments: [{ id: "d1", versions: [{ version_id: version, percentage: 100 }] }] } }),
    [`${CF}/workers/scripts/trace-manifest-ingestion/versions/${version}`]: () => Response.json({ success: true, result: { resources: { bindings } } }),
    [`${CF}/workers/scripts/trace-manifest-ingestion/schedules`]: () => Response.json({ success: true, result: { schedules: schedules.map((cron) => ({ cron })) } }),
    [`${CF}/workers/scripts/trace-manifest-ingestion-preview/schedules`]: () => Response.json({ success: true, result: { schedules: [] } }),
  });
}
const cfEnv = { CLOUDFLARE_API_TOKEN: "test-token", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32) };
const runPr19 = (w, env = cfEnv, args = {}) => verifyRelease({ manifest: "pr19.json", github: true, cloudflare: true, ...args }, { fetchImpl: w.fetchImpl, env, readText, retryDelayMs: 1, pollIntervalMs: 1 });

test("Cloudflare mode: expected Worker version, bindings, empty Cron and serving deployment pass", async () => {
  const r = await runPr19(cfWorld(), cfEnv, { offline: false });
  for (const id of ["worker.version", "worker.bindings", "cron.production", "cron.preview", "deployment.serving"]) assert.equal(byId(r, id).status, STATUS.PASS, `${id}: ${byId(r, id).summary}`);
  assert.equal(byId(r, "database.snapshot").status, STATUS.NOT_RUN);
  assert.equal(r.verdict.status, STATUS.NOT_VERIFIED, "snapshots are mandatory in this manifest and were not supplied");
});

test("Cloudflare mode without credentials: NOT_VERIFIED and mandatory, so the verdict cannot pass", async () => {
  files["same.json"] = wrangler(BASE);
  const r = await runPr19(cfWorld(), {}, { before: "same.json", after: "same.json" });
  for (const id of ["worker.version", "cron.production"]) { assert.equal(byId(r, id).status, STATUS.NOT_VERIFIED); assert.equal(byId(r, id).mandatory, true); }
  assert.equal(byId(r, "database.snapshot").status, STATUS.PASS);
  assert.equal(r.verdict.status, STATUS.NOT_VERIFIED, "only the missing credentials keep this from passing");
  assert.match(r.verdict.text, /worker\.version/);
  assert.ok(!JSON.stringify(r).includes("test-token"));
});

test("Cloudflare mode: wrong Worker version, missing binding and non-empty Cron fail", async () => {
  const wrong = await runPr19(cfWorld({ version: "00000000-0000-0000-0000-000000000000" }));
  assert.equal(byId(wrong, "worker.version").status, STATUS.FAIL);
  assert.ok(wrong.stop_conditions.includes("WORKER_VERSION_MISMATCH"));
  const binding = await runPr19(cfWorld({ bindings: [{ name: "DB", type: "d1" }] }));
  assert.equal(byId(binding, "worker.bindings").status, STATUS.FAIL);
  const cron = await runPr19(cfWorld({ schedules: ["*/15 * * * *"] }));
  assert.equal(byId(cron, "cron.production").status, STATUS.FAIL);
  assert.ok(cron.stop_conditions.includes("CRON_NOT_EXPECTED"));
  assert.ok(!JSON.stringify(cron).includes("test-token"), "the token never reaches the receipt");
});

// ---- Manifest validation ----
test("manifest validation refuses ambiguous or unsafe release definitions", () => {
  const good = JSON.parse(files["pr19.json"]);
  assert.doesNotThrow(() => validateManifest(good));
  const bad = (mutate, re) => { const m = structuredClone(good); mutate(m); assert.throws(() => validateManifest(m), re); };
  bad((m) => { m.target = "prod"; }, /target/);
  bad((m) => { m.expected_commit = "9da92ec"; }, /40-character/);
  bad((m) => { m.approval_reference = " "; }, /approval_reference/);
  bad((m) => { m.cron.expected = ["0 * * * *"]; }, /STOP-BURN/);
  bad((m) => { m.surprise = true; }, /not a known field/);
  bad((m) => { m.database.approved_changes = ["x"]; }, /approved_changes/);
  assert.throws(() => validateManifest(good, { commitOverride: COMMIT }), /already pins/);
  assert.throws(() => validateManifest({ ...JSON.parse(files["manifest.json"]) }), /40-character/, "the post-merge manifest needs the CI commit");
  assert.throws(() => parseArgs(["--manifest"]), /needs a value/);
  assert.throws(() => parseArgs(["--deploy"]), /unknown argument/);
});

// ---- Database snapshots ----
const wrangler = (metrics) => JSON.stringify([{ success: true, results: Object.entries(metrics).map(([metric, value]) => ({ metric, value })), meta: {} }]);
const BASE = { "clusters.total": 2755, "clusters.status.published": 92, "clusters.status.withdrawn": 16, "candidates.state.new": 3751, "feed_items.total": 3000, "members.total": 3819, "audit.total": 2930, "audit.max_id": 2930, "schema.objects": "table:a,table:b" };

test("snapshots: identical is PASS; audit-only growth is EXPECTED only with an allowlisted delta", () => {
  const before = parseSnapshot(wrangler(BASE), "before");
  assert.equal(compareSnapshots(before, before).status, STATUS.PASS);
  const grown = parseSnapshot(wrangler({ ...BASE, "audit.total": 2932, "audit.max_id": 2932 }), "after");
  assert.equal(compareSnapshots(before, grown).status, STATUS.NOT_VERIFIED, "growth without a delta is unverified");
  const allow = { target_type: "admin_route", actions: ["/admin/clusters"], outcomes: ["allowed", "succeeded"] };
  const delta = parseSnapshot(wrangler({ "audit.delta.admin_route./admin/clusters.allowed": 1, "audit.delta.admin_route./admin/clusters.succeeded": 1 }), "delta");
  const ok = compareSnapshots(before, grown, { audit_delta_allow: allow }, delta);
  assert.equal(ok.status, STATUS.PASS);
  assert.ok(ok.differences.every((d) => d.class === "EXPECTED"));
  const write = parseSnapshot(wrangler({ "audit.delta.candidate.transition_candidate.succeeded": 1, "audit.delta.admin_route./admin/clusters.allowed": 1 }), "delta");
  assert.equal(compareSnapshots(before, grown, { audit_delta_allow: allow }, write).status, STATUS.FAIL, "an editorial write hidden in audit growth is unexpected");
  assert.match(auditDeltaSql(2930), /WHERE id > 2930 GROUP BY/);
  assert.throws(() => auditDeltaSql(-1));
});

test("snapshots: editorial changes are UNEXPECTED; approved changes are EXPECTED; one-sided metrics are UNVERIFIED", () => {
  const before = parseSnapshot(wrangler(BASE), "before");
  const moved = parseSnapshot(wrangler({ ...BASE, "candidates.state.new": 3750, "candidates.state.held": 1 }), "after");
  const r = compareSnapshots(before, moved);
  assert.equal(r.status, STATUS.FAIL);
  assert.deepEqual(r.differences.map((d) => [d.metric, d.class]), [["candidates.state.held", "UNEXPECTED"], ["candidates.state.new", "UNEXPECTED"]]);
  const approved = compareSnapshots(before, parseSnapshot(wrangler({ ...BASE, "clusters.total": 2756 }), "after"), { metrics: { "clusters.total": { max_increase: 1 } } });
  assert.equal(approved.status, STATUS.PASS);
  const missing = compareSnapshots(before, parseSnapshot(wrangler({ ...BASE, "feed_items.max_id": 10 }), "after"));
  assert.equal(missing.status, STATUS.NOT_VERIFIED);
  assert.throws(() => parseSnapshot('[{"success":false,"results":[]}]', "x"), /failure/);
  assert.throws(() => parseSnapshot("not json", "x"), /JSON/);
});

test("snapshot comparison through the CLI path records file hashes and makes the database check pass", async () => {
  files["before.json"] = wrangler(BASE);
  files["after.json"] = wrangler(BASE);
  const r = await runPr19(cfWorld(), cfEnv, { before: "before.json", after: "after.json" });
  assert.equal(byId(r, "database.snapshot").status, STATUS.PASS);
  assert.equal(r.verdict.status, STATUS.PASS, r.verdict.text);
  assert.ok(r.evidence_files.some((f) => f.path === "before.json" && /^[0-9a-f]{64}$/.test(f.sha256)));
});

test("offline mode runs no network checks and cannot pass a manifest that needs them", async () => {
  const w = world();
  const r = await run({ offline: true }, w);
  assert.equal(w.calls.length, 0);
  assert.equal(r.verdict.status, STATUS.NOT_VERIFIED);
});

// ---- Safety properties of the shipped files ----
test("tool sources contain no write verbs, process spawning or credential-store reads", () => {
  for (const f of ["release-verify.mjs", "lib/http.mjs", "lib/site-checks.mjs", "lib/deployment.mjs", "lib/snapshot.mjs", "lib/report.mjs", "lib/manifest.mjs"]) {
    const src = readFileSync(`scripts/ops/${f}`, "utf8");
    assert.doesNotMatch(src, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/, f);
    assert.doesNotMatch(src, /child_process|execSync|spawn\(/, f);
    assert.doesNotMatch(src, /wrangler[\\/]config|oauth_token|default\.toml/, f);
  }
});

test("the workflow is read-only, unscheduled and bounded", () => {
  const yml = readFileSync(".github/workflows/post-deploy-verify.yml", "utf8");
  assert.match(yml, /permissions:\n  contents: read\n  checks: read\n/);
  assert.doesNotMatch(yml, /schedule:|cron:/);
  assert.doesNotMatch(yml, /secrets\.(?!GITHUB_TOKEN)/);
  assert.doesNotMatch(yml, /npx wrangler|npm ci|pages deploy|d1 execute/);
  assert.match(yml, /timeout-minutes: 20/);
  assert.match(yml, /--github --out-dir ops-receipts/);
  assert.doesNotMatch(yml, /--cloudflare/);
  assert.match(yml, /persist-credentials: false/);
});
