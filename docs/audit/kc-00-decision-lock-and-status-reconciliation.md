# KC-00 — Decision Lock and Status Reconciliation

**Date:** 22 July 2026  
**Scope:** Documentation and contract lock only  
**Status:** Complete  
**No runtime, D1, R2, Queue, Vectorize, secret, or production changes were made.**

## Purpose

KC-00 establishes one canonical Knowledge Continuity workstream and records the boundaries that implementation tasks must follow. It is the prerequisite for KC-01 and for any source capture, schema expansion, external-AI backfill, or retrieval-index work.

## Canonical ownership decision

1. D1 `knowledge_documents` and its revisions, source links, relationships, review state, expiry, and future claim/assertion joins are the canonical runtime knowledge path.
2. `docs/Knowledge Input/*.md` and the admin knowledge API are authoring/migration inputs to that D1 lifecycle, not independent runtime stores.
3. The original `knowledge_pages`/`knowledge_page_*` schema in `db/schema.sql` and `src/data/knowledge/*.ts` static route are legacy compatibility/publishing paths. They receive no new canonical knowledge writes and are not Ask TRACE evidence until imported, mapped, and reviewed through D1.
4. Existing published static pages may remain visible while migration is planned and reviewed. No third knowledge table or new static authoring path may be introduced.

## Contracts locked

- ADR 0016 `evidenceMode` is separate from `conclusionMode`; the model cannot choose either mode.
- Claim citations resolve to reviewed assertions and source chunks/locators, not only whole-source IDs.
- Source tier/identity is source-level metadata; directness, role, and evidentiary treatment are claim-assertion-level decisions.
- Existing claims remain authoritative only until the KC-05 cutover; then canonical claims/assertions receive all new writes and legacy claims become read-only compatibility data.
- D1 remains authoritative across R2 and Vectorize failures; capture and indexing use pending outbox/reconciliation states.
- Embedding provider/model/version/cost policy is a gate before KC-09 indexing.
- Ordinary HTML/Markdown/plain-text capture is in scope before PDF parsing. PDF v1 is metadata-only/pending; PDF extraction requires a separate spike.
- Original-language evidence remains canonical. Translation representations are deferred to Phase 7 and never count as independent sources.
- Numeric public evidence scores remain disabled until the KC-07 fixed labelled calibration gate; qualitative bands may be used earlier.

## Status corrections recorded

The launch and canonical plans now describe the following as partial or pending rather than complete:

- normal triage receives snippets unless a governed source-capture path is used;
- Find Related currently returns read-only suggestions and does not persist evidence relationships;
- automatic cluster tier-count upgrades are not claim/provenance-aware proof;
- public independence/reproducibility labels require the KC-01 trust fix;
- approved knowledge prose is internal synthesis whose external evidence bundle is not yet inherited by Ask TRACE; and
- document-level knowledge source URLs are not yet section-to-assertion evidence links.

## Evidence of completion

- [`docs/TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md`](../TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md) — ownership decision, amended contracts, and KC-00 marked complete.
- [`docs/BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md`](../BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md) — KC-00 marked complete; KC-01 remains the first code gate.
- [`ai_intelligence_platform_master_build_plan.md`](../../ai_intelligence_platform_master_build_plan.md) — KC-00 marked complete and linked to this audit note.
- `db/schema.sql` and `src/pages/knowledge/[slug].astro` — legacy static/table path identified; current D1 routes and migrations confirm `knowledge_documents` as the active structured path.

## Exit

KC-00 is complete. Proceed to **KC-01 Trust Hotfix** in Preview. Do not deploy new capture, extraction, scoring, or indexing behaviour until KC-01's regression and fail-closed checks pass.
