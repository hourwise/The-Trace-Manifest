// TRACE-OPS-01: anonymous public-route and admin-protection checks. GET only.
// A public route may be retried for transient 5xx/timeouts (deployment
// propagation); an exposed admin route is never retried: it fails at once.
import { STATUS } from "./report.mjs";
import { boundedGet, sleep } from "./http.mjs";

const TRANSIENT = (r) => r.error === "timeout" || r.error === "network" || (r.status >= 500 && r.status <= 599) || r.status === 429;

function evaluatePublic(route, r) {
  const expect = route.expect;
  if (r.error) return { ok: false, reason: `request ${r.error}${r.detail ? `: ${r.detail}` : ""}`, stop: r.error === "host_not_allowed" || r.error === "insecure_scheme" ? "CONFIGURATION_REFUSED" : "PUBLIC_ROUTE_UNAVAILABLE" };
  if (r.status >= 300 && r.status < 400) return { ok: false, reason: `unexpected redirect ${r.status} to ${r.location ?? "(no location)"}`, stop: "PUBLIC_ROUTE_REDIRECTED" };
  if (r.status !== expect.status) return { ok: false, reason: `status ${r.status}, expected ${expect.status}`, stop: r.status >= 500 ? "PUBLIC_ROUTE_UNAVAILABLE" : "PUBLIC_ROUTE_WRONG_STATUS" };
  if (r.truncated) return { ok: false, reason: `response exceeded the ${r.bytes}-byte cap`, stop: "PUBLIC_CONTENT_UNEXPECTED" };
  if (expect.content_type && !r.contentType.toLowerCase().includes(expect.content_type)) return { ok: false, reason: `content-type "${r.contentType}", expected "${expect.content_type}"`, stop: "PUBLIC_CONTENT_UNEXPECTED" };
  for (const marker of expect.contains ?? []) if (!r.body.includes(marker)) return { ok: false, reason: `missing expected content ${JSON.stringify(marker)}`, stop: "PUBLIC_CONTENT_UNEXPECTED" };
  for (const marker of expect.not_contains ?? []) if (r.body.includes(marker)) return { ok: false, reason: `contains forbidden content ${JSON.stringify(marker)}`, stop: "PUBLIC_CONTENT_UNEXPECTED" };
  return { ok: true, reason: `${r.status} ${r.contentType.split(";")[0]}, ${r.bytes} bytes, ${(expect.contains ?? []).length} marker(s) present, ${(expect.not_contains ?? []).length} absent` };
}

/** Access protection: the only PASS is a redirect to the Access login for this site. */
export function evaluateAdmin(profile, r) {
  if (r.error) return { ok: false, reason: `request ${r.error}; protection could not be confirmed`, stop: r.error === "host_not_allowed" ? "CONFIGURATION_REFUSED" : "ADMIN_PROTECTION_UNCONFIRMED" };
  if (r.status >= 200 && r.status < 300) return { ok: false, reason: `anonymous request returned ${r.status}: protected route is publicly reachable`, stop: "ADMIN_EXPOSED" };
  if (r.status >= 300 && r.status < 400) {
    let location;
    try { location = new URL(r.location ?? "", r.url); } catch { return { ok: false, reason: `redirect ${r.status} with an unparseable location`, stop: "ACCESS_BEHAVIOUR_CHANGED" }; }
    const accessHost = location.protocol === "https:" && (profile.access.team_host ? location.hostname === profile.access.team_host : location.hostname.endsWith(".cloudflareaccess.com"));
    const loginPath = location.pathname === `/cdn-cgi/access/login/${profile.access.application_host}`;
    if (accessHost && loginPath) return { ok: true, reason: `${r.status} to Cloudflare Access login (${location.hostname}); redirect not followed` };
    return { ok: false, reason: `${r.status} redirect to ${location.origin}${location.pathname}, not the Cloudflare Access login`, stop: "ACCESS_BEHAVIOUR_CHANGED" };
  }
  return { ok: false, reason: `status ${r.status} instead of the Cloudflare Access redirect`, stop: r.status >= 500 ? "ADMIN_PROTECTION_UNCONFIRMED" : "ACCESS_BEHAVIOUR_CHANGED" };
}

export async function runSiteChecks({ profile, log, budget, fetchImpl, publicMandatory = true, accessMandatory = true, retryDelayMs = 5_000 }) {
  const base = `https://${profile.site_host}`;
  const http = { fetchImpl, timeoutMs: profile.limits.timeout_ms, maxBytes: profile.limits.max_response_bytes, budget, allowHosts: profile.allow_hosts };
  for (const route of profile.public_routes) {
    const startedAt = new Date().toISOString();
    let attempt = 0;
    let result;
    let outcome;
    const history = [];
    while (true) {
      attempt += 1;
      result = await boundedGet(base + route.path, http);
      history.push(result.error ?? result.status);
      outcome = evaluatePublic(route, result);
      if (outcome.ok || !TRANSIENT(result) || attempt > profile.limits.public_retries || result.error === "budget_exhausted") break;
      await sleep(retryDelayMs * attempt);
    }
    const recovered = outcome.ok && attempt > 1;
    log.record({
      id: route.id, mandatory: publicMandatory, startedAt, attempts: attempt,
      status: result.error === "budget_exhausted" ? STATUS.NOT_RUN : outcome.ok ? STATUS.PASS : STATUS.FAIL,
      summary: `GET ${route.path}: ${outcome.reason}${recovered ? ` (recovered after ${attempt - 1} transient failure(s): ${history.slice(0, -1).join(", ")})` : ""}`,
      evidence: { url: result.url, status: result.status ?? null, error: result.error ?? null, content_type: result.contentType ?? null, bytes: result.bytes ?? null, history },
      stop: outcome.ok ? null : outcome.stop,
    });
  }
  for (const route of profile.admin_routes) {
    const startedAt = new Date().toISOString();
    const result = await boundedGet(base + route.path, http);
    const outcome = evaluateAdmin(profile, result);
    log.record({
      id: route.id, mandatory: accessMandatory, startedAt, attempts: 1,
      status: result.error === "budget_exhausted" ? STATUS.NOT_RUN : outcome.ok ? STATUS.PASS : STATUS.FAIL,
      summary: `anonymous GET ${route.path}: ${outcome.reason}`,
      evidence: { url: result.url, status: result.status ?? null, error: result.error ?? null, location_host: result.location ? safeHost(result.location, result.url) : null },
      stop: outcome.ok ? null : outcome.stop,
    });
  }
}

function safeHost(location, base) {
  try { return new URL(location, base).hostname; } catch { return "unparseable"; }
}
