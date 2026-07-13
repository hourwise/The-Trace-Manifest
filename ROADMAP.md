# Roadmap

**Planning basis:** Solo-founder-led, AI-assisted development alongside existing projects. Estimates are directional and phases may overlap.

**Editorial identity:** T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence (10 editorial laws govern all outputs).

**Model governance:** ADR-0008 — DeepSeek via provider-neutral gateway, cost containment, automated-loop prevention. Model is a replaceable drafting component; TRACE's corpus and validation are authoritative.

## Phase 0 — Foundation ✅
**Estimate:** 1–2 weeks | **Completed:** 12 July 2026

~~Complete the repository foundation, documentation structure, product charter, MVP, trust framework, commercial-independence rules, source inventory, initial schema, moderation policy, SEO strategy, CI standards, continuity plan, and accepted ADRs.~~

Delivered: 20 docs across 7 directories, 8 accepted ADRs (including ADR-0008 model governance), GitHub repo with CI-ready structure.

## Phase 1 — Static Product Shell ✅
**Estimate:** 2–4 weeks | **Completed:** 12 July 2026

~~Build the Astro shell, core page templates, RSS, accessibility and SEO foundations, corrections page, methodology pages, first decision pages, and a static prototype containing 20–30 manually curated, cited answers.~~

Delivered: Astro 5 + TypeScript, 26 static pages (homepage, feed, stories, topics, models, benchmarks, daily/weekly briefings, ask box with 20 curated Q&As, corrections ledger, methodology), RSS feed, sitemap, evidence label system (6 states), responsive navigation with skip-to-content, OG meta tags.

## Phase 2 — Source Registry and Ingestion 🔧
**Estimate:** 3–5 weeks | **Started:** 12 July 2026

Integrate the first 50–100 sources, scheduled fetching, source-health checks, metadata storage, deduplication, licence tracking, and admin controls.

**Infrastructure built:** Wrangler config with 5 cron schedules, D1 schema (16 tables), seed data (39 sources), ingestion Worker (RSS/GitHub/arXiv/HN fetchers, URL dedup via SHA-256, source health monitoring with auto-disable, cron audit tracking), admin UI (4 pages: dashboard, sources, jobs, review queue). **Deployed:** Worker live at `trace-manifest-ingestion.philgeran.workers.dev` (98 items ingested, 1 confirmed cron run), Pages site live at `thetracemanifest.com` with Git-connected auto-deploy. **Design system:** Dark-first OKLCH theme, new BaseLayout with sticky header/mobile drawer/theme toggle, typed ask results detail page at `/ask/[question]`, all pages restyled.

**Pending:** live cron verification over 24–48h.

## Phase 3 — Curation and Trust ✅
**Estimate:** 4–8 weeks | **Completed:** 13 July 2026

~~Add classification, semantic deduplication, clustering, entity and claim extraction, evidence labels, conflict detection, human review, corrections, and golden evaluation datasets.~~

Delivered: Full curation and trust pipeline with 6 new worker modules, 2 Astro components, 10-state evidence system, decomposable rating explanation panel, correction workflow, and admin review queue.

**Pipeline (runs daily at 09:00 UTC):** classification → cross-source matching → semantic dedup → story clustering → claim extraction → conflict detection.

| Module | File | Description |
|--------|------|-------------|
| Classification | `classify.ts` | 16-topic rule-based taxonomy, model/provider entity extraction, item type detection, confidence scoring |
| Cross-source matching | `cross-source-match.ts` | Lexical Jaccard v2 candidate matching, evidence-preserving (never discards items) |
| Semantic dedup | `semantic-dedup.ts` | Title Jaccard + content excerpt overlap, 45% combined threshold, same-source exclusion |
| Story clustering | `cluster.ts` | 3-stage: topic grouping → entity overlap → title keyword similarity ≥35%, auto-assigns evidence_status |
| Claim extraction | `extract-claims.ts` | 14 rule sets, 40+ regex patterns, 9 claim classes, 12 claim domains, evidence quality scoring, dedup |
| Conflict detection | (in extract-claims.ts) | 4 conflict types, severity assessment, auto-flags disputed claims |
| Correction workflow | `corrections.ts` | 9 correction types, cluster + claim targeting, evidence status cascade, soft-delete support |

**Evidence system:** 10-state labels (confirmed → outdated), decomposable rating explanation panel (10 factors: source class, tier, corroboration, independent verification, conflict of interest, timeliness, reproducibility, disagreement level, correction status, supersession), colour-coded OKLCH design tokens for all states in dark + light themes.

**Components:** `EvidenceBadge.astro` (reusable badge), `RatingExplanation.astro` (expandable factor breakdown per product principle 2.3).

**Admin API routes added:** `POST /admin/extract-claims`, `POST /admin/detect-conflicts`, `POST /admin/correct`, `GET /admin/corrections`.

**Schema additions:** Claims table rewritten (9 claim classes + 12 domains, evidence quality scoring), claim_evidence (10 relationship types), claim_conflicts (6 conflict types), corrections table enhanced (9 correction types + evidence status tracking + published flag), pipeline_stages extended with `corrected` stage.

**Frontend updated:** Story pages use EvidenceBadge + RatingExplanation components, feed + topic pages use EvidenceBadge, corrections page redesigned with before/after comparison panels + evidence badges, admin review queue shows 10-state reference table + correction API docs.

## Phase 3B — Evidence-Linked Knowledge Base ✅
**Estimate:** 2–3 weeks | **Completed:** 13 July 2026

~~Build the living technical reference where material claims are connected to evidence. Create the `/knowledge/` route structure, standard-contract page template, claim-to-evidence rendering component, and 16 initial cornerstone pages.~~

