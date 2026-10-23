# TRACE V1 — KNOWLEDGE-10 Workstream 1: legacy Production D1 absorption

**Date:** 23 October 2026
**Release line:** V1.1 (knowledge foundation). This does not block the V1 relaunch.
**Disposition:** `LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS`

## 1. Question and answer

Can everything already in Production D1 flow into the V1 governed model, or is some of it dead wood?

**Answer:**

- Every Production row has a class and a recorded reason. **No population is unexplained dead wood.**
- Only a small share is already **usable evidence**: **0 of 417** assertions are eligible for Ask TRACE today.
- No accepted assertion can be promoted to `current` through the existing freshness gate. The legacy shape fails five gate conditions, set out in §4.
- The working absorption route already exists in the code:
  1. capture the source (KC-11C);
  2. re-extract it into locator-backed assertions (KC-11D);
  3. provenance review;
  4. admission and reviewer review;
  5. freshness review.
- The route needs one small capability (§6, C1) and four owner decisions about large legacy queues (§7).

Each queue will hit one of three constraints:

- **reviewer time** (the real bottleneck);
- **owner triage decisions** for 8,700+ unreviewed backlog rows (drafts, candidates and raw feed items);
- **a handful of governed-route gaps**, none of which needs a new database or import path.

## 2. Inspection method

| Item | Value |
|---|---|
| Cloudflare account | `b7765d4c91a51c079125912afcd840cf` (OAuth, `wrangler whoami`) |
| Production D1 | `trace-manifest-db` / `1625036a-ffe2-4103-bf9d-086bae150561`, region WEUR, 118 objects reported by `d1 info` |
| Snapshot method | One read-only keyset pass: per table, `ORDER BY rowid LIMIT 2000`, FTS shadow tables skipped (`scripts/knowledge-10/logical-backup-keyset.mjs`) |
| Snapshot window | Started `2026-10-23T05:52:19Z`, captured `2026-10-23T05:56:41Z` |
| Snapshot size | 113 tables, **55,718 rows**, 30.7 MB JSON, SHA-256 `5e6a414d0ee39ea04445b3849a76694d5199d099dc4d2c8451e1e3b1aa9563ee` |
| **D1 rows read** | **56,338**: the one pass, with each row read once |
| Live queries beyond the snapshot | **0 SQL queries.** `d1 info` (metadata) was called once, plus four unauthenticated public GETs: `/ask-trace`, `/stories/ai-evidence-index`, sitemap and RSS. |
| Analysis | Run locally against an SQLite copy (`scripts/knowledge-10/load-snapshot.mjs`, `census.mjs`, `absorption.mjs`). The query text is recorded in those scripts. |
| Privacy | The snapshot stays in the session scratchpad and is not committed. This report gives counts and identifiers only. |

**D1 context.** At inspection time, `d1 info` reported `rows_read_24h = 1,499,397` and `rows_written_24h = 32,921`. That 24-hour window includes the approved Production migrations of 22 October and three logical backups taken during them, so it is **not** a steady-state baseline. Re-measure it after a quiet 24 hours (see the readiness report, §10).

## 3. Population classification

**Classes:**

| Class | Meaning |
|---|---|
| A | Native: already in its final V1 shape |
| B | Absorbable through an existing governed route |
| C | Needs a new, small capability |
| D | History, audit or provenance only; never evidence |
| E | Retirement candidate: owner decision, nothing deleted |

### 3.1 Editorial and evidence data

