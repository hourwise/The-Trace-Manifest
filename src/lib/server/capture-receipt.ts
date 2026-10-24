/** Browser-authenticated intake receipts; no credentials are issued to Android. */
export const CAPTURE_PROTOCOL = "trace-capture-v1";
export interface CapturePayload {
  version: 1; captureId: string; requestId: string;
  kind: "social" | "article" | "lead";
  url: string; platform: string; reason: string; notes: string; lead: string;
}
export interface CaptureReceipt {
  version: 1; origin: string; captureId: string; requestId: string; digest: string;
  challenge: string; kind: CapturePayload["kind"]; id: string; duplicate: boolean; expires: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORMS = new Set(["reddit", "x", "bluesky", "mastodon", "linkedin", "youtube", "github-discussion", "forum", "other-approved"]);
export function publicCaptureUrl(value: string): boolean {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    return value.length <= 2048 && ["http:", "https:"].includes(u.protocol) && !u.username && !u.password &&
      (!u.port || u.port === "80" || u.port === "443") && host.includes(".") && !host.includes(":") &&
      !/^[\d.]+$/.test(host) && !/(^|\.)(localhost|local|internal|test)$/.test(host);
  } catch { return false; }
}
export function parseCapturePayload(raw: string): CapturePayload | null {
  if (new TextEncoder().encode(raw).length > 16000) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || Array.isArray(p) || Object.keys(p).sort().join(",") !==
        "captureId,kind,lead,notes,platform,reason,requestId,url,version" ||
        p.version !== 1 || !UUID.test(p.captureId) || !UUID.test(p.requestId) ||
        !["social", "article", "lead"].includes(p.kind) ||
        ![p.url, p.platform, p.reason, p.notes, p.lead].every(v => typeof v === "string") ||
        p.notes.length > 4000 || p.lead.length > 8000 || p.reason.length > 1000) return null;
    if (p.kind === "lead") {
      if (!p.lead.trim() || p.url || p.platform || p.reason) return null;
    // The Worker stores the trimmed URL; only an exact URL can be read back.
    } else if (p.url !== p.url.trim() || !publicCaptureUrl(p.url) || p.lead) return null;
    if (p.kind === "social" && (!PLATFORMS.has(p.platform) || p.reason.trim().length < 10)) return null;
    if (p.kind === "article" && (p.platform || p.reason)) return null;
    // These known social hosts must never enter the article pipeline.
    if (p.kind === "article") {
      const host = new URL(p.url).hostname.replace(/^www\./, "");
      if (/(^|\.)(reddit\.com|redd\.it|x\.com|twitter\.com|bsky\.app|linkedin\.com|youtube\.com|youtu\.be)$/.test(host) ||
          (host === "github.com" && new URL(p.url).pathname.includes("/discussions/"))) return null;
    }
    return p;
  } catch { return null; }
}
export async function sha256(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    b => b.toString(16).padStart(2, "0")).join("");
}
const encode = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
/**
 * The receipt key is derived from the server-only internal secret, never the
 * secret itself: the internal secret also signs proxy-to-Worker requests, and
 * the environment label keeps a Preview receipt from verifying in Production
 * even if both environments shared a secret.
 */
async function key(secret: string, environment: string) {
  if (secret.length < 32) throw new Error("Receipt service is not configured.");
  const encoder = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("trace-capture-receipt"), info: encoder.encode(`${CAPTURE_PROTOCOL}|${environment || "unset"}`) },
    base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign", "verify"]);
}
/** A receipt names one real queue row: a social_signals rowid or an editorial_candidates id. */
export function receiptRecordId(kind: CapturePayload["kind"], id: unknown): id is string {
  if (typeof id !== "string") return false;
  return kind === "social" ? /^[1-9][0-9]{0,14}$/.test(id) : /^capture-[0-9a-f]{64}$/.test(id) || UUID.test(id);
}
export async function signReceipt(receipt: CaptureReceipt, secret: string, environment: string): Promise<string> {
  const body = encode(JSON.stringify(receipt));
  const mac = await crypto.subtle.sign("HMAC", await key(secret, environment), new TextEncoder().encode(`${CAPTURE_PROTOCOL}\n${body}`));
  return `${body}.${encode(String.fromCharCode(...new Uint8Array(mac)))}`;
}
export async function verifyReceipt(token: string, verifier: string, origin: string, secret: string, environment: string): Promise<CaptureReceipt | null> {
  try {
    if (token.length > 6000 || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const valid = await crypto.subtle.verify("HMAC", await key(secret, environment),
      Uint8Array.from(decode(parts[1]), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${CAPTURE_PROTOCOL}\n${parts[0]}`));
    if (!valid) return null;
    const r = JSON.parse(decode(parts[0])) as CaptureReceipt;
    if (r.version !== 1 || r.origin !== origin || !UUID.test(r.captureId) || !UUID.test(r.requestId) ||
        r.expires <= Date.now() || r.challenge !== await sha256(verifier) ||
        !["social", "article", "lead"].includes(r.kind) || !receiptRecordId(r.kind, r.id) ||
        !/^[a-f0-9]{64}$/.test(r.digest) || typeof r.duplicate !== "boolean") return null;
    return r;
  } catch { return null; }
}
export async function readCaptureBody(request: Request, limit = 24000): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; } finally { reader.releaseLock(); }
}
