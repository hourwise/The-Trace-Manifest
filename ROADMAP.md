# Roadmap

**Planning basis:** Solo-founder-led, AI-assisted development alongside existing projects. Estimates are directional and phases may overlap.

## Phase 0 — Foundation ✅
**Estimate:** 1–2 weeks | **Completed:** 12 July 2026

~~Complete the repository foundation, documentation structure, product charter, MVP, trust framework, commercial-independence rules, source inventory, initial schema, moderation policy, SEO strategy, CI standards, continuity plan, and accepted ADRs.~~

Delivered: 20 docs across 7 directories, 7 accepted ADRs, GitHub repo with CI-ready structure.

## Phase 1 — Static Product Shell ✅
**Estimate:** 2–4 weeks | **Completed:** 12 July 2026

~~Build the Astro shell, core page templates, RSS, accessibility and SEO foundations, corrections page, methodology pages, first decision pages, and a static prototype containing 20–30 manually curated, cited answers.~~

Delivered: Astro 5 + TypeScript, 26 static pages (homepage, feed, stories, topics, models, benchmarks, daily/weekly briefings, ask box with 20 curated Q&As, corrections ledger, methodology), RSS feed, sitemap, evidence label system (6 states), responsive navigation with skip-to-content, OG meta tags.

## Phase 2 — Source Registry and Ingestion 🔧
**Estimate:** 3–5 weeks | **Started:** 12 July 2026

Integrate the first 50–100 sources, scheduled fetching, source-health checks, metadata storage, deduplication, licence tracking, and admin controls.

**Infrastructure built:** Wrangler config with 5 cron schedules, D1 schema (16 tables), seed data (39 sources), ingestion Worker (RSS/GitHub/arXiv/HN fetchers, URL dedup via SHA-256, source health monitoring with auto-disable, cron audit tracking), admin UI (4 pages: dashboard, sources, jobs, review queue). **Deployed:** Worker live at `trace-manifest-ingestion.philgeran.workers.dev` (98 items ingested, 1 confirmed cron run), Pages site live at `thetracemanifest.com` with Git-connected auto-deploy. **Design system:** Dark-first OKLCH theme, new BaseLayout with sticky header/mobile drawer/theme toggle, typed ask results detail page at `/ask/[question]`, all pages restyled.

**Pending:** Remaining 25 source seeds, live cron verification over 24–48h, Pages env var for API URL.

## Phase 3 — Curation and Trust
**Estimate:** 4–8 weeks

Add classification, semantic deduplication, clustering, entity and claim extraction, evidence labels, conflict detection, human review, corrections, and golden evaluation datasets.

## Phase 4 — Models, Providers, and Benchmarks
**Estimate:** 4–8 weeks

Build structured model, provider, pricing, benchmark, version, comparison, and benchmark-health features.

## Phase 5 — Full Ask Box
**Estimate:** 6–12 weeks

Implement retrieval, citation assembly, freshness checks, confidence labels, caching, rate limiting, abuse protection, analytics, and evaluation against the earlier curated-answer set.

## Phase 6 — Accounts and Personalisation
**Estimate:** 4–8 weeks

Add authentication, saved questions, watchlists, preferences, alerts, and initial paid plans.

## Phase 7 — Monetisation Expansion
**Estimate:** 3–6 weeks, then ongoing

Add sponsorship management, contextual advertising, affiliate management, premium research, exports, team plans, job listings, and API foundations.

## Phase 8 — Advanced Intelligence
**Estimate:** Ongoing, 3–12+ months

Add claim timelines, historical recommendation changes, licence and price monitoring, provider reliability, contradiction maps, organisation dashboards, and white-label feeds.

## Overall range

A credible public MVP is approximately **8–16 weeks of focused work**. A mature platform with the full ask box, accounts, personalisation, and commercial data products is more realistically a **9–18 month programme** for a solo founder working across multiple projects.