Delivered: 16 knowledge pages (5 complete with full standard-contract content, 11 stubs with proper metadata), 12 subject hubs, ClaimEvidenceLink component (11 relationship types with inference labelling), KnowledgePage component (full 20-section standard contract renderer), `/knowledge/` index + `[slug]` dynamic route, 4 new DB tables (knowledge_pages, knowledge_page_versions, knowledge_page_claims, knowledge_page_events).

**Complete pages:** What is MCP?, MCP architecture, What is an AI agent?, Prompt injection/tool poisoning/confused-deputy risks, MCP vs function calling.

**Stub pages:** MCP security, Agents vs workflows vs automation, Agent orchestration, Human approval in agent systems, Evaluating agent systems, Coding agents and agentic IDEs, Tool calling/function calling/MCP, Agent memory, Auditability vs enforceability, Local-agent architectures, Context engineering and retrieval boundaries.

## Phase 4 — Models, Providers, and Benchmarks ✅
**Estimate:** 4–8 weeks | **Completed:** 13 July 2026

~~Build structured model, provider, pricing, benchmark, version, comparison, and benchmark-health features.~~

Delivered: 7 new DB tables, 4 Astro components, 4 new/updated pages, 1 worker module.

**Schema:** `models` (16 fields including openness, context_window, modalities, tool_use, structured_output, api_available, local_available, superseded_by), `model_versions`, `providers`, `provider_models` (pricing junction), `pricing_history` (change tracking), `benchmarks` (7 health states), `benchmark_runs` (vendor-run vs independent flags). Pipeline stages and job types extended.

**Components:** `ModelCard.astro` (full spec card with pricing + use cases), `BenchmarkHealthBadge.astro` (7-state health badge), `ComparisonTable.astro` (side-by-side with highlight columns), `PricingHistory.astro` (timeline with ↑↓ indicators).

**Pages:** `/models` (6 models in closed/open-weight sections), `/models/[slug]` (full spec + pricing history + benchmark comparison + hardware requirements), `/benchmarks` (8 benchmarks with health summary), `/benchmarks/[slug]` (health breakdown + results with vendor/independent flags), `/providers` (10 providers with pricing comparison table).

**Worker:** `model-data.ts` — rule-based extraction of 25 models, 17 providers, 12 benchmarks from feed items. Pricing detection via regex. `seedModelData()` bootstraps baseline records. Admin routes: `POST /admin/seed-models`, `POST /admin/extract-model-data`.

## Phase 5 — Ask TRACE
**Estimate:** 6–12 weeks | **Governed by:** ADR-0008 (DeepSeek via provider-neutral gateway, cost containment, automated-loop prevention)

Build the source-grounded question-answering system. Ask TRACE answers from the indexed evidence base with citations, confidence labels, evidence windows, and explicit "insufficient evidence" handling. Per ADR-0008: provider-neutral model gateway (`src/ai/`), DeepSeek `deepseek-v4-flash` for routine public requests, `deepseek-v4-pro` restricted to reviewed editorial workflows. Includes: public endpoint `POST /api/trace/ask` (browser never calls DeepSeek directly), atomic budget reservation, internal usage ledger, 10 circuit breakers, idempotency with persistent request state, post-generation validation pipeline, deterministic confidence calculation, launch limits ($1/day, 3 questions/visitor/day, 1 model call/question). Model is a replaceable drafting component — TRACE's corpus and validation are authoritative.

## Phase 5B — TRACE Predicts
**Estimate:** 4–6 weeks | **Dependency:** Phase 5

Build the weekly editorial forecast product. Three to five evidence-linked, probabilistic, time-bounded, falsifiable predictions per week. Immutable after publication (LAW-TRACE-007). Public archive with full prediction history. Manual evaluation interface with outcome tracking. Rejects vague, unfalsifiable, or unevidenced predictions.

## Phase 5C — The Trace Weekly Newsletter
**Estimate:** 3–5 weeks | **Dependency:** Phases 5 + 5B

Build the recurring weekly digest and retention channel. Eight-section edition structure (biggest developments, editorial analysis, open-source watch, Ask TRACE selection, TRACE Predicts, last week's scorecard, project updates). Subscriber database with consent tracking, double opt-in, unsubscribe/suppression handling. Manual editorial assembly with test-send and approval workflow.

## Phase 5D — TRACE Scorecard and Calibration
**Estimate:** 2–3 weeks | **Dependency:** ~20+ evaluated predictions

Build public prediction performance metrics: aggregate counts by outcome, accuracy excluding unresolved, probability-band analysis, formal calibration metric (Brier score) when sufficient data exists. Public methodology page. Independently verifiable from the archive.

## Phase 6 — Accounts and Personalisation
**Estimate:** 4–8 weeks

Add authentication, saved questions, watchlists, topic preferences, custom briefings, alerts, user history, newsletter preferences, saved predictions tracking, supporter plan, and professional plan.

## Phase 7 — Monetisation Expansion
**Estimate:** 3–6 weeks, then ongoing

Add sponsorship management, contextual advertising, affiliate management, premium research, exports, team plans, job listings, sponsored newsletter slots, and API foundations.

## Phase 8 — Advanced Intelligence
**Estimate:** Ongoing, 3–12+ months

Add claim timelines, historical recommendation changes, licence and price monitoring, provider reliability, contradiction maps, organisation dashboards, white-label feeds, and advanced prediction analytics.

## Overall range

A credible public MVP is approximately **8–16 weeks of focused work**. A mature platform with the full ask box, predictions, newsletter, accounts, personalisation, and commercial data products is more realistically a **12–24 month programme** for a solo founder working across multiple projects.
