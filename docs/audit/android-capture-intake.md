# Android Capture companion integration

Base: remote main `9cbad4f0d54badb3e003900fc3fe5d78ad7fee03`. Branch: `codex/android-capture-intake`. Prepared locally; not merged or deployed.

Android cannot legitimately call the existing same-origin editorial endpoints with a fabricated Origin or embedded service credentials. The companion uses the operator's normal external browser, existing Access publisher identity and existing governed proxy/Worker for all writes.

Additions:

* `/admin/capture` and a self-hosted external script: fragment-carried immutable intake, bounded review and an explicit confirm action. No automatic submit or publication. Raw shared social text and media stay on the phone.
* `/api/admin/capture-submit`: verified Access publisher, genuine same-origin browser request, bounded strict input, existing admin proxy and audit, private queue row read-back, seven-day signed receipt.
* `/api/capture/receipt`: proof-protected read-only receipt verification, requiring both the HMAC receipt and a phone-only 256-bit verifier. Domain-separated use of existing server-only internal secret. No endpoint for anonymous submission, queue enumeration, identity issuance or publishing. Response includes identifiers only; no content or operator email.
* Optional `captureRequestId` for existing candidate POST: publisher-scoped deterministic primary key; identical retries return the saved ID; changed payload rejects; concurrent retry recovers a committed row. Existing callers keep their response/behaviour.
* Independent Astro/Vite cache directories support local worktrees reusing installed dependencies without mutating another checkout's dependency cache.

No D1 migration, secret, service credential, Access policy, background worker or new publication route is introduced. The existing Pages/Worker internal secret and DB binding must refer to the same environment. Deploy the compatible Worker before the Pages wrapper.

Validation completed locally: focused `tests/capture-intake.test.ts` uses fixture Access RSA keys, real JWT verification, same-origin checks, signed Worker requests and in-memory SQLite private queues. It checks credential expiry/denial, social duplicate receipts, exact post URL retention, article/text routing, body bounds, invalid URLs, forged/expired/wrong-environment receipts, saved-row read-back, and retry after an interrupted committed request. Existing stabilisation suite, Astro check, Worker TypeScript check, Astro production build and generated routing/role-script checks passed. No remote records were created. Existing Astro KV-session/config and dynamic-page warnings remain unrelated to this feature.

Deployment is an approval gate. Read-only live checks found Production receipt route absent (404), and Preview receipt route Access-protected (302). Preview needs a maintainer-approved scoped receipt-path configuration or approved alternative, while keeping admin Access intact. Do not change policy or deploy without authorisation. After an approved Preview deployment, test on the phone and inspect the exact returned ID in `/admin/social` or `/admin/desk`; a 2xx response alone is not acceptance.

Manual operator steps after approval:

1. Review this branch and Android's `docs/INTEGRATION-AUDIT.md`; rebase/merge through the current maintainer workflow if main moves.
2. Verify existing schema prerequisites (editorial candidates, social signals and admin audit) and matching Pages/Worker environment bindings. No new migration is needed.
3. Deploy Worker and Pages to the agreed Preview environment; approve the specific read-only receipt-path access arrangement. Confirm `GET /api/capture/receipt` returns `trace-capture-v1` to native clients.
4. Log in through the browser with a configured publisher, submit an explicitly approved fixture or real operator-selected public post, return the signed receipt, and verify it in the Android app.
5. Read the returned ID directly in the private queue. Reopen the same attempt and verify no second row. Test offline, expired browser login, callback interception without verifier and local retention.
6. Only after that, separately approve Production rollout and a real phone acceptance test.

If Access login loses the URL fragment, sign in, then reopen the same attempt from the app. No credentials leave the browser. Fragments may remain in browser history, so clear that history according to personal preference after review.
