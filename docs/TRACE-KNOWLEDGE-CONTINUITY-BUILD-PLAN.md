# TRACE Knowledge Continuity and Story Memory Build Plan

**Status:** Canonical implementation plan (KC-02, KC-03A–E, KC-04A–F, KC-05A–G, KC-06A–E, and KC-07A–B complete locally; KC-07C is next)

**Date:** 23 July 2026

**Scope:** source absorption, claim-level evidence, story memory, knowledge linking, evidence scoring, retrieval, answer synthesis, and historical backfill

**Governing decisions:** ADR 0004, ADR 0009, ADR 0012, ADR 0015, ADR 0016, ADR 0017, ADR 0018, and ADR 0019

**Related plans:** [`BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md`](BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md), [`the_trace_manifest_evidence_linked_knowledge_base_build_plan.md`](the_trace_manifest_evidence_linked_knowledge_base_build_plan.md)

## 1. Outcome

TRACE must develop durable, evidence-linked memory from every admitted source and every published TRACE record without treating TRACE's own prose as independent proof.

When this workstream is complete, TRACE will be able to:

- retrieve the substantive content of admitted articles, papers, documents, release notes, social-source leads, and manually supplied files;
- store immutable source versions, content hashes, extraction provenance, permitted text, and short evidence locators;
- extract material claims, attributed opinions, entities, dates, model versions, benchmark results, caveats, and contradictions;
- distinguish several reports derived from one announcement from genuinely independent corroboration;
- connect later stories to earlier stories, models, providers, claims, knowledge documents, Guides, corrections, and supersessions;
- recalculate an explainable story evidence score when new admitted evidence is attached;
- propose updates to approved knowledge without silently changing it;
- let manually written knowledge pages reuse evidence already held by TRACE;
- answer from current admitted evidence with source summaries and visible disagreement;
- return a qualified lean or an insufficient-evidence answer rather than inventing certainty; and
- backfill every existing published story and approved knowledge document through the same pipeline.

This is retrieval and evidence infrastructure. It is not model fine-tuning, autonomous publication, or permission for a model to browse without deterministic controls.

### ADR 0019 reuse boundary

ADR 0019's Open Model Execution Intelligence is a later specialist vertical. It reuses this workstream's admitted sources, immutable source versions, claims, provenance, freshness, corrections, evidence eligibility, retrieval, R2 storage, queue/outbox, and Vectorize-reconciliation rules; it must not create a second evidence system.

It does **not** add model-family, artefact, runtime, hardware, diagnostic, recommendation, or execution-test tables to KC-02. Those records begin only after the required Knowledge Continuity trust and source-foundation gates have passed. KC-02H and KC-03 must, however, establish reusable record-type-agnostic storage, queue, idempotency, recovery, and Preview/production-isolation contracts so the later vertical can inherit them safely.

## 2. Required answer behaviour

TRACE must preserve the two dimensions already defined by ADR 0016. `evidenceMode` describes where the admissible material came from; `conclusionMode` describes what the evidence permits TRACE to conclude. They must never be collapsed into one public enum.

### Evidence mode (ADR 0016)

| `evidenceMode` | Meaning |
|---|---|
| `knowledge` | Answer is grounded in approved TRACE knowledge whose external claim/assertion bundle has been resolved. |
| `researched` | Answer is grounded in an approved, bounded research packet. |
| `insufficient` | Admitted evidence exists but is too weak, stale, derivative, or conflicting to answer safely. |
| `out_of_scope` | The question is outside TRACE's supported subject or evidence boundary. |
| `refused` | The request cannot be answered under safety, privacy, policy, or access rules. |

### Conclusion mode

The application must support four deterministic conclusion modes.

| `conclusionMode` | When application policy selects it | Required presentation |
|---|---|---|
| `supported` | The material claims are supported by sufficient admitted, current and independently rooted evidence. | Give the supported answer, confidence, limitations, claim citations, and source summaries. |
| `qualified_lean` | Multiple defensible positions exist, but one has materially stronger evidence. | State that there is no definitive answer, describe each position, state which answer TRACE currently leans toward and why, and say what evidence could change the lean. |
| `multiple_positions` | Several positions are supported and no position has a defensible advantage. | Describe the positions without selecting a winner; show supporting and contradictory sources for each. |
| `insufficient_evidence` | Evidence is missing, stale, derivative, contradictory without resolution, or below the policy threshold. | Decline to conclude, show what is known, list the best available sources, and identify the missing evidence. |

Example `qualified_lean` language:

> There is no single definitive answer in the evidence TRACE currently holds. Several sources reach different conclusions. TRACE presently leans toward **X** because its supporting evidence is more direct, independently corroborated, and current, but the disagreement is material and the conclusion may change.

The application, not the language model, selects the answer mode and confidence band. The model may explain a supplied decision but must not upgrade the evidence state or invent a consensus.

Every non-refusal answer must include:

- a direct answer or explicit non-answer;
- both `evidenceMode` and `conclusionMode`;
- TRACE's current lean, if any;
- a short explanation of why that mode was selected;
- material claims with claim-level citations;
- alternative or contradictory positions;
- source summaries identifying whether each source is primary, independent, vendor, community, or TRACE internal synthesis;
- confidence label and evidence-score explanation;
- limitations and unresolved questions;
- freshness date; and
- what new evidence could change the answer.

Required validated output shape:

```text
evidenceMode
conclusionMode
directAnswer
lean
whyLean
positions[]
  - positionId
  - label
  - summary
  - supportingClaimIds[]
  - contradictingClaimIds[]
  - sourceIds[]
claims[]
  - claimId
  - statement
  - relationship
  - citationAssertionIds[]
citations[]
  - assertionId
  - sourceDocumentVersionId
  - sourceChunkId
  - startLocator
  - endLocator
sourceSummaries[]
  - sourceId
  - sourceName
  - sourceRole
  - summary
  - materialClaims[]
  - caveats[]
  - publishedAt
  - retrievedAt
confidence
confidenceScore
confidenceReasons[]
limitations[]
unresolvedQuestions[]
freshestEvidenceAt
whatCouldChange
```

