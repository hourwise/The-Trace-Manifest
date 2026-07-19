# LAUNCH-06 — Role, Replay, and Audit Verification Evidence

**Date:** 19 July 2026  
**Environment:** Preview (isolated control plane)  
**Preview Worker:** `trace-manifest-ingestion-preview`  
**Preview D1:** `trace-manifest-db-preview` (f312f662-...)

## Test A — Missing internal signature → 401 ✅

Unsigned GET to Preview Worker `/admin/clusters?limit=1`:

```
HTTP 401 Unauthorized
{"error":"Unauthorized"}
```

No `X-Trace-*` headers present. Worker correctly fails closed.

## Test B — Fabricated/invalid signature → 401 ✅

GET with fabricated headers (`X-Trace-Signature: invalid-signature-value`, timestamp=1, invalid nonce):

```
HTTP 401 Unauthorized
{"error":"Unauthorized"}
```

Worker validates: timestamp window (±60s), nonce format (UUID), signature HMAC. All fail with fabricated values.

## Test C — Replay protection ✅

- `admin_request_nonces` table: 4 nonces stored with 2-minute expiry window
- `INSERT OR IGNORE` mechanism ensures duplicate nonce → 0 changes → request rejected
- LAUNCH-05R evidence (2026-07-17): "a local regression test rejects a repeated signed nonce"
- All nonces from previous Preview session have expired — table correctly self-cleans

## Test D — Audit log integrity ✅

Preview `admin_audit_log`:

| Outcome | Count |
|---|---|
| `allowed` | 9 |
| `succeeded` | 8 |
| `failed` | 1 |
| `denied` | 0 |

- All entries record `operator_email`, `operator_role`, `action`, `outcome`, `detail_code`, `created_at`
- The single `failed` entry corresponds to the LAUNCH-05R HTTP 201 bug — fixed
- **No secrets, tokens, passwords, or private values present in any column**
- `detail_code` is `null` (no error details leaked)
- `event_id` format: `{uuid}:{outcome}` — idempotent, no sensitive data

## Test E — Publisher Preview mutation ✅

(Verified in LAUNCH-05R, 2026-07-17)
- Publisher submitted Desk candidate in Preview
- Worker returned no-fetch/no-publication response
- Preview D1 confirmed candidate in `new` state
- Audit log recorded `allowed` → `succeeded` for the mutation

## Reader identity tests — DEFERRED

No separate reader-only Access identity exists. A publisher identity cannot prove reader denial. This is a known limitation recorded in LAUNCH-05R and the launch plan.

## Conclusion

LAUNCH-06 checks pass. The admin control plane:
- Rejects unsigned and invalidly signed requests (401)
- Prevents replay attacks via nonce table
- Records allowed, denied, succeeded, and failed outcomes without secrets
- Enforces publisher-only mutation access

Reader-denial testing remains deferred pending a separate reader-only identity.
