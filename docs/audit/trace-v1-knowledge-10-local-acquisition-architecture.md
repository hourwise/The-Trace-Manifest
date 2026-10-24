# TRACE V1 — KNOWLEDGE-10 Workstream 8: local knowledge acquisition architecture

**Date:** 23 October 2026
**Release lines:**
- Contract and offline prototype (phases A–B): V1.1. They need no workstation.
- Local RAG, workers and Preview importer (C–E): V1.2.
- Production pilot and nightly operation (F–G): separate approvals.

**Disposition:** `LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED`

**Status:** planning only. Nothing here is implemented, scheduled or deployed.

**Principle.** Local hardware acquires, compares and prepares. Cloudflare validates, records, serves and audits. **Cloudflare verifies; local proposes.** The local RAG is never a source of factual authority.

## 1. Decisions this document proposes

| # | Decision | Recommendation |
|---|---|---|
| L-1 | Does local acquisition **replace, complement or shrink** Cloudflare-scheduled ingestion? | **Shrink.** Research discovery moves local: model and runtime releases, Hugging Face metadata, papers, benchmarks, documentation diffs. Cloudflare Cron, once STOP-BURN is closed through scheduler 0072, keeps only (a) bounded maintenance (expiry recalculation, index reconciliation) and (b) optional low-cost news-feed polling, if the editorial desk still wants it. Scheduler 0072 is still required for any Cron at all. Its overlap and stale-job remediation stays mandatory, but its scope and read budget shrink. |
| L-2 | Should one write path serve the seeding pilot, legacy absorption and catalogue records? | **Yes, at the evidence layer.** Evidence-bearing captures from **every** origin go through the existing KC-11A inventory → KC-11C plan → approve → execute route, where the **Worker fetches and hashes**. The import contract adds only (i) a machine identity, (ii) submission of inventories, plans and extraction hints, and (iii) a new structured record type for ADR 0019 catalogue objects. The seeding pilot and legacy absorption need nothing new. |
| L-3 | Who captures the evidence bytes? | **Cloudflare re-fetches.** For evidence-bearing sources that are publicly fetchable, the local capture is a *proposal*. The Worker re-captures under KC-11C ceilings and compares normalised hashes: a match is `captured`; a mismatch is `held_for_review`. Locally captured bytes are accepted only for sources the Worker cannot fetch (licensed or uploaded documents), and then as `editor_supplied_document` storage that a reviewer must check. |
| L-4 | Direct database access from the workstation | **Never.** No D1 credential, no `wrangler d1 execute --remote`, no S3 key that can write canonical R2 prefixes. |

## 2. Architecture

