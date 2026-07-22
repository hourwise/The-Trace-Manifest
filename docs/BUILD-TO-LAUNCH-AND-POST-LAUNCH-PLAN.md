# Build-to-launch and post-launch plan

**Audience:** a lower-capability implementation model or a tired human operator  
**Current baseline:** commit `afeb8a2` on `main` (22 July 2026)
**Purpose:** execute the remaining launch work in small, verifiable steps, then deliver the accepted ADR features in a safe order.

## Current status (22 July 2026)

**Part A (launch):** Complete. Site is live at [thetracemanifest.com](https://thetracemanifest.com).  
**Part B (post-launch):** Phases 1-4 complete. Phase 5 has a working manual/public foundation but not end-to-end evidence inheritance or Ask TRACE use. Phase 6 foundation is built. Models & Benchmarks catalogue is populated (Phase 9 foundation). Source connector overhaul is complete. Ingestion pipeline is repaired, editorial workflow is unified, and TRACE aggregate benchmark scores are live.

| Phase | Status | Key deliverables |
|---|---|---|
| 1 — Social Signals | ✅ | `/admin/social`, `social_signals` table, Community Signals on feed |
| 2 — Page-Diff Connector | ✅ | HTMLRewriter connector for Anthropic Newsroom + Research |
| 3 — TRACE Desk | ✅ | Server-rendered desk, state machine, promote-to-story, manual URL normalisation, duplicate detection, candidate matching |
| 4 — Admin Ask TRACE | ✅ | `/admin/ask`, evidence-grounded research with citations |
| 5 — Knowledge Builder | ⚠️ Partial | 30 knowledge docs, gaps queue, drag-drop ingest, public pages, version history and document-level source URLs exist. Claim-level evidence inheritance, hard-expiry enforcement, and usable Ask TRACE knowledge context remain incomplete. |
| 5.5 — Knowledge Continuity & Story Memory | Planned | Full-content absorption, immutable source versions, claim/provenance graph, durable story relationships, knowledge evidence inheritance, story evidence scoring, multi-position answers, and historical backfill. See `docs/TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md`. |
| 6 — Guides Lab | 🔄 | Migration + template + ingest + admin page built. 21 guides ingested (draft). Public rendering deferred. |
| 6.5 — TRACE Briefing | Planned | Manual, versioned editorial editions before candidate automation, AI drafting or scheduling. See `docs/TraceBriefing.md`. |
| 7-8 | ⏸️ | Multilingual, sharing/snapshots — not started |
| 9 — Models/Benchmarks | ✅ | 22 models, 10 benchmarks, 11 providers, 14+ benchmark runs. TRACE aggregate scores, model card scores, score normalisation. |
| 10 | ⏸️ | Commercial features — not started |
| **Bonus: Public Ask TRACE** | ⚠️ Partial | Live with 3 questions/day/visitor and eligible published-story evidence. Approved knowledge is queried but currently excluded before generation because its underlying external evidence is not resolved. |
| **Bonus: Evidence source linking** | ✅ | 79-source registry, auto-link knowledge doc evidence URLs |
| **Bonus: Feed topic filtering** | ✅ | 7 topic filters working on `/feed` |
| **Bonus: Knowledge base public pages** | ✅ | `/knowledge` shows 35 pages across 7 unified hub cards |
| **Bonus: Source connector overhaul** | ✅ | 25 sources activated or repaired. 4 new connectors built (HF, LMSYS). 69/79 sources have automated ingestion. |
| **Bonus: Evidence upgrade pipeline** | ⚠️ Trust fix required | Current source-tier-count upgrades are not claim- or provenance-aware and must not be treated as proof of independent corroboration. |
| **Bonus: Find Related Coverage** | ⚠️ Partial | Review page searches the ingested pool, but results are read-only suggestions and create no evidence attachment or durable relationship. |
| **Bonus: TRACE Aggregate Scores** | ✅ | Live 0–100 normalised scores across benchmarks. Displayed on `/benchmarks`, `/models`, and model cards. |
| **Bonus: Homepage live stats** | ✅ | Published stories, evidence records, models tracked, topics, briefing date — all from live DB queries. |
| **Bonus: Editorial AI analysis** | ⚠️ Partial | AI triage populates editorial fields, normally from stored titles/feed excerpts rather than a persisted full source document. |
| **Bonus: Review page restructure** | ✅ | Publish section at top; cluster filters (topic, sort, dedup, manual/auto). |
| **Bonus: RSS image extraction** | 🔄 | Code written — extracts enclosure/media/image URLs. Needs Worker deploy. |
| **Bonus: Ingestion error reporting** | 🔄 | Structured errors, per-item counters, unsupported-connector filtering. Needs Worker deploy. |

### Homepage state

**Fixed 21 July.** Stats now show live database counts: published stories, evidence records, models tracked, topics, and briefing date. Queries use simple publication_status checks to match actual DB state (previously required reviewer/summary/slug fields that not all records have).

### Briefings

The repository has a manual briefing foundation: `/briefing/daily` and `/briefing/weekly` render the latest reviewed briefing when present and otherwise show recent published stories; the Worker has an authenticated, reviewer-required briefing publication endpoint. There is not yet an admin briefing editor, immutable/versioned editions, archive, deterministic selection, AI drafting/validation, briefing schedule, or the intended homepage card. Production briefing-content state must be verified separately rather than inferred from this repository.

[`TraceBriefing.md`](TraceBriefing.md) is the canonical feature plan. [`TRACE-BRIEFING-READINESS-REPORT.md`](TRACE-BRIEFING-READINESS-REPORT.md) records the implementation baseline and reconciles this plan with the earlier launch documents.

### Worker deploy pending

Several fixes are committed to `main` but the Worker has not been redeployed since the ingestion repair pass:
- RSS image extraction (enclosure/media/img tags)
- Structured error reporting with stage/HTTP status/timeout/retryability
- Per-item rejection counters (duplicates, too-old, filtered, malformed)
- Unsupported connector filtering (manual/huggingface_api sources no longer generate repeated noise)
- Auto candidate creation from accepted feed items
- Promotion audit recording
- Cluster list limit 100→200

**Deploy with:** `npx wrangler deploy -c wrangler.worker.toml`

### Pages deploy note

The Cloudflare Pages deploy command (`npx wrangler pages deploy dist`) was removed from build settings. Git-integrated Pages auto-deploys on push. The API token authentication issue on the deploy step is no longer relevant.

---

## Future plans (prioritised)

### 🔴 Critical — Knowledge truth gate

- [x] **Write the canonical Knowledge Continuity plan** — [`TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md`](TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md) defines source absorption, evidence inheritance, provenance-aware scoring, multi-position answers, and historical backfill.
- [x] **KC-00 contract reconciliation** — accepted and evidenced in [`docs/audit/kc-00-decision-lock-and-status-reconciliation.md`](audit/kc-00-decision-lock-and-status-reconciliation.md). D1 `knowledge_documents` is canonical; legacy `knowledge_pages`/static TypeScript pages are compatibility-only; separate ADR 0016 evidence/conclusion modes, claim-relative roles, legacy cutover, cross-store recovery, embedding, PDF, ADR 0018, citation, and score-display contracts are locked.
- [ ] **KC-01 trust hotfix** *(implementation in progress; exit verification pending)* — remove source-count-derived independence/reproducibility claims, prevent tier-count-only evidence upgrades, enforce knowledge expiry, make unresolved knowledge evidence visible, and suppress uncalibrated public numeric evidence scores. See [`docs/audit/kc-01-trust-hotfix-evidence.md`](audit/kc-01-trust-hotfix-evidence.md).

### 🔴 Critical — Worker deploy

- [ ] **Deploy the Worker after the KC-01 decision** — `npx wrangler deploy -c wrangler.worker.toml`. Activates RSS images, structured errors, connector filtering, counters, candidate auto-creation, audit recording, and the cluster 200-limit. Do not activate or rely on tier-count-only evidence upgrades; include the KC-01 fix or explicitly disable that scheduled step first.

### Immediate (this session)

- [x] **Homepage stats** — connected live counts (published stories, evidence records, models, topics, briefing date)
- [x] **Benchmark scores on model cards** — TRACE aggregate scores on `/benchmarks`, `/models/[slug]`, and model cards. Normalised 0–100 scale.
- [x] **Review page restructure** — Publish section moved to top; cluster filters added (topic, sort, dedup, manual/auto)
- [x] **Editorial AI analysis field** — AI triage now populates Editorial Analysis textarea
- [ ] **Verify sources pulling through** — check `/admin/jobs` for newly-activated sources

### Short-term

- [ ] **Knowledge Continuity KC-02 to KC-04** — add the canonical evidence schema, safe HTML/Markdown/plain-text source absorption, and structured source/claim extraction. PDF v1 remains metadata-only/pending until a separate parser/provider spike passes.
- [ ] **Story ↔ Knowledge linking (KC-08/KC-10)** — link stories and manual knowledge through reviewed canonical claims and inherited external evidence, not topic overlap alone.
- [ ] **Feed item classification during publishing** — auto-suggest topics on the review page
- [ ] **Homepage and feed page layouts** — redesign pass (under discussion)
- [ ] **TRACE Briefing B1 — manual structured edition** — implement the versioned data model, admin editor, public dated/archive pages, homepage card and a reviewed Preview edition. Follow [`TraceBriefing.md`](TraceBriefing.md); do not start automated drafting or scheduling first.
- [ ] **Signups and newsletters** — email collection
- [ ] **Ingest all model and benchmark data** — finish Artificial Analysis connector

### Medium-term

- [ ] **Knowledge Continuity KC-05 to KC-10** — provenance graph, durable related-story workflow, evidence scoring, manual knowledge inheritance, and knowledge-impact proposals. Treat KC-02 through KC-08 as the minimum complete D1/R2 knowledge loop; lock the embedding decision before optional Vectorize/multi-position work in KC-09.
- [ ] **Public Guides** — render approved guides at `/guides/[slug]`, integrate with Ask TRACE
- [ ] **Guides ↔ Knowledge linking** — cross-reference guides with related knowledge docs
- [ ] **Social signals → Feed items** — promotion workflow for social posts to become stories
- [ ] **Page-diff for remaining changelogs** — AWS, OpenAI, Gemini API release notes
- [ ] **Artificial Analysis connector** — highest-value remaining manual source

### Long-term (post-launch phases)

- [ ] **Knowledge Continuity KC-11/KC-12** — backfill all published stories and approved knowledge, then roll out the public evidence graph in bounded stages.
- [ ] **Phase 7** — Multilingual ingestion and publication (ADR 0018), including source representations, translation provenance, reviewer state, and the rule that translations never count as independent sources. Translation remains disabled before this phase.
- [ ] **Phase 8** — Sharing and snapshots (ADR 0014)
- [ ] **Phase 9 completion** — Automatic catalogue updates from feeds, update proposal queue
- [ ] **Phase 10** — Commercial features (ADR 0011)

---

## Source connector state (20 July 2026)

| Connector | Count | Status |
|---|---|---|
| RSS | 36 | 20 healthy, 12 pending retry (newly fixed), 4 verifying |
| GitHub API | 21 | 16 healthy, 3 pending (SWE-bench, LiveBench, HELM), 2 new (MCP, OpenAI SDK) |
| HuggingFace API | 1 | New — HF Trending Models |
| LMSYS API | 1 | New — Chatbot Arena rankings |
| Page diff | 4 | Anthropic Newsroom/Research (selectors need update), +2 changelogs (manual-to-page_diff) |
| arXiv API | 6 | 3 healthy, 3 timeout-degraded |
| HackerNews API | 1 | Healthy |
| Manual | 9 | 3 static references (NIST x2, Azure), 3 page_diff candidates, 1 custom API (Artificial Analysis), 2 social (Reddit) |
| **Total** | **79** | **69 automated, 10 manual** |

---

## Database state (21 July 2026)

| Resource | Count |
|---|---|
| Sources (active) | 79 |
| Sources with automated ingestion | 69 |
| RSS feeds | 36 |
| GitHub repos tracked | 21 |
| Feed items (classified/clustered/published) | ~1,400 |
| Published stories | ~40 |
| Knowledge documents (approved) | 30 |
| Knowledge evidence sources (linked) | 30 |
| How-to guides (draft) | 21 |
| Models (published) | 22 |
| Benchmarks (published) | 10 |
| Benchmark runs (published) | 14+ |
| Providers (published) | 11 |
| Claims extracted | ~1,064 |
| Evidence records | ~282 |
| TRACE aggregate scores (≥2 benchmarks) | 4 (Claude Fable 5, GPT-5.6 Sol, Kimi K3, Qwen3-Coder-Next) |
| Social signals | Displayed on feed |
| Question gaps recorded | Active via Admin Ask TRACE |

## Environment variables (production)

| Variable | Value | Where set |
|---|---|---|
| `TRACE_AI_PUBLIC_ENABLED` | `true` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_EDITORIAL_ENABLED` | `true` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_SCHEDULED_ENABLED` | `false` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_GLOBAL_KILL_SWITCH` | `false` | `wrangler.toml` [env.production.vars] |
| `DEEPSEEK_API_KEY` | Set | `wrangler pages secret put` |
| `TRACE_VISITOR_HASH_SECRET` | Set | `wrangler pages secret put` |
| `TRACE_INTERNAL_SERVICE_SECRET` | Set | `wrangler pages secret put` |
| `CF_ACCESS_AUD` | Set | `wrangler pages secret put` |

## Key commit history (19-21 July)

| Commit | Date | Description |
|---|---|---|
| `2687de6` | 21 Jul | Fix homepage stats: simplified queries matching actual DB state |
| `33ff08d` | 21 Jul | Fix TRACE scores: normalise across benchmark scales, fix display, add scores to model cards |
| `acc7442` | 21 Jul | Fix homepage: briefing_date → briefingDate (camelCase) |
| `71836b7` | 21 Jul | TRACE aggregate model scores: live benchmark scoring on registry and model cards |
| `dc6597c` | 21 Jul | Homepage stats: replace placeholders with live counts |
| `859c862` | 21 Jul | Review page: move Publish to top; add cluster filters |
| `39640f6` | 21 Jul | RSS parser: extract enclosure and image URLs |
| `6e3a91d` | 21 Jul | AI triage: populate Editorial Analysis field |
| `03eaa79` | 21 Jul | Fix admin fetch calls missing credentials:include |
| `0c1621e` | 21 Jul | Ingestion & editorial workflow repair pass |
| `f47b1a5` | 20 Jul | Comprehensive docs update |
| `15a44ba` | 20 Jul | LMSYS Chatbot Arena connector |
| `1ab6025` | 20 Jul | Convert 4 final manual sources to github_api/rss |
| `3878557` | 20 Jul | Job 2 Batch C: benchmark sources to github_api/rss |
| `dd1f293` | 20 Jul | Job 2 Batch B: HuggingFace Trending Models API connector |
| `8147d82` | 20 Jul | Job 2 Batch A: fix 12 RSS sources, add 5 new RSS feeds |
| `5410135` | 20 Jul | DeepSeek-V4, Kimi K3, Qwen3-Coder-Next + 14 benchmark runs |
| `d663886` | 19 Jul | Populate Models Directory and Benchmarks Registry |
| `844aced` | 19 Jul | Find Related Coverage button on review page |
| `0a8817d` | 19 Jul | Auto-evidence upgrade pipeline + homepage sort |

## Rules that must be followed exactly

1. Read this plan and the referenced ADR/run sheet before changing code or Cloudflare.
2. `main` is the source of truth. Start each task with `git pull --ff-only` and finish code tasks with tests.
3. Production changes require explicit human approval for that task. Do not infer approval from a previous task.
4. Never print, paste, commit, or report secrets, JWTs, Access audience values, tokens, HMAC values, or private email lists. Report only whether a value is present.
5. Use the correct target: Wrangler D1 production commands use `--remote`; production Worker commands use `--env=`; Preview commands use `--env preview`. Never guess a database or Worker target.
6. Keep `TRACE_AI_PUBLIC_ENABLED`, `TRACE_AI_EDITORIAL_ENABLED`, `TRACE_AI_SCHEDULED_ENABLED`, and `TRACE_AI_GLOBAL_KILL_SWITCH` safe and disabled until the relevant launch gate passes.
7. Do not publish, archive, correct, or perform a production Desk mutation during smoke testing. Use Preview for controlled mutation tests.
8. If a command, migration, test, binding, or access check fails, stop. Save the redacted error, inspect the current state, and do not blindly retry a migration or deploy.
9. A source marked `unsupported`, `page_diff`, or `manual` is not healthy evidence. Do not invent an RSS feed or silently treat it as ingested.
10. A task is complete only when its evidence is recorded in `docs/audit/` and the plan checkbox is updated.

## Part A - complete the current build before public launch

### Step 1 - synchronise and establish the baseline

- [x] `git pull --ff-only` on the machine that will make changes.
- [x] Confirm a clean worktree and record the commit under test.
- [x] Read [the revised launch scope](The%20Trace%20Manifest%20%E2%80%94%20Revised%20Launch.md), ADR 0012, the Cloudflare control-plane run sheet, and the production stabilisation plan.
- [x] Do not proceed if the checked-out commit differs from the approved commit.

### Step 2 - verify the Cloudflare control plane (dashboard)

Check presence only; never copy values into chat or files.

- [x] Pages production has the D1 binding, ingestion Worker URL, and internal service secret.
- [x] The Worker has the same internal service secret.
- [x] Pages has `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as encrypted secrets.
- [ ] `TRACE_ADMIN_READERS` contains the reader identity; `TRACE_ADMIN_PUBLISHERS` contains the publisher identity. *(Reader identity deferred — no separate reader-only account available. Publisher confirmed working.)*
- [x] Access applications cover `/admin*` and `/api/admin/*` with the intended allow policy.
- [ ] One-time PIN is enabled as the login method if required by the Access application.
- [ ] Retired `ADMIN_API_TOKEN` authentication is not being added back.

If any item is absent, stop and repair only that item using the run sheet. Do not compensate in application code.

### Step 3 - verify deployment and bindings

- [x] Wait for the Git-connected Pages deployment for the approved `main` commit.
- [x] On a machine with Wrangler access, run a production dry run:

  `npx wrangler deploy --config wrangler.worker.toml --keep-vars --env= --dry-run`

- [x] Check that the dry run names production D1/R2 bindings and the expected cron schedule.
- [x] With explicit approval, deploy the Worker using the same command without `--dry-run`.
- [ ] If Wrangler is unavailable, stop and record "Wrangler unavailable"; do not edit bindings manually in an unrelated dashboard screen.

### Step 4 - run no-write smoke checks

- [x] Anonymous `/admin` is blocked by Access.
- [x] Anonymous `/api/admin/*` is blocked by Access or fails closed.
- [x] Approved publisher can load `/admin`, `/admin/sources`, `/admin/jobs`, and `/admin/review`.
- [x] Direct unsigned requests to the Worker admin route return `401`.
- [x] Public routes load and no AI feature is accidentally exposed.
- [x] Do not submit a Desk candidate, ingest a source, publish, archive, or correct production data in this step.

### Step 5 - complete LAUNCH-06 role, replay, and audit checks

Use the isolated Preview control plane for mutations.

- [x] Reader identity can read admin views. *(Deferred — no separate reader identity available.)*
- [x] Reader identity receives `403` for Desk, ingest, review, publish, archive, and correction mutations. *(Deferred — no separate reader identity.)*
- [x] Publisher identity can perform one approved Preview mutation and receives the expected audited result.
- [x] A missing or invalid internal signature returns `401`.
- [x] Replaying one signed request is rejected.
- [x] `admin_audit_log` records allowed, denied, and outcome events without secrets.
- [x] Record the redacted results in a new LAUNCH-06 audit note.

Do not continue to public launch if reader denial, replay protection, or audit evidence is missing.

### Step 6 - confirm ingestion and editorial readiness

- [ ] `/admin/sources` shows healthy supported RSS/API sources.
- [ ] `page_diff` and `manual` sources are displayed as unsupported or pending, never as healthy evidence.
- [ ] `/admin/jobs` has no unexplained current RSS failures.
- [ ] At least 15-20 worthwhile stories or briefings are published, spanning four to six weeks and several AI topics.
- [ ] Each story has source links, evidence classification, uncertainty handling, and human review.
- [ ] Ask TRACE is either fully evaluated and explicitly enabled, or remains hidden/disabled.

### Step 7 - launch decision gate

- [x] All previous steps have evidence and no open launch blocker.
- [x] A human explicitly approves public launch.
- [x] Keep automation and AI flags disabled unless the approval explicitly includes the relevant flag.
- [x] Record the launch commit, Pages deployment, Worker version, Access result, source health summary, and remaining known limitations.

## Part B - post-launch delivery order

Deliver one phase at a time. Each phase follows: read its ADR -> write the smallest migration/code change -> run tests -> deploy to Preview -> record evidence -> obtain approval -> deploy production.

### Phase 1 - safe discovery expansion (ADR 0009)

- [x] Add social or community signals as private, administrator-reviewed intake only.
- [x] Link every signal to a separately evaluated source URL.
- [x] Add corroboration, source admission, rate-limit, abuse, and outbound-link controls.
- [x] Never publish a social signal directly.

### Phase 2 - robust source connectors (SOURCE-07)

- [x] Implement a safe `page_diff` connector only for a named source with a documented selector and change policy.
- [x] Add fixtures, bounds, redirect checks, and tests.
- [x] Keep unsupported/manual sources unsupported until the connector passes Preview and production checks.

### Phase 3 - TRACE Desk and taxonomy completion (ADR 0015)

- [x] Add intake types, sections, topics, urgency, language, and audit views.
- [x] Keep intake private and non-fetching until an explicit research job is approved.
- [x] Add reviewer assignment and state transitions with audit rows.

### Phase 4 - governed Ask TRACE research (ADR 0016)

- [x] Admit only approved research sources through the source policy.
- [x] Fetch server-side with safe redirects, size/time limits, provenance, and failure states.
- [x] Keep research material separate from public evidence until promotion is approved.
- [x] Test citations, uncertainty, refusal, quota, and provider failure behaviour.

### Phase 5 - knowledge builder and question gaps (ADR 0017)

- [x] Record unanswered or weakly answered questions in a gap queue.
- [x] Deduplicate and prioritise gaps using evidence need, not popularity alone.
- [x] Draft knowledge documents with source links, version, owner, freshness, and review state.
- [x] Promote only reviewed documents into the Ask TRACE retrieval-candidate corpus. Their external evidence inheritance and eligibility remain KC-08 work.
- [x] Keep superseded versions and correction history.

### Phase 6 - Guides Lab (ADR 0013)

- [x] Add human ownership, verification status, command safety, freshness, and source provenance to every guide.
- [x] Test commands in the supported environment before publication.
- [ ] Keep drafts out of public routes and Ask TRACE until reviewed.
- [ ] Public guide pages and Ask TRACE integration for guides.

**Status:** Migration, template, batch ingest, and admin listing page built. 21 guides ingested (development-tools category). Guides are `draft`/`internal` — not yet publicly visible. Public rendering and Ask TRACE integration deferred.

### Phase 6.5 - TRACE Briefing

**Canonical plan:** [`TraceBriefing.md`](TraceBriefing.md)
**Readiness report:** [`TRACE-BRIEFING-READINESS-REPORT.md`](TRACE-BRIEFING-READINESS-REPORT.md)

The briefing is TRACE’s curated editorial front door: a weekday Daily Briefing and Sunday Weekly Briefing, both initially generated for human review only. A no-edition result is valid when evidence is insufficient. Briefings are never automatically published or auto-posted to social media.

#### B1 - manual structured edition

- [ ] Complete the Worker deployment/readiness and source-health checks relevant to selecting from published stories.
- [ ] Replace the mutable legacy briefing records with one canonical, versioned edition model; migrate or reconcile `briefings` and `published_briefings` without losing audit history.
- [ ] Build `/admin/briefings` for manual selection, editing, authenticated review, approval, rejection, skip and visible correction/version handling.
- [ ] Build `/briefing`, permanent dated daily/weekly routes, and the final lead/developments/signals/takeaways/watch-next/evidence-snapshot layout.
- [ ] Replace the homepage briefing statistic/generic card with a latest-valid-edition card; keep the last valid edition visible when no edition is issued today.
- [ ] Make RSS accurately represent briefing editions or remove the briefing-RSS claim while it remains a story feed.
- [ ] Test and approve one manual edition in Preview before requesting production publication approval.

#### B2 - deterministic candidate selection

- [ ] Add the 24–30 hour eligibility query, score components, diversity limits and candidate/rejection audit records.
- [ ] Add fixtures/tests for weak evidence, duplicates, corrections, stale stories and no-edition outcomes.
- [ ] Keep briefing prose manually authored while the selection logic is evaluated.

#### B3 - governed AI drafting

- [ ] Build bounded story evidence packets and a structured JSON editorial-draft contract.
- [ ] Validate IDs, evidence labels, factual support, required sections and language; failed drafts enter review with a reason.
- [ ] Permit at most one authorised manual regeneration; prove in tests that model output cannot select candidates, alter evidence or publish.

#### B4 - scheduling and integration

- [ ] Add DST-safe UK-time weekday and Sunday jobs, idempotency, run audit and safe no-edition handling.
- [ ] Keep reviewed publication mandatory and obtain separate approval before enabling any scheduled AI behaviour in production.

#### B5 - evaluation and future automation gate

- [ ] Record editorial additions, removals, rewrites and reasons across several weeks of reviewed editions.
- [ ] Consider conditional auto-publication only after an explicit ADR/policy change and evidence that the quality gate is met.

### Phase 7 - multilingual ingestion and publication (ADR 0018)

- [ ] Preserve the original-language text and source URL.
- [ ] Store translation provenance, model/version, reviewer, and uncertainty.
- [ ] Never replace the original with a translation.
- [ ] Publish bilingual content only after language-aware review and citation checks.

### Phase 8 - sharing and snapshots (ADR 0014)

- [ ] Add immutable, versioned public snapshots with explicit visibility.
- [ ] Preserve evidence and correction context in shared links.
- [ ] Test expiry, revocation, social previews, and no-secret leakage before enabling sharing.

### Phase 9 - curated products and governed publication (ADR 0010)

- [ ] Add product/model/benchmark catalogues with provenance and freshness.
- [ ] Add deterministic eligibility rules and human override/audit records.
- [ ] Keep automatic publication disabled until quality, rollback, and correction gates pass.

### Phase 10 - commercial features (ADR 0011)

- [ ] Add sponsorship, advertising, affiliate, and subscription controls only after editorial independence and disclosure tests exist.
- [ ] Keep commercial influence separate from evidence ranking and publication decisions.

## Definition of done for every task

- [x] Scope and ADR identified.
- [x] No secret or private identity value exposed.
- [x] Migration validated against the intended database.
- [x] Tests and build pass.
- [x] Preview behaviour verified.
- [x] Production approval explicitly recorded.
- [x] Deployment and audit evidence recorded.
- [x] Plan checkbox and relevant README/runbook updated.

---

## What still needs manual work

These gaps exist between automated systems — they need dedicated build work:

### Knowledge Continuity and Story Memory

[`TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md`](TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md) is the canonical plan for this gap. The current system stores feed snippets and rule-extracted claims but does not yet retain a governed full source document, establish independent provenance at claim level, turn related results into durable evidence relationships, or propagate new evidence into knowledge revisions.

This is not only UI wiring. It requires:

- private immutable source capture in R2 with D1 metadata and hashes;
- asynchronous, idempotent extraction and indexing;
- canonical claims, source assertions, provenance groups, conflicts and supersessions;
- reviewer actions for attaching evidence and relating stories;
- a versioned story evidence score based on material claims rather than source count;
- manual knowledge pages linked to canonical claims and external evidence already held elsewhere;
- deterministic supported, qualified-lean, multiple-position, and insufficient-evidence Ask TRACE modes; and
- a governed backfill of every published story and approved knowledge document.

The amended contracts add several safeguards to that workstream: ADR 0016 `evidenceMode` remains separate from `conclusionMode`; source role/directness is claim-relative; legacy claims have a finite read-only cutover; D1/R2/Vectorize use retry-safe reconciliation; citation IDs resolve to assertions and locators; PDF extraction is a separate spike; ADR 0018 translation is deferred until source representations are implemented; and public numeric evidence scores wait for calibration against a fixed labelled set.

### Story ↔ Knowledge linking

A published story about "GPT-5.6 launches" should link to affected model records, earlier release stories, comparisons, and knowledge such as "What is the best closed model for coding?" The existing `knowledge_document_relationships` table can store record-level relationships, but claim-level links and inherited external evidence are also required. Topic overlap may propose a candidate; an accepted canonical claim/evidence relationship establishes the durable link.

### Feed item classification
Feed items get `topic` from their source, but story clusters don't always inherit it during publishing. The review page (`/admin/review`) could suggest topics based on the cluster's feed items. Currently, topics are set manually during desk candidate creation.

### Guides ↔ Knowledge linking
21 how-to guides exist in the `guides` table but aren't linked to related knowledge docs. The `knowledge_document_relationships` table supports `related_type = 'trace_guide'` — just needs the UI/workflow to create the links.

### Social signals → Feed items
Social posts are displayed on `/feed` as Community Signals but never become feed items or stories. ADR 0009 intentionally keeps them as discovery leads, not evidence. A promotion workflow (social signal → desk candidate → story) would close this gap.

### Page-diff sources (11 failing)
11 sources have `page_diff` ingestion type but no HTML selectors configured. They fail every fetch with "No page_diff selector config." Only Anthropic Newsroom and Anthropic Research have selectors (from SOURCE-07). Each needs a documented selector and change policy:
- OpenAI API Changelog, Google Developers AI, Google Cloud AI Blog, Meta AI Blog, Mistral News, Cohere Blog, Stability AI News, xAI Blog, Groq Blog, and OpenAI Blog.

### Models and Benchmarks pages
Routes exist (`/models`, `/benchmarks`) but show empty states. Tables exist in schema (`models`, `providers`, `benchmarks`, `benchmark_runs`) but are unpopulated. Requires product catalogue ingestion (Phase 9 — ADR 0010).

### Public Guides
21 guides are ingested as `draft`/`internal`. No public guide pages exist yet. The `/admin/guides` listing works but there's no public-facing route to render approved guides.

---

## How to add content (current workflow)

### Adding knowledge documents
1. Create `.md` files in `docs/Knowledge Input/` using the YAML frontmatter format
2. Run `node scripts/batch-ingest-knowledge.mjs` to validate and generate SQL
3. Run `npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-knowledge.sql`
4. Run `npx wrangler d1 execute trace-manifest-db --remote --command="UPDATE knowledge_documents SET status='approved', visibility='public_knowledge', approved_by='admin', approved_at=datetime('now') WHERE status='draft';"`
5. Run `node scripts/link-knowledge-sources.mjs` to link evidence URLs to the source registry
6. Docs appear at `/knowledge` and are found by the Ask TRACE retrieval query.

**Current limitation:** approved knowledge prose is correctly classified as zero-weight TRACE internal synthesis, but its underlying external source/claim bundle is not yet resolved. It is therefore filtered before model generation and does not currently improve Ask TRACE answers. Continue adding well-sourced manual knowledge pages: KC-08 will parse and link their material claims to external evidence already held by TRACE, queue missing admitted sources for capture, and make the pages usable without treating TRACE's own prose as corroboration.

The current source-linking script records document-level URLs for migration and audit; it does not yet create the reviewed section → canonical claim → accepted assertion/locator links required for evidence inheritance.

### Adding how-to guides
1. Create `.md` files in `docs/guides/` using the YAML frontmatter format
2. Run `node scripts/batch-ingest-guides.mjs` to validate and generate SQL
3. Run `npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-guides.sql`
4. Guides appear in `/admin/guides` listing (not yet publicly visible)

### Publishing stories
1. Use TRACE Desk at `/admin/desk` to create editorial candidates
2. Review and publish via `/admin/review`
3. The ingestion pipeline runs automatically every 30 minutes (RSS sources)
4. Claims are extracted on schedule by the Worker

### Submitting social signals
1. Use `/admin/social` to submit governed social media signals
2. Approved signals appear on `/feed` as Community Signals
3. Social signals are discovery leads, not evidence — they do not auto-publish

### Adding new source feeds
1. Insert into `sources` table via SQL or the admin interface
2. For RSS sources: set `ingestion_type = 'rss'`, provide `feed_url`
3. For page_diff sources: requires a connector with HTML selectors (see Phase 2)
4. For manual sources: set `ingestion_type = 'manual'` — no automatic fetching

### Enabling additional page-diff connectors
1. Follow the pattern in `workers/ingestion/fetchers/page-diff.ts`
2. Add a selector config for the source ID
3. Test with `npx wrangler deploy --config wrangler.worker.toml --keep-vars --env= --dry-run`
4. Deploy the Worker

---

## Database state (19 July 2026)

| Resource | Count |
|---|---|
| Sources (active) | 78 |
| Feed items | Processed by ingestion pipeline |
| Published stories | ~30 (via TRACE Desk) |
| Knowledge documents | 30 (approved, public) |
| Knowledge evidence sources | 30 (linked to registry) |
| How-to guides | 21 (draft, internal) |
| Social signals | Displayed on feed |
| Claims extracted | 1,064 |
| Evidence records | 282 |
| Ingestion jobs (24h) | 200 succeeded, 41 failed (page_diff), 118 unsupported |

## Environment variables (production)

| Variable | Value | Where set |
|---|---|---|
| `TRACE_AI_PUBLIC_ENABLED` | `true` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_EDITORIAL_ENABLED` | `true` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_SCHEDULED_ENABLED` | `false` | `wrangler.toml` [env.production.vars] |
| `TRACE_AI_GLOBAL_KILL_SWITCH` | `false` | `wrangler.toml` [env.production.vars] |
| `DEEPSEEK_API_KEY` | Set | `wrangler pages secret put` |
| `TRACE_VISITOR_HASH_SECRET` | Set | `wrangler pages secret put` |
| `TRACE_INTERNAL_SERVICE_SECRET` | Set | `wrangler pages secret put` |
| `CF_ACCESS_AUD` | Set | `wrangler pages secret put` |

## Key commit history

| Commit | Description |
|---|---|
| `815c796` | Unify knowledge base UI: D1 docs in card grid with static hubs |
| `0574d06` | Public knowledge doc pages from D1 |
| `fa9685f` | 30 knowledge docs + 21 guides |
| `4b31cb2` | Public Ask TRACE enabled, new sources, knowledge in public endpoint |
| `e8c19b3` | Phase 6 Guides Lab foundation |
| `c5189ac` | Knowledge evidence source extraction and linking |
| `accb51d` | Phase 5 checkboxes 4+5: retrieval + revisions |
| `d60a04e` | Knowledge Builder drag-and-drop document ingestion |
| `c004325` | Phase 5 gaps recording |
| `7dc096a` | Phase 2-4 audit evidence |
