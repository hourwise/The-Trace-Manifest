# TRACE-CAPTURE-INTEGRATION-01: Android capture integration review and Gate A record

**Date:** 2026-10-24
**Branch:** `codex/trace-capture-integration-01`, based on `main` (`9cbad4f`). It is local and has not been pushed.
**Preview candidate:** `codex/trace-capture-preview-01`, which is SEED-01 (PR #3) merged with this branch. Also local only.
**Android:** `hourwise/Trace-Capture-App`, branch `codex/complete-personal-capture` at `7ea6a78` (1.1.0, versionCode 2). **No Android change is required.**

**Status:** Gate A complete. **Gate B deployed to Preview on 2026-10-24 (§7A).**
- Nothing was pushed, deployed or migrated.
- No Access setting or secret was changed.
- No Preview or Production record was created.

## 1. Baseline

| Item | State on 2026-10-24 |
|---|---|
| `main` | `9cbad4f` (PR #2 merged). Production Pages `ed33e35f`; Production Worker `41f31744` (PR #2 build `916861c`); Cron `[]` |
| Preview | Worker `c4976ccd` and Pages `7d7c81e9`, both built from SEED-01 `efcec4a`; Preview D1 has 0076 |
| Unmerged work | PR #3 (SEED-01 / 0076, draft), PR #4 (SEED-03 docs, draft), the scheduler 0072 branch (separate). No worktree has uncommitted changes. Codex's `companion-trace` worktree was not modified. |
| Governing decisions | ADR 0009 (social signals are discovery signals; linked material is independent and becomes separate candidates); ADR 0015 (TRACE Desk intake: article URL, social URL, lead); ADR 0004 (human review boundary); ADR-0020 (Proposed, consistent) |
| Existing intake used | `POST /api/admin/social-signals` (publisher; `review_status = pending`, `evidence_status = unreviewed`) and `POST /api/admin/candidates` (publisher; `state = new`). Both go through the signed admin proxy, Worker replay protection and fail-closed audit. |

## 2. Companion review: claims against the source

| Codex claim | Verified? | Notes or change |
|---|---|---|
| Authenticated publisher submission | **Yes** | `capture-submit` verifies the Access JWT, requires the publisher role and audits denials, then calls the existing proxy, which authenticates again |
| Browser-based Access authentication; no credential in the APK | **Yes** | The phone opens the normal browser. The APK holds no cookie, token or service credential. |
| Origin and CSRF protection | **Yes** | `sameOriginRequest`: the genuine Origin must equal both the request origin and the environment allowlist. The handoff page sets `frame-ancestors 'none'`. |
| Social, article and lead routing | **Yes** | Social → `social_signals`. Article → candidate `manual_url`. Lead → candidate `lead`. Known social hosts can never become articles. |
| Original post URL preserved | **Yes**, plus a fix | The exact URL is stored. **Fixed:** a URL with surrounding whitespace is now rejected, because the Worker stores the trimmed value and the read-back would otherwise miss it. |
| Durable attempts and safe retry | **Yes** | The phone keeps an immutable snapshot, request id and verifier in Room. The candidate id is derived from `(publisher, requestId)`; the same request with changed content gets 409. |
| Duplicate semantics | **Corrected** | Codex flagged a **retry of the same attempt** as `duplicate`. The phone would then say "this attempt did not create a new record" after a lost response, which is untrue. Now `duplicate` means another capture or publisher created the record, and `replay` means an earlier try of this attempt did. The receipt schema the phone verifies is unchanged. |
| Signed receipts | **Yes**, hardened | **Fixed:** the HMAC key was the raw `TRACE_INTERNAL_SERVICE_SECRET`, which also signs proxy→Worker requests. It is now derived with HKDF (`trace-capture-receipt`, `trace-capture-v1|<TRACE_ENVIRONMENT>`). Record ids are validated before any D1 read. The endpoint returns 503 when not configured. |
| Proof-bound verification | **Yes** | Redemption needs the signed receipt **and** the 256-bit verifier, whose SHA-256 is the receipt's challenge. The verifier never leaves the phone except in the HTTPS redemption request. |
| Android acknowledges only after verified persistence | **Yes** (by source) | `SubmissionRepository.verify` sets `SYNCED` in a Room transaction only after the endpoint returns 200 and `SubmissionProtocol.matches` (capture, request, digest, kind, id). Failures keep the capture. **Device execution is still unproven** (Gate C). |
| No D1 migration | **Yes** | Existing tables only. Candidate ids `capture-<sha256>` (72 characters) fit `TEXT PRIMARY KEY`, and no route assumes candidate ids are UUIDs. |
| `astro.config.ts` cache directories | **Removed** | A local workaround for shared `node_modules`, unrelated to capture |
| Page error handling | **Improved** | Network failures and timeouts now say "Outcome uncertain; retry this same attempt" instead of a raw browser error |
| Tests in `npm test` | **Added** | Codex's test file was not in the chain |
| Whitespace | **Fixed** | `public/capture-intake.js` had blank lines at the start and end, which CI's `git diff --check` would reject over the PR range |

**Are new endpoints needed?** Yes, two, and kept minimal.
- **`POST /api/admin/capture-submit`:** reuses the existing governed routes through the same proxy. It exists only to read the persisted row back and sign a receipt, which the existing routes cannot do.
- **`POST /api/capture/receipt`:** the phone's only way to confirm persistence without holding a credential.

No other route, table or binding is added. The Worker change is one optional, validated field: `captureRequestId` on candidate intake.

## 3. Governance boundaries (unchanged)

- **No privileged path.** Mobile intake creates only a `pending`/`unreviewed` social signal or a `new` candidate. Nothing is fetched, researched, approved, admitted as evidence or published. The tests assert that no candidate moves past `new`.
- **Social post versus linked article (ADR 0009).** The post URL goes to `social_signals`. A linked article must be captured separately as an article, and the app refuses to send a social URL as an article. Other links in a shared post stay in the local capture and are never followed.
- **Text leads** are stored as leads with no URL. Notes carry the capture provenance ("source app (unverified)") and never count as evidence.
- **Duplicates** never rewrite the existing record's reason or notes.

## 4. Security assessment: receipt verification

**Flow.**
1. The phone saves an immutable snapshot, a random request id and a 256-bit verifier.
2. The browser receives the snapshot and SHA-256(verifier) in the URL fragment.
3. You confirm under Access as a publisher.
4. The server persists through the governed proxy, **reads the row back**, and signs a receipt bound to: origin, environment key, capture id, request id, payload digest, challenge, kind, record id, the duplicate flag, and a 7-day expiry.
5. The browser hands the receipt to the app through `tracecapture://receipt`.
6. The phone POSTs `{receipt, verifier}` to `/api/capture/receipt`.

| Threat | Assessment |
|---|---|
| **Replay** | Redemption is read-only and returns only identifiers the redeemer already holds. Replay changes nothing. Submission replay is idempotent: the candidate id is derived from the request id, and social is unique by URL. |
| **Enumeration** | Not possible. The single D1 read happens only for a valid server signature, and it reads the one id the signature covers. Tested: invalid proofs cause **zero** D1 reads. |
| **Brute force** | Forging needs the HKDF key (256-bit). The verifier is 256 bits. Both are infeasible. |
| **Data leakage** | The response contains only the receipt's own fields (capture id, request id, digest, kind, id, duplicate), never record content. `GET` returns only the protocol label. Responses send `no-store`, `noindex` and `no-referrer`. |
| **Proof theft** | A receipt intercepted through the custom scheme (another app can register `tracecapture://`) is useless without the verifier. Stealing both requires access to the phone's app storage, which already contains the capture. |
| **Cross-environment confusion** | The receipt carries its origin, checked against the request URL, and is signed with an environment-labelled key. A Preview receipt fails in Production even if the secrets matched (tested). |
| **Expiry** | 7 days, so the phone can verify after being offline. An expired receipt is refused, and the same attempt can be resubmitted to get a new one (idempotent). |
| **CSRF** | Submission requires the genuine browser Origin, an Access session and a JSON body, which needs a cross-origin preflight. A crafted link can only open the review page, which shows the exact content and needs an explicit tap. Framing is blocked. |
| **Session expiry** | `redirect: "error"` turns an Access re-login redirect into "outcome uncertain". The capture remains, and you retry the same attempt after signing in. |
| **Rate limiting / DoS** | Bodies are capped at 8 KiB. Invalid requests cost one HMAC and no D1 access. A Cloudflare rate-limiting rule (for example 30 requests per minute per IP on `POST /api/capture/receipt`) is optional hardening, not required. |
| **Service secrets** | `TRACE_INTERNAL_SERVICE_SECRET` never leaves Pages and the Worker. Receipts use a derived key, and nothing secret goes to the phone. |

**Residual risks, accepted for a single-operator personal tool:**
1. The handoff fragment can stay in browser history. It contains only the capture text you chose to send.
2. A publisher who is tricked into confirming attacker-supplied content creates only a private `pending` or `new` record.
3. 7-day receipts. Shortening them would only add more re-confirmations.

### Alternatives considered

| Option | Verdict |
|---|---|
| **Scoped Access bypass for the single receipt path on Preview** | **Recommended.** No Android change and no APK rebuild. The route's own proof requirement carries the security. |
| Offline asymmetric receipts (the phone verifies an ECDSA signature with a pinned public key; no receipt endpoint) | Sound, and needs no Access change. But it needs a new signing secret, an Android patch and an APK rebuild, and it drops the phone-side "the record still exists" read. Kept as a future option. |
| Access service token in the APK | **Rejected.** It embeds a credential. |
| Trusting the browser's deep link without server verification | **Rejected.** Deep links are spoofable by any app. |
| Blanket bypass of `/api/*` or `/api/capture/*` | **Rejected.** It is wider than necessary. |

## 5. Exact Cloudflare configuration required

**Preview** (Access protects the whole `launch-05r-preview.the-trace-manifest.pages.dev` hostname today):
- In Zero Trust → Access → Applications, add a **self-hosted application**:
  - **Domain/path:** `launch-05r-preview.the-trace-manifest.pages.dev` + `/api/capture/receipt` (exact path).
  - **Policy:** one policy, action **Bypass**, include **Everyone**.
  - **Why it applies:** Access uses the most specific matching application, so this path skips login while every other path, including `/admin/capture`, `/api/admin/capture-submit` and `/capture-intake.js`, stays under the existing application.
- **Check afterwards (read-only):** `GET /api/capture/receipt` returns 200 `{"protocol":"trace-capture-v1"}`, and `/admin/capture` still returns 302.
- **Without this change:** browser submission still works, but the phone's verification gets a 302. The app shows "receipt route needs operator configuration" and keeps the capture `FAILED`/retryable, never `SYNCED`.

**Production:** **no Access change.** The Production Access application covers `/admin/*` (`/admin/capture` returns 302 today), and `/api/capture/receipt` is not covered (it returns 404 because it isn't deployed). Re-verify both at Gate D.

**Settings unchanged:**
- **No new secrets:** Pages already has `TRACE_INTERNAL_SERVICE_SECRET` and `TRACE_ENVIRONMENT`.
- **No new variables or bindings, and no migration.**
- **Origins:** `TRACE_ALLOWED_ORIGINS` already lists the Preview alias, and Production allows `https://thetracemanifest.com`. The app uses exactly these two origins.

## 6. Tests

| Run | Result |
|---|---|
| `tests/capture-intake.test.ts` | **94 checks passed**: Codex's 56 (updated) plus 38 new. They cover routing and exact URLs, provenance, the state boundary, genuine duplicate versus replay, lost-response recovery, concurrent taps, reader, expired and unknown identities, cross-origin, the phone's binding checks, tampered, expired, wrong-verifier and cross-environment proofs, zero D1 reads for invalid proofs, fail-closed configuration, and page messages. |
| Integration branch | `npm test`, typecheck (0 errors), `test:security`, `test:diff` (including the full PR range), `test:migrations`, `npm run build` (routing and D6 checks) all pass |
| Combined Preview candidate (`264cdef`) | All of the above pass, including the Evidence Library, freshness and review-gating suites |
| Android | Not rebuilt. The delivered APK SHA-256 `8a4d684b…0afca` matches `SHA256SUMS.txt`, and it is signed with the same debug certificate as 1.0.0 (`27ac6e13…`), so it installs as an in-place update |
| Live | **None run.** Preview and Production behaviour after deployment, and real-device behaviour, are unverified (Gates B and C) |

## 7. Gate B: Preview deployment (needs owner approval)

| Question | Answer |
|---|---|
| Commit to deploy | Head of `codex/trace-capture-preview-01` (SEED-01 plus capture). It keeps every SEED-01 feature already on Preview. Deploying the `main`-based branch alone would remove them. |
| Pages | Direct upload of `dist` to branch `launch-05r-preview` |
| Worker | `wrangler deploy --config wrangler.worker.toml --env preview --strict` (adds the optional `captureRequestId`). **Worker first, then Pages.** The old Pages never sends the field, so the order is safe. |
| Access | The single bypass application in §5. It can be added before or after the deploy. Without it, phone verification fails safely. |
| Migrations | None |
| Automation | No push. Direct uploads do not trigger Git builds. Pushing later creates an Access-gated branch preview only. |
| Impact on Preview | Additive: two routes, one page, one static script, and an optional Worker field. Existing Desk and social intake behave the same. |
| Cron | Stays `[]`, checked before and after |
| Rollback | Worker: `wrangler versions deploy c4976ccd-5654-440e-bf3d-ef2949f0a36c@100% --env preview`. Pages: roll `launch-05r-preview` back to `7d7c81e9`. Access: delete the bypass application. No data rollback is needed: test rows stay as labelled fixtures. |

**Smoke checks (non-destructive):**
- schedules `[]`;
- unauthenticated `/admin/capture` and `POST /api/admin/capture-submit` return 302;
- `GET /api/capture/receipt` returns 302 before the Access change and 200 after;
- publisher `/admin/capture` with no fragment shows "Invalid or missing handoff";
- Production is unchanged.

**Test submissions (separate authorisation).** Each one is labelled `[QA-CAPTURE]`:
- one text lead;
- one article (`https://example.com/qa-capture-…`);
- one social signal on a clearly test URL.

Each needs a D1 read-back.

## 7A. Gate B result: Preview deployment (2026-10-24, owner-approved)

**Scope.** Deployed `codex/trace-capture-preview-01` at `4e10dd8` to Preview only. No migration was run, Cron stayed `[]`, and no test submission was made.

| Step | Result |
|---|---|
| Local preflight | Clean tree at `4e10dd8`. The only configuration change since the previous Preview build (`efcec4a`) is PR #2's *Production* Ask flag. Build passes (routing and D6 checks). All three capture routes are in the bundle. The Worker dry run shows no Cron trigger. |
| Remote preflight | Schedules `[]` / `[]`. Rollback targets: Worker `c4976ccd`, Pages `7d7c81e9`. Production Pages `ed33e35f` and Worker `41f31744`. Preview D1 baseline: 0 social signals, 19 candidates (0 `capture-*`), 13 governance events. |
| Preview Worker | **`3b8d5721-f1da-4223-ad3a-53a108d26cf3`** (tag `4e10dd8`), deployed first |
| Preview Pages | **`fff5102d`** on `launch-05r-preview`, commit `4e10dd8` |
| Schedules after | `[]` / `[]` |
| Unauthenticated | `GET /admin/capture`, `/capture-intake.js`, `/api/capture/receipt` and `POST /api/admin/capture-submit` and `/api/capture/receipt` all return **302** (Access). The receipt route stays 302 until the owner adds the bypass application in §5. |
| Authenticated page (reader session) | `/admin/capture` renders and loads only its own same-origin script. Submit stays disabled and no return link appears without a handoff. |
| Existing Preview features | Evidence Library is read-only for readers, and history returns 200 with 3 events. Freshness returns 403 for readers. `/admin/social` and `/api/admin/social-signals` return 200. TRACE Desk renders. **`/admin/review` now shows readers the read-only notice:** the Publish/Archive role gating (`50fc313`) is verified live for the first time. |
| D1 after | Unchanged: 0 social signals, 19 candidates, 13 events. No writes. |
| Production | Unchanged: `/api/capture/receipt` returns 404, `/admin/capture` returns 302, Ask is still off |

**Finding, fixed locally and not yet deployed.** Without a handoff, the page showed the raw "Unexpected end of JSON input". That is exactly what you'd see if Access sign-in drops the fragment. Commit `acbd63e` replaces it with "This page has no capture to submit. Return to TRACE Capture and reopen the same saved attempt." Submit stays disabled and nothing is sent; four tests cover it. It goes out in the next approved Preview deploy, before Gate C.

**Rollback (if needed).**
- Worker: `wrangler versions deploy c4976ccd-5654-440e-bf3d-ef2949f0a36c@100% --config wrangler.worker.toml --env preview`.
- Pages: roll `launch-05r-preview` back to `7d7c81e9`.

**Redeploy (owner-approved, 2026-10-24).** Deployed the candidate at `3e0c345`, which adds the handoff-message fix `acbd63e`. No configuration or database change since `4e10dd8`, and the dry run shows no Cron trigger.
- **Versions:** Preview Worker **`d8e4d10c-209f-45b5-9d0f-d30c46a0d4a3`** first, then Pages **`ed744c77`** on `launch-05r-preview`.
- **Smoke checks:** schedules `[]` / `[]`. Every unauthenticated capture path returns 302. Production is unchanged (`ed33e35f`, `41f31744`; receipt route 404; Ask off).
- **Page:** `/admin/capture` without a handoff now shows "This page has no capture to submit. Return to TRACE Capture and reopen the same saved attempt." Submit stays disabled and there is no return link.
- **Existing features:** Evidence Library (reader, read-only), freshness (403), review (reader notice), social and Desk all as before. History returns 200.
- **D1:** unchanged: 0 social signals, 19 candidates, 13 events.
- **Rollback for this round:** Worker `3b8d5721-f1da-4223-ad3a-53a108d26cf3`, Pages `fff5102d`. The original pre-capture targets are Worker `c4976ccd` and Pages `7d7c81e9`.

**Waiting on the owner:** the Preview Access bypass application for `/api/capture/receipt` (§5). After it is added, `GET /api/capture/receipt` should return 200 `{"protocol":"trace-capture-v1"}` while `/admin/capture` stays 302.

## 8. Gate C: real device

1. Copy `delivery/TRACE-Capture-1.1.0-debug.apk` to the phone and install it over 1.0.0. Same signer, so it's an update. **Do not uninstall first**, or the local database is lost.
2. **Before:** note an existing capture. **After:** confirm it is still listed (Room v1→v2 migration).
3. Share a Reddit post to TRACE Capture and save it. Open it, choose Submit, pick **Preview**, choose **social** and enter a reason.
4. The browser opens `/admin/capture`. Sign in with Access as the **publisher**. If the page says the handoff is missing after sign-in, return to the app and reopen the same attempt.
5. Confirm. Tap "Return receipt to TRACE Capture". In the app, run verify. **Expect** `SYNCED` with the record id.
6. In `/admin/social` on Preview, confirm the exact URL, reason and notes, status pending.
7. Repeat with an article URL (TRACE Desk) and a text lead (TRACE Desk).
8. **Offline and retry:**
   - Enable airplane mode before verifying; expect FAILED with the capture intact. Re-enable and verify again; expect SYNCED.
   - Submit the same attempt twice; expect "Already saved by this attempt" and no second record.

Evidence to keep: screenshots of each step, the record ids, and a D1 read-back.

## 9. Gate D: Production (separate approval)

- Production currently lacks this code. Production also has **no 0076**, and the combined branch contains SEED-01.
- **Recommended:** release capture through `main` **after** PR #3 is merged and 0076 is applied, so capture rides on the same release path.
- Alternatively, open the capture branch as its own PR against `main`. It has no dependency on 0076, and merging it deploys Production Pages; the Production Worker must be deployed immediately after.
- No Access change, no secret and no migration. Re-verify the Access coverage first.

## 10. Commits (local)

| Commit | Description |
|---|---|
| `ae17062` | Codex's companion, cherry-picked from `dcc0ed2` (authorship kept) |
| `e7251fd` | Keep `astro.config.ts` unchanged |
| `b32ad4e` | Environment-bound HKDF receipt key, id validation, truthful replay/duplicate semantics, exact-URL check, page messages |
| `e2dbfaf` | Regression tests; added to `npm test` |
| `b5be2fb` | Whitespace fix |
| this document | Gate A record |

## 11. Open questions for the owner

1. **Approve the Preview Access bypass application** in §5, or choose the offline-receipt alternative, which needs an Android patch and rebuild.
2. **Approve the Gate B deployment** of the combined candidate, and separately authorise labelled test submissions.
3. **Gate D release order:** with PR #3 (recommended), or as a separate PR.