All identifiers must resolve to the supplied evidence packet. Claim citations must resolve to reviewed `claim_assertions` and their source chunk/locator, not merely to a whole source document. Unknown identifiers, unsupported claims, or a model-selected evidence/conclusion mode fail validation and return a safe non-answer.

## 3. Non-negotiable trust rules

1. Similarity is a discovery signal, never evidence.
2. A source count is not an independence count.
3. Syndicated, copied, quoted, or derivative coverage sharing one origin counts as one provenance group.
4. A vendor statement remains a vendor-reported claim even when repeated elsewhere.
5. An attributed opinion is evidence that the person expressed that opinion; it is not corroboration of the opinion's underlying factual conclusion.
6. Social posts are discovery context unless promoted through normal source admission. They do not independently raise a factual story score.
7. TRACE stories, briefs, Guides, knowledge pages, answers, translations, and corrections have independent-evidence weight zero.
8. When TRACE internal synthesis is retrieved, its underlying external claim and source bundle must be resolved and inherited.
9. Vector similarity never changes evidence status or score.
10. New evidence may propose an update, correction, supersession, or knowledge revision, but it must not silently rewrite published text.
11. Hard-expired knowledge is excluded from normal answering until reviewed or visibly handled as stale.
12. Full source content remains private and is stored only where retrieval, licence, retention, and copyright policy permit it.
13. Source identity/tier is source-level metadata; directness, role, and evidentiary treatment are evaluated per claim assertion. One source may be primary for a release date and vendor-reported for a performance claim.
14. `evidenceMode` and `conclusionMode` are independent application decisions. A model cannot replace either decision with a confidence score or prose.

## 4. Current baseline and corrections

The repository already contains useful foundations:

- `feed_items`, `story_clusters`, `story_cluster_members`, `claims`, `claim_evidence`, `claim_conflicts`, and corrections;
- a source registry with tiers and treatments;
- an R2 `RAW_STORE` binding for the ingestion Worker;
- governed AI request, budget, audit, idempotency, and circuit-breaker infrastructure;
- `knowledge_documents`, revisions, source URLs, relationships, gaps, and generation-job states;
- public story and knowledge pages; and
- Ask TRACE retrieval and validated answer output.

The following current descriptions must be treated as partial until this plan is complete:

- AI triage normally receives feed snippets, not durable full article content;
- Find Related returns suggestions but does not attach evidence or create relationships;
- scheduled cross-source matching records a hint but does not establish evidence;
- story evidence upgrades are based on cluster source tiers rather than claim-level independent provenance;
- public reproducibility and independence labels are inferred from source count;
- knowledge-document source links are document-level URL links rather than claim-level inherited evidence; and
- approved knowledge is retrieved but excluded from model context because it is internal synthesis whose external evidence is not yet resolved.

## 5. Canonical Cloudflare architecture

### D1: canonical relational truth

D1 remains authoritative for:

- source identity, admission and provenance;
- source-document and version metadata;
- extraction jobs and audit state;
- entities, canonical claims, source assertions, conflicts and supersessions;
- story membership and story relationships;
- knowledge-to-claim and knowledge-to-source relationships;
- evidence-score snapshots and explanations;
- knowledge change proposals and immutable review decisions; and
- retrieval eligibility, expiry, correction and publication state.

Large source bodies and binary files must not be stored as oversized D1 rows.

### Private R2: source artifacts

The existing private `RAW_STORE` bucket will store permitted artifacts under immutable, content-addressed keys:

```text
sources/{source_document_id}/{content_hash}/original
sources/{source_document_id}/{content_hash}/extracted.json
sources/{source_document_id}/{content_hash}/chunks.jsonl
uploads/{upload_id}/{content_hash}/original
```

No raw source object is public by default. D1 records the object key, hash, media type, byte length, retrieval time, extraction method, retention class, and deletion state.

### Queues: asynchronous processing

A dedicated queue will handle source capture and knowledge processing outside user-facing requests. Queue messages contain identifiers and hashes, not article bodies. Consumers must be idempotent because delivery is at least once.

Initial message types:

- `capture_source_document`;
- `extract_source_content`;
- `extract_source_claims`;
- `canonicalise_claims`;
- `match_story_and_knowledge`;
- `recompute_evidence_score`;
- `embed_search_record`;
- `upsert_search_index`;
- `reconcile_source_artifact`;
- `reconcile_search_index`;
- `backfill_story`; and
- `backfill_knowledge_document`.

Permanent failures enter a dead-letter queue and a visible admin repair queue.

Cross-store writes use an outbox/reconciliation pattern because D1, R2, and Vectorize cannot commit atomically. For source capture, create a pending D1 job, write the content-addressed R2 object, verify its hash, commit the D1 source version, and only then mark the job complete. If R2 succeeds and D1 does not, reconciliation must find the orphan and either attach it to a matching pending version or delete it under the retention policy. For indexing, record a pending D1 index operation, upsert the Vectorize record, and mark it indexed only after success. D1 remains authoritative when Vectorize is unavailable, stale, or missing; reconciliation must be safe to retry.

The ingestion Worker owns R2 and queue access. Pages admin routes request capture/review actions through the existing signed internal-service boundary; browser code receives neither an R2 binding nor direct queue production authority.

### Vectorize: semantic candidate retrieval

Vectorize will index approved chunks, canonical claims, story summaries, and approved knowledge sections. Vector records contain only stable D1 identifiers, record type, language, publication/admission state, and embedding-version metadata. The embedding provider, model, dimensions, multilingual behaviour, chunk policy, input-cost budget, and re-embedding/migration procedure must be locked before KC-09 indexing begins. Create the small, versioned metadata-filter set before inserting vectors; use filters only for candidate discovery and re-check publication and eligibility in D1.

Retrieval flow:

```text
question or new document
-> lexical/entity candidates from D1
-> semantic candidates from Vectorize
-> resolve canonical records in D1
-> exclude ineligible, stale, corrected, withdrawn or superseded records
-> group by provenance and position
-> fetch permitted evidence text from R2/D1
-> deterministic sufficiency and answer-mode decision
-> bounded model synthesis
```

