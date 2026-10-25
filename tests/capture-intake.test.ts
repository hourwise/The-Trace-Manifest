import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { SQLiteD1 } from "./sqlite-d1";
import worker from "../workers/ingestion/index";
import { signInternalRequest } from "../src/security/internal-signature";
import { parseCapturePayload, publicCaptureUrl, receiptRecordId, sha256, signReceipt, verifyReceipt, readCaptureBody, type CaptureReceipt } from "../src/lib/server/capture-receipt";
import { POST as redeem } from "../src/pages/api/capture/receipt";
import { POST as submit } from "../src/pages/api/admin/capture-submit";

let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
/** Changes one character of a receipt's signed body. Never touches the MAC's
 *  trailing base64url padding bits, which can decode to the same bytes. */
const tamperBody = (receipt: string, at = 5) => receipt.slice(0, at) + (receipt[at] === "x" ? "y" : "x") + receipt.slice(at + 1);
const secret = "fixture-only-".repeat(4), origin = "https://thetracemanifest.com", environment = "production";
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
const token = await signReceipt(receipt, secret, environment);
check((await verifyReceipt(token, verifier, origin, secret, environment))?.digest === receipt.digest, "verify signed receipt");
check(!await verifyReceipt(token, "b".repeat(43), origin, secret, environment), "stolen callback cannot redeem without phone verifier");
check(!await verifyReceipt(token, verifier, "https://preview.example", secret, environment), "receipt bound to environment");
check(!await verifyReceipt(token, verifier, origin, "wrong-secret".repeat(4), environment), "wrong signer rejected");
check(!await verifyReceipt(tamperBody(token, 10), verifier, origin, secret, environment), "tampering rejected");
check(!await verifyReceipt(await signReceipt({ ...receipt, expires: 1 }, secret, environment), verifier, origin, secret, environment), "expired receipt rejected");

// Integration review: the receipt key is derived, never the raw internal secret,
// and it is bound to the environment label as well as the origin.
check(!await verifyReceipt(token, verifier, origin, secret, "preview"), "a Production receipt never verifies under the Preview key");
{
  const body = token.split(".")[0];
  const rawKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const rawMac = await crypto.subtle.sign("HMAC", rawKey, new TextEncoder().encode(`trace-capture-v1\n${body}`));
  const rawToken = `${body}.${Buffer.from(rawMac).toString("base64url")}`;
  check(!await verifyReceipt(rawToken, verifier, origin, secret, environment), "a MAC made directly with the internal service secret is rejected");
}
for (const [kind, id, ok] of [["social", "42", true], ["social", "0", false], ["social", "1 OR 1=1", false], ["lead", `capture-${"a".repeat(64)}`, true],
  ["article", crypto.randomUUID(), true], ["lead", "../../etc", false], ["article", "42", false]] as const) {
  check(receiptRecordId(kind, id) === ok, `receipt record id ${kind}:${id} ${ok ? "accepted" : "rejected"}`);
  if (!ok) check(!await verifyReceipt(await signReceipt({ ...receipt, kind, id }, secret, environment), verifier, origin, secret, environment), `signed receipt with malformed id ${id} still rejected`);
}
check(!parseCapturePayload(JSON.stringify({ ...p, url: ` ${p.url} ` })), "URL with surrounding whitespace rejected so read-back matches the stored URL");
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
check(offlineNodes.status.textContent.includes("Outcome uncertain"), "a dropped connection says the outcome is uncertain, not a raw browser error");
const replayNodes = await browserScript(async () => Response.json({ id: "1", kind: "social", receipt: token, duplicate: false, replay: true }));
check(replayNodes.status.textContent.startsWith("Already saved by this attempt"), "a recovered retry is reported as this attempt's own record");
const duplicateNodes = await browserScript(async () => Response.json({ id: "1", kind: "social", receipt: token, duplicate: true, replay: false }));
check(duplicateNodes.status.textContent.startsWith("Existing record found"), "a genuine duplicate is reported as not created by this attempt");

