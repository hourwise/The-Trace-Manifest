# Operational runbook

## First response

1. Preserve request IDs, audit event IDs, timestamps, and aggregate counts; do not copy secrets, raw authorisation headers, or full questions.
2. Disable the smallest affected feature. Use `TRACE_AI_PUBLIC_ENABLED=false` for public Ask, `TRACE_AI_EDITORIAL_ENABLED=false` for admin drafting, or `TRACE_AI_GLOBAL_KILL_SWITCH=true` for every model path.
3. If publication or audit integrity is uncertain, stop admin mutations and scheduled ingestion.
4. Record the incident and operator actions outside the affected system.

## Provider failures

- `401`: keep AI disabled, rotate/verify the key and configuration, inspect access history. Never retry automatically.
- `402`: keep AI disabled, reconcile provider balance and D1 reservations/ledger. Never auto-top-up or retry.
- `429`/`5xx`/timeout: the request has one attempt. Inspect circuit state and billing-uncertain settlements before restoring.
- Invalid output/citations: inspect validation codes and the evidence IDs, not raw secrets. Do not publish the draft.

## Unexpected spend or request storm

Activate the global kill switch, inspect `ai_requests`, reservations, usage ledger, quota, concurrency leases, and circuit rows by time/task/model. Compare aggregate tokens and cost to the provider account. Revoke the key if requests do not correspond to TRACE request IDs.

## Admin/authentication incident

Remove the user from Access and role allowlists, rotate the internal signing secret if its exposure is possible, inspect denial and outcome audit rows, and verify nonce replay rejections. Do not restore mutations until reader/publisher negative tests pass.

## Ingestion degradation

Use the jobs and sources admin views. `unsupported` means no connector implementation exists; disable or implement it rather than treating it as healthy. For failures, inspect redacted source health details, test the parser against a saved fixture, and confirm no job is recorded as succeeded before storage completes.

## Publication error

Withdraw or supersede the published story through an authenticated publisher action. Record a public correction when a factual statement changed. Never delete the correction/audit history to make the page appear clean.

## Migration failure

Stop writes, preserve the pre-migration export, capture the exact applied statement, and determine whether the one-time migration partially committed. Do not rerun the full file until the schema is inspected. Prefer a forward repair migration; restore only under the documented recovery decision.

## Recovery checks

Run CI, migration validation, Access role tests, one supported and one unsupported ingestion, publication eligibility tests, audit verification, and an AI-disabled smoke test. AI restoration additionally requires a bounded non-production provider test and cost reconciliation.