Vectorize is a relevance index, not the source of truth.

## 6. Additive canonical data model

Do not create a third independent knowledge system. The following ownership decision is now locked for KC-00:

- **Canonical runtime knowledge:** D1 `knowledge_documents`, `knowledge_document_revisions`, and their governed source/relationship records. Future claim/assertion joins from this plan extend this path; all new structured knowledge must enter through this lifecycle.
- **Authoring input:** `docs/Knowledge Input/*.md` and the admin knowledge API are inputs to the D1 lifecycle, not a second runtime store. Generated SQL and source-link scripts are migration tooling only.
- **Legacy compatibility:** the original `knowledge_pages`/`knowledge_page_*` tables in `db/schema.sql` and the `src/data/knowledge/*.ts` static publishing route are retained temporarily for compatibility and public-page migration. They receive no new canonical knowledge writes and are not an Ask TRACE evidence source until imported and reviewed through D1.
- **Cutover rule:** no new static page or parallel knowledge table may be introduced. KC-08/KC-11 will inventory, map, and migrate legacy pages; existing published static pages may remain visible until an explicit reviewed migration/removal decision.

### 6.1 Source documents and versions

Add:

```text
source_documents
- id
- canonical_url
- canonical_url_hash
- source_id
- media_kind
- admission_state
- retention_class
- copyright_storage_mode
- current_version_id
- first_seen_at
- last_seen_at
- created_at
- updated_at

source_document_versions
- id
- source_document_id
- content_hash
- retrieved_url
- retrieved_at
- http_status
- media_type
- byte_length
- title
- author
- published_at
- r2_original_key
- r2_extracted_key
- extraction_status
- extraction_method
- extraction_version
- source_language
- created_at

source_chunks
- id
- source_document_version_id
- chunk_index
- section_label
- text_excerpt
- text_hash
- start_locator
- end_locator
- r2_chunk_key
- embedding_state
- embedding_model
- embedding_version
- created_at
```

`copyright_storage_mode` must distinguish at least:

- `metadata_only`;
- `short_excerpt`;
- `private_full_text`;
- `editor_supplied_document`; and
- `prohibited`.

The first implementation preserves original-language bytes and records `source_language`; it does not create translated evidence. ADR 0018 translation remains disabled until Phase 7, when a `source_document_representations` table records the original version, representation language/type, content hash, R2 key, translation provider/model, status, reviewer, and review time. A translation is always attached to the same source identity and can never count as another source or provenance group.

### 6.2 Provenance and independence

Add:

```text
provenance_groups
- id
- root_source_document_id
- root_claim_locator
- origin_type
- explanation
- determined_by
- determination_method
- reviewed_at
- created_at

source_provenance_memberships
- source_document_id
- provenance_group_id
- relationship
- confidence
- created_at
```

Relationships include `original`, `syndicated_from`, `quotes`, `summarises`, `reports_on`, `independently_tests`, and `unknown`.

Only distinct admitted provenance groups eligible under task policy count toward independent corroboration.

### 6.3 Canonical claims and source assertions

Keep the existing `claims` tables readable during migration. Add a canonical layer:

```text
canonical_claims
- id
- canonical_text
- claim_class
- claim_domain
- subject_entity_id
- predicate_key
- object_json
- valid_from
- valid_until
- current_state
- materiality
- created_at
- updated_at

claim_assertions
- id
- canonical_claim_id
- source_document_version_id
- source_chunk_id
- start_locator
- end_locator
- legacy_claim_id
- assertion_text
- relationship
- source_role
- directness
- evidence_treatment
- admission_state
- freshness_state
- provenance_group_id
- extraction_method
- extraction_version
- model_provider
- model_identifier
- confidence
- reviewer_state
- reviewed_by
- reviewed_at
- created_at
```

Assertion relationships include the existing evidence vocabulary: `supports`, `partially_supports`, `qualifies`, `contradicts`, `reports`, `reproduces`, `fails_to_reproduce`, `supersedes`, `corrects`, and `contextualises`.

`source_role`, `directness`, and `evidence_treatment` are assertion-level fields. Keep source identity/tier and publisher treatment on the source registry, but do not infer the evidentiary role of every claim from those source-level labels.

#### Legacy claims cutover

- **Before KC-05:** the existing `claims`/`claim_evidence` tables remain authoritative for current routes.
- **During KC-05:** map legacy claims and accepted evidence into `canonical_claims` and `claim_assertions`, retaining legacy IDs for compatibility and audit.
- **After cutover:** all new extraction and review writes target the canonical tables; legacy claims become read-only compatibility data.
- No indefinite dual-write path is permitted. Every route must have an explicit cutover owner and a migration/read-fallback test.

### 6.4 Story, knowledge and graph links

Add:

```text
story_claims
- story_cluster_id
- canonical_claim_id
- role
- materiality
- display_order
- reviewed_by
- reviewed_at

knowledge_document_claims
- knowledge_document_id
- canonical_claim_id
- section_key
- relationship
- display_order
- reviewed_by
- reviewed_at

knowledge_document_claim_assertions
- knowledge_document_id
- section_key
- canonical_claim_id
- claim_assertion_id
- relationship
- reviewed_by
- reviewed_at

story_relationships
- source_story_id
- target_story_id
- relationship
- explanation
- confidence
- created_by
- reviewed_at

knowledge_change_proposals
- id
- knowledge_document_id
- triggering_story_id
- triggering_claim_id
- proposal_type
- proposed_change_json
- rationale
- detector_version
- state
- reviewed_by
- reviewed_at
- created_at

evidence_score_snapshots
- id
- story_cluster_id
- score
- evidence_status
- component_json
- policy_version
- triggering_event
- created_at
```

Story relationships include `same_event`, `follow_up_to`, `updates`, `contradicts`, `supersedes`, `corrects`, `compares_with`, `same_model_family`, and `related_context`.

Populate the existing `knowledge_document_relationships` table for story, Guide, briefing, and knowledge relationships. Do not use it as a substitute for claim-level links.

