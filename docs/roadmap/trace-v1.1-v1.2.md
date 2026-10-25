# TRACE V1.1 / V1.2 roadmap

**Prepared:** 23 October 2026 (KNOWLEDGE-10).
**Status:** proposal for owner review. Every execution item needs its own approval.

**Principle.** The V1 editorial relaunch is independent: PR #2 merge, Production Pages publish, §7.7 smoke test and QA. **Nothing on this roadmap blocks it.**

## 1. Release lines

| Line | Goal | Exit criterion |
|---|---|---|
| **V1.0** relaunch | Editorial site, workflow and governance live | PR #2 merged; Production smoke and authenticated QA pass |
| **V1.0.1** | Editorial usability | D4 shipped |
| **V1.1: knowledge foundation** | Turn stored data into governed evidence on a small scale; prove the route | Seeding pilot passes on Preview (Ask evaluation doc, §4.2). Legacy absorption rehearsed locally. Owner decisions D-1 to D-4 and P-1 taken. |
| **V1.2: Ask TRACE and open-model execution** | A useful, trustworthy public Ask; a hardware-aware catalogue pilot | Public-Ask gate (Ask evaluation doc, §4.2) passed; OM-1 to OM-4 on Preview; hardware scenarios pass |
| **Gated track: ingestion** | Safe sustained acquisition | STOP-BURN closed through scheduler 0072 with two clean scheduled opportunities, **or** the local-acquisition importer certified (L-1). Source 93 and M2 decided. |
| **Deadline track** | Astro 7 / Workers migration | Before the audit exception expires on **2027-01-31** |

## 2. Owner decisions (no code; unblock everything else)

| ID | Decision | Source | Needed by |
|---|---|---|---|
| R-1 | **Public Ask posture at relaunch:** keep it enabled as an evidence-limited preview (every answer is currently a zero-cost "insufficient evidence"), or set `TRACE_AI_PUBLIC_ENABLED=false` until V1.2 | Readiness report, §2 | **Relaunch** |
| D-1 to D-4 | Backlog triage rules: drafts, candidates, raw feed, synthesis claims | Legacy-absorption doc, §7 | V1.1 absorption |
| P-1 | `primary_attributed` conclusion mode for single-authoritative-source facts (ADR 0016 / KC-09G amendment) | Ask evaluation doc, §2.1 | V1.1 pilot interpretation |
| L-1 to L-4 | Local acquisition: shrink Cloudflare ingestion scope; shared evidence route; Cloudflare re-fetch; no workstation database access | Local-acquisition doc, §1 | Before phase E |
| S-93 / M2 | Source 93 connector or deactivation; M2 contract amendment or table rebuild | Readiness report, §8 | Before any Cron |
| G-1 | DeepSeek allow-list: the research inventory reports `deepseek-v4-flash` retired (served by V4.1-Flash-1017) and `deepseek-flash` as the current name. Configured prices (1/5 USD per million) are above the reported list prices (0.30/1.20). | Inventory, `MOD-deepseek-*` | Before any new provider-mode use. Editorial AI is enabled on Production. |

## 3. Feature classification

**Gate keys:**

- **S:** `REQUIRED_BEFORE_SEEDING`
- **A:** `REQUIRED_BEFORE_PUBLIC_ASK`
- **I:** `REQUIRED_BEFORE_AUTOMATED_INGESTION`
- **P:** `POST_LAUNCH_IMPROVEMENT`

