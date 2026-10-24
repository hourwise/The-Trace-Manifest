import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { SQLiteD1 } from "./sqlite-d1";
import worker from "../workers/ingestion/index";
import { signInternalRequest } from "../src/security/internal-signature";
import { parseCapturePayload, publicCaptureUrl, sha256, signReceipt, verifyReceipt, readCaptureBody, type CaptureReceipt } from "../src/lib/server/capture-receipt";
import { POST as redeem } from "../src/pages/api/capture/receipt";
import { POST as submit } from "../src/pages/api/admin/capture-submit";

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
const secret = "fixture-only-".repeat(4), origin = "https://thetracemanifest.com";
const verifier = "a".repeat(43);
const p = { version: 1, captureId: crypto.randomUUID(), requestId: crypto.randomUUID(), kind: "social",
  url: "https://www.reddit.com/r/LocalLLaMA/comments/abc123/post/", platform: "reddit", reason: "Interesting AI development to review",
  notes: "Shared from phone, unverified source app", lead: "" };
const payload = JSON.stringify(p);
check(parseCapturePayload(payload)?.url === p.url, "retain original post URL");
for (const url of ["http://127.0.0.1", "http://10.2.3.4", "http://[::1]", "file:///tmp/a", "https://u:p@example.com", "https://host.local", "https://example.com:8443"]) {
  check(!publicCaptureUrl(url), `reject unsafe URL ${url}`);
}
check(!parseCapturePayload(JSON.stringify({ ...p, kind: "article", platform: "", reason: "" })), "social URL cannot become article");
check(!parseCapturePayload(JSON.stringify({ ...p, extra: true })), "reject extra fields");
check(!parseCapturePayload(JSON.stringify({ ...p, reason: "short" })), "require meaningful reason");
check(!parseCapturePayload(JSON.stringify({ ...p, kind: "lead", url: "", platform: "", reason: "", lead: "" })), "reject blank lead");
check(!!parseCapturePayload(JSON.stringify({ ...p, kind: "article", url: "https://example.com/article", platform: "", reason: "" })), "accept article");
check(!!parseCapturePayload(JSON.stringify({ ...p, kind: "lead", url: "", platform: "", reason: "", lead: "Text-only lead" })), "accept text lead");
const receipt: CaptureReceipt = { version: 1, origin, captureId: p.captureId, requestId: p.requestId,
  digest: await sha256(payload), challenge: await sha256(verifier), kind: "social", id: "1", duplicate: false, expires: Date.now() + 60000 };
const token = await signReceipt(receipt, secret);
check((await verifyReceipt(token, verifier, origin, secret))?.digest === receipt.digest, "verify signed receipt");
check(!await verifyReceipt(token, "b".repeat(43), origin, secret), "stolen callback cannot redeem without phone verifier");
check(!await verifyReceipt(token, verifier, "https://preview.example", secret), "receipt bound to environment");
check(!await verifyReceipt(token, verifier, origin, "wrong-secret".repeat(4)), "wrong signer rejected");
check(!await verifyReceipt(token.slice(0, 10) + "x" + token.slice(11), verifier, origin, secret), "tampering rejected");
check(!await verifyReceipt(await signReceipt({ ...receipt, expires: 1 }, secret), verifier, origin, secret), "expired receipt rejected");
check(await readCaptureBody(new Request(origin, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(9000) }), 8192) === null, "bound streamed request size");

// Run the actual self-hosted browser script against a minimal DOM fixture.
async function browserScript(response: () => Promise<Response>) {
  let click: (() => Promise<void>) | undefined;
  const nodes = Object.fromEntries(["preview", "status", "submit", "return"].map(id => [id, {
    textContent: "", disabled: true, hidden: true, href: "", addEventListener(_type: string, handler: () => Promise<void>) { click = handler; },
  }]));
  runInNewContext(readFileSync("public/capture-intake.js", "utf8"), {
    document: { getElementById(id: string) { return nodes[id]; } },
    location: { hash: "#" + Buffer.from(JSON.stringify({ payload, challenge: receipt.challenge })).toString("base64url") },
    atob, Uint8Array, TextDecoder, JSON, Error, AbortSignal, encodeURIComponent,
    fetch: async (_path: string, init: RequestInit) => {
      check(init.credentials === "same-origin" && init.redirect === "error", "browser keeps real session and rejects login redirects");
      return response();
    },
  });
  check(!nodes.submit.disabled && nodes.preview.textContent.includes(p.url), "browser displays exact original URL before confirmation");
  await click!();
  return nodes;
}
const successNodes = await browserScript(async () => Response.json({ id: "1", kind: "social", receipt: token, duplicate: false }));
check(successNodes.submit.disabled && !successNodes.return.hidden && successNodes.return.href.startsWith("tracecapture://receipt?"), "success requires explicit return of signed receipt");
const deniedNodes = await browserScript(async () => Response.json({ error: "denied" }, { status: 403 }));
check(!deniedNodes.submit.disabled && deniedNodes.return.hidden && deniedNodes.status.textContent.includes("Publisher permission"), "denied submission offers retry without claiming receipt");
const offlineNodes = await browserScript(async () => { throw new Error("Offline fixture"); });
check(!offlineNodes.submit.disabled && offlineNodes.return.hidden, "browser network failure cannot become confirmed upload");