The assertion join is the durable replacement for string-only `source_reference`/`claim_reference` fields. During KC-08, every inherited external citation must resolve through these foreign-key-backed links to an accepted assertion and its source locator.

## 7. Manual knowledge pages and inherited evidence

Yes: manually entered knowledge pages will be able to link to evidence already held elsewhere.

The completed workflow will be:

1. The editor continues to write or upload the existing Markdown knowledge format.
2. Ingestion parses the Evidence section and material statements.
3. Each source URL is matched to an existing `source_document`; missing admitted sources are queued for capture.
4. Each material knowledge statement is matched to an existing `canonical_claim` or proposed as a new canonical claim.
5. The editor reviews the proposed claim and source mappings.
6. Approved mappings are stored in `knowledge_document_claims` plus the foreign-key-backed `knowledge_document_claim_assertions` join. Existing `knowledge_document_sources` links remain compatibility/audit links while section-level assertion links are migrated.
7. Ask TRACE may retrieve the knowledge prose as internal synthesis, but it resolves and supplies the underlying admitted external assertions, chunks, and locators as the actual evidence.
8. If a linked claim is corrected, contradicted, superseded, or stale, the knowledge document enters the review queue automatically.

Manual knowledge therefore becomes a curated interpretation layer over the same evidence graph used by stories. It does not need duplicate copies of the evidence and it never counts itself as corroboration.

Approval must fail closed when a public knowledge page contains material claims that have neither:

- a reviewed link to a canonical claim with eligible evidence; nor
- an explicit `editorial_synthesis` or `trace_manifest_inference` label with supporting claims and limitations.

Stable headings/section keys, explicit material statements, direct source URLs, separated supporting and contradictory sources, review/freshness dates, and clear inference labels make existing manual pages easiest to map. Editors may continue adding pages now; KC-08 will link them without treating the page prose as corroboration.

## 8. Evidence score and status policy

Introduce a distinct `story_evidence_score` from 0 to 100. Do not confuse it with model benchmark aggregate scores.

The score is calculated from material canonical claims, not from article or source count. The initial versioned components are:

| Component | Maximum | Meaning |
|---|---:|---|
| Source admission and directness | 25 | Whether the source is admitted and directly supports the claim rather than merely reporting it |
| Independent provenance | 25 | Number and quality of distinct eligible provenance groups |
| Primary evidence | 15 | Presence and quality of specifications, papers, official records, repositories, model cards, or direct observations |
| Reproduction or methodological support | 15 | Independent tests, transparent methods, or reproducibility evidence |
| Freshness | 10 | Whether evidence is current for the claim type |
| Consistency and conflict handling | 10 | Agreement, explained qualifications, and resolved conflicts |

Mandatory penalties and caps:

- unresolved direct contradiction: subtract according to materiality and cap the affected claim;
- unknown provenance: no independence credit;
- derivative repetition: zero additional independence credit;
- vendor-only factual claim: maximum `vendor_reported` status;
- community-only factual claim: maximum `community_reported` status;
- stale or hard-expired evidence: freshness penalty and possible ineligibility;
- corrected or superseded assertion: excluded from current support;
- TRACE internal synthesis: zero independent-evidence credit; and
- an opinion assertion: excluded from the factual corroboration component.

Initial status gates:

- `confirmed`: score at least 80 and the claim-specific deterministic eligibility gate passes;
- `strongly_supported`: score at least 65 and at least two eligible provenance roots, including primary or independently reproduced evidence where the claim requires it;
- `provisionally_supported`: score at least 45 with admitted support but incomplete corroboration;
- `vendor_reported` or `community_reported`: source-role gate determines the label regardless of raw numeric score;
- `disputed`: unresolved material contradiction;
- `unverified` or `insufficient`: evidence below the admissibility/sufficiency gate; and
- `corrected`, `superseded`, or `outdated`: lifecycle state overrides score.

A story score is a materiality-weighted roll-up of its claim scores. A weak or disputed core claim caps the story status even when secondary claims are strong. Every score snapshot must retain its policy version and component explanation.

The initial weights and thresholds are provisional. KC-07 must keep numeric scores admin-only until a fixed labelled evaluation set has tested vendor-only, derivative, disputed, independently reproduced, stale, and corrected examples against human editorial decisions. Threshold changes create a new policy version and never rewrite historical snapshots. Before that gate, public pages may show qualitative bands such as `provisionally_supported`, `strongly_supported`, or `disputed` with component explanations; they must not display an uncalibrated numeric score or imply that it is the separate TRACE model benchmark score.

## 9. Governed external-AI use and cost controls

External AI tokens are permitted for source repair and backfill, but only through governed task types.

Add task types:

- `extract_source_structure`;
- `extract_source_claims`;
- `summarise_source`;
- `canonicalise_claim`;
- `classify_provenance`;
- `embed_search_record`;
- `detect_knowledge_impact`; and
- `synthesise_multi_position_answer`.

Add separately controlled configuration:

- `TRACE_KNOWLEDGE_CAPTURE_ENABLED`;
- `TRACE_AI_KNOWLEDGE_ENABLED`;
- `TRACE_AI_BACKFILL_ENABLED`;
- `TRACE_AI_KNOWLEDGE_DAILY_BUDGET_USD`;
- `TRACE_AI_BACKFILL_TOTAL_BUDGET_USD`;
- `TRACE_AI_KNOWLEDGE_MAX_CONCURRENCY`;
- `TRACE_AI_EMBEDDING_DAILY_BUDGET_USD`;
- `TRACE_AI_EMBEDDING_BACKFILL_BUDGET_USD`; and
- the existing global AI kill switch.

Initial maximum output budgets per call:

- source structure/summary: 800 tokens;
- source claim and opinion extraction: 1,500 tokens;
- claim canonicalisation/provenance proposal: 600 tokens;
- knowledge-impact proposal: 800 tokens; and
- multi-position answer synthesis: 1,200 tokens.

