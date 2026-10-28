// TRACE-OPS-01: deployment and Worker identity. Read-only APIs only.
//
// GitHub mode (no Cloudflare credentials): Cloudflare's GitHub app posts a
// "Cloudflare Pages" check run on each deployed commit. Its success is
// Cloudflare's own report that the deployment for this commit succeeded.
// It does NOT prove the Production alias still serves that deployment, so
// "serving" stays NOT_VERIFIED unless the Cloudflare API mode confirms it.
//
// Cloudflare mode needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
// environment, supplied by the operator for a manual run. Nothing here reads
// Wrangler's stored login or any other credential store.
import { STATUS } from "./report.mjs";
import { boundedGet, sleep } from "./http.mjs";

async function getJson(url, { fetchImpl, budget, allowHosts, token, timeoutMs = 10_000 }) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await boundedGet(url, { fetchImpl, budget, allowHosts, headers, timeoutMs, maxBytes: 1_000_000 });
  if (r.error) return { error: r.error };
  try { return { status: r.status, json: JSON.parse(r.body) }; } catch { return { status: r.status, error: "invalid_json" }; }
}

const GITHUB_HOSTS = ["api.github.com"];
const CLOUDFLARE_HOSTS = ["api.cloudflare.com"];

/** Poll the commit's "Cloudflare Pages" check run within a bounded window. */
export async function verifyGithubDeployment({ repo, commit, log, budget, fetchImpl, token, attempts, intervalMs, expectedDeploymentId, mandatory = true }) {
  const startedAt = new Date().toISOString();
  const url = `https://api.github.com/repos/${repo}/commits/${commit}/check-runs?check_name=${encodeURIComponent("Cloudflare Pages")}`;
  let last = "no response";
  let observed = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const r = await getJson(url, { fetchImpl, budget, allowHosts: GITHUB_HOSTS, token });
    if (r.error === "budget_exhausted") { last = "request budget exhausted"; break; }
    if (r.error || r.status !== 200) { last = r.error ?? `GitHub API ${r.status}`; }
    else {
      const run = [...(r.json.check_runs ?? [])].filter((c) => c.head_sha === commit).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
      if (!run) last = "no Cloudflare Pages check run yet";
      else if (run.status !== "completed") last = `Cloudflare Pages check ${run.status}`;
      else {
        const id = /\/pages\/view\/[^/]+\/([0-9a-f-]{36})/.exec(run.details_url ?? "")?.[1] ?? null;
        observed = { conclusion: run.conclusion, deployment_id: id, short_id: id?.slice(0, 8) ?? null, completed_at: run.completed_at, title: run.output?.title ?? null };
        if (run.conclusion !== "success") {
          log.record({ id: "deployment.reported", mandatory, startedAt, attempts: attempt, status: STATUS.FAIL, summary: `Cloudflare Pages reported ${run.conclusion} for ${commit.slice(0, 7)}`, evidence: observed, stop: "DEPLOYMENT_FAILED" });
          return observed;
        }
        const idMatches = !expectedDeploymentId || (id && (id === expectedDeploymentId || id.startsWith(expectedDeploymentId)));
        log.record({
          id: "deployment.reported", mandatory, startedAt, attempts: attempt,
          status: idMatches ? STATUS.PASS : STATUS.FAIL,
          summary: idMatches
            ? `Cloudflare Pages reported a successful deployment ${observed.short_id ?? "(id not parsed)"} for ${commit.slice(0, 7)} at ${run.completed_at}`
            : `deployment ${observed.short_id} does not match expected ${expectedDeploymentId}`,
          evidence: observed, stop: idMatches ? null : "DEPLOYMENT_IDENTITY_MISMATCH",
        });
        return observed;
      }
    }
    if (attempt < attempts) await sleep(intervalMs);
  }
  log.record({ id: "deployment.reported", mandatory, startedAt, attempts, status: STATUS.NOT_VERIFIED, summary: `deployment of ${commit.slice(0, 7)} not established within the bounded window: ${last}`, evidence: { last } });
  return observed;
}