| Population | Rows | Observed shape | Class | Route or reason |
|---|---:|---|---|---|
| `story_clusters`, published | 98 | 97 with `is_published = 1`; **1 placeholder** (§5.1) | **A** | Live public stories. The 88 with no story claims stay story-level until claims are extracted through `/admin/extract-claims` and the EDITORIAL-03C run ledger (**B**). |
| `story_clusters`, review | 37 | All `vendor_reported`, none reviewed | **A** (queue) | Normal editorial review. D4 makes this queue reachable from Pending Review. |
| `story_clusters`, draft | 2,620 | Jul 1,074; Aug 1,239; Sep 307. 1,435 `community_reported`, 669 `vendor_reported`, 312 `unverified`, 157 `provisionally_supported`, 47 `strongly_supported`. Average 1.38 members; 235 multi-source. 1,626 have topic `general`. | **E** with a carve-out to **B** | Owner triage rule (§7, D-1). These are unreviewed, auto-clustered news items 7–15 weeks old. The 204 provisionally or strongly supported drafts in scoped topics can enter review (B). The rest are retained as discovery history (D). |
| `editorial_candidates` | 3,768 | 3,751 `new` (`manual_url` intake; Jul 897, Aug 2,508, Sep 363), 15 published, 1 drafting, 1 archived | **E** with a carve-out to **B** | Owner triage rule (§7, D-2). No bulk triage tool exists (§6, C3). |
| `feed_items` | 6,765 | published 249; clustered 3,651; classified 563; raw 2,302. **0 rows with `duplicate_of` set.** Fetched 2026-07-12 to 2026-09-06. | **D**, plus **B** for URLs | Feed items are discovery and provenance context. Their URLs are inputs to capture (B, via C1). Raw and classified items are **not** pushed through classify/cluster: that would only add drafts (§7, D-3). |
| `claims` (legacy) | 1,159 | All cut over | **A** (history) | Kept as the cutover source. |
| `legacy_claim_cutover` | 1,159 | 1,159 legacy claims → 1,159 distinct canonical claims; 0 missing | **A** | The cutover is complete and one-to-one. |
| `canonical_claims` | 1,199 | All `active`. 1,159 from the cutover plus 40 rule-based. Classes: official_vendor_claim 740, editorial_synthesis 388, specification_defined 52, independent_research_finding 9, benchmark_result 5, community_report 4, legal 1. **782 have no assertion**, of which 556 are non-synthesis (289 published-linked, 267 draft-linked). | **A** (identity) | The canonical claim is the stable anchor. Evidence attaches by re-extraction (§4). The 388 `editorial_synthesis` claims are TRACE's own story prose. They never count as independent evidence and stay story content (D for evidence purposes). |
| `claim_assertions`, legacy | 377 | `legacy_claim_evidence`. 210 admitted/accepted/unknown and 167 pending/proposed/unknown. All are `reports`, `directness = unknown`, with no version, chunk, locator or provenance. | **D** (history), with replacement via **B** | They cannot be promoted (§4). They are replaced by locator-backed assertions from captured sources on the same canonical claim. The legacy rows and their 210 reviewer decisions stay as audit history and act as a review-priority signal. |
| `claim_assertions`, rule-based | 40 | pending/proposed/**current**; 31 are on `editorial_synthesis` claims; all linked to the 33 metadata-only versions | **B** (after capture) | Anomaly: `current` without any `evidence_freshness_reviews` row (that table is empty). They are not eligible, because admission is pending. Treat as unknown until reviewed (§5.3). |
| `claim_evidence`, `legacy_claim_evidence_map` | 377 / 377 | Complete one-to-one map | **A** (provenance) | Records where each legacy assertion came from. |
| `source_documents`, `source_document_versions` | 33 / 33 | All HTML, admitted, `metadata_only`, `legacy_raw_v1` hash semantics, **0 in R2**. Registry: 21 rss-A, 3 github-A, 2 rss-B, 7 rss-C. **None** overlap the legacy-assertion evidence URLs. | **B** | Recapture through KC-11C under `normalized_content_v3`, private full text. That is 2 batches of at most 25. |
| `source_chunks`, `provenance_groups`, `source_extractions` | 0 / 0 / 0 | | none yet | Produced by the B route. |

### 3.2 Knowledge, catalogue and guides

| Population | Rows | Observed shape | Class | Route or reason |
|---|---:|---|---|---|
| `knowledge_documents` | 30 | All approved, `public_knowledge`, `vendor_reported`. Types: 11 comparison, 10 how-to, 8 definition, 1 security advisory. Approved 2026-07-19. **`review_after` 2026-10-19 has passed for all 30.** | **A** (prose) + **B** (evidence) | Knowledge retrieval now marks all 30 `stale`. Route: KC-10D revision review renews them; KC-08 `map.ts` mapping links them to eligible assertions. See the readiness report, §6. |
| `knowledge_document_sources` | 30 | One per document. 28 labelled `external_independent`, 2 `external_vendor`. | **B** | KC-08E link migration. **Data-quality flag:** vendor pages such as `openai.com/index/…` and `developers.openai.com/…` are labelled `external_independent`. They must be reclassified at review. |
| `knowledge_source_link_migration_audit` | 30 | All `pending_review` since 2026-07-26 | **B** | The existing relink and review surface (`/api/admin/knowledge/relink-sources`). |
| Knowledge mappings, revisions, proposals | 0 | | none yet | Produced by the B route. |
| `knowledge_search_records` / FTS | 3,984 | 2,755 `published_story` (**2,657 of them not published**), 1,199 `canonical_claim`, 30 `knowledge_document` | **A** (derived, rebuildable) | Latent defect (§5.2). No runtime consumer today. |
| `models` | 27 | 22 published; 10 open-weight with `local_available`. `hardware_requirements` and `quantisation_options` empty for **27 of 27**. Last verified 2026-07-20. Some values need verification: for example, `Qwen 2.5` and `Qwen 3` are recorded as `closed`, and `Qwen3.8` as `2.4T` parameters. | **A** (catalogue) + **C** (evidence links) | Foundation for open-model execution (ADR 0019). Catalogue facts are not yet linked to Knowledge Continuity evidence (C4). |
| `providers`, `provider_models`, `benchmarks`, `benchmark_runs` | 20 / 19 / 13 / 14 | 11 benchmark runs are vendor-run and 3 independent | **A** + **C** | As above. `model_versions` and `pricing_history` are empty. |
| `guides` | 21 | All `draft`, `internal`, `documentation-reviewed` (developer tooling, Ollama, MCP) | **A** (Guides Lab) | 0 `guide_sources`. Guides go through normal Guides Lab review. ADR 0019 setup procedures link here. |
| `question_gaps`, `question_gap_examples` | 1 / 1 | "best open model for running on ram not gpu", open since 2026-07-21 | **A** (queue) | A direct open-model execution use case (§10 of the open-model plan). |
| `social_signals` | 6 | | **D** | Discovery context. |

### 3.3 Operational and audit data

| Population | Rows | Observed shape | Class | Route or reason |
|---|---:|---|---|---|
| `sources` | 79 | All active. rss 36, github_api 21, manual 9, arxiv_api 6, page_diff 4, lmsys_api 1, huggingface_api 1, hackernews_api 1 | **A** | Source 93 is a scheduler-track decision (readiness report, §8). |
| `ingestion_jobs` | 17,048 | completed 10,479; failed 3,902; **running 2,667** (all `fetch`, 2026-07-19 to 2026-09-06) | **D** | Telemetry. Stale-running cleanup belongs to the scheduler track, not absorption. |
| `cron_runs` | 2,918 | completed 709; failed 1,258; **running 951** | **D** | Telemetry. Scheduler track. |
| `pipeline_stages` | 5,131 | | **D** | Telemetry. |
| `admin_audit_log`, `admin_request_nonces` | 2,761 / 7 | | **D** | Audit. |
| `ai_requests`, `ai_usage_ledger`, `ai_budget_reservations`, `ai_quota_usage`, `ai_circuit_breakers` | 121 / 116 / 116 / 5 / 2 | 15 `ask_trace` requests (all 19–21 July; 10 provider calls, US$0.041 settled) and 106 editorial calls (through 2026-09-06, US$0.183) | **D** | Cost and audit history. Rows carry `retention_expires_at`. |
| `editorial_sections` | 7 | | **A** | |

**Empty tables.** 75 of 113 snapshot tables are empty. They are mostly the V1 governed machinery:

- provenance, chunks, extractions;
- freshness reviews and governance events;
- knowledge mappings, revisions and impact;
- embeddings and index operations;
- backfill ledgers;
- the claim-extraction ledger.

**The governed layer has never processed Production data.** That is the absorption gap in one line.

## 4. Why the 210 accepted assertions cannot simply be "made current"

`evidence-freshness-review.ts` (`assertTransitionAllowed`) promotes an assertion to `current` only if **all** of these conditions hold. The table shows how the 210 admitted and accepted legacy assertions fare:

| Gate condition | Assertions passing |
|---|---:|
| Admitted and accepted | 210 |
| `source_role = evidence` and `factual_support` | 210 |
| Relationship in `supports`, `partially_supports`, `qualifies`, `reproduces` (all 210 are `reports`) | **0** |
| `provenance_group_id` present | **0** |
| An admitted source document whose **current** version is referenced | **0** |
| An `extracted` or `captured` version | **0** |
| `source_chunk_id` with start and end locators | **0** |

The gate is correct: it is the trust boundary. **Do not weaken it to absorb legacy rows.**

**What this means.** Legacy evidence is absorbed by **re-deriving** it from captured sources, not by promoting the legacy rows. KC-11D already writes locator-backed chunks, proposed assertions, deterministic `claim_match_candidates` against existing canonical claims, and provenance-group proposals. So:

- re-extracted assertions attach to the **same canonical claims**;
- the canonical identity is preserved;
- the legacy assertions remain as history.

**Why the extra stages still matter.** Even an assertion promoted to `current` would not yet support an answer. `calculateDeterministicConfidence` requires either two independent sources or one strong Tier A record:

- `independentEvidenceWeightFor` returns 0 until KC-05 provenance groups exist;
- `strong` requires `direct` + `supports` + provenance.

Provenance review is therefore on the critical path, not optional.

## 5. Defects and anomalies found (none blocks the relaunch)

### 5.1 A placeholder cluster is marked `published`

Story 358, **"Unclustered Items (placeholder)"**, has:

- slug `ai-evidence-index`;
- `publication_status = published`, but `is_published = 0`;
- `published_at` 2026-07-19;
- reviewed status;
- 0 members;
- **539 story claims**.

`workers/ingestion/extract-claims.ts:63-68` creates it as a holding cluster for claims from unclustered items.

**Public exposure: none.** `/stories/ai-evidence-index` returns 404, and the story is absent from the home page, sitemap and RSS (checked 23 October with GETs).

**Ask TRACE exposure:** `retrievePublishedEvidence` filters on `publication_status = 'published'` plus slug, review and summary, and does **not** check `is_published`. The placeholder therefore passes the "linked to a published story" stage: **163 of the 223** published-linked assertions (151 of them accepted) come through it.

**Impact:** none today, because no assertion is current. Once evidence becomes current, unreviewed holding-cluster claims would be treated as published-story evidence.

**Fix (V1.1, before any evidence goes current), either:**

- add `sc.is_published = 1` to the Ask published-story predicate (it already exists on the public routes); or
- set the placeholder's `publication_status` back to `draft` through a reviewed publisher action.

### 5.2 Drafts are indexed as `published_story`

The migration 0050 triggers `story_clusters_knowledge_search_ai` and `_au` index **every** cluster as `published_story`, whatever its publication status. Production holds 2,620 draft and 37 review clusters in the FTS index.

**Exposure today: none.** No runtime code queries `knowledge_search_fts`. Ask TRACE uses `LIKE` predicates, and the only readers are the M1 readiness report and migration validators.

**Requirement (V1.1):** before any FTS or hybrid retrieval ships, the trigger, or every consumer, must filter on publication state. Retrieval work that reads this index must cover it in its tests.

### 5.3 Forty pending assertions carry `freshness_state = current` without a freshness review

These are the rule-based assertions. They are not eligible, because they are pending and proposed, but `current` was never reviewed: `evidence_freshness_reviews` is empty.

**Recommendation:** at review time, treat them as `unknown`. Change nothing in this programme.

### 5.4 Knowledge source kinds

28 of the 30 knowledge source links are typed `external_independent`, including vendor pages. This is harmless to Ask TRACE today:

- knowledge excerpts are `internal_synthesis` with weight 0;
- `independentEvidenceWeightFor` returns 0 for every kind.

It must be corrected in the KC-08E review before those links become mappings.

## 6. New capabilities required (class C)

All are small and fit existing subsystems. None needs a schema migration except where noted.

| ID | Capability | Why | Fits in | Size | Release |
|---|---|---|---|---|---|
| **C1** | **Legacy evidence URL inventory category.** Extend `scripts/inventory-backfill.mjs` (KC-11A) with an `evidence_url` category: the feed-item URLs behind legacy assertions (285 distinct; 160 behind the 210 accepted) and behind published non-synthesis claims (90 distinct). Carry the canonical-claim IDs as `origin`. | The KC-11A inventory currently covers registry, knowledge, benchmark and correction URLs, not claim evidence URLs. Without this, the B route cannot select the legacy evidence. | KC-11A collector (read-only) | S | V1.1 |
| **C2** | **Ask published-story predicate fix** (§5.1) and **publication-aware FTS indexing** (§5.2) | Correctness before evidence goes current | `ask-evidence.ts`; migration-level trigger fix (needs authorisation) | S | V1.1 |
| **C3** | **Bulk triage for editorial backlogs**: archive or keep by rule, with a reason and an audit event, for draft clusters and `new` candidates | 6,371 rows cannot be triaged one at a time. The existing `/admin/archive-cluster` is single-item. | Existing archive route plus admin queue | M | V1.1 |
| **C4** | **Catalogue-to-evidence links**: model and benchmark facts reference canonical claims and assertions | ADR 0019 requires every execution fact to be linked to Knowledge Continuity | ADR 0019 slice 2 (needs a migration) | M | V1.2 |

**No new path is needed for:**

- assertion succession: re-extraction attaches to the same canonical claim;
- a separate import route (see the local-acquisition plan for the shared import contract);
- bulk freshness promotion, which is **forbidden**.

## 7. Owner decisions required

These populations will become dead wood unless one of these decisions is made. Each option keeps every row; "archive" means excluded from work queues, with a recorded reason.

| ID | Population | Recommended rule |
|---|---|---|
| **D-1** | 2,620 draft clusters | Keep for review: the drafts that are `provisionally_supported` or `strongly_supported` (204) **and** are in a scoped AI and agents topic. Archive the rest as `stale_unreviewed_discovery`, with each cluster's feed URLs retained as discovery history. |
| **D-2** | 3,751 `new` editorial candidates | Archive candidates older than 30 days as `stale_intake` unless they point to a Tier A or B primary source **and** an AI and agents topic. Re-raise the kept ones through the normal desk. |
| **D-3** | 2,865 raw or classified feed items | Do **not** run them through classify and cluster. Keep them as discovery history. Make only Tier A and B URLs selectable in the C1 inventory, when a question needs them. |
| **D-4** | 388 `editorial_synthesis` canonical claims | Confirm they stay story content and are never evidence. Their 162 legacy assertions are history. |

## 8. Absorption sequence (proposed; not executed)

1. **Pre-requisites.** Owner decisions D-1 to D-4. C1 (inventory category). C2 (Ask predicate). D4 (Pending Review reaches the governance panel; see the readiness report, §11).
2. **Rehearse locally.**
   - Run the KC-11A inventory against a fresh snapshot copy (read-only).
   - Build the KC-11C plan for the **160 accepted-evidence URLs** (7 batches of at most 25) and the **33 metadata-only documents** (2 batches).
   - Run KC-11D extraction against **recorded fixtures**, not live fetches, using the D1-faithful adapter (`tests/sqlite-d1.ts`: 100-parameter limit, trigger-counted changes).
   - Confirm that a second run produces 0 new rows.
3. **Preview pilot** (the seeding plan; needs separate approval). The same route runs on Preview with the curated seed corpus first, so the route is proven on new sources before legacy URLs are attempted.
4. **Production absorption** (separate approval; manual batches; Cron untouched). **Prerequisite:** KC-11C is Preview-only in code (`knowledge-source-backfill.ts`), so lifting that guard for Production is its own reviewed change:
   - **First:** the 33 metadata-only documents, then the 160 accepted-evidence URLs, one batch at a time, with rows-read and rows-written observed between batches.
   - **Then:** provenance review, assertion admission and reviewer review, freshness review.
   - **Then:** knowledge revision review (all 30 are review-due), and mapping the 30 documents to the newly eligible assertions.
5. **Expected yield.** Unknown until capture. Sources may have moved, been redirected or become paywalled. KC-11D settles unresolved drift as `held_for_review` and never fabricates a body. Report the yield honestly per batch.

## 9. Reviewer workload estimate

This is an order-of-magnitude estimate for planning only. Times assume the existing review UIs plus D4.

| Work | Volume | Unit time | Hours |
|---|---:|---:|---:|
| Provenance group review (proposals from 193 captured sources) | ~60–120 proposals | 2 min | 2–4 |
| Assertion admission and reviewer decisions on re-extracted assertions | ~300–600 assertions | 1–1.5 min | 5–15 |
| Freshness review of accepted assertions | ~200–400 | 0.5–1 min | 2–7 |
| Knowledge revision renewal (30 review-due documents) and mapping | 30 documents | 10–20 min | 5–10 |
| Backlog triage by rule (with C3) | 6,371 rows | rule-based | ~2 |
| **Total** | | | **~16–38 reviewer-hours** |

**Without C3**, backlog triage alone runs to hundreds of hours. **Without D4**, every Pending Review item costs extra navigation. Both are on the critical path for review throughput, not for correctness.

## 10. Disposition

**`LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS`.**

- Every population is classified.
- The governed route exists end to end (KC-11C → KC-11D → provenance → admission and review → freshness → KC-08 mapping).
- Absorption needs C1 and C2 (both small), C3 for backlog throughput, C4 for catalogue evidence (V1.2), and owner decisions D-1 to D-4.
- No legacy row has to be deleted, and none can or should be promoted without the existing gates.