These are ceilings, not targets. Input is chunked and bounded, and the task should stop rather than silently omit material content when the complete admitted source cannot be processed within policy.

Rules:

1. Hash the source version, prompt version, policy version, model, and task to form the idempotency key.
2. Never pay twice for the same completed extraction unless an editor explicitly requests regeneration.
3. Use deterministic parsing and existing rule extraction first; call AI only for admitted text that needs structured interpretation.
4. Use the routine model tier for extraction and summaries; reserve stronger models for contradiction resolution or approved high-impact review.
5. Store structured output and validation failures. Do not store chain-of-thought.
6. Require claim locators and source identifiers in every extraction output.
7. Reject claims whose locators cannot be resolved to supplied content.
8. Keep embedding provider/model, dimensions, language support, chunk policy, version migration, and daily/backfill budgets under the same D1 audit and idempotency controls as extraction.
9. Apply separate daily and total backfill budgets with a global kill switch.
10. Provide a dry-run estimate showing item count, expected calls, maximum tokens, and maximum cost before a backfill batch starts.
11. Stop the batch on systemic validation, audit, budget, or provider failures.

## 10. Atomic implementation phases

Each task must produce an audit note in `docs/audit/`, update this plan, and pass the listed exit check before the next dependent task begins. Production mutation is not part of a task unless its scope explicitly includes a reviewed deployment gate.

### KC-00 — Decision lock and truthful status

- [x] **KC-00A:** Accept this document as the canonical Knowledge Continuity workstream and link it from the launch and master build plans.
- [x] **KC-00B:** Correct documentation that currently describes knowledge retrieval, Find Related, full-content triage, or evidence upgrades as fully complete.
- [x] **KC-00C:** Record the legacy `knowledge_pages`, static TypeScript pages, and current `knowledge_documents` ownership decision; prohibit another parallel knowledge store.
- [x] **KC-00D:** Lock the separate ADR 0016 `evidenceMode` and conclusion `conclusionMode` contracts, including assertion/locator citations.
- [x] **KC-00E:** Lock claim-relative source roles, legacy-claims cutover ownership, and D1/R2/Vectorize outbox/reconciliation rules.
- [x] **KC-00F:** Lock the embedding decision gate, PDF v1/v2 boundary, ADR 0018 original-language/translation boundary, and admin-only numeric score calibration gate.

Exit: documentation states the real boundaries, names one canonical structured knowledge path, records the amended contracts before schema or retrieval implementation begins, and the decision is evidenced in [`docs/audit/kc-00-decision-lock-and-status-reconciliation.md`](audit/kc-00-decision-lock-and-status-reconciliation.md).

### KC-01 — Trust hotfix before knowledge expansion (complete)

- [x] **KC-01A:** Replace source-count-derived public independence, reproducibility, and source-tier labels with values queried from reviewed evidence records; show `not assessed` until available.
- [x] **KC-01B:** Prevent `upgradeClusterEvidence` from upgrading status solely from cluster source-tier counts.
- [x] **KC-01C:** Enforce `review_after` warnings and `hard_expiry` exclusion in knowledge retrieval and public knowledge rendering.
- [x] **KC-01D:** Make Ask TRACE report that approved internal knowledge could not be used when its external evidence bundle is unresolved.
- [x] **KC-01E:** Add regression tests proving repeated derivative coverage cannot create independent corroboration.
- [x] **KC-01F:** Remove or suppress uncalibrated public numeric evidence scores; show `not assessed` or a qualitative band until KC-07's fixed evaluation gate passes.

Exit: current public pages and Ask TRACE no longer overstate independence, reproducibility, knowledge eligibility, freshness, or numeric score certainty.

### KC-02 — Canonical schema and migration validation (complete)

- [x] **KC-02A:** Add source-document, immutable version, chunk, retention, and R2-key tables.
- [x] **KC-02B:** Add provenance groups and source-provenance membership tables.
- [x] **KC-02C:** Add canonical claims and source assertions with legacy-claim compatibility.
- [x] **KC-02D:** Add story-claim, knowledge-claim, story-relationship, knowledge-change-proposal, and evidence-score-snapshot tables.
- [x] **KC-02E:** Add idempotent processing-job/outcome records or safely extend the current job model.
- [x] **KC-02F:** Configure separate Preview processing queue and dead-letter queue bindings for the ingestion Worker. Do not attach production consumers in this task.
- [x] **KC-02G:** Validate forward migration, duplicate rerun behaviour, foreign keys, rollback/export recovery, legacy production compatibility, and Preview D1 application.
- [x] **KC-02H:** Add pending outbox/index-operation state and reconciliation records for R2 capture and Vectorize indexing; prove orphan recovery and stale-index recovery without making Vectorize authoritative. The contract is record-type agnostic for later ADR 0019 artefact/diagnostic work: queue messages contain only identifiers, hashes, and bounded metadata; consumers are idempotent; repair is visible to administrators; and Preview cannot mutate production resources. *(The runner is not a Queue consumer; KC-03 and KC-09 must connect their admitted capture/index flows to it.)*

Exit: additive migrations pass locally and in Preview without publishing or rewriting existing records. Evidence: [`kc-02-schema-foundation-evidence.md`](audit/kc-02-schema-foundation-evidence.md).

### KC-03 — Safe content absorption (complete; KC-03A–E complete)