// Gate B finding: Access sign-in can drop the URL fragment. An empty or garbled
// handoff must say how to recover, keep Submit disabled and send nothing.
for (const [label, hash] of [["empty", ""], ["bare #", "#"], ["garbled", "#not-base64!!"],
  ["wrong shape", "#" + Buffer.from(JSON.stringify({ payload: "{}" })).toString("base64url")]] as const) {
  let fetched = false;
  const nodes = Object.fromEntries(["preview", "status", "submit", "return"].map(id => [id, {
    textContent: "", disabled: true, hidden: true, href: "", addEventListener() {} }]));
  runInNewContext(readFileSync("public/capture-intake.js", "utf8"), {
    document: { getElementById(id: string) { return nodes[id]; } }, location: { hash },
    atob, Uint8Array, TextDecoder, JSON, Error, AbortSignal, encodeURIComponent, fetch: async () => { fetched = true; },
  });
  check(nodes.status.textContent.startsWith("This page has no capture to submit") && nodes.submit.disabled && nodes.return.hidden && !fetched,
    `${label} handoff explains recovery, keeps Submit disabled and sends nothing`);
}

const database = new SQLiteD1();
database.sqlite.exec(readFileSync("db/migration-0024-social-signals.sql", "utf8"));
const env = { DB: database.asD1(), TRACE_INTERNAL_SERVICE_SECRET: secret, TRACE_ENVIRONMENT: environment };
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
  const candidateToken = await signReceipt({ ...receipt, kind: "lead", id }, secret, environment);
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
    TRACE_ADMIN_PUBLISHERS: "publisher@example.com,second@example.com", TRACE_ADMIN_READERS: "reader@example.com",
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
    const decoded = await verifyReceipt(saved.receipt, verifier, origin, secret, environment);
    check(decoded?.kind === "social" && decoded.digest === await sha256(payload), "server signs receipt bound to exact capture snapshot");
    check((await database.prepare("SELECT review_status FROM social_signals WHERE id = ?").bind(saved.id).first<{ review_status: string }>())?.review_status === "pending", "social post remains pending human review");
    const duplicate = await browserSubmission(p);
    const duplicateBody = await duplicate.json() as { id: string; duplicate: boolean; replay: boolean };
    check(duplicate.status === 200 && duplicateBody.id === saved.id && !duplicateBody.duplicate && duplicateBody.replay,
      "a retry of the same social attempt confirms its own record (replay), not a duplicate");
    check((await database.prepare("SELECT COUNT(*) AS count FROM social_signals").first<{ count: number }>())?.count === 1, "social retry does not duplicate records");
    check((await browserSubmission({ ...p, url: "http://127.0.0.1" })).status === 422, "unsafe URL rejected before Worker mutation");
    const article = { ...p, kind: "article", url: "https://example.com/article", platform: "", reason: "" };
    loseNextWorkerResponse = true;
    check((await browserSubmission(article)).status === 503, "uncertain response after server commit is not called success");
    const recovered = await browserSubmission(article);
    const recoveredBody = await recovered.json() as { receipt: string; duplicate: boolean; replay: boolean };
    check(recovered.status === 200 && !recoveredBody.duplicate && recoveredBody.replay, "retry recovers article after lost response as this attempt's own record");
    check((await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates").first<{ count: number }>())?.count === 1, "uncertain response retry creates exactly one article");
    const leadResponse = await browserSubmission({ ...p, requestId: crypto.randomUUID(), kind: "lead", url: "", platform: "", reason: "", lead: "Text-only fixture lead" });
    check(leadResponse.status === 200, "authenticated text-only lead enters Desk");

    // Integration review: routing and provenance land exactly as captured, and
    // nothing is approved, fetched or published by mobile intake.
    const socialRow = await database.prepare("SELECT platform, canonical_url, submitted_by, review_status, evidence_status, reviewer_notes FROM social_signals WHERE id = ?")
      .bind(saved.id).first<Record<string, string>>();
    check(socialRow?.canonical_url === p.url && socialRow.platform === "reddit" && socialRow.submitted_by === "publisher@example.com",
      "social post keeps its exact original URL, platform and submitting publisher");
    check(socialRow?.review_status === "pending" && socialRow.evidence_status === "unreviewed" && socialRow.reviewer_notes === p.notes,
      "social post is an unreviewed signal awaiting human review, with the capture notes");
    const articleRow = await database.prepare("SELECT intake_type, submitted_url, lead_text, state FROM editorial_candidates WHERE submitted_url = ?")
      .bind(article.url).first<Record<string, string>>();
    check(articleRow?.intake_type === "manual_url" && articleRow.state === "new" && articleRow.lead_text === p.notes,
      "article enters Desk as a new manual URL candidate with its provenance notes");
    const leadRow = await database.prepare("SELECT intake_type, submitted_url, lead_text, state FROM editorial_candidates WHERE intake_type = 'lead' AND lead_text LIKE 'Text-only fixture lead%'")
      .first<Record<string, string | null>>();
    check(leadRow?.submitted_url === null && leadRow.state === "new" && leadRow.lead_text === `Text-only fixture lead\n\n${p.notes}`,
      "text lead is stored as an unverified lead with no invented URL");
    check((await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates WHERE state <> 'new'").first<{ count: number }>())?.count === 0,
      "no capture is advanced past 'new' by intake");

    // A genuine duplicate: another capture of the same URL (different notes),
    // and the same URL from a different publisher.
    const otherCapture = { ...p, captureId: crypto.randomUUID(), requestId: crypto.randomUUID(), notes: "TRACE Capture another-capture; captured later" };
    const otherBody = await (await browserSubmission(otherCapture)).json() as { id: string; duplicate: boolean; replay: boolean };
    check(otherBody.id === saved.id && otherBody.duplicate && !otherBody.replay, "a second capture of the same post confirms the existing record as a duplicate");
    const secondBody = await (await browserSubmission(p, await jwt("second@example.com"))).json() as { id: string; duplicate: boolean; replay: boolean };
    check(secondBody.id === saved.id && secondBody.duplicate && !secondBody.replay, "another publisher's identical capture is a duplicate, not a replay");
    check((await database.prepare("SELECT reviewer_notes FROM social_signals WHERE id = ?").bind(saved.id).first<{ reviewer_notes: string }>())?.reviewer_notes === p.notes,
      "a duplicate never rewrites the existing record's notes");

    // The phone's side: redeem the receipt exactly as ReceiptClient does, then
    // apply SubmissionProtocol.matches (capture, request, digest, kind, id).
    const redeemAs = async (receiptToken: string, proof: string, at = origin, redeemEnv: Record<string, unknown> = env) =>
      await redeem({ request: new Request(`${at}/api/capture/receipt`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: receiptToken, verifier: proof }) }), locals: { runtime: { env: redeemEnv } } } as any) as Response;
    const phone = await redeemAs(saved.receipt, verifier);
    const confirmed = await phone.json() as { captureId: string; requestId: string; digest: string; kind: string; id: string; duplicate: boolean };
    check(phone.status === 200 && confirmed.captureId === p.captureId && confirmed.requestId === p.requestId && confirmed.digest === await sha256(payload)
      && confirmed.kind === p.kind && confirmed.id === saved.id && confirmed.duplicate === false, "phone receipt check binds capture, request, payload digest, kind and record");
    check(Object.keys(confirmed).sort().join(",") === "captureId,digest,duplicate,id,kind,requestId", "redemption discloses only the receipt's own identifiers");

    // Invalid proofs never reach D1; the route cannot be used to probe records.
    let reads = 0;
    const countingEnv = { ...env, DB: new Proxy(env.DB, { get(target, key, receiver) {
      if (key === "prepare") return (sql: string) => { reads++; return target.prepare(sql); };
      return Reflect.get(target, key, receiver);
    } }) };
    check((await redeemAs(saved.receipt, "c".repeat(43), origin, countingEnv)).status === 401, "wrong verifier refused");
    check((await redeemAs(saved.receipt, verifier, "https://launch-05r-preview.the-trace-manifest.pages.dev", countingEnv)).status === 401, "receipt from another environment refused");
    check((await redeemAs(tamperBody(saved.receipt), verifier, origin, countingEnv)).status === 401, "tampered receipt refused");
    check((await redeemAs(saved.receipt, verifier, origin, { ...countingEnv, TRACE_ENVIRONMENT: "preview" })).status === 401, "receipt refused under another environment's key");
    check(reads === 0, "no D1 read for any invalid proof");
    check((await redeemAs(saved.receipt, verifier, origin, { ...env, TRACE_INTERNAL_SERVICE_SECRET: "" })).status === 503, "unconfigured receipt service fails closed");
    const getProbe = await (await import("../src/pages/api/capture/receipt")).GET({} as any) as Response;
    check(getProbe.status === 200 && JSON.stringify(await getProbe.json()) === JSON.stringify({ protocol: "trace-capture-v1" }), "GET discloses only the protocol label");
  } finally { globalThis.fetch = originalFetch; }
} finally { database.close(); }
console.log(`TRACE Capture intake: ${checks} checks passed (local SQLite fixtures; no remote writes).`);
