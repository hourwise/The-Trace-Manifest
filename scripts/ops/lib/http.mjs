// TRACE-OPS-01: bounded, read-only HTTP. GET only, a fixed host allowlist,
// no redirect following, a per-request timeout covering headers and body, a
// response-byte cap and a hard per-run request budget.

export class RequestBudget {
  constructor(name, limit) { this.name = name; this.limit = limit; this.used = 0; }
  take() {
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }
  toJSON() { return { used: this.used, limit: this.limit }; }
}

/** Exact host names only; no wildcards, so a look-alike host never matches. */
export function hostAllowed(hostname, allowHosts) {
  return allowHosts.includes(hostname.toLowerCase());
}

async function readCapped(response, maxBytes) {
  if (!response.body) return { text: "", bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - bytes));
        bytes = maxBytes;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      bytes += value.byteLength;
    }
  } finally {
    reader.releaseLock?.();
  }
  const all = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) { all.set(chunk, at); at += chunk.byteLength; }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(all), bytes, truncated };
}

/**
 * One bounded GET. Never throws: transport problems come back as `error`
 * ("host_not_allowed", "insecure_scheme", "budget_exhausted", "timeout",
 * "network").
 */
export async function boundedGet(url, options) {
  const { fetchImpl = globalThis.fetch, timeoutMs = 10_000, maxBytes = 1_500_000, budget, allowHosts, headers = {} } = options;
  let target;
  try { target = new URL(url); } catch { return { url, error: "invalid_url" }; }
  if (target.protocol !== "https:") return { url: target.href, error: "insecure_scheme" };
  if (!hostAllowed(target.hostname, allowHosts)) return { url: target.href, error: "host_not_allowed" };
  if (!budget.take()) return { url: target.href, error: "budget_exhausted" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(target.href, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "trace-ops-release-verify/1", ...headers },
    });
    const body = await readCapped(response, maxBytes);
    return {
      url: target.href,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      location: response.headers.get("location"),
      body: body.text,
      bytes: body.bytes,
      truncated: body.truncated,
      ms: Date.now() - started,
    };
  } catch (error) {
    return { url: target.href, error: controller.signal.aborted ? "timeout" : "network", detail: String(error?.message ?? error).slice(0, 200), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