- [x] **KC-03A:** Refactor the safe triage URL fetcher into a shared server-side retrieval service with URL admission, redirect revalidation, time/size limits, content preflight, and audit. The service is not yet a capture consumer or persistence path; KC-03B–D must use it only after source admission.
- [x] **KC-03B:** Add bounded deterministic HTML main-content extraction with title, author, publication date, headings, text, source locators, and extraction diagnostics. The shared triage wrapper uses this parser; no extracted content is persisted, queued, AI-processed, or promoted by this task.
- [x] **KC-03C:** Store permitted immutable originals/extractions in private R2 and metadata/hashes in D1, preserving the reusable boundary that large source bodies and later ADR 0019 artefacts/logs do not enter D1. Capture is content-addressed and records an idempotent R2 reconciliation operation; it does not connect feed ingestion or Queue production yet.
- [x] **KC-03D:** Connect RSS/feed items to admitted source documents and enqueue bounded, idempotent capture jobs after feed-item admission, never before. Preview has the producer binding; production remains unbound until a reviewed capture consumer and deployment gate exist.
- [x] **KC-03E:** Add the Queue capture consumer and publisher-only manual URL capture using the same retrieval, extraction, and storage pipeline. Preview has bounded retry/DLQ consumer configuration; production remains unbound pending a deployment gate.
- [ ] **KC-03F:** Add publisher-only document upload for supported text/HTML/Markdown inputs, with type, size, retention, and untrusted-content controls.
- [ ] **KC-03G:** Add explicit states for unavailable, paywalled, robots/policy restricted, unsupported, extraction failed, and metadata-only sources.
- [ ] **KC-03H:** PDF v1 stores the permitted original privately in R2 with metadata and hash, and records `extraction_pending` or `metadata_only`; it does not add a parser to the main ingestion Worker.
- [ ] **KC-03I:** Run a separate PDF v2 parser/provider spike for accuracy, memory, security, and cost. It must pass before PDF text enters claim extraction, but it must not block ordinary HTML, Markdown, or plain-text capture.

Exit: one admitted feed article and one editor-supplied ordinary text document can be captured, versioned, retrieved privately, and audited without entering public evidence automatically; PDF remains explicitly metadata-only or pending until its spike passes. KC-03A evidence: [`kc-03a-shared-source-retrieval-evidence.md`](audit/kc-03a-shared-source-retrieval-evidence.md). KC-03B evidence: [`kc-03b-html-extraction-evidence.md`](audit/kc-03b-html-extraction-evidence.md). KC-03C evidence: [`kc-03c-private-source-capture-evidence.md`](audit/kc-03c-private-source-capture-evidence.md). KC-03D evidence: [`kc-03d-feed-capture-queue-evidence.md`](audit/kc-03d-feed-capture-queue-evidence.md). KC-03E evidence: [`kc-03e-capture-consumer-manual-url-evidence.md`](audit/kc-03e-capture-consumer-manual-url-evidence.md).

### KC-04 — Structured extraction and source summaries (complete; KC-04A–F complete)

- [x] **KC-04A:** Define and validate structured schemas for entities, material claims, attributed opinions, dates, model versions, benchmark results, caveats, and source summary.
- [x] **KC-04B:** Run deterministic extraction first and reserve governed AI extraction as the second pass where needed; the deterministic pass records zero external-AI cost.
- [x] **KC-04C:** Require every extracted item to reference a source chunk/locator.
- [x] **KC-04D:** Store model, prompt, policy, extraction, source-version, usage, validation, idempotency, correlation, and audit metadata in a durable extraction-run envelope linked to its structured outputs. Deterministic runs remain zero-cost and no external AI is enabled by this task.
- [x] **KC-04E:** Add publisher-only editor review states: accepted, amended, rejected, duplicate, unsupported, and needs more research. Every transition is attributable, validated against the current state, retained in review history, and written to the admin audit log; amendments remain bounded and review-gated.
- [x] **KC-04F:** Add an idempotency/cache gate before governed-AI provider invocation and tests proving unchanged content returns the completed run without a second provider call or external-AI charge. Failed runs remain retryable; changed source/model/prompt/policy identity creates a distinct run.

Exit: captured content produces reviewable structured claims and a source summary with resolvable locators and recorded AI cost.

### KC-05 — Provenance, canonical claims, and conflict graph

- [x] **KC-05A:** Create idempotent, review-gated match candidates from extracted material/benchmark claims using lexical, entity, value, date, and deterministic semantic-proxy signals. Exclude the extraction’s own canonical claim; do not merge, create provenance, or change scores. Real embedding/Vectorize semantic recall remains KC-09.
- [x] **KC-05B:** Add publisher-only, attributable decisions to merge a candidate into an existing canonical claim, accept the extraction's own claim as new, or reject the match. Accepted decisions resolve the source assertion and supersede competing proposals; no provenance group or evidence score is created automatically.
- [x] **KC-05C:** Create deterministic, review-gated provenance proposals with relationship, directness, source role, evidence treatment, confidence, rationale, and mandatory-review flags for uncertain/high-materiality lineage. Publisher accept/reject review updates assertion metadata only; provenance groups/memberships and evidence scores remain untouched.
- [x] **KC-05D:** Create deterministic, exact-content shared-origin group proposals with mandatory publisher review. Accepted proposals create the reviewed provenance group/root and derivative memberships and link source assertions; evidence scores remain unchanged.
- [x] **KC-05E:** Create deterministic, review-gated claim relationship proposals for support, qualification, contradiction, reproduction, correction, temporal change, and supersession. Accepted proposals add a reviewed relation assertion; claim state and evidence scores remain unchanged.
- [x] **KC-05F:** Preserve explicit unresolved conflict cases from reviewed contradiction, correction, supersession, and temporal-change relationships. Publisher acknowledge/resolve/dismiss/reopen decisions are attributable; no side is selected and no claim state or evidence score changes automatically.
- [x] **KC-05G:** Complete the legacy claims mapping and route cutover: canonical tables receive all new writes, while legacy claims become read-only compatibility data with no indefinite dual-write path.

Exit: two derivative articles count as one evidentiary root, while an independent test can count separately and a contradiction remains visible.

### KC-06 — Find Related becomes an editorial workflow

- [x] **KC-06A:** Replace the current read-only list with candidates from entity, lexical, claim, date, provenance, and semantic matching. The Worker endpoint and admin UI now expose ranked, explainable candidates. See [`docs/audit/kc-06-related-workflow-evidence.md`](audit/kc-06-related-workflow-evidence.md).
- [x] **KC-06B:** Add explicit publisher actions: same event, attach evidence, follow-up, related context, contradiction, correction, supersession, comparison, or reject. Migration 0044 records idempotent decisions and accepted story relationships. See [`docs/audit/kc-06-related-workflow-evidence.md`](audit/kc-06-related-workflow-evidence.md).
- [x] **KC-06C:** Persist accepted story relationships and claim/evidence attachments with reviewer identity. Accepted story actions and canonical-claim/feed-item evidence attachments are attributable and idempotent; no score is recalculated.
- [x] **KC-06D:** Do not alter evidence score until an eligible claim-level attachment is accepted. The related-review path records explicit attachment eligibility and never mutates story status or creates a score snapshot; score recalculation remains KC-07 work.
- [x] **KC-06E:** Surface existing published stories and approved, non-expired knowledge pages affected by an accepted relationship or claim-level evidence attachment. Results include stable story and knowledge-document links.