const database = new SQLiteD1();
database.sqlite.exec(readFileSync("db/migration-0024-social-signals.sql", "utf8"));
const env = { DB: database.asD1(), TRACE_INTERNAL_SERVICE_SECRET: secret };
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
async function candidate(body: object, role: "publisher" | "reader" = "publisher") {
  const text = JSON.stringify(body), path = "/admin/candidates";
  const identity = { operator: `${role}@example.com`, role, timestamp: String(Date.now()), nonce: crypto.randomUUID() };
  const signature = await signInternalRequest(secret, "POST", path, text, identity);
  return worker.fetch(new Request(`https://worker.example${path}`, { method: "POST", body: text,
    headers: { "Content-Type": "application/json", "X-Trace-Internal-Version": "v1", "X-Trace-Operator": identity.operator,
      "X-Trace-Role": role, "X-Trace-Timestamp": identity.timestamp, "X-Trace-Nonce": identity.nonce, "X-Trace-Signature": signature } }), env as any, ctx);
}
try {
  const body = { intakeType: "lead", lead: "A local test lead", captureRequestId: crypto.randomUUID() };
  check((await candidate(body, "reader")).status === 403, "reader cannot submit");
  const created = await candidate(body);
  check(created.status === 201, "create private candidate");
  const id = (await created.json() as { id: string }).id;
  const retry = await candidate(body);
  check(retry.status === 200 && (await retry.json() as { id: string }).id === id, "retry after lost response recovers same record");
  check((await candidate({ ...body, lead: "Changed content" })).status === 409, "idempotency key content conflict rejected");
  check((await candidate({ ...body, captureRequestId: "invalid" })).status === 400, "invalid key rejected");
  const [a, b] = await Promise.all([candidate(body), candidate(body)]);
  check(a.status === 200 && b.status === 200, "simultaneous repeated taps reuse committed candidate");
  check((await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates").first<{ count: number }>())?.count === 1, "exactly one candidate persisted");
  check((await database.prepare("SELECT state FROM editorial_candidates WHERE id = ?").bind(id).first<{ state: string }>())?.state === "new", "no automatic publication or approval");
  const candidateToken = await signReceipt({ ...receipt, kind: "lead", id }, secret);
  const redemption = () => redeem({ request: new Request(`${origin}/api/capture/receipt`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt: candidateToken, verifier }) }), locals: { runtime: { env } } } as any) as Promise<Response>;
  check((await redemption()).status === 200, "receipt checks persisted private candidate");
  database.sqlite.exec("DELETE FROM editorial_candidates");
  check((await redemption()).status === 404, "HTTP receipt without persisted row is insufficient");
  const anonymous = await submit({ request: new Request(`${origin}/api/admin/capture-submit`, { method: "POST", body: payload }), locals: { runtime: { env } } } as any) as Response;
  check(anonymous.status === 401, "browser submission cannot bypass Access");

  // Exercise the real Access verifier, same-origin gateway, signed Worker proxy,
  // private SQL queues and receipt redemption together, using local fixture keys.
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "capture-fixture" };
  const accessEnv = { ...env, CF_ACCESS_TEAM_DOMAIN: "capture-fixture.cloudflareaccess.com", CF_ACCESS_AUD: "capture-audience",
    TRACE_ADMIN_PUBLISHERS: "publisher@example.com", TRACE_ADMIN_READERS: "reader@example.com",
    TRACE_ENVIRONMENT: "production", TRACE_INGESTION_WORKER_URL: "https://worker.example" };
  const b64 = (s: string) => Buffer.from(s).toString("base64url");
  async function jwt(email = "publisher@example.com", expires = Math.floor(Date.now() / 1000) + 3600) {
    const signing = `${b64(JSON.stringify({ alg: "RS256", kid: jwk.kid }))}.${b64(JSON.stringify({ email,
      sub: "fixture-subject", aud: "capture-audience", exp: expires, iss: "https://capture-fixture.cloudflareaccess.com" }))}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(signing));
    return `${signing}.${Buffer.from(signature).toString("base64url")}`;
  }
  const operatorJwt = await jwt();
  const originalFetch = globalThis.fetch;
  let loseNextWorkerResponse = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.url === "https://capture-fixture.cloudflareaccess.com/cdn-cgi/access/certs") return Response.json({ keys: [jwk] });
    assert.equal(new URL(request.url).origin, "https://worker.example", "no external test network request");
    const response = await worker.fetch(request, env as any, ctx);
    if (loseNextWorkerResponse) { loseNextWorkerResponse = false; throw new Error("Fixture network interruption after commit"); }
    return response;
  }) as typeof fetch;
  async function browserSubmission(record: object, token = operatorJwt, requestOrigin = origin) {
    return await submit({ request: new Request(`${origin}/api/admin/capture-submit`, { method: "POST",
      headers: { "Origin": requestOrigin, "Cf-Access-Jwt-Assertion": token, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: JSON.stringify(record), challenge: await sha256(verifier) }) }),
      locals: { runtime: { env: accessEnv } } } as any) as Response;
  }
  try {
    check((await browserSubmission(p, operatorJwt, "https://evil.example")).status === 403, "cross-origin write denied");
    check((await browserSubmission(p, await jwt("reader@example.com"))).status === 403, "reader identity cannot use mobile wrapper");
    check((await browserSubmission(p, await jwt("publisher@example.com", 1))).status === 401, "expired Access credential rejected");
    check((await browserSubmission(p, await jwt("unknown@example.com"))).status === 401, "unapproved identity rejected");
    const response = await browserSubmission(p);
    check(response.status === 200, "authenticated social submission completes through governed proxy");
    const saved = await response.json() as { id: string; receipt: string; duplicate: boolean };
    check(!saved.duplicate && !!saved.id, "social saved response contains real private record identifier");
    const decoded = await verifyReceipt(saved.receipt, verifier, origin, secret);
    check(decoded?.kind === "social" && decoded.digest === await sha256(payload), "server signs receipt bound to exact capture snapshot");
    check((await database.prepare("SELECT review_status FROM social_signals WHERE id = ?").bind(saved.id).first<{ review_status: string }>())?.review_status === "pending", "social post remains pending human review");
    const duplicate = await browserSubmission(p);
    const duplicateBody = await duplicate.json() as { id: string; duplicate: boolean };
    check(duplicate.status === 200 && duplicateBody.id === saved.id && duplicateBody.duplicate, "social retry confirms existing persisted URL");
    check((await database.prepare("SELECT COUNT(*) AS count FROM social_signals").first<{ count: number }>())?.count === 1, "social retry does not duplicate records");
    check((await browserSubmission({ ...p, url: "http://127.0.0.1" })).status === 422, "unsafe URL rejected before Worker mutation");
    const article = { ...p, kind: "article", url: "https://example.com/article", platform: "", reason: "" };
    loseNextWorkerResponse = true;
    check((await browserSubmission(article)).status === 503, "uncertain response after server commit is not called success");
    const recovered = await browserSubmission(article);
    const recoveredBody = await recovered.json() as { receipt: string; duplicate: boolean };
    check(recovered.status === 200 && recoveredBody.duplicate, "retry recovers article after lost response");
    check((await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates").first<{ count: number }>())?.count === 1, "uncertain response retry creates exactly one article");
    const leadResponse = await browserSubmission({ ...p, requestId: crypto.randomUUID(), kind: "lead", url: "", platform: "", reason: "", lead: "Text-only fixture lead" });
    check(leadResponse.status === 200, "authenticated text-only lead enters Desk");
  } finally { globalThis.fetch = originalFetch; }
} finally { database.close(); }
console.log(`TRACE Capture intake: ${checks} checks passed (local SQLite fixtures; no remote writes).`);