/** Whether the expected commit is still the head of the deployed branch. */
export async function verifyBranchHead({ repo, branch, commit, log, budget, fetchImpl, token, mandatory = false }) {
  const startedAt = new Date().toISOString();
  const r = await getJson(`https://api.github.com/repos/${repo}/branches/${branch}`, { fetchImpl, budget, allowHosts: GITHUB_HOSTS, token });
  const head = r.json?.commit?.sha;
  if (r.error || r.status !== 200 || !head) {
    log.record({ id: "deployment.branch_head", mandatory, startedAt, status: STATUS.NOT_VERIFIED, summary: `could not read ${branch} head: ${r.error ?? r.status}`, evidence: {} });
    return;
  }
  log.record({
    id: "deployment.branch_head", mandatory, startedAt,
    status: head === commit ? STATUS.PASS : STATUS.NOT_VERIFIED,
    summary: head === commit ? `${commit.slice(0, 7)} is still the head of ${branch}` : `${branch} has moved to ${head.slice(0, 7)}; the served deployment may be a later one`,
    evidence: { head },
  });
}

export function cloudflareCredentials(env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  return token && /^[0-9a-f]{32}$/.test(account ?? "") ? { token, account } : null;
}

/** Manual mode: Pages production deployment, Worker version, bindings and Cron. */
export async function verifyCloudflare({ manifest, profile, commit, log, budget, fetchImpl, credentials, enabled }) {
  const mandatoryCron = manifest.cron.mandatory !== false;
  const worker = manifest.worker;
  const ids = [
    ["deployment.serving", false],
    ...(worker ? [["worker.version", Boolean(worker.expected_version_id)], ["worker.bindings", Boolean(worker.expected_bindings?.length)]] : []),
    ...profile.workers.map((w) => [`cron.${w.label}`, mandatoryCron && enabled]),
  ];
  if (!enabled || !credentials) {
    const why = !enabled ? "Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials)" : "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not supplied";
    for (const [id, mandatory] of ids) log.record({ id, mandatory: enabled ? mandatory : false, status: STATUS.NOT_VERIFIED, summary: `${why}; not verified`, evidence: {} });
    return {};
  }
  const api = (path) => getJson(`https://api.cloudflare.com/client/v4/accounts/${credentials.account}${path}`, { fetchImpl, budget, allowHosts: CLOUDFLARE_HOSTS, token: credentials.token });
  const observed = {};

  // Pages: is the expected commit the latest successful Production deployment?
  {
    const startedAt = new Date().toISOString();
    const r = await api(`/pages/projects/${profile.pages_project}/deployments?env=production&per_page=5`);
    if (r.error || !r.json?.success) log.record({ id: "deployment.serving", mandatory: false, startedAt, status: STATUS.NOT_VERIFIED, summary: `Pages API unavailable: ${r.error ?? r.status}`, evidence: {} });
    else {
      const list = r.json.result ?? [];
      const latest = list.find((d) => d.latest_stage?.status === "success");
      const latestCommit = latest?.deployment_trigger?.metadata?.commit_hash ?? null;
      observed.pages_latest = latest ? { short_id: latest.short_id, commit: latestCommit } : null;
      const serving = latestCommit === commit;
      const present = list.some((d) => d.deployment_trigger?.metadata?.commit_hash === commit);
      log.record({
        id: "deployment.serving", mandatory: false, startedAt,
        status: serving ? STATUS.PASS : STATUS.NOT_VERIFIED,
        summary: serving ? `latest successful Production deployment ${latest.short_id} is ${commit.slice(0, 7)}` : present ? `a later Production deployment (${latestCommit?.slice(0, 7)}) is serving` : `no recent Production deployment for ${commit.slice(0, 7)}`,
        evidence: observed.pages_latest ?? {},
      });
    }
  }

  if (worker) {
    const startedAt = new Date().toISOString();
    const d = await api(`/workers/scripts/${worker.name}/deployments`);
    const latest = d.json?.result?.deployments?.[0];
    const full = latest?.versions?.find((v) => v.percentage === 100) ?? null;
    observed.worker_version = full?.version_id ?? null;
    if (!latest) log.record({ id: "worker.version", mandatory: Boolean(worker.expected_version_id), startedAt, status: STATUS.NOT_VERIFIED, summary: `Worker deployments unavailable: ${d.error ?? d.status}`, evidence: {} });
    else if (!worker.expected_version_id) log.record({ id: "worker.version", mandatory: false, startedAt, status: STATUS.NOT_VERIFIED, summary: `no expected version in the manifest; observed ${observed.worker_version}`, evidence: { observed: observed.worker_version } });
    else log.record({
      id: "worker.version", mandatory: true, startedAt,
      status: observed.worker_version === worker.expected_version_id ? STATUS.PASS : STATUS.FAIL,
      summary: observed.worker_version === worker.expected_version_id ? `${worker.name} serves ${worker.expected_version_id} at 100%` : `${worker.name} serves ${observed.worker_version ?? "a split deployment"}, expected ${worker.expected_version_id}`,
      evidence: { observed: observed.worker_version, deployment_id: latest.id }, stop: observed.worker_version === worker.expected_version_id ? null : "WORKER_VERSION_MISMATCH",
    });

    const bindingsStarted = new Date().toISOString();
    if (!worker.expected_bindings?.length) log.record({ id: "worker.bindings", mandatory: false, startedAt: bindingsStarted, status: STATUS.NOT_VERIFIED, summary: "no expected bindings in the manifest", evidence: {} });
    else if (!observed.worker_version) log.record({ id: "worker.bindings", mandatory: true, startedAt: bindingsStarted, status: STATUS.NOT_VERIFIED, summary: "no single active version to inspect", evidence: {} });
    else {
      const v = await api(`/workers/scripts/${worker.name}/versions/${observed.worker_version}`);
      const actual = (v.json?.result?.resources?.bindings ?? []).map((b) => ({ name: b.name, type: b.type, ...(b.id ? { id: b.id } : {}), ...(b.bucket_name ? { bucket_name: b.bucket_name } : {}) }));
      const missing = worker.expected_bindings.filter((e) => !actual.some((a) => a.name === e.name && a.type === e.type && (!e.id || a.id === e.id)));
      log.record({
        id: "worker.bindings", mandatory: true, startedAt: bindingsStarted,
        status: v.error || !v.json?.success ? STATUS.NOT_VERIFIED : missing.length ? STATUS.FAIL : STATUS.PASS,
        summary: v.error || !v.json?.success ? `version API unavailable: ${v.error ?? v.status}` : missing.length ? `missing or different bindings: ${missing.map((m) => `${m.name}:${m.type}`).join(", ")}` : `all ${worker.expected_bindings.length} expected bindings present (${actual.map((a) => a.name).join(", ")})`,
        evidence: { names: actual.map((a) => `${a.name}:${a.type}`) }, stop: missing.length && !v.error ? "WORKER_BINDINGS_MISMATCH" : null,
      });
    }
  }

  for (const w of profile.workers) {
    const startedAt = new Date().toISOString();
    const s = await api(`/workers/scripts/${w.name}/schedules`);
    const schedules = s.json?.success ? s.json.result?.schedules : undefined;
    if (!Array.isArray(schedules)) log.record({ id: `cron.${w.label}`, mandatory: mandatoryCron, startedAt, status: STATUS.NOT_VERIFIED, summary: `schedules API unavailable: ${s.error ?? s.status}`, evidence: {} });
    else {
      const ok = JSON.stringify(schedules.map((x) => x.cron)) === JSON.stringify(manifest.cron.expected);
      log.record({
        id: `cron.${w.label}`, mandatory: mandatoryCron, startedAt,
        status: ok ? STATUS.PASS : STATUS.FAIL,
        summary: ok ? `${w.name} schedules = ${JSON.stringify(manifest.cron.expected)}` : `${w.name} has schedules ${JSON.stringify(schedules.map((x) => x.cron))}, expected ${JSON.stringify(manifest.cron.expected)}`,
        evidence: { schedules: schedules.map((x) => x.cron) }, stop: ok ? null : "CRON_NOT_EXPECTED",
      });
    }
  }
  return observed;
}