Exit: a related result can be durably attached or linked, and the audit record explains why it did or did not affect evidence.

### KC-07 — Evidence scoring and automatic recalculation

- [x] **KC-07A:** Implement the versioned claim score and story roll-up policy from section 8. Policy `kc-07a-v1` is pure, deterministic, materiality-weighted, and snapshot-schema-backed; automatic recalculation remains KC-07B.
- [x] **KC-07B:** Recompute after accepted evidence, correction, provenance change, conflict resolution, expiry, withdrawal, or supersession. The D1-backed recalculation service invokes `kc-07a-v1`, persists claim/story score snapshots, updates qualitative story status, and is wired into review, correction, publication-status, and scheduled expiry paths. See [`docs/audit/kc-07b-automatic-recalculation-evidence.md`](audit/kc-07b-automatic-recalculation-evidence.md).
- [ ] **KC-07C:** Store immutable score snapshots and before/after explanations.
- [ ] **KC-07D:** Add an admin evidence panel showing material claims, roots, roles, conflicts, caps, penalties, and proposed status.
- [ ] **KC-07E:** Require human approval for high-impact status changes and corrections; allow only policy-approved low-risk metadata recalculation later.
- [ ] **KC-07F:** Evaluate the versioned score policy against a fixed labelled set and compare score changes with human editorial decisions before permitting public numeric display.

Exit: adding a genuinely independent corroborating source can increase the relevant claim/story score, while adding derivative or unrelated coverage cannot.

### KC-08 — Manual knowledge-to-evidence linking

- [ ] **KC-08A:** Parse material claims and evidence URLs from new and existing knowledge Markdown.
- [ ] **KC-08B:** Suggest existing canonical claims and source documents.
- [ ] **KC-08C:** Queue missing admitted source URLs for capture and extraction.
- [ ] **KC-08D:** Build an admin mapper for knowledge section -> canonical claim -> source assertions.
- [ ] **KC-08E:** Populate `knowledge_document_claims` and the foreign-key-backed `knowledge_document_claim_assertions` join after review; retain string source/claim references only for migration audit.
- [ ] **KC-08F:** Strengthen approval so public knowledge requires reviewed evidence mappings or explicit inference/synthesis labels.
- [ ] **KC-08G:** Resolve mapped external evidence, accepted assertions, chunks, and locators when knowledge is retrieved; retain the knowledge text as zero-weight internal synthesis.
- [ ] **KC-08H:** Trigger review when linked evidence changes, expires, conflicts, corrects, or supersedes the knowledge page.

Exit: a manually entered knowledge page can answer through its inherited external evidence and can be invalidated by later evidence without being treated as independent proof.

### KC-09 — Hybrid retrieval and multi-position Ask TRACE

- [ ] **KC-09A:** Lock the embedding provider, model, dimensions, language support, chunk-size policy, cost budgets, index metadata filters, version namespace, and re-embedding procedure.
- [ ] **KC-09B:** Add lexical/entity indexes and Vectorize bindings for Preview first. Vectorize is an optional recall improvement, not a prerequisite for the D1/FTS5 knowledge loop.
- [ ] **KC-09C:** Create Preview metadata filters and a versioned index namespace before inserting vectors; production index creation remains a later rollout gate.
- [ ] **KC-09D:** Index source chunks, canonical claims, published stories, approved knowledge sections, Guides, and corrections with versioned embeddings.
- [ ] **KC-09E:** Resolve all search matches through D1 eligibility and provenance rules.
- [ ] **KC-09F:** Group evidence into compatible and competing positions.
- [ ] **KC-09G:** Add deterministic sufficiency, confidence, and evidence/conclusion-mode selection.
- [ ] **KC-09H:** Extend the validated answer schema with `evidenceMode`, `conclusionMode`, `lean`, `positions`, `sourceSummaries`, `whyLean`, and `whatCouldChange`.
- [ ] **KC-09I:** Ensure citations resolve to the supplied reviewed assertion, source chunk, and start/end locator.
- [ ] **KC-09J:** Add refusal and disagreement tests, including the target `qualified_lean` example.

Exit: Ask TRACE can return the ADR 0016 evidence mode plus supported, qualified-lean, multiple-position, and insufficient-evidence conclusions with assertion-level citations and source summaries.

### KC-10 — Knowledge-impact proposals and revisions

- [ ] **KC-10A:** Match new accepted claims to approved knowledge documents, Guides, model profiles, and earlier stories.
- [ ] **KC-10B:** Create change proposals for support, qualification, contradiction, correction, supersession, timeline addition, comparison update, or review-only impact.
- [ ] **KC-10C:** Build queues for affected knowledge, expiring knowledge, unresolved contradictions, and orphan claims.
- [ ] **KC-10D:** Require a reviewed immutable revision for substantive public changes.
- [ ] **KC-10E:** Preserve the prior version, evidence set, score, rationale, and reviewer decision.

Exit: a later model release can propose updates to earlier model knowledge and comparisons without silently changing them.

### KC-11 — Historical backfill

- [ ] **KC-11A:** Inventory all published stories, approved knowledge documents, static knowledge pages, Guides, corrections, models, providers, benchmarks, and source URLs.
- [ ] **KC-11B:** Produce a dry-run cost report and reviewed total backfill budget.
- [ ] **KC-11C:** Backfill admitted source documents and versions in bounded batches.
- [ ] **KC-11D:** Extract source summaries, entities, claims, opinions, caveats, and provenance candidates.
- [ ] **KC-11E:** Review high-impact, conflicting, failed, paywalled, and low-confidence records.
- [ ] **KC-11F:** Link story claims, story relationships, knowledge claims, and knowledge change proposals.
- [ ] **KC-11G:** Calculate first evidence-score snapshots without automatically changing published wording.
- [ ] **KC-11H:** Re-index approved records and run the fixed evaluation set.