```text
 ┌──────────────────────── LOCAL WORKSTATION (untrusted preparer) ────────────────────────┐
 │                                                                                       │
 │  scheduler (systemd timer / Task Scheduler, independent of Cloudflare Cron)           │
 │      │ nightly, with per-source cursors; a missed interval is recorded, not caught up │
 │      ▼                                                                                │
 │  [1] Acquisition worker ──► raw snapshots (permitted only) + transport hash          │
 │      ▼                                                                                │
 │  [2] Extraction worker (deterministic parsers first; bounded local SLM for           │
 │      candidate claims) ──► normalised text, entities, candidate claims, locators     │
 │      ▼                                                                                │
 │  [3] Reconciliation worker ──► local catalogue + local RAG: "what changed since       │
 │      last receipt?", "already recorded?", "contradicts stored claim?"                │
 │      ▼                                                                                │
 │  [4] Verification worker (independent model + deterministic checks: IDs, hashes,     │
 │      schemas, locators re-found in text, allowed record types)                        │
 │      ▼                                                                                │
 │  [5] Packaging worker ──► TRACE-KNOW-YYYYMMDD-NNNN batch (manifest + JSONL + checksum)│
 │      ▼                                                                                │
 │  local append-only run log + batch ledger (prepared/submitted/accepted/rejected/      │
 │  committed) + receipt mirror                                                          │
 └──────┬────────────────────────────────────────────────────────────────────────────────┘
        │ HTTPS, Cloudflare Access service token + HMAC (machine identity "importer")
        ▼
 ┌──────────────────────── CLOUDFLARE (authority) ───────────────────────────────────────┐
 │  Import Worker route /admin/knowledge/import/*                                        │
 │    validate envelope, size, schema version, checksum, allowed types, idempotency     │
 │      ├─ evidence-bearing items ──► KC-11A inventory snapshot ──► KC-11C plan         │
 │      │                             (operator approval) ──► Worker re-fetch + hash   │
 │      │                             compare ──► KC-11D extraction ──► pending/proposed│
 │      ├─ extraction hints ──► stored as untrusted proposals with the item             │
 │      └─ catalogue records (ADR 0019) ──► staged rows, review_state = pending         │
 │    receipts per batch and per item (durable, replay-safe)                            │
 │  D1 = canonical identities, states, relationships     R2 = bodies, staged JSONL      │
 │  Review UIs: provenance, admission, reviewer, freshness, catalogue review            │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

## 3. Existing TRACE components reused

| Need | Reuse | Notes |
|---|---|---|
| Source and version identity, content hash, normalisation | `source-version-identity.ts` (`normalized_content_v3`), `source_documents`, `source_document_versions`, observations | The local system must run the **same** normalisation code: a vendored package of the same module and version. Its hashes are then comparable, but they are never trusted without a Worker re-fetch (L-3). |
| Bounded capture and backfill | KC-11A inventory snapshot (`/admin/knowledge/backfill/snapshot`, 512 KiB body), plan, approve, execute, retry, recover, status. `BACKFILL_CEILINGS`. | This is already the governed, idempotent, plan-hash-bound route. |
| Extraction, chunks, locators, match candidates, provenance proposals | KC-11D | Local extraction hints are proposals that help a reviewer. Canonical extraction still runs in the Worker. |
| Attribution | EDITORIAL-03C extraction-run ledger (`claim_extraction_runs`, items, effects) | Each import batch records its local `run_id` and model identity in the ledger metadata. |
| Governance | Assertion admission and reviewer governance (CAS, idempotency keys, events); freshness review; KC-08 mapping; KC-10 impact proposals | Unchanged. Import never writes past `pending` or `proposed`. |
| Authentication | Signed internal requests (`X-Trace-Operator`, `-Role`, `-Timestamp`, `-Nonce`, `-Signature`; nonce table; 64 KiB admin body) | Add a **machine role** `importer`, with its own secret and an Access service token. Grant it only the import routes. |
| Storage split | ADR 0019: R2 holds bodies; D1 holds identity, hashes, bounded excerpts, locators and relationships | Staged batch JSONL lives in R2 under an `import-staging/` prefix that only the import route reads. |

## 4. Local storage and RAG

| Store | Technology | Content |
|---|---|---|
| Catalogue | SQLite (WAL), schema mirrored from the D1 subset it needs | Sources and cursors; source versions (identity, hashes, retrieval time); entities (models, releases, artefacts, quantisations, runtimes, hardware); candidate claims; **import receipts mirrored from Cloudflare**; batch ledger |
| Snapshots | Content-addressed files: `sha256/aa/bb/…` | Permitted raw bodies and normalised text. Retention follows each source's `copyright_storage_mode`. |
| Lexical index | SQLite FTS5 | Normalised text and claims, for "already recorded?" and "what changed?" |
| Vector index (optional) | A local embedding model plus SQLite-vec or a similar embedded index | Near-duplicate and contradiction candidates only. Similarity never sets a fact. |
| Chronology | Tables of release, version and observation events | "Is this benchmark newer than the stored one?" |

**Reconciliation works from receipts, not from D1 scans.** The local catalogue learns Cloudflare's canonical state only from durable import receipts and from a bounded, read-only **delta feed** of the records it submitted (status by batch ID). It never mirrors Production D1. Normal nightly work needs **zero** broad Production reads.

## 5. Source monitoring strategy (nightly, incremental)

| Source class | Change signal (cheapest first) | Cursor |
|---|---|---|
| GitHub releases and tags | Releases API with `ETag` / `If-None-Match` | Last release ID and ETag |
| GitHub repository docs (selected paths) | Commits API filtered by path, since the cursor | Last commit SHA per path |
| Hugging Face model repositories | Hub API `lastModified` and `sha`; file listing with LFS SHA-256 | Repository SHA |
| Publisher announcement pages, documentation | HTTP conditional GET (`ETag` / `Last-Modified`), then normalised-hash diff | ETag and normalised hash |
| arXiv | Listing API with date bounds | Last announced date |
| Security advisories | GitHub Advisory or vendor feeds | Last advisory ID |
| Approved source documents already in TRACE | Conditional GET, then normalised-hash comparison with the last receipt | Version ID from the receipt |

**Rules:**

- A per-source politeness interval.
- `robots.txt` and terms respected.
- Bounded bytes per source.
- No marketplace scraping.
- No login-gated content.
- **Offline catch-up:** if the machine was off, record `missed_interval(start, end)` per source. The next run fetches only the current state, with no back-dated scan. Missed intervals are visible in the run report.

## 6. Nightly stages and change classification

| Stage | Output |
|---|---|
| 1. Acquire | Snapshots plus transport identity (URL, final URL, status, headers digest, time) |
| 2. Normalise and hash | `normalized_content_v3` hash per source; diff against the previous version |
| 3. Classify the change | One of: `new_source`, `new_release`, `new_artefact`, `new_quantisation`, `new_runtime_compatibility`, `changed_benchmark`, `changed_source_document`, `correction`, `supersession`, `withdrawal`, `no_material_change` |
| 4. Extract | Deterministic parsers for structured sources (release notes, model cards, HF metadata). Bounded local-model extraction for prose, emitting candidate claims with locators. |
| 5. Reconcile | Match to existing entities and canonical-claim candidates (local catalogue). Flag contradictions. |
| 6. Verify independently | A second model or rule set re-finds each locator span in the normalised text, checks schema and field constraints, and confirms the source is on the allowed list |
| 7. Package | Deterministic batch; unresolved items listed, never dropped silently |

**History is never overwritten.** A new version is a new version, and supersession is a proposed relationship.

`no_material_change` produces **no import item**. It is recorded locally only.

## 7. Local multi-worker responsibilities

| Worker | Allowed | Not allowed |
|---|---|---|
| Acquisition | Fetch allowed URLs within budgets; write snapshots | Run downloaded content; fetch model weights |
| Extraction | Propose claims, entities, locators | Mark anything verified |
| Reconciliation | Propose matches, contradictions, supersessions | Decide truth |
| Verification | Accept or reject proposals by executable checks; flag `reviewer_required` | Rely on any model's self-reported success |
| Packaging | Build manifest, JSONL and checksum | Alter verified content |

**Model output is untrusted throughout.** Verification is deterministic first. A model judgement can only add `reviewer_required`; it can never remove it. The coding-worker methodology in the research intake (§9.2 of the mission brief) applies to any local model used.

## 8. Batch envelope (`trace-know-batch-v1`)

```json
{
  "schemaVersion": "trace-know-batch-v1",
  "batchId": "TRACE-KNOW-20261022-0001",
  "localRunId": "run-20261022T020000Z-7f3c",
  "createdAt": "2026-10-22T02:41:09Z",
  "producer": { "system": "trace-local-acquisition", "version": "0.1.0", "normalizationPolicy": "source-normalized-html-v3", "hashSemantics": "normalized_content_v3" },
  "recordCount": 18,
  "byteCount": 41233,
  "itemsSha256": "…",
  "batchChecksum": "sha256 of canonical(manifest without batchChecksum) + itemsSha256",
  "items": "items.jsonl"
}
```

**Item fields** (one JSONL line per item):

- `itemId`: stable, `batchId` + ordinal.
- `idempotencyKey`: SHA-256 of the record type, canonical URL, normalised hash and proposed action. It is **independent of the batch**, so a retry in a new batch cannot duplicate.
- `recordType`: `source_capture_request` | `extraction_hint` | `catalogue_record` | `relationship_proposal`.
- `proposedAction`: `create` | `new_version` | `supersede_proposal` | `withdrawal_proposal` | `correction_proposal`.
- **Source:** `sourceRegistryId` (if known), `canonicalUrl`, `retrievedAt`, `transportHash`, `normalizedHash`, `contentPolicy` (`metadata_only` | `private_full_text` | `editor_supplied_document`).
- `locators`: start and end locators against the normalised text, plus a short excerpt hash (no full text in the item).
- `candidateClaimIds` and `existingCanonicalCandidates`: proposals.
- `entities`: model, release, artefact, quantisation and runtime identities, with external IDs such as the HF repo plus revision SHA, or a GitHub tag.
- `validation`: the result of every deterministic check.
- `reviewerRequired` (boolean) plus `reviewReasons`.

**Transport.**

- Large payloads go up as a staged R2 object under `import-staging/<batchId>/`, written by the import route itself through a size-limited multipart upload. The workstation holds no R2 credential.
- The control call carries only the manifest (well under 64 KiB).
- The batch is limited to 25 evidence items: the KC-11C ceiling is reused.

## 9. Governed import boundary

1. **Identity.** A Cloudflare Access service token plus an HMAC signature with a dedicated `TRACE_IMPORTER_SECRET`, a role of `importer` and the nonce table. Requests from an unknown or expired identity get 401. The importer role can never call publish, admission, reviewer or freshness routes.
2. **Validation.** Supported `schemaVersion`; manifest at most 64 KiB; staged JSONL at most 5 MiB; at most 25 evidence items and 200 catalogue items; checksum verified; every `recordType` on the allow-list; URLs checked by `eligibleRemoteUrl`; `contentPolicy` allowed for the source.
3. **Replay detection.** `batchId` is unique. Each item `idempotencyKey` is unique across batches. A replayed batch returns the original receipts.
4. **Canonical identity check.** The canonical URL hash against `source_documents`. Entity external IDs against the catalogue.
5. **Writes, bounded:**
   - evidence items become a KC-11A inventory snapshot and a draft KC-11C plan awaiting **operator approval**;
   - catalogue records become staged rows with `review_state = 'pending'`;
   - relationship proposals go into the existing proposal tables.
   - Every multi-row statement is chunked to **≤ 100 bound parameters**. Expected writes are counted with trigger-aware `meta.changes`.
6. **State preserved.** Nothing becomes admitted, accepted, current or published through import.
7. **Receipts.** One per batch and one per item: `accepted_for_staging`, `rejected(reason)`, `duplicate(original receipt)`, `held_for_review`. Later, `committed` or `rejected` once operator approval, capture or review completes. Receipts are durable D1 rows readable by the importer identity.
8. **Fail safe.** An unknown schema version, missing runtime columns (the existing `assertBackfillRuntimeSchema` pattern) or a checksum mismatch rejects the **whole batch** before any write.
9. **Retry.** Resubmitting the same batch is idempotent. A timeout after a successful write is resolved by reading receipts, never by resending blindly.

**Schema needs (separately authorised migrations, phase E):** `knowledge_import_batches`, `knowledge_import_items`, `knowledge_import_receipts`, and the ADR 0019 catalogue tables (open-model plan, §16).

## 10. Evidence admission policy

| Category | Examples | Import may set | Review required |
|---|---|---|---|
| **Objective metadata** | Release ID or tag; HF revision SHA; file names, sizes and SHA-256; declared licence identifier; declared parameter count; declared context length | Staged catalogue fields with `evidence_class = publisher_stated`, `review_state = pending` | Lightweight batch review: one approval covers a batch of objective fields, but only after the Worker has independently re-read the field from the primary API (for example the HF API for file hashes). A mismatch means item-level review. |
| **Interpretive evidence** | Coding quality, benchmark superiority, compatibility reliability, speed, energy efficiency, "works with harness X" | Candidate claims or assertions only, `pending` / `proposed` | Full item-level review on all three axes: admission, reviewer and freshness. Community-origin items stay `COMMUNITY_REPORTED`. |
| **Never importable as fact** | A model's judgement of credibility; similarity matches; locally computed speed estimates | Not importable as facts | Estimates can be imported only as `deterministic_trace_estimate`, with their calculation version |

## 11. Budgets, kill switches and cost controls

| Budget | Local (per night) | Cloudflare (per batch and per day) |
|---|---|---|
| Source requests | ≤ 2,000 conditional requests; ≤ 300 full fetches | Worker re-fetch: ≤ 25 per batch (KC-11C) |
| Bytes downloaded | ≤ 500 MB | ≤ 5 MiB per batch (KC-11C) |
| Local storage growth | ≤ 2 GB per night; pruned by retention class | R2: ≤ 10 MiB staged per batch; staging deleted after commit |
| Embedding generation | ≤ 50k chunks per night | None in Production (no Vectorize) |
| Local inference time | ≤ 4 GPU-hours per night; per-worker timeouts | None |
| CPU/GPU concurrency | One acquisition pool; at most 2 model workers | n/a |
| D1 import records | n/a | ≤ 25 evidence and ≤ 200 catalogue items per batch; ≤ 4 batches per day |
| D1 rows read | n/a | Measured on the Preview pilot. Target ≤ 20k per batch, including identity checks |
| D1 rows written | n/a | Measured on the Preview pilot. Target ≤ 5k per batch, including trigger writes |
| Import retries | n/a | ≤ 2 per batch (KC-11C) |

**Kill switches:**

- `TRACE_IMPORT_ENABLED=false`: the Worker refuses every import route.
- Revoke the importer's Access service token.
- Pause the local scheduler.

**Automatic stop conditions:**

- 2 consecutive batch rejections;
- more than 20% of items `held_for_review`;
- any D1 per-batch budget exceeded;
- Worker CPU errors.

**The import route never schedules anything** and never enables Cron. Measure the Preview pilot before setting the Production ceilings.

## 12. Recovery and integrity

| Event | Handling |
|---|---|
| Network loss or shutdown | The local ledger stays `prepared` or `submitted`. On restart, read the receipts for submitted batches, then continue. |
| Interrupted retrieval | Snapshot written atomically (temporary file, then rename); the item is retried next night |
| Partially prepared batch | Never submitted; rebuilt from verified items |
| Duplicate source updates | Same `idempotencyKey`, so the duplicate receipt is returned |
| Corrupt batch file | Checksum fails locally (not submitted) or remotely (whole batch rejected) |
| Cloudflare unavailable | Back off; nothing is lost locally; no catch-up flood (the daily batch cap applies) |
| **Timeout after a successful write** | Read receipts by `batchId`; never resend before reconciling |
| D1 schema evolution | `schemaVersion` negotiation; the Worker rejects unknown versions; the local packager pins the version |
| Conflicting source versions | Both kept; a `supersede_proposal` goes to review |
| Reviewer rejection | The receipt becomes `rejected`. The local catalogue records the rejection and does not resubmit the same `idempotencyKey`. |

**Local ledger states:** `prepared` → `submitted` → `accepted_for_staging` → `committed` | `rejected` | `held_for_review`. The run log and batch log are append-only.

## 13. STOP-BURN separation

- The local scheduler is a workstation timer, with no Cloudflare trigger.
- The import route is request-driven only. It cannot enqueue, schedule or poll.
- Nothing in this design requires scheduler 0072, Cron or the `ingestion_jobs` pipeline.
- Activating the importer on Preview and then Production are **separate approvals** from STOP-BURN closure.

## 14. Testing plan

| Level | Tests |
|---|---|
| Contract | A JSON Schema for the manifest and items. Golden batches. Canonical checksum vectors. Idempotency-key vectors. |
| Local (phase B) | Deterministic packaging from recorded fixtures with no network. A rebuild gives an identical checksum. Corrupt and partial batch detection. Offline catch-up records missed intervals. |
| Worker (phase E, local) | The import route on the D1-faithful adapter (`tests/sqlite-d1.ts`: 100-parameter limit, trigger-counted changes): auth failures 401; role scope 403; replay returns the original receipts; oversize or unknown schema rejects the whole batch; no state ever goes past pending; timeout-after-write reconciliation. |
| Preview | One labelled batch at a time with D1 rows read and written measured; then the KC-11C re-fetch hash comparison; then the review flow end to end |
| Adversarial | A prompt-injection string inside source text; locators that do not re-find; a forged `normalizedHash`; a URL outside the allow-list |

## 15. Implementation phases

| Phase | Content | Needs | Gate |
|---|---|---|---|
| **A** | Contract: envelope and item JSON Schema, canonical field mapping to D1, record-type allow-list, admission policy (§10), importer role definition | Docs and tests only | Owner review |
| **B** | Offline prototype: packager, validator and local ledger over recorded fixtures, using the vendored `source-version-identity` module | Any machine | None (local) |
| C | Local RAG: catalogue, FTS, change detection, receipt mirror | Workstation | None (local) |
| D | Multi-worker orchestration with independent verification | Workstation and local models | None (local) |
| E | Preview import Worker route plus migrations | Code, migrations, Access service token, secret | **Separate approval** |
| F | One reviewed Production batch | E proven | **Explicit approval** |
| G | Nightly local schedule | F plus cost certification | **Separate approval** |

**Earliest safe portion before the workstation exists: phases A and B.** They also deliver value on their own: the same packager can turn the curated seed list (seeding plan) and the C1 legacy evidence URLs into KC-11A inventories with deterministic identities. The shared-route decision (L-2) therefore makes them worth building first.

## 16. Hardware and software dependencies; operating cost

**Hardware:** the reference workstation (mission brief, §9.1) is sufficient. Acquisition and normalisation are CPU and I/O work. The local SLM extraction and verification models fit on one 16–32 GB GPU. Storage: about 0.5–2 TB SSD for snapshots, with retention pruning.

**Software:**

- Node 22+ (to run the vendored TRACE identity module), SQLite with FTS5, a local inference runtime with an OpenAI-compatible API (for example llama.cpp or vLLM; see the research inventory), and an OS timer.
- Cloudflare: an Access service token, the importer secret, the import route (phase E).

**Estimated operating cost** (assumptions, unverified):

| Item | Estimate |
|---|---|
| Electricity | Depends on the GPU-hours used. At 4 GPU-hours plus 8 idle hours per night, perhaps 1.5–3 kWh per night. |
| Cloudflare | Within Workers Paid allowances at ≤ 4 batches per day. D1 reads and writes to be **measured** on Preview, with targets in §11. |
| R2 | Staging is transient. Retained evidence bodies are bounded by KC-11C (5 MiB per batch). |

**Unresolved assumptions:**

- whether Access service tokens can reach the Worker's import route under the current Access application layout;
- the R2 multipart limits through a Worker route for the staged JSONL;
- whether vendor terms permit nightly polling for each source class (check per source when it is registered);
- the GPU-hour estimates depend on which local models are chosen (research inventory).

## 17. Disposition

**`LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED`.**

The architecture is compatible with ADR 0019, Knowledge Continuity, KC-11 and the signed-Worker boundary, and it needs no second authority. It cannot be built safely until three things exist:

1. the phase A contract;
2. the importer role and its separation from operator roles;
3. the decisions L-1 to L-4.

**Earliest safe implementation:** phases A and B, which are local and offline, need no workstation and touch no Cloudflare resource.
