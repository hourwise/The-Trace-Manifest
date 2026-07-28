# KC-08F — public knowledge approval gate evidence

**Status:** Complete locally

**Scope:** Ensure public knowledge can only be approved when every material section has reviewed external evidence or an explicit reviewed inference/synthesis basis.

## Implementation

- Added `src/lib/server/knowledge-approval.ts` with a deterministic D1-backed gate.
- The gate reads parsed `materialClaims` from `document_json` (with a Markdown fallback), groups them by section, and requires a reviewed canonical mapping for every section.
- A normal section needs at least one accepted, admitted, current, non-`internal_synthesis` assertion through `knowledge_document_claim_assertions`.
- An explicit inference section may pass without an external assertion only when the reviewed canonical claim class is `editorial_synthesis` or `trace_manifest_inference` and the mapping relationship is `inference_basis`.
- Missing material claims, unresolved sections, legacy source links, stale assertions, and internal TRACE prose fail closed.
- `PATCH /api/admin/knowledge/approve` now enforces the gate, same-origin mutation protection, and a successful `admin_audit_log` event.

## Verification

- Stabilisation tests cover unmapped material claims, reviewed external assertions, and explicit editorial inference.
- `npm.cmd test -- --run` passed (119 ingestion tests plus stabilisation tests).
- `npm.cmd run typecheck` passed with the four existing hints.
- `npm.cmd run test:migrations` passed.
- `npm.cmd run build` passed with Cloudflare route verification.

KC-08G remains responsible for resolving mapped assertions, source chunks, and locators during retrieval while keeping knowledge prose at zero independent-evidence weight.