| Feature | Gates | Line | Size | Notes |
|---|---|---|---|---|
| **Assertion governance queue outside story context**: list pending and proposed assertions by source or canonical claim, reusing the existing admission and reviewer panels | **S** | V1.1 | S–M | **New finding.** Admission and reviewer controls exist only inside the cluster Review panel (`review.astro`). KC-11D seeded assertions are not attached to stories, so today they can be reviewed only through the raw API. Extraction review (`knowledge/extractions`) does not set assertion axes. |
| Freshness review UI and queue (due / unknown / changed-version) | **S** | V1.1 | S | The route `/admin/knowledge/freshness` exists; there is no UI |
| C1: evidence-URL and curated-seed inventory categories (KC-11A) | **S** | V1.1 | S | Read-only collector change |
| Quiet D1 baseline plus a per-batch rows-read and rows-written report | **S** | V1.1 | S | Measurement, not monitoring |
| D4: Pending Review → governance panel | P (throughput) | V1.0.1 | S | **Does not block the pilot**: seeded assertions are reviewed through the new queue above. It **does** gate the throughput of legacy absorption of story-linked claims. |
| C2: Ask `is_published` predicate plus publication-aware FTS indexing | **A** | V1.1 | S | Placeholder story 358; drafts indexed (absorption doc, §5) |
| FTS5 `MATCH` retrieval with bm25, relevance floor and versioned synonyms | **A** | V1.1 → V1.2 | M | Lexical precision finding (Ask evaluation doc, §1.1) |
| Deterministic topic-scope gate (`out_of_scope`) | **A** | V1.2 | S | No path sets `out_of_scope` today |
| Knowledge revision renewal (30 documents review-due) and KC-08E source-link review (vendor pages mislabelled independent) | **A** | V1.1 | S (review work) | Existing UIs |
| Knowledge claim-mapping workflow | **A** | V1.1 | n/a | Exists (`/admin/knowledge/mappings`); it is review work, not code |
| Citation locator quality checks in the pilot report | **A** | V1.1 | S | Automated: number/entity diff against chunks |
| Public Ask answer UX (attributed versus established, usefulness) | **A** | V1.2 | M | After the pilot results |
| Retrieval evaluation harness (suite runner over `/admin/ask`) | **A** | V1.1 | S | Fixture exists |
| Capture failure visibility (backfill UI) | S (at scale), **I** | V1.1 | M | The API is enough for the first two pilot batches |
| C3: bulk backlog triage | P (absorption throughput) | V1.1 | M | 6,371 rows |
| Extraction failure recovery / retry | **I** | Gated | M | Out of scope here; existing terminal behaviour accepted |
| Source 93 compatibility | **I** | Gated | S | Decision S-93 |
| Question-gap queue | P | V1.2 | S | The table exists, with 1 open gap |
| Automatic evidence refresh | **I** | Gated / local acquisition | L | Local acquisition, §6 |
| Source and version change notifications | **I** | Gated / local acquisition | M | Change classification, local acquisition §6 |
| D1 consumption monitoring and alerts | **I** | Gated | S–M | Required before scheduler 0072 or importer phase F |
| Hardware and workload input; fit calculator (OM-3) | A (hardware Ask) | V1.2 | M | The OM-3 library can start early |
| Runtime compatibility records (OM-2); catalogue pilot (OM-4) | A (hardware Ask) | V1.2 | M | |
| C4: catalogue → evidence links (OM-1) | A (hardware Ask) | V1.2 | M | Migration |
| Local acquisition phases A–B (contract plus offline packager) | P | V1.1 | M | No workstation needed |
| Local acquisition phases C–E | **I** (if L-1 is adopted) | V1.2 | L | Phase E needs approval |
| DeepSeek allow-list and pricing update (G-1) | A (provider mode) | V1.1 | S | Config and test change |

**This roadmap proposes no large new system.** Each item extends an accepted subsystem: KC-03/08/09/11, assertion governance, Guides Lab, ADR 0019, or the signed Worker boundary.

## 4. Dependency order

```text
R-1 (relaunch posture)            ──► V1.0 relaunch (independent)
D4 ─────────────────────────────────► V1.0.1

C1 ─┐
Assertion-governance queue ─┤
Freshness UI ───────────────┼─► Seeding pilot batch 1 (Preview) ─► batch 2 ─► pilot report ─┐
Quiet D1 baseline ──────────┘        (incl. v3 two-pass identity check)                    │
P-1 decision ──────────────────────────────────────────────────────────────────────────────┤
C2 + FTS MATCH + scope gate ───────────────────────────────────────────────────────────────┼─► Public-Ask gate (V1.2)
Knowledge renewal + KC-08E review ─────────────────────────────────────────────────────────┘
                                                     pilot report ─► Production absorption batches (approval each)
OM-3 (library) ─► OM-1 ─► OM-2 ─► OM-4 ─► OM-7 ─► hardware Ask
Local acq. A ─► B ─► (workstation) C ─► D ─► E (approval) ─► F (approval) ─► G (approval)
S-93 + M2 + D1 alerts + 0072 rehearsal ─► scheduler activation (approval) ─► STOP-BURN closure
```

## 5. Entry and exit criteria for the next three executable items

| Item | Entry | Exit |
|---|---|---|
| **V1.1-A: seeding prerequisites** (C1, assertion-governance queue, freshness UI, baseline) | This roadmap approved | Merged; tests on the D1-faithful adapter; Preview deploy approved separately |
| **V1.1-B: Preview seeding pilot** | V1.1-A on Preview; source list approved; plan hash approved | Pilot report with per-batch D1 and R2 usage, v3 stability result, per-question outcomes and usefulness scores |
| **V1.1-C: legacy absorption rehearsal** (local only) | C1 merged; D-1 to D-4 decided | Local rehearsal report: yields, idempotency on a second run, reviewer workload re-estimated |

## 6. STOP-BURN and sustained operation

**What runs with STOP-BURN active.** The seeding pilot and the absorption rehearsal both do. They are manual, bounded and request-driven, and they need no Cron, scheduler or `ingestion_jobs` pipeline.

**Sustained operation** requires everything below, with each item restated under decision L-1 (shrink):

| Requirement | Under L-1 |
|---|---|
| Scheduler 0072 activation with overlap prevention | Still required for any Cron. Its scope is reduced to maintenance plus optional news polling. |
| Stale-running cleanup: **2,667 `ingestion_jobs` and 951 `cron_runs` stuck as `running`** | Still required |
| Source 93 and M2 decisions | Still required |
| Two clean scheduled opportunities with bounded D1 reads | Still required, against a lower read budget |
| Ingestion health monitoring and D1 alerts | Still required, and also for the importer |
| Source-change detection | **Moves to local acquisition** (§6 there) |
| Freshness and review-queue integration | Same governed queues; the origin is import receipts rather than Cron |
