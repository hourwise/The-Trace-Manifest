# The Trace Manifest — Product Charter

**Status:** Draft 1  
**Date:** 12 July 2026  
**Primary domain:** thetracemanifest.com  
**UK domain:** thetracemanifest.uk

## 1. Purpose

The Trace Manifest will provide a continuously updated, evidence-linked view of the AI ecosystem.

It will aggregate and interpret:

- Product and model announcements
- Benchmark results
- Research papers
- Provider and API changes
- Open-source project activity
- Security incidents
- Regulation and licensing
- Community discoveries and commentary

The platform must help users understand not only what is new, but what is credible, useful, disputed, outdated, or commercially influenced.

## 2. Product promise

The Trace Manifest should help users answer:

- What changed?
- What evidence supports the claim?
- Is the source independent?
- Is the information current?
- Are results directly comparable?
- What do credible sources disagree about?
- What action is appropriate for this use case?

## 3. Positioning

> Not another AI news site. A current, evidence-linked intelligence platform showing what changed, what is credible, what is disputed, and what people should actually use.

## 4. Brand meaning

### Trace

Represents:

- Source provenance
- Citation trails
- Claim history
- Version changes
- Corrections
- Auditability
- Reproducibility

### Manifest

Represents:

- A structured record
- A declared inventory of evidence
- A current state of the ecosystem
- A durable historical index
- A machine-readable intelligence layer

## 5. Brand language

### Primary tagline

> Follow the evidence. Understand the change.

### Supporting lines

- AI intelligence with sources, context, and consequence.
- What changed in AI, what is credible, and what matters.
- Trace the claims. Compare the evidence. Make better decisions.

## 6. Target users

### Developers

Need reliable model, provider, tooling, and open-source intelligence.

### Local-model users

Need practical comparisons based on hardware, quantisation, licensing, cost, and performance.

### Small businesses

Need understandable guidance on vendors, privacy, security, costs, and adoption.

### Researchers and advanced users

Need benchmark context, research tracking, disagreement mapping, and reproducibility information.

### General AI followers

Need high-signal briefings without hype or repetitive summaries.

## 7. Core product areas

- Intelligence feed
- Daily and weekly briefings
- Model directory
- Provider directory
- Benchmark registry
- Research feed
- GitHub and open-source radar
- Community signal feed
- Citation-grounded ask box
- Claim timelines
- Corrections ledger
- Marketing-versus-evidence comparisons
- Watchlists and alerts
- Decision pages
- Data and API access later

## 8. Editorial principles

- Primary evidence is preferred.
- Social popularity is not proof.
- Vendor claims are labelled as vendor claims.
- Syndicated reporting is not independent corroboration.
- Uncertainty must remain visible.
- High-impact claims require stronger evidence.
- Corrections must remain publicly accessible.
- Commercial relationships must not affect ratings or conclusions.

## 9. Commercial principles

The project may use:

- Contextual advertising
- Direct sponsorship
- Affiliate links
- Supporter memberships
- Paid research
- Professional plans
- Alerts and watchlists
- Team plans
- Data exports
- API subscriptions
- Enterprise research

Commercial relationships purchase visibility or access, never editorial outcomes.

## 10. Technical direction

Initial recommendation:

- Astro
- TypeScript
- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Cron Triggers
- Cloudflare R2 where needed

A hybrid Supabase layer may be introduced later for accounts, saved research, teams, and richer relational workloads.

## 11. Product constraints

The MVP will not depend on:

- Automated Reddit scraping
- Full social-media ingestion
- Large-scale original benchmark execution
- Fully autonomous publication of major claims
- Enterprise features
- Public API
- Native mobile apps

## 12. Success definition

The early product succeeds when it:

- Publishes useful briefings consistently
- Cites primary evidence
- Explains uncertainty clearly
- Corrects mistakes transparently
- Answers practical questions with current sources
- Covers its operating costs without compromising editorial trust