Exit: every published story and approved knowledge document has an explicit backfill outcome: complete, metadata-only, unavailable, held for review, or excluded with reason.

### KC-12 — Public presentation and rollout

- [ ] **KC-12A:** Show related stories from reviewed graph relationships rather than same-topic recency alone.
- [ ] **KC-12B:** Show source summaries, claim relationships, provenance/independence explanation, score components, and freshness on story pages.
- [ ] **KC-12C:** Show linked stories, claims, sources, revisions, limitations, and affected-by-new-evidence state on knowledge pages.
- [ ] **KC-12D:** Add Preview feature flags for capture, AI extraction, scoring, semantic retrieval, knowledge inheritance, and multi-position answers.
- [ ] **KC-12E:** Run security, migration, retrieval, evidence, cost, accessibility, and performance gates in Preview.
- [ ] **KC-12F:** Enable production capabilities one at a time with rollback evidence and monitoring.
- [ ] **KC-12G:** Keep public numeric evidence scores disabled until KC-07F passes; launch with qualitative bands and explanations, then enable numeric snapshots only through a reviewed policy-version rollout.

Exit: the complete system is enabled in bounded stages, and every public claim can be traced through TRACE synthesis to admitted external evidence.

## 11. Backfill order and token budget

Backfill in this order:

1. currently published stories, newest first;
2. approved knowledge documents used by Ask TRACE;
3. corrections, supersessions, and disputed stories;
4. model, provider, benchmark, pricing, and release records;
5. static knowledge pages selected for migration;
6. draft Guides selected for publication; and
7. archived or rejected material only where needed for provenance or correction history.

For each batch:

```text
inventory
-> deterministic fetchability and admission check
-> dry-run token/cost ceiling
-> explicit approval
-> capture
-> deterministic extraction
-> governed AI extraction where needed
-> schema validation
-> human review sample and exception review
-> relationship/scoring proposal
-> acceptance
-> index
-> audit report
```

The initial backfill should favour completeness and correctness over minimum token use. Token spending is acceptable when it repairs durable source summaries, claims, and relationships, but regeneration of unchanged content is not.

## 12. Required tests

### Data and migrations

- additive forward migration and repeat application;
- foreign-key and uniqueness integrity;
- immutable source versions and score snapshots;
- D1/R2 reference integrity;
- R2 orphan reconciliation and Vectorize pending/stale-index recovery;
- deletion/retention behaviour;
- legacy claim compatibility; and
- Preview-to-production binding isolation.

### Retrieval and evidence

- knowledge internal synthesis resolves underlying external evidence;
- internal TRACE prose never gains independent weight;
- hard-expired knowledge is excluded;
- corrected and superseded assertions are not returned as current;
- derivative sources share one provenance group;
- independent testing forms another provenance group;
- opinion attribution does not increase factual corroboration;
- semantic similarity does not change evidence state;
- claim-relative source roles distinguish, for example, release-date evidence from vendor performance claims;
- claim citations resolve to reviewed assertion IDs and supplied source locators;
- original-language identity is preserved and translations cannot create a second source; and
- no cross-entity or cross-version claim leakage.

### Answer modes

- evidence provenance and conclusion selection remain separate (`evidenceMode` is never replaced by `conclusionMode`);
- strong consensus selects `supported`;
- one stronger position with material disagreement selects `qualified_lean`;
- balanced competing positions select `multiple_positions`;
- weak, stale, or derivative-only evidence selects `insufficient_evidence`;
- source summaries preserve source role and material caveats; and
- model output cannot change application-selected mode or confidence.

### Score calibration and content formats

- public numeric evidence scores remain gated until the fixed labelled evaluation set passes;
- ordinary HTML, Markdown, and plain-text capture works without PDF parsing; and
- PDF metadata-only/pending states do not enter claim extraction until the separate parser/provider spike passes.

### Security and operations

- private/loopback/link-local URL blocking;
- redirect revalidation;
- bounded response and upload sizes;
- untrusted-source prompt-injection resistance;
- publisher-only manual capture and review;
- same-origin mutation controls;
- queue retry idempotency and dead-letter handling;
- embedding budget, version migration, and metadata-filter validation;
- R2 artifacts remain private;
- AI budget, rate-limit, audit and kill-switch behaviour; and
- no automatic publication from capture or extraction.

## 13. Success measures

Track at minimum:

- percentage of published stories with captured admitted source versions;
- percentage of material story claims with reviewed source assertions;
- percentage of approved knowledge claims with inherited external evidence;
- unresolved provenance, conflict, expiry, and extraction queues;
- duplicate/derivative sources prevented from counting as corroboration;
- answer-mode distribution;
- citation validity rate;
- qualified-lean and multiple-position evaluation accuracy;
- external-AI cost per newly processed source and per backfilled record;
- cache/idempotency savings;
- percentage of later stories linked to relevant earlier stories; and
- time from new accepted evidence to a reviewed knowledge-impact proposal.

## 14. Definition of complete

This workstream is complete only when:

1. admitted source content can be captured and versioned safely;
2. claims and attributed opinions have resolvable evidence locators;
3. independent provenance is computed from origins rather than source count;
4. Find Related creates reviewed durable relationships and evidence attachments;
5. story evidence scores are claim-based, versioned, explainable, and automatically recalculated from accepted evidence;
6. manual knowledge pages inherit external evidence held elsewhere;
7. Ask TRACE can produce all four answer modes with source summaries;
8. corrections, conflicts, supersessions, and expiry propagate into retrieval and review queues;
9. every existing published story and approved knowledge document has a recorded backfill outcome; and
10. Preview and production rollout evidence is recorded without bypassing human publication controls.
