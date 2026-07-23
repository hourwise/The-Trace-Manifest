# AI Intelligence Platform — Master Build Plan

**Status:** Implementation in progress — ADR 0009–0019 and launch sequencing reconciled on 22 July 2026; LAUNCH-05R production deployment and anonymous boundary verification are evidenced, while the authenticated publisher-browser check and later launch gates remain pending
**Document purpose:** Define the product, architecture, MVP, roadmap, monetisation, governance, and required documentation from the beginning.  
**Product name:** The Trace Manifest  
**Editorial identity:** T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence  
**Primary domains:** thetracemanifest.com · thetracemanifest.uk  
**Primary goal:** Build a public AI intelligence platform that aggregates current information, evaluates evidence quality, tracks models and benchmarks, helps users answer practical questions using dated, cited sources, and publishes accountable forecasts whose results remain visible.

---

## 1. Product Vision

The platform should not be another AI news feed that merely republishes headlines.

It should become a continuously updated, evidence-linked intelligence layer that helps users understand:

- What happened
- What changed
- Whether a claim is credible
- Whether a source is trustworthy
- What experts and communities currently think
- Which models, tools, providers, or practices are best for a given use case
- What remains disputed or unverified
- What actions a developer, business, researcher, or local-model user should consider

The product should combine:

- AI and technology news
- Frontier model releases
- Open-weight and local-model developments
- Benchmark tracking
- Provider pricing and capability comparisons
- Research-paper summaries
- GitHub and open-source project activity
- Community signals from forums and social platforms
- Best-practice guidance
- Security, regulation, and licensing changes
- Citation-grounded question answering
- Personalised watchlists and briefings

The core value proposition is:

> A current, evidence-linked map of what is happening in AI, what is credible, what is disputed, and what people should actually use.

### 1.1 T.R.A.C.E. — Editorial Intelligence Layer

**T.R.A.C.E.** (Traceable Research, Analysis, Context and Evidence) is the named editorial intelligence layer of The Trace Manifest. It is not a fictional all-knowing persona — it is the visible interface through which the platform presents researched summaries, analysis, answers, and forecasts.

T.R.A.C.E. should be positioned as:

> A source-grounded AI intelligence publication with traceable evidence, accountable analysis and scored predictions.

**Brand voice:** calm, evidence-led, concise, sceptical without being dismissive, explicit about uncertainty, resistant to hype, willing to distinguish marketing claims from demonstrated facts.

**T.R.A.C.E. must avoid:** exaggerated certainty, anthropomorphic claims of understanding, promotional language, clickbait, fake quotations, invented consensus, and vague predictions that cannot be evaluated.

**Required navigation entries:** Ask TRACE, TRACE Analysis, TRACE Predicts, Newsletter.

---

## 2. Product Principles

### 2.1 Evidence before popularity

A widely shared claim is not necessarily accurate. Social engagement may affect relevance but must never determine factual confidence.

### 2.2 Primary sources first

Whenever possible, claims should be grounded in:

- Official documentation
- Model cards
- Research papers
- Source repositories
- Security advisories
- Provider pricing pages
- Regulatory publications
- Reproducible benchmark results

Secondary reporting and community discussion should add context, not replace primary evidence.

### 2.3 Explainable ratings

The system must never show a mysterious single “trust score” without explanation.

Every rating should be decomposable into:

- Source class
- Evidence quality
- Corroboration
- Conflict of interest
- Timeliness
- Reproducibility
- Claim severity
- Disagreement level

### 2.4 Visible uncertainty

The site should clearly distinguish:

- Confirmed
- Strongly supported
- Provisionally supported
- Vendor-reported
- Community-reported
- Disputed
- Unverified
- Corrected
- Superseded
- Outdated

### 2.5 Correction over concealment

Updates, corrections, and score changes should be visible. The site should not silently rewrite history.

### 2.6 Monetisation must not alter conclusions

Advertising, sponsorships, and affiliate relationships must never change:

- Rankings
- Benchmark results
- Evidence ratings
- Trust labels
- Recommendations
- Negative findings
- Editorial conclusions

### 2.7 Useful before clever

The first release should prioritise dependable feeds, model pages, benchmark context, and clear answers over ambitious autonomous-agent behaviour.

### 2.8 TRACE Editorial Laws

These ten laws govern every T.R.A.C.E. output — summaries, analysis, answers, predictions, and newsletter content.

**LAW-TRACE-001 — Evidence before assertion**
T.R.A.C.E. must not present a factual claim without an attributable source or an explicit statement that the claim is unverified.

**LAW-TRACE-002 — Summary and analysis must remain separate**
Neutral summaries, reported claims, confirmed facts, editorial interpretation and predictions must be visibly distinguishable.

**LAW-TRACE-003 — Inference must be labelled**
Any conclusion not directly stated by a source must be marked as analysis, inference or prediction.

**LAW-TRACE-004 — Source ownership must remain visible**
Every article summary, analysis and answer must link prominently to the original reporting, repository, paper, announcement or primary source.

**LAW-TRACE-005 — Model visibility is publication exposure**
Any material supplied to T.R.A.C.E. for answer generation must be treated as potentially exposable. Sensitive, private or restricted material must not enter the public retrieval corpus.

**LAW-TRACE-006 — Predictions must be falsifiable**
Each published prediction must define: what is expected to happen, the forecast period, the assigned probability, the evidence supporting it, what would count as confirmation, and what would count as failure or invalidation.

**LAW-TRACE-007 — Published predictions are immutable**
Once published, the wording, probability and evaluation window of a prediction must not be silently changed. Corrections may be appended through a visible amendment record.

**LAW-TRACE-008 — Failed predictions remain public**
Incorrect, partially correct, unresolved and invalidated forecasts must remain visible in the prediction archive.

**LAW-TRACE-009 — Automation may draft, but publication remains governed**
Generated summaries, analysis, newsletter content and predictions must pass the configured review policy before public release.

**LAW-TRACE-010 — Uncertainty is a valid outcome**
T.R.A.C.E. must be permitted to answer: evidence is insufficient, sources conflict, the matter remains unresolved, or no reliable conclusion can yet be drawn.

### 2.9 Model Governance — ADR-0008

These governance rules apply to all model-assisted features (Ask TRACE, TRACE Analysis, TRACE Predicts, newsletter generation, internal editorial workflows). Per ADR-0008, the model is a replaceable drafting and reasoning component — TRACE's governed corpus, source records, claim relationships, citation validation, corrections history, and deterministic confidence policy remain authoritative.

**Primary provider and models:**
- Initial provider: DeepSeek via a provider-neutral, server-side model gateway.
- Routine public model: `deepseek-v4-flash` for Ask TRACE.
- Reviewed editorial model: `deepseek-v4-pro`, restricted to approved, evaluated workflows.
- No automatic model substitution — every model change requires configuration review, evaluation, and an auditable deployment decision.
- The provider decision is reversible: all application code calls TRACE's internal model gateway, not provider-specific logic.

**API key and secret protection:**
- The DeepSeek API key must never be exposed to the browser, committed to Git, included in logs, or shared with other products and development tools.
- Public clients call a protected TRACE-owned endpoint; only the server-side gateway communicates with DeepSeek.
- Production secrets stored as encrypted Worker secrets; local development uses non-committed secret files.

**Cost containment:**
- Prepaid credit is the provider-level hard spending boundary — not the primary security control.
- TRACE enforces: atomic budget reservations, daily/monthly spending ceilings, per-request token and cost limits, rate limiting, idempotency, bounded retries, balance thresholds, circuit breakers, and a global kill switch.
- Suggested launch limits: $1.00/day public budget, $10.00/month, max $0.02/request estimated cost.

**Automated-loop prevention:**
- No model response may autonomously trigger another model request.
- Public Ask TRACE: one provider generation per accepted request.
- Prohibited: recursive review loops, unbounded tool loops, indefinite validation regeneration, automatic client resubmission, duplicate scheduled jobs, generic retry-on-error.

**Trust boundary:**
- The model may summarise, compare, draft analysis, identify uncertainty, and propose editorial wording.
- The model may not: invent evidence, access unrestricted web search, alter source trust classifications, approve its own citations, calculate final confidence, publish autonomously, modify the corrections ledger, call arbitrary URLs, execute code, or write directly to production data.

---

### 2.10 Mandatory ADR execution contract

The accepted ADRs are enforceable build constraints. Their `MUST`, `MUST NOT`, review gates, failure behaviour and deferred boundaries must be explicitly implemented and tested. Referring to an ADR in a comment, plan or completion message does not prove compliance.

Every model-executed task must:

1. select exactly one atomic task ID from Section 20.1 of this plan or Section 17 of `docs/the_trace_manifest_evidence_linked_knowledge_base_build_plan.md`;
2. read the governing ADRs and `docs/The Trace Manifest — Revised Launch.md` before editing;
3. state the allowed files, out-of-scope files, exact rules, tests and stop conditions;
4. inspect current repository evidence and correct stale plan claims before relying on them;
5. implement the narrowest change that satisfies the selected task;
6. prove each applicable rule with tests or a verifiable repository check;
7. fail closed when evidence, identity, audit, publication state or configuration is unavailable;
8. stop after the selected task and report the next eligible task without starting it.

The executor must stop for human direction if rules conflict or if work requires production migration, deployment, destructive data changes, secrets, public enablement, a new external integration, or a deferred feature gate. The more restrictive rule applies until the conflict is resolved.

### 2.11 ADR 0009–0019 implementation map

| ADR | Build consequence | Sequence |
|---|---|---|
| ADR 0009 | Social posts remain governed discovery signals; linked material becomes a separate source candidate with its own provenance. | Administrator-only at launch; no social auto-publication. |
| ADR 0010 | New verticals, Spotlight, App Radar, Open Source Radar and automatic publication require feature flags and deterministic gates. | Schema preparation may proceed; public expansion and automatic publication are deferred. |
| ADR 0011 | Commercial relationships and values are isolated from evidence, confidence, ranking, retrieval and conclusions. | Policy foundation only at launch; commercial activation follows stability and explicit approval. |
| ADR 0012 | Durable D1 controls, verified Access roles, audit, publication eligibility and grounded Ask are launch prerequisites. | Verify migration and deployment before public AI or expanded publication. |
| ADR 0013 | Guides and TRACE Lab require named ownership, verification, command safety, versions, freshness and underlying sources. | First expansion; publish six complete reviewed Guides before prominent navigation. |
| ADR 0014 | Sharing retains context, version/date and corrections; private Ask conversations are never directly public. | Add correction-aware metadata first; snapshots, public Ask sharing and social automation are deferred. |
| ADR 0015 | TRACE Desk unifies automated and manual intake under one source, evidence, audit, and human-review lifecycle. | Pre-launch: apply the Desk migration, verify publisher-only candidate intake, and activate only parser-verified discovery feeds. |
| ADR 0016 | Ask TRACE retrieves approved knowledge first and uses only bounded, admitted research when allowed. TRACE publications are context, not corroboration. | Implement after the launch-control gates; no unrestricted browser/search or automatic knowledge promotion. |
| ADR 0017 | Knowledge Builder turns governed questions and research into reviewable, expiring knowledge and Guides. | Continue through the canonical [`docs/TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md`](docs/TRACE-KNOWLEDGE-CONTINUITY-BUILD-PLAN.md); the manual/public document foundation is not complete until external evidence inheritance, expiry, story memory, provenance-aware scoring, multi-position answers, and backfill pass their gates. |
| ADR 0018 | Original-language evidence remains canonical; translations are derived, reviewable representations. | Add language/provenance fields before foreign-language activation; bilingual publishing is deferred. |
| ADR 0019 | Open Model Execution Intelligence adds exact model artefacts, runtimes, hardware, compatibility, diagnostics, and deterministic recommendations. It inherits Knowledge Continuity evidence rather than creating a parallel evidence system. | Begin only after the required Knowledge Continuity trust and source foundation. Use D1/R2/Queues/Vectorize within their existing authority boundaries; model-generated explanation cannot override deterministic compatibility or evidence state. |

The revised launch scope controls delivery order: launch AI & Agents with manual editorial approval first, then Guides, then separately approved expansion. Later ADRs do not authorise their features to bypass that sequence.

---

## 3. Target Users

### 3.1 Developers

Need to know:

- Which models and tools are genuinely useful
- What changed in coding agents
- Which APIs are cheapest or fastest
- Which projects are active or declining
- Which frameworks are production-ready

### 3.2 Local-model users

Need to know:

- What runs on their hardware
- Quantisation requirements
- RAM and VRAM needs
- Licence restrictions
- Best-performing models by resource level
- Current inference tools

### 3.3 Small businesses

Need to know:

- Which AI tools are trustworthy
- What is safe for business use
- What is worth paying for
- Which vendors are credible
- What legal or privacy issues apply

### 3.4 Researchers and advanced users

Need:

- Research tracking
- Benchmark methodology
- Replication status
- Conflicting findings
- Model lineage
- New evaluation methods

### 3.5 General AI followers

Need:

- Important stories without noise
- Explanations without hype
- Daily or weekly summaries
- Clear context around major announcements

---

## 4. Core Product Areas

## 4.1 Main Intelligence Feed

A chronological and relevance-ranked feed containing:

- Model launches
- Provider updates
- Research
- Benchmarks
- API changes
- Open-source releases
- Security incidents
- Regulation
- Hardware
- Funding and industry changes
- Community discoveries
- Pricing changes
- Product deprecations

Each story should display:

- Headline
- Short summary
- Topic
- Published date
- Last checked date
- Source class
- Evidence status
- Relevance score
- Confidence level
- Related entities
- Original source links
- “Why this rating?” explanation
- Whether the item has been corrected or superseded

### Filters

- Frontier models
- Open-weight models
- Local AI
- Coding assistants
- MCP and agents
- Research
- Benchmarks
- Security
- Regulation
- AI business
- Image generation
- Audio and video
- Hardware
- Developer tools
- Open-source releases

---

## 4.2 Daily and Weekly Briefings

### Daily briefing

- Five things that matter today
- New model releases
- Pricing changes
- Important research
- Security issues
- Major corrections
- Claims awaiting verification
- Trending GitHub projects
- Community discussions worth reading

### Weekly briefing

- Most consequential developments
- Benchmark movement
- Provider comparison changes
- Major model releases
- New best-practice guidance
- Most disputed claims
- Most important open-source projects
- “What changed since last week?”

Briefings should be available as:

- Web pages
- Email newsletters
- RSS
- Optional downloadable Markdown or PDF later

---

## 4.3 Model Directory

Each model page should include:

- Provider
- Model family
- Version
- Release date
- Status
- Open, closed, or open-weight
- Licence
- Parameter count where known
- Context window
- Modalities
- Tool use support
- Structured output support
- API availability
- Local availability
- Known providers
- Input price
- Output price
- Cached input price
- Speed
- Latency
- Hardware requirements
- Quantisation options
- Best use cases
- Weaknesses
- Known reliability concerns
- Published benchmarks
- Independent benchmarks
- Community reports
- Last verified date
- Superseded-by relationship

### Useful model views

- Best coding models
- Best models by budget
- Best local models
- Best models for 16 GB RAM
- Best models for agent workflows
- Best long-context models
- Best structured-output models
- Best privacy-preserving models
- Fastest models
- Best value models
- Most improved models

---

## 4.4 Provider Directory

Each provider page should track:

- Supported models
- Pricing
- Rate limits
- Regions
- Data retention policy
- Privacy terms
- Enterprise support
- API compatibility
- Reliability
- Known outages
- Latency
- Speed
- Tool-use support
- Structured-output support
- Batch support
- Caching
- Fine-tuning
- Moderation policy
- Commercial restrictions
- Last checked date

Comparison pages should support practical questions such as:

- Cheapest provider for a selected model
- Fastest provider
- Best provider for Europe
- Best provider for privacy
- Best provider for agents
- Best provider for high-volume workloads

---

## 4.5 Benchmark Registry

The platform should not present benchmarks as universally comparable.

Each benchmark record should include:

- Benchmark name
- Version
- Owner or publisher
- Purpose
- Domain
- Test date
- Model version
- Prompting method
- Tool access
- Reasoning settings
- Sampling settings
- Hardware or provider
- Vendor-run or independent
- Code availability
- Data availability
- Reproducibility
- Known contamination concerns
- Known saturation concerns
- Comparable-results flag
- Last reviewed date

### Benchmark Health Status

- Healthy
- Limited
- Saturating
- Contamination concern
- Poorly reproducible
- Vendor-specific
- Deprecated

### Benchmark views

- Best coding model
- Best agentic model
- Best local model
- Best cost-adjusted model
- Best speed-adjusted model
- Best small model
- Most improved model
- Most independently verified model

---

## 4.6 Research Feed

Track papers and reports in:

- Large language models
- Agent systems
- Memory
- Retrieval
- Tool use
- Evaluations
- Safety
- Security
- Multimodal systems
- Efficient inference
- Compression
- Alignment
- Human-computer interaction
- AI regulation

Each research item should be classified as:

- Likely practical impact
- Significant theoretical contribution
- New benchmark
- New architecture
- Incremental result
- Replication
- Critical security finding
- Safety finding
- Interesting but speculative
- Needs independent verification

---

## 4.7 GitHub and Open-Source Radar

Track selected repositories for:

- Releases
- Changelog entries
- Security advisories
- Licence changes
- Repository archival
- Contributor growth
- Star growth
- Issue activity
- Maintenance health
- Breaking changes
- New competing projects

Potential categories:

- MCP
- Agents
- Coding assistants
- Model runtimes
- Local inference
- Vector databases
- Evaluation frameworks
- Guardrails
- Observability
- AI security
- Memory systems
- Orchestration
- Prompt tooling

---

## 4.8 Community Signal Feed

Potential sources:

- Hacker News
- Reddit links
- GitHub Discussions
- Lobsters
- Specialist forums
- Public newsletters
- Selected blogs
- Public social posts where permitted
- YouTube and podcasts
- User-submitted links

Community signals must be treated as:

- Discovery
- Commentary
- Bug reports
- Early warnings
- Sentiment
- Practical experience

They must not automatically become evidence.

### Reddit policy

The MVP should avoid depending on Reddit API access.

Safer initial approach:

- Allow manual or user-submitted Reddit links
- Store the URL, title, topic, and original analysis
- Avoid mirroring full posts or comments
- Use Reddit as discovery rather than factual authority
- Review Reddit API and commercial-use terms before automation
- Do not rely on unofficial scraping services

---

## 4.9 Citation-Grounded Ask Box

The ask box is a core differentiator.

Example questions:

- What is currently considered the best local coding model?
- Which model is best for 16 GB RAM?
- Which provider offers the best price-to-speed ratio?
- What is the current thinking on agent memory?
- Has model X been independently verified?
- What changed in MCP gateways this month?
- Which coding agent is most reliable?
- Is tool X genuinely open source?
- What are the current best practices for AI security?
- What is the strongest open-weight model for commercial use?

### Required answer structure

Every answer should contain:

1. Current answer
2. Why
3. Supporting evidence
4. Sources
5. Points of disagreement
6. Confidence
7. Freshness date
8. Practical recommendation
9. What could change the conclusion

The ask system should answer from retrieved, dated source material rather than unrestricted model memory.

### Ask-box modes

#### Free mode

- Limited daily questions
- Public dataset only
- Short answers
- Basic citations

#### Professional mode

- Deep multi-source research
- Longer time windows
- Custom comparison tables
- Saved research
- Export
- Alerts
- Team sharing
- User constraints and preferences
- API access

---

## 4.10 Claim Timeline

For major stories, show how the evidence developed.

Example:

- Vendor announcement
- Model card published
- Independent benchmark appears
- Contradictory test published
- Vendor clarification
- Revised conclusion

This feature makes corrections and uncertainty visible.

---

## 4.11 Corrections Ledger

Create a permanent public record of:

- Factual corrections
- Changed trust ratings
- Updated benchmark results
- Removed claims
- Superseded recommendations
- Pricing corrections
- Licence corrections
- Editorial mistakes

Each correction should show:

- Previous statement
- Updated statement
- Reason
- Date
- Evidence
- Impact on any ranking or recommendation

---

## 4.12 Marketing Versus Evidence

For major launches, compare vendor claims against available evidence.

Example fields:

- Vendor claim
- Supporting evidence
- Independent evidence
- Contradictory evidence
- Current assessment
- Confidence
- Last checked date

---

## 4.13 Personalisation

Users should eventually be able to select an interest profile:

- Developer
- Local-model user
- Small business
- Researcher
- Enterprise buyer
- Content creator
- Security professional

The system can then show:

- More relevant stories
- Role-specific explanations
- Custom briefings
- Suggested tools
- Watchlists
- Alerts

---

## 4.14 Watchlists and Alerts

Users should be able to follow:

- Models
- Providers
- Benchmarks
- Repositories
- Companies
- Topics
- Pricing thresholds
- Licence changes
- API deprecations
- Security incidents
- Regulatory changes

Delivery options:

- Email
- Web notifications
- RSS
- Digest
- Webhook later

---

## 4.15 Decision Pages

These should be designed for both usefulness and search traffic.

Examples:

- Best coding models for a limited budget
- Best local models by RAM
- Best models for tool use
- Best providers for UK and EU businesses
- Best open-weight models for commercial use
- Current MCP gateway comparison
- Current AI memory system comparison
- Best model router
- Best model for structured output
- Best private AI stack
- Best AI API for a startup

Decision pages must disclose:

- Date
- Methodology
- Evidence
- Affiliate relationships
- Limitations
- Whether results are independently verified

---

## 5. Trust and Evidence Framework

## 5.1 Source Classes

Suggested hierarchy:

1. Official primary source
2. Peer-reviewed or formal research
3. Independent benchmark or test
4. Reputable technical journalism
5. Specialist analysis
6. Community report
7. Anonymous or unverifiable claim

Source class alone must not determine truth.

---

## 5.2 Evidence Dimensions

Each claim can be scored across:

- Primary-source support
- Methodology quality
- Reproducibility
- Independent corroboration
- Source independence
- Conflict of interest
- Timeliness
- Version specificity
- Claim severity
- Contradictory evidence
- Correction history

---

## 5.3 Relevance Dimensions

Relevance can consider:

- Recency
- Technical significance
- Practical impact
- Number of affected users
- Degree of change
- Security implications
- Commercial implications
- Community interest
- Uniqueness
- User-profile relevance

---

## 5.4 Public Rating Labels

Recommended labels:

- Confirmed
- Strongly supported
- Provisionally supported
- Vendor-reported
- Community-reported
- Disputed
- Unverified
- Corrected
- Superseded
- Outdated

---

## 6. Source and Ingestion Strategy

## 6.1 Initial source types

### Primary sources

- Model provider blogs
- Official documentation
- Model cards
- GitHub releases
- Security advisories
- Pricing pages
- Regulatory bodies
- Government publications
- Standards bodies

### Research

- arXiv
- Benchmark repositories
- Research organisation publications
- Independent evaluation groups

### Open-source

- GitHub API
- Project RSS feeds
- Release feeds
- Security advisory feeds

### Community

- Hacker News
- User-submitted Reddit links
- GitHub Discussions
- Specialist blogs
- Selected newsletters

---

## 6.2 Ingestion Pipeline

```text
Source registry
    ↓
Scheduled fetchers
    ↓
Raw metadata storage
    ↓
Content normalisation
    ↓
URL deduplication
    ↓
Semantic deduplication
    ↓
Story clustering
    ↓
Entity extraction
    ↓
Claim extraction
    ↓
Source classification
    ↓
Evidence analysis
    ↓
Relevance ranking
    ↓
Human review where required
    ↓
Publication
    ↓
Ongoing correction and staleness checks
```

---

## 6.3 Cost-Control Pipeline

Do not send all content directly to an expensive model.

Recommended stages:

1. Fetch metadata
2. Apply deterministic filters
3. Remove duplicates
4. Use lightweight classification
5. Cluster related stories
6. Analyse only high-value or disputed stories deeply
7. Use stronger models only for final summaries and difficult comparisons
8. Cache all outputs
9. Reuse extracted claims across pages
10. Re-check only changed or stale records

---

## 7. Suggested Technical Architecture

## 7.1 Frontend

Recommended:

- Astro
- TypeScript
- Server-rendered or statically generated content pages
- Lightweight interactive components
- Accessible responsive design
- Minimal client-side JavaScript
- Search-engine-friendly page structure

Why Astro:

- Content-heavy product
- Fast static output
- Excellent SEO
- Low hosting cost
- Easy RSS generation
- Easy hybrid rendering later

---

## 7.2 Backend

### Cheapest MVP option

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare Cron Triggers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Queues later

### Alternative

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Edge Functions
- Vector search
- Realtime

### Recommendation

Use Cloudflare for the public MVP if cost minimisation is the priority.

Use Supabase if the project quickly needs:

- Accounts
- Saved searches
- Teams
- Complex relational queries
- Advanced vector search
- Fine-grained user data

A hybrid approach is also possible:

- Astro and public content on Cloudflare
- Supabase for accounts, saved data, and paid features

---

## 7.3 Search

### MVP

- Database full-text search
- Filters
- Entity pages
- Topic pages
- Date filtering

### Later

- Hybrid keyword and semantic search
- Claim-level search
- Query rewriting
- Re-ranking
- Citation retrieval
- Historical comparison
- Personalised ranking

---

## 7.4 AI Layer

Suggested functional separation:

- Relevance classifier
- Topic classifier
- Source classifier
- Entity extractor
- Claim extractor
- Duplicate detector
- Contradiction detector
- Evidence summariser
- Briefing generator
- Question-answering synthesiser
- Recommendation engine
- Staleness reviewer

Use small models for routine classification and larger models only where synthesis or complex reasoning is required.

---

## 8. Core Data Model

Suggested entities:

- `sources`
- `source_policies`
- `feed_items`
- `documents`
- `story_clusters`
- `entities`
- `claims`
- `claim_evidence`
- `claim_conflicts`
- `models`
- `model_versions`
- `providers`
- `provider_prices`
- `benchmarks`
- `benchmark_runs`
- `benchmark_health`
- `repositories`
- `repository_events`
- `research_items`
- `recommendations`
- `briefings`
- `corrections`
- `curation_reviews`
- `user_questions`
- `answer_citations`
- `users`
- `watchlists`
- `alerts`
- `subscriptions`
- `sponsors`
- `affiliate_links`

Every factual record should include:

- Source URL
- Publication date
- Retrieval date
- Last checked date
- Source type
- Version applicability
- Evidence status
- Superseded status
- Correction status

---

## 9. MVP Scope

The MVP should prove that the site can reliably collect, classify, explain, and answer.

## 9.1 MVP Features

### Public site

- Homepage
- Main intelligence feed
- Topic pages
- Story pages
- Daily briefing
- Basic model directory
- Basic benchmark registry
- GitHub project radar
- Research feed
- Source page
- Corrections page
- About and methodology pages
- RSS feeds

### Curation

- Source registry
- Scheduled ingestion
- Duplicate detection
- Story clustering
- Source classification
- Basic evidence labels
- Manual review queue
- Correction workflow

### Ask box

- Limited public questions
- Citation-grounded answers
- Confidence label
- Freshness date
- Evidence links

### Administration

- Add or disable sources
- Review stories
- Edit summaries
- Approve major claims
- Correct records
- Pin important stories
- Mark items as superseded

### Monetisation foundation

- Newsletter signup
- Support button
- Affiliate-link disclosure system
- Sponsor slots
- Ad-placement placeholders
- Consent and privacy framework

---

## 9.2 Explicit MVP Exclusions

Do not include initially:

- Automated Reddit scraping
- Full social-media firehose
- User comments
- Complex social features
- Enterprise accounts
- White-label feeds
- Real-time minute-by-minute updates
- Running original large-scale benchmarks
- Fully autonomous publication of high-impact claims
- Native mobile app
- Heavy personalisation
- Public API
- Large historical archive
- Multiple expensive vector databases

---

## 10. Development Phases

## Phase 0 — Foundation and Documentation

Deliverables:

- Project name and domain
- Repository setup
- Product charter
- Architecture decision records
- Data model
- Source policy
- Trust methodology
- Editorial policy
- Monetisation policy
- Security model
- Privacy model
- Documentation structure
- Initial design system
- CI setup
- Issue templates
- Pull-request templates
- Contribution guide

---

## Phase 1 — Static Product Shell

Build:

- Astro site
- Homepage
- Feed layout
- Story layout
- Topic pages
- Model page template
- Benchmark page template
- Briefing page template
- Methodology pages
- Responsive navigation
- Search placeholder
- RSS generation
- SEO foundations

---

## Phase 2 — Source Registry and Ingestion

Build:

- Source registry
- RSS and API fetchers
- Scheduled jobs
- Raw item storage
- URL deduplication
- Basic metadata normalisation
- Source health monitoring
- Failed-fetch reporting
- Admin source controls

---

## Phase 3 — Curation and Trust Layer  ✅ COMPLETED 13 July 2026

Built and deployed:

- Topic classification ✅ — `classify.ts`, 16-topic rule-based taxonomy
- Source classification ✅ — Tier A/B/C + treatment labels
- Semantic deduplication ✅ — `semantic-dedup.ts`, Jaccard similarity
- Story clustering ✅ — `cluster.ts`, 3-stage entity+title pipeline
- Entity extraction ✅ — model/provider extraction in classify.ts
- Claim extraction ✅ — `extract-claims.ts`, 9 claim classes, 40+ patterns
- Evidence labels ✅ — 10-state system with OKLCH design tokens
- Conflict detection ✅ — 4 conflict types with severity assessment
- Manual review queue ✅ — Admin review page with 10-state reference
- Correction workflow ✅ — `corrections.ts`, 9 correction types
- Rating explanation panel ✅ — `RatingExplanation.astro`, 10-factor decomposable panel

---

## Phase 3B — Evidence-Linked Knowledge Base — PARTIALLY IMPLEMENTED

**Status:** Partial — 16 static records exist, but only 5 are marked published; draft stubs, durable editorial workflow, claim-level storage, revision enforcement and deployment verification remain incomplete. File or route existence is not completion.
**Dependency:** Phase 3 (Curation and Trust) is complete. The knowledge base consumes classified items, clustered stories, extracted entities, claims, and evidence relationships from the pipeline.

### Purpose

The knowledge base is a **living technical reference** in which material claims are connected to evidence, dated, scoped, reviewable, and versioned. It complements the intelligence feed: the feed answers "what changed" while the knowledge base answers "what is this technology, how does it work, and what should you consider before adopting it."

It is not a conventional open-edit wiki or a loosely sourced blog collection. Every material factual statement should be attributable to claim records with provenance, not merely to a bibliography at the bottom of a page.

### Initial subject coverage

Focused on the project owner's active technical domains:

- Model Context Protocol (MCP)
- AI agents
- Agentic workflows
- Automation
- Tool and function calling
- Agent orchestration
- Agent memory and provenance
- Context engineering
- AI gateways
- Local and open-weight models
- Coding agents and agentic IDEs
- Evaluation, tracing, and observability
- AI security
- Human approval and execution governance
- Auditability, enforceability, and policy controls

### Information architecture

Public route: `/knowledge`

First-level hubs:

| Hub | Path |
|-----|------|
| MCP | `/knowledge/mcp` |
| Agents | `/knowledge/agents` |
| Automation | `/knowledge/automation` |
| Memory | `/knowledge/memory` |
| Orchestration | `/knowledge/orchestration` |
| Tool use | `/knowledge/tool-use` |
| Security | `/knowledge/security` |
| Governance | `/knowledge/governance` |
| Local models | `/knowledge/local-models` |
| Coding agents | `/knowledge/coding-agents` |
| Evaluation | `/knowledge/evaluation` |
| Observability | `/knowledge/observability` |

### Page types

#### Core concept pages
Example: "What is the Model Context Protocol?", "What is an AI agent?", "What is agent memory?", "What is tool calling?"

#### Comparison pages
Example: "MCP vs function calling", "Agents vs workflows vs automation", "Agent memory vs ordinary application state", "Local agents vs hosted agents"

#### Architecture and implementation pages
Example: "Anatomy of an MCP host, client, and server", "Building a governed tool-execution path", "Designing memory with source provenance", "Separating orchestration from execution authority"

#### Risk and security pages
Example: "MCP security risks", "Tool poisoning", "Indirect prompt injection", "Credential exposure", "Confused-deputy failures", "Untrusted memory influencing execution"

#### Timeline and change pages
Example: "MCP specification timeline", "Major coding-agent releases", "Agent framework evolution"

#### Practical reference pages
Example: "MCP implementation checklist", "Agent evaluation checklist", "Tool-risk classification guide", "Local-model hardware guide", "Questions to ask an AI-agent vendor"

### Initial cornerstone page set (launch with 14–16 pages)

1. What is MCP?
2. MCP architecture: hosts, clients, servers, tools, resources, prompts, and transports
3. MCP security and the execution-governance gap
4. MCP vs function calling
5. What is an AI agent?
6. Agents vs workflows vs automation
7. Tool calling, function calling, and MCP
8. Agent memory: types, provenance, conflict, and decay
9. Human approval in agent systems
10. Agent orchestration and gateway architecture
11. Prompt injection, tool poisoning, and confused-deputy risks
12. Auditability vs enforceability
13. Local-agent architectures
14. How to evaluate an agent system
15. Coding agents and agentic IDEs
16. Context engineering and retrieval boundaries

### Standard knowledge page contract

Every canonical knowledge page must support:

```
Title
Canonical summary
Why the subject matters
Current status
Core concepts
Architecture or mechanism
What it does
What it does not do
Known limitations
Security and governance considerations
Implementation options
Comparisons
Timeline or significant changes
Claims and evidence
Open questions or disputed areas
Related intelligence events
Related knowledge pages
Last reviewed date
Review status
Page version
Public revision history
```

Optional: compatibility matrix, code examples, glossary, diagrams, vendor-specific behaviour, local deployment notes, legal or licensing notes, practical checklist.

### Claim-level evidence model

The system must support a direct relationship between a material claim and the evidence that supports, challenges, qualifies, or supersedes it. A bibliography alone is insufficient.

**Evidence relationship types:** supports, partially supports, qualifies, contradicts, reports, reproduces, fails to reproduce, supersedes, corrects, contextualises.

**Claim classes:** specification-defined, official vendor claim, observed implementation behaviour, independent research finding, benchmark result, community report, legal or regulatory statement, editorial synthesis, Trace Manifest inference.

**Inference labelling:** Inferences must never be presented as directly sourced facts. The distinction between evidence-supported claim and editorial inference must be visible to the reader.

### Schema additions (new tables)

```
knowledge_pages
  id, slug, title, hub, page_type, status, version,
  last_reviewed_at, reviewed_by, created_at, updated_at

knowledge_page_versions
  id, page_id, version_number, content_json, change_summary,
  created_by, created_at

knowledge_page_claims
  page_id, claim_id, relationship (supports/qualifies/challenges),
  section_id, order

knowledge_page_events
  page_id, feed_item_id, cluster_id, relationship
  (update_suggested/context_added/supersedes)
```

### Deliverables

- Astro route structure under `/knowledge/`
- Knowledge page template with standard contract sections
- Claim-to-evidence rendering component
- Page version history UI
- Review status badges
- Admin: knowledge page editor with claim linking
- Integration: feed items can propose updates to knowledge pages
- Integration: knowledge pages surface related intelligence events
- 14–16 initial cornerstone pages with real content
- SEO: structured data, breadcrumbs, sitemap entries
- Tests: claim extraction accuracy, page rendering, version integrity

### Architectural constraints

- Not a wiki: no open public editing; edits flow through review
- Not fully automated: AI may assist drafting but automated output must not become canonical without validation
- Not disconnected: the knowledge base shares entities, claims, and evidence with the feed pipeline
- Evidence-first: every material claim must have at least one evidence record before publication
- Versioned: every change produces a version record with a change summary
- Correction-friendly: errors are corrected publicly with dated revision entries, not silently overwritten

### Rejected approaches

- **Conventional blog-only publishing:** articles become stale, duplicate explanations, and do not expose claim-level provenance.
- **Open community wiki:** uncontrolled edits, inconsistent sourcing, and moderation requirements conflict with the trust model.
- **Fully automated RAG-generated reference pages:** generated prose can merge sources incorrectly, conceal uncertainty, and silently change meaning.
- **Independent knowledge base disconnected from the feed:** would duplicate evidence storage and prevent new events from identifying which pages may need revision.

---

## 4.6 TRACE Editorial Content Model

Every processed story should support distinct content layers, clearly separated per LAW-TRACE-002.

### Required article structure

Each TRACE-enhanced article must support:

1. **What happened** — A concise neutral summary.
2. **What is confirmed** — Facts independently supported by available sources.
3. **What is claimed** — Statements made by companies, authors or commentators that have not been independently demonstrated.
4. **TRACE Analysis** — Why the development matters, what may be overstated, and how it relates to earlier events.
5. **Context** — Relevant previous releases, policies, projects or market movements.
6. **Evidence and caveats** — Source list, uncertainty, missing information and conflicts.
7. **Related traces** — Connected stories, projects, people, repositories, papers and previous predictions.

### Editorial workflow

```text
Source ingestion
→ canonicalisation
→ deduplication
→ source clustering
→ claim extraction
→ neutral summary draft
→ evidence mapping
→ TRACE analysis draft
→ uncertainty review
→ human approval
→ publication
→ correction monitoring
```

### Publication controls

The system must support: reviewer identity, review timestamp, approval status, visible correction history, source count, primary-source indicator, and stale-story warning where material has materially changed.

### Content type definitions

**Source record** — Represents the original external material (canonical URL, title, publisher, author, publication date, source type, primary-source flag, content hash, trust notes).

**Story record** — The platform's own structured treatment of a source or source cluster (slug, headline, dek, source IDs, topic IDs, status, summary, TRACE analysis, context, caveats, confidence level, publication/update dates).

**Claim record** — Extractable and classifiable independently of article prose. Claim classes: reported, confirmed, claimed, inferred, analysis, unresolved, disputed. Each claim links to its story and source IDs with a confidence score.

**Correction record** — Story ID, creation date, summary, previous text, corrected text, reason.

---

## Phase 4 — Model, Provider, and Benchmark Data — PARTIALLY IMPLEMENTED

The model, provider, pricing-history, benchmark, and benchmark-run schemas and public catalogue views exist. Public catalogue queries now fail closed: only explicitly published, reviewed parent and child records are visible, so the site shows an honest empty state until editorial records pass those gates. Historical seed/extraction routes and deployment claims require a separate production review; no seeded placeholder record is treated as published evidence.

### Future follow-on: Open Model Execution Intelligence (ADR 0019)

The present catalogue is not yet an execution-intelligence system. After the required Knowledge Continuity trust and source foundation, add model-release/variant/artefact/quantisation records; versioned runtime, operating-system, hardware and performance compatibility; reviewed Guides; harness/tool/MCP tests; diagnostic records; and deterministic recommendation snapshots. Reuse the canonical source, claim, provenance, freshness, correction and retrieval records; do not introduce a parallel model-execution knowledge store. The canonical delivery sequence and Cloudflare storage/queue boundary are in [`ADR 0019`](docs/adr/ADR%200019%20TRACE%20Open%20Model%20Execution.md).

---

## Phase 5 — Ask TRACE

**Estimate:** 6–12 weeks  
**Status:** Source-grounded MVP implemented behind a disabled-by-default feature flag; desktop CI, migration, deployment, and evaluation verification remain pending
**Model governance:** ADR-0008 (DeepSeek via provider-neutral gateway, cost containment, automated-loop prevention)

Build the source-grounded question-answering system. Ask TRACE answers from the indexed evidence base rather than behaving as an unrestricted general chatbot. Per ADR-0008: the model is a replaceable drafting component — TRACE's governed corpus, citation validation, and deterministic confidence policy remain authoritative.

### Architecture (ADR-0008)

```
Browser → TRACE public API (/api/trace/ask)
  → auth/abuse checks
  → input validation
  → retrieval from approved TRACE corpus
  → evidence filtering + token budgeting
  → internal model gateway (provider-neutral)
  → DeepSeek API (server-side only, never exposed to browser)
  → structured-output validation
  → citation + claim validation
  → deterministic confidence calculation
  → response
```

**Provider-neutral gateway:** `src/ai/` directory with `provider.ts`, `model-router.ts`, `trace-model-gateway.ts`, `schemas.ts`, `validation.ts`, `usage-ledger.ts`, `budget-policy.ts`, `circuit-breaker.ts`, and `providers/deepseek.ts`. All application code calls TRACE's internal model interface — provider-specific logic is isolated.

**Initial models (ADR-0008):**
- Routine public: `deepseek-v4-flash` for Ask TRACE.
- Reviewed editorial: `deepseek-v4-pro`, restricted to approved admin/scheduled workflows with demonstrated quality benefit.
- No automatic model substitution. Deprecated aliases (`deepseek-chat`, `deepseek-reasoner`) must not be used.

### API key and secret protection (ADR-0008)

The DeepSeek API key must exist only in trusted server-side execution environments. Never: in browser JS, committed to Git, in logs, in static bundles, in client-side storage, or shared with other products. Stored as encrypted Cloudflare Worker secret (`wrangler secret put DEEPSEEK_API_KEY`). Local dev uses non-committed `.dev.vars`. Separate keys for dev/staging/production. Rotation after suspected exposure, accidental logging, collaborator departure, or security incident.

### Public endpoint design (ADR-0008)

`POST /api/trace/ask` — TRACE-owned endpoint, never calls DeepSeek directly from browser.

**Launch limits (conservative, configurable):**
- Max question length: 1,000 characters
- Max request body: 16 KB
- Max evidence excerpts: 16
- Max evidence input tokens: 12,000
- Max generated output tokens: 1,500
- Max model calls per question: 1
- Public questions per visitor per day: 3 initially
- Request timeout: bounded below platform max

**Abuse resistance:** Implemented repository controls include a server-derived, privacy-preserving daily visitor hash; persistent D1 daily quotas; one active request per visitor; durable request deduplication; atomic daily/monthly spend reservations; bounded request size and length; circuit breakers; and a disabled-by-default public feature switch. Cloudflare WAF/rate-limit rules and Turnstile are deployment follow-ups, not current repository guarantees. Caller-supplied session identifiers are not trusted.

### Financial controls (ADR-0008)

DeepSeek prepaid balance is the provider-level hard stop — not the primary security control. TRACE maintains an internal usage ledger and budget policy.

**Launch budget (configurable):**
- Daily public budget: $1.00
- Monthly public budget: $10.00
- Max estimated cost per request: $0.02
- Warning balance: $2.00 → notify admin
- Restrict balance: $0.50 → disable anonymous requests
- Stop balance: $0.10 → reject all non-essential requests
- Global kill switch: reject every model request until manually re-enabled

**Atomic reservation:** Before calling the provider, TRACE atomically reserves the worst-case estimated cost. If reservation fails, the model request must not begin. After completion, actual usage is recorded and unused budget released. This prevents concurrent workers from overspending.

### Automated-loop prevention (ADR-0008)

No model response may autonomously trigger another model request. Public Ask TRACE: strictly one provider generation per accepted request. Hard step counters on every workflow (`maxProviderCallsPerRequest`, `maxRetries`, `maxElapsedTimeMs`). Explicit retry policy by HTTP status — no generic `catch { retry(); }`. Idempotency keys with persistent request state prevent duplicate processing. Streaming (if introduced later): reconnection attaches to existing request, never creates new generation.

### Trust boundary (ADR-0008)

**Model may:** summarise supplied evidence, compare supplied claims, draft labelled analysis, identify uncertainty, propose editorial wording, generate candidate predictions for review.

**Model may not:** invent or select external evidence, access unrestricted web search, alter source trust classifications, approve its own citations, calculate final public confidence score, publish autonomously, modify the corrections ledger, call arbitrary URLs, execute code, write directly to production data, approve publication, or create additional model requests by itself.

### Post-generation validation (ADR-0008)

Before any answer is served, TRACE code must verify: every cited source ID was supplied, every cited claim ID exists, material factual statements are linked to evidence, cited evidence supports the statement, disagreements are not suppressed, analysis is labelled as analysis, dates are correct, no excluded or superseded source was used, output is complete and not truncated. Validation failure → safe non-answer or single bounded regeneration (if enabled and budgeted). Never unvalidated publication.

### Build list

- Provider-neutral model gateway (`src/ai/`) with DeepSeek adapter
- Public endpoint `POST /api/trace/ask` with full security controls
- Retrieval layer over approved TRACE corpus (evidence-bounded, not open RAG)
- Durable D1 atomic budget reservations and batched usage ledger (`src/ai/durable-governance.ts`)
- Durable circuit breakers for global, feature, provider, and model scopes
- Persistent idempotency, request state, quota, and concurrency leases
- Citation assembly with primary-source preference
- Post-generation validation pipeline (structured output, claim verification, confidence calculation)
- Answer structure with confidence labels + evidence-window display
- Rate limiting, abuse protection, query length limits
- Prompt-injection-resistant retrieval boundaries + source-content sanitisation
- Durable `ai_requests`, `ai_budget_reservations`, `ai_usage_ledger`, `ai_quota_usage`, `ai_concurrency_leases`, and `ai_circuit_breakers` records (never plaintext IP addresses or secrets)
- Global kill switch + per-feature switches (Ask TRACE, scheduled jobs, per-model)
- "Insufficient evidence" explicit non-answer handling
- Incident response procedures for key leaks, request storms, unexpected spend

---

## Phase 5B — TRACE Predicts

**Estimate:** 4–6 weeks  
**Dependency:** Phase 5 (Ask TRACE) should be substantially complete so the evidence corpus is stable enough to produce evidence-based forecasts.

TRACE Predicts is a weekly editorial forecast product — not an entertainment horoscope or vague trend section.

### Publishing cadence

- One edition per week.
- Three to five predictions per edition.
- Forecast window normally seven days.
- Occasional longer-horizon predictions clearly marked.

### Prediction record

Each prediction must record: title, prediction text, probability (0–100), forecast start/end dates, evidence source IDs, related story IDs, reasoning summary, confirmation criteria, failure criteria, status (pending/correct/partially-correct/incorrect/unresolved/invalidated), publication date, evaluation date, evaluation notes, and amendment IDs.

### Prediction quality requirements

Reject any prediction that: cannot be confirmed or disproved, has no defined time window, merely predicts that a broad trend will continue, depends on private or unverifiable information, is framed to count almost any outcome as success, contains financial advice, is materially identical to another prediction, or lacks enough evidence to justify publication.

### Workflow

```text
Weekly evidence set assembled
→ candidate signals extracted
→ candidate predictions generated
→ duplicates and vague claims removed
→ probability assigned
→ confirmation and failure criteria written
→ evidence checked
→ human review
→ prediction locked (immutable per LAW-TRACE-007)
→ publication
→ later evaluation
→ public scorecard update
```

### Public archive

The archive must show: prediction wording, original probability, publication date, forecast deadline, supporting evidence, result, evaluation notes, amendments, and related stories published after the forecast.

### Build list

- Prediction data model and storage
- Candidate generation from evidence corpus
- Review and locking workflow (immutable after publication)
- Publication page with probability indicators and evidence links
- Manual evaluation interface
- Public archive with full history
- Amendment record system (append-only, not silent edits)

---

## Phase 5C — The Trace Weekly Newsletter

**Estimate:** 3–5 weeks  
**Dependency:** Phase 5 (Ask TRACE) and Phase 5B (TRACE Predicts) provide the content that feeds the newsletter.

### Purpose

The newsletter is the recurring weekly digest and retention channel for the platform.

### Title

> **The Trace Weekly** — The week's biggest AI developments, what they mean, and what TRACE expects next.

### Edition structure

1. **The five biggest developments** — Concise summaries with links.
2. **What actually matters** — TRACE's editorial view on signal versus noise.
3. **What changed since last week** — Continuing stories and follow-up developments.
4. **Open-source watch** — Significant repositories, releases, standards and technical projects.
5. **Ask TRACE** — One selected reader question and source-grounded answer.
6. **TRACE Predicts** — Three to five forecasts for the coming week.
7. **Last week's prediction scorecard** — Outcomes and brief evaluation.
8. **From PCGsoft / project updates** — Optional and restrained.

### Subscription requirements

Explicit consent; double opt-in where practical; visible privacy notice; unsubscribe link in every message; sender identity and contact details; suppression handling; consent timestamp; no pre-ticked marketing consent; no purchased email lists; no hidden cross-marketing consent.

### Workflow

```text
Candidate stories selected
→ TRACE summaries assembled
→ editorial commentary drafted
→ prediction section inserted
→ previous predictions evaluated
→ links and citations validated
→ human review
→ test email
→ approval
→ scheduled send
→ delivery and unsubscribe metrics recorded
```

### Build list

- Subscriber database with consent tracking
- Signup, confirmation, and unsubscribe flows
- Newsletter edition data model
- Manual editorial assembly interface
- Test-send and approval workflow
- Delivery tracking and metrics
- Archive of previous editions

---

## Phase 5D — TRACE Scorecard and Calibration

**Estimate:** 2–3 weeks  
**Dependency:** Sufficient prediction history exists for meaningful aggregation (minimum ~20 evaluated predictions).

### Build list

- Aggregate prediction metrics (total, correct, partially correct, incorrect, unresolved, invalidated)
- Accuracy excluding unresolved predictions
- Performance grouped by probability band
- Formal calibration metric (e.g. Brier score) when enough data exists
- Public methodology page explaining scoring and partial/invalidated outcomes
- Independent verifiability: results must be checkable from the archive

---

## Phase 5E — Live Publication and Frontend Data Wiring

**Estimate:** 5–10 working days  
**Status:** Publication boundary, D1-backed public queries, briefings, and corrections are implemented in the repository; desktop migration/CI and Cloudflare deployment verification remain pending
**Dependency:** The ingestion, clustering, and catalogue schemas must be migrated and verified before production publication is enabled. Phase 5E does not depend on Ask TRACE being enabled — it provides the canonical public content layer that Ask TRACE, TRACE Predicts, and the newsletter consume.

### Purpose

Connect The Trace Manifest's public Astro frontend to the live Cloudflare D1 intelligence database while preserving the platform's editorial, evidence, and publication boundaries. This phase converts the current static demonstration shell into a genuinely live intelligence platform.

It must not expose raw ingestion records merely because they exist in D1.

### Problem

The ingestion Worker is collecting, classifying, and deduplicating source material in D1, but the public-facing Astro pages continue to render hardcoded demonstration content. Affected surfaces: `/`, `/feed`, `/stories/[slug]`, `/topics/[slug]`, `/briefing/daily`, `/briefing/weekly`, RSS. Newly ingested material never reaches the public site, and hardcoded story URLs and evidence data diverge from the live platform.

### Architectural decision

Astro uses Cloudflare server output so D1-backed and access-controlled routes execute on demand. Editorial assets that do not need runtime state remain simple content routes. The deployment target remains Astro 5 on Cloudflare Pages; successful production deployment is not asserted until the desktop verification and rollout checklist passes.

### Publication boundary

Raw ingestion is not equivalent to publication. The public frontend must never render arbitrary rows from `feed_items`. The pipeline stages must remain distinct: ingestion → classification → deduplication → clustering → evidence evaluation → human review → deliberate publication. Every public query must fail closed — unpublished, rejected, archived, duplicate, or review-pending records must not become public through fallback behaviour.

### Public story model

Create a clear public publication model. Preferred: a `published_stories` table with `id`, `cluster_id`, `slug`, `headline`, `summary`, `editorial_analysis`, `why_it_matters`, `topic`, `evidence_status`, `publication_status`, `reviewed_by`, `reviewed_at`, `published_at`, `updated_at`. Alternative for MVP: extend `story_clusters` with stable slug and editorial presentation fields, preserving a distinguishable boundary between machine-generated clustering and public editorial output.

### Database work

Add or confirm: stable unique story slugs, public summary and editorial-analysis storage, publication state and timestamp, review timestamp and reviewer identity, topic slug mapping, indexes covering publication status/date/topic/slug, deterministic primary-source identification per cluster, published briefing records, and safe handling of corrections and superseded stories. All queries use prepared statements — no ad hoc SQL in page files.

### Cloudflare and Astro integration

1. Install and pin a Cloudflare adapter version compatible with Astro 5 and Cloudflare Pages.
2. Add the adapter to `astro.config.ts`.
3. Retain Astro's static default output.
4. Mark only live routes with `export const prerender = false`.
5. Add the existing TRACE D1 database as a binding to the Pages project (local, preview, production).
6. Add TypeScript declarations for the Cloudflare runtime and D1 binding.
7. All D1 access runs in the server-rendered Astro layer — never exposed to browser-side JavaScript.

### Shared public data layer

Create `src/lib/server/public-data.ts` — a typed server-only module exposing functions: `getPublishedStories`, `getPublishedStoryBySlug`, `getPublishedStoriesByTopic`, `getPublishedTopics`, `getLatestPublishedBriefing`, `getPublishedBriefingByDate`, `getPublishedSourcesForStory`, `getCorrectionsForStory`, `getRelatedStories`. Pages consume typed public view models, not raw D1 row shapes. The module applies the publication gate, normalises dates, parses JSON defensively, rejects malformed records, limits returned fields, supports pagination, provides predictable empty states, and logs operational errors without leaking implementation details.

### Route implementation

**`/feed`** — Replace hardcoded array with published stories ordered by publication date. Add topic filtering, evidence-status filtering, cursor-based pagination, stable story links, source-count display, publication and last-checked dates, and a proper empty state. Must not silently substitute placeholder stories when D1 is unavailable.

**`/stories/[slug]`** — Remove hardcoded `getStaticPaths()`. Resolve slug at request time. Render: headline, summary, TRACE editorial analysis, why it matters, evidence status, source classification, published/last-checked dates, supporting sources, related entities, claims and evidence, conflicts, corrections, related published stories. Return 404 for nonexistent, unpublished, or withdrawn slugs. Withdrawn/superseded stories may remain visible when required by corrections policy but must be clearly labelled.

**`/topics/[slug]`** — Resolve dynamically. Display only published stories. Support topic description, latest developments, evidence-status summary, pagination, empty topic state, stable canonical URLs.

**`/briefing/daily` and `/briefing/weekly`** — Load latest published briefing or specific requested date. Do not construct an apparently editorial briefing by listing raw recent items. When no briefing is published, show honest empty state.

**Homepage** — Replace hardcoded "latest" content with bounded selection of published stories and latest published briefing. Must remain usable if dynamic content component fails.

**RSS** — Generate from the same published-story contract used by `/feed`. Must not contain raw, review-pending, or unpublished records.

### Caching

Apply bounded edge caching: feed/topic pages (short cache), story pages (longer cache with revalidation), corrections/withdrawn content (very short cache or invalidation), briefings (cache according to publication cadence).

### Relationship with Ask TRACE

Phase 5E must be completed before the public Ask TRACE frontend is considered complete. Ask TRACE uses the same canonical public data contracts for story metadata, evidence labels, source citations, corrections, publication state, and stable URLs. Where Ask TRACE cites material not yet a published TRACE story, the response must identify it as source material rather than presenting it as an established TRACE conclusion.

### Security requirements

No D1 queries in browser-delivered JavaScript. No administrative endpoints exposed through public page code. No reliance on URL parameters as trusted SQL input. All limits and filters bounded server-side. Prepared statements for every user-influenced value. Public query functions explicitly select fields — no `SELECT *`. No raw metadata JSON exposed by default. No unpublished story leakage through related-content queries. No fallback to first available story when slug is invalid. Database failures must not reveal SQL, table names, or binding details. Public source URLs validated before rendering.

### Testing requirements

**Data-layer:** published stories returned, unpublished/review-pending/rejected/archived excluded, topic filters cannot cross publication boundaries, pagination deterministic, invalid JSON does not crash routes, SQL-injection strings treated as values, corrections remain attached to correct story.

**Route:** `/feed` renders live data, new published story appears without rebuild, `/stories/[slug]` resolves valid published story, invalid/unpublished slugs return 404, topic pages contain only matching published stories, briefing pages use only published briefings, empty states honest and usable, RSS matches public feed contract.

**Deployment:** local/preview/production D1 bindings work, static pages remain prerendered, dynamic pages execute through Cloudflare runtime, existing sitemap/theme/navigation/accessibility intact.

### Acceptance criteria

1. Public feed content originates from D1.
2. Newly published stories appear without a site rebuild.
3. Raw ingestion records cannot leak onto public pages.
4. Story pages use stable live slugs.
5. Invalid and unpublished stories return correct 404 responses.
6. Topic pages use live published data.
7. Daily and weekly briefings use published briefing records.
8. Homepage and RSS use the same public story contract.
9. Static trust and methodology pages remain static.
10. Preview and production bindings work correctly.
11. Automated tests cover publication-boundary failures.
12. Placeholder stories and hardcoded public feed arrays are removed.
13. Ask TRACE can reuse the resulting public data layer.

### Recommended delivery order

1. **5E.1** — Publication contract and schema (public story model, publication gate, indexes, migrations)
2. **5E.2** — Astro runtime integration (Cloudflare adapter, D1 binding, runtime types, static-first)
3. **5E.3** — Typed public data layer (`src/lib/server/public-data.ts` with tests)
4. **5E.4** — Feed and story routes (`/feed`, `/stories/[slug]`)
5. **5E.5** — Topics, briefings, homepage, and RSS
6. **5E.6** — Cache, failure, and security testing
7. **5E.7** — Ask TRACE integration (wire frontend to canonical live content contracts)

---

## Phase 6 — Accounts and Personalisation

Build:

- Authentication
- Saved questions
- Watchlists
- Topic preferences
- Custom briefings
- Alerts
- User history
- Supporter plan
- Professional plan

---

## Phase 7 — Monetisation Expansion

**Governing decision:** ADR 0011. This phase is deferred until launch stability and explicit approval. Commercial values must remain structurally inaccessible to evidence, confidence, ranking and retrieval code. Ad networks, behavioural tracking, paid editorial inclusion and automatic affiliate insertion require separate review and are not implied by this phase heading.

Build:

- Direct sponsorship manager
- Affiliate-link manager
- Ad network integration
- Paid briefings
- Professional research mode
- Export tools
- Team subscriptions
- Sponsored newsletter slots
- Job board
- API access

---

## Phase 8 — Advanced Intelligence

Build:

- Claim timelines
- Historical recommendation changes
- Price-change alerts
- Licence-change alerts
- Provider reliability tracking
- Model lineage
- Trend detection
- Community-signal weighting
- Contradiction maps
- Custom organisation dashboards
- White-label feeds

---

## 9. Final Product Statement

> **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence — is the source-grounded editorial intelligence layer of The Trace Manifest. It explains what happened, distinguishes evidence from claims, answers questions from the recorded source base, and publishes accountable forecasts whose results remain visible.**

### Acceptance criteria for the TRACE add-on

The TRACE add-on is complete when:

1. The platform uses the identity **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence**.
2. TRACE-enhanced articles distinguish summary, claims, analysis, context and caveats.
3. Ask TRACE answers from approved indexed evidence with citations and uncertainty.
4. Predictions are evidence-linked, probabilistic, time-bounded and falsifiable.
5. Published predictions are locked and remain visible after evaluation (LAW-TRACE-007, 008).
6. A public archive shows prediction outcomes.
7. Newsletter subscription, confirmation and unsubscribe flows work.
8. The Trace Weekly can include major stories, analysis, Ask TRACE, predictions and a scorecard.
9. Generated content requires the configured review policy before publication (LAW-TRACE-009).
10. Corrections and amendments are visible and auditable.
11. Secrets, subscriber data and internal prompts are not exposed.
12. Accessibility, SEO and responsive behaviour meet the existing project standard.

---

## 10. Deliverability and Constraints

### Immediate constraints

- Solo-founder-led, AI-assisted development alongside existing projects.
- All automated content must pass human review before publication (LAW-TRACE-009).
- No fully autonomous publishing.
- No private enterprise knowledge bases in the first implementation.
- No personalised investment, medical or legal predictions.
- No unmoderated public comments or user-generated predictions.
- No paid subscriptions until Phase 6+.

### Model and API constraints (ADR-0008)

- The DeepSeek API key must never be exposed to the browser, committed to Git, included in logs, or shared with other products.
- Public clients call a protected TRACE-owned endpoint; only the server-side gateway may communicate with DeepSeek.
- Prepaid credit is the provider-level hard boundary — not the primary security control.
- No model response may autonomously trigger another model request.
- Public Ask TRACE: one provider generation per accepted request.
- No automatic model substitution without configuration review, evaluation, and auditable deployment.
- Deprecated model aliases (`deepseek-chat`, `deepseek-reasoner`) must not be used.
- Internal budget policy is authoritative: atomic reservations, daily/monthly ceilings, balance thresholds, circuit breakers, global kill switch.
- `src/ai/` gateway structure enforces provider-neutral design — all application code calls TRACE's internal interface.

### Route reservations

The following routes are reserved for TRACE features:

- `/ask-trace` — Ask TRACE question interface
- `/api/trace/ask` — Ask TRACE server-side endpoint (never exposes provider to browser)
- `/analysis` — TRACE Analysis archive
- `/predicts` — TRACE Predicts (current + archive)
- `/newsletter` — Newsletter signup and archive

---

## 11. Monetisation Strategy

## 11.1 Early Stage

Primary objective:

> Cover hosting, database, email, and AI-processing costs without compromising trust.

### Early revenue options

- Support or donation button
- Founding supporter membership
- Carefully disclosed affiliate links
- One direct sponsor
- Newsletter sponsor
- House ads for related projects
- Small paid research reports
- Limited professional ask-box plan

### Early supporter benefits

- Ad-free browsing
- More daily questions
- Saved questions
- Early access to new features
- Supporter badge
- Weekly premium summary
- Export to Markdown

---

## 11.2 Growth Stage

Add:

- Contextual technical advertising
- Direct sponsorships
- Watchlist subscriptions
- Paid alerts
- Paid newsletters
- Affiliate comparisons
- Professional research reports
- Job listings
- Data exports
- Team accounts

---

## 11.3 Mature Stage

Potential major revenue:

- Commercial data API
- White-label intelligence feeds
- Enterprise subscriptions
- Custom benchmark programmes
- Private research dashboards
- Provider monitoring
- AI procurement reports
- Security and governance research
- Consultancy and implementation leads
- Research partnerships

---

## 11.4 Suggested Plans

### Free

- Public news
- Daily briefing
- Basic model pages
- Basic benchmark comparisons
- Limited ask-box use
- Basic alerts

### Supporter — approximately £3–£5/month

- Ad-free
- More questions
- Saved history
- Watchlists
- Weekly supporter briefing
- Markdown exports

### Professional — approximately £10–£20/month

- Deep research
- Longer date ranges
- Custom comparisons
- Advanced alerts
- CSV and PDF exports
- Priority processing
- Personalised recommendations

### Team — approximately £40–£100/month

- Shared workspaces
- Team watchlists
- Shared research
- Admin controls
- Higher usage limits
- Webhooks
- Team exports

### Enterprise — custom

- Private feeds
- API
- White-label dashboards
- Custom monitoring
- Procurement research
- SLA and support

---

## 11.5 Advertising Rules

- Ads must be clearly labelled
- Sponsored stories must be visually distinct
- Sponsors buy visibility, never conclusions
- Ad buyers cannot alter rankings
- Affiliate relationships must be disclosed
- Rankings must show when top results have no affiliate relationship
- No hidden native advertising
- No pay-to-remove-negative-findings
- No sponsored benchmark score manipulation
- Publish a commercial independence policy

---

## 12. Legal, Privacy, and Compliance

The project should include:

- Privacy policy
- Cookie policy
- Terms of use
- Editorial policy
- Corrections policy
- Affiliate disclosure
- Sponsorship policy
- Copyright and takedown process
- Source-use policy
- Data retention policy
- AI-generated-content disclosure
- Automated-decision disclaimer
- User-submission policy
- Abuse-reporting process

### Important source-handling rules

- Store metadata and original analysis rather than complete copied articles
- Use short excerpts only where permitted
- Link prominently to original sources
- Respect robots, API terms, and licensing
- Track source-specific restrictions
- Maintain removal and correction workflows
- Avoid scraping where official feeds or APIs exist
- Review commercial-use terms before monetising API-derived content

---

## 13. Security Requirements

- Strong admin authentication
- MFA for privileged users
- Role-based admin permissions
- Secure secret storage
- Source-input sanitisation
- HTML sanitisation
- URL validation
- SSRF protection
- Rate limiting
- Prompt-injection resistance
- Retrieval isolation
- Audit logs
- Backup and restore
- Dependency scanning
- Security headers
- Content Security Policy
- Abuse detection
- API key rotation
- No direct model access to unrestricted admin actions

### AI-specific threats

- Prompt injection in articles
- Malicious repository content
- Fake benchmarks
- Source impersonation
- Citation laundering
- Coordinated influence campaigns
- Vendor manipulation
- Poisoned community submissions
- Hidden affiliate bias
- False corroboration from syndicated press releases

---

## 14. Required Documentation From the Start

This project should avoid the documentation gaps that appeared in other repositories.

Create and maintain the following from Phase 0.

## 14.1 Root Documentation

- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `LICENSE`
- `GOVERNANCE.md`
- `SUPPORT.md`
- `RELEASING.md`
- `TESTING.md`
- `DEPLOYMENT.md`
- `OPERATIONS.md`
- `TROUBLESHOOTING.md`
- `STYLE_GUIDE.md`
- `ACCESSIBILITY.md`

---

## 14.2 Product Documentation

Create:

- `docs/product/vision.md`
- `docs/product/personas.md`
- `docs/product/use-cases.md`
- `docs/product/mvp-scope.md`
- `docs/product/feature-roadmap.md`
- `docs/product/monetisation.md`
- `docs/product/success-metrics.md`
- `docs/product/non-goals.md`

---

## 14.3 Architecture Documentation

Create:

- `docs/architecture/system-overview.md`
- `docs/architecture/components.md`
- `docs/architecture/data-flow.md`
- `docs/architecture/data-model.md`
- `docs/architecture/ingestion-pipeline.md`
- `docs/architecture/search-and-retrieval.md`
- `docs/architecture/ai-curation.md`
- `docs/architecture/deployment-topology.md`
- `docs/architecture/scaling.md`
- `docs/architecture/failure-modes.md`

---

## 14.4 Trust and Editorial Documentation

Create:

- `docs/trust/source-classification.md`
- `docs/trust/evidence-scoring.md`
- `docs/trust/relevance-ranking.md`
- `docs/trust/conflict-detection.md`
- `docs/trust/corrections-policy.md`
- `docs/trust/editorial-independence.md`
- `docs/trust/benchmark-methodology.md`
- `docs/trust/affiliate-and-sponsor-policy.md`
- `docs/trust/human-review-policy.md`
- `docs/trust/uncertainty-labels.md`

---

## 14.5 Source Documentation

Create:

- `docs/sources/source-registry.md`
- `docs/sources/source-acceptance-policy.md`
- `docs/sources/api-and-licence-register.md`
- `docs/sources/reddit-policy.md`
- `docs/sources/social-media-policy.md`
- `docs/sources/content-retention.md`
- `docs/sources/takedown-process.md`
- `docs/sources/source-health.md`

---

## 14.6 Security Documentation

Create:

- `docs/security/threat-model.md`
- `docs/security/prompt-injection.md`
- `docs/security/source-poisoning.md`
- `docs/security/admin-security.md`
- `docs/security/data-protection.md`
- `docs/security/incident-response.md`
- `docs/security/secrets-management.md`
- `docs/security/dependency-security.md`

---

## 14.7 Operations Documentation

Create:

- `docs/operations/runbook.md`
- `docs/operations/source-failures.md`
- `docs/operations/reprocessing.md`
- `docs/operations/corrections.md`
- `docs/operations/backups.md`
- `docs/operations/monitoring.md`
- `docs/operations/cost-controls.md`
- `docs/operations/release-process.md`
- `docs/operations/disaster-recovery.md`

---

## 14.8 API Documentation

When APIs exist:

- `docs/api/overview.md`
- `docs/api/authentication.md`
- `docs/api/rate-limits.md`
- `docs/api/models.md`
- `docs/api/providers.md`
- `docs/api/benchmarks.md`
- `docs/api/claims.md`
- `docs/api/errors.md`
- `docs/api/versioning.md`

---

## 14.9 ADRs

The canonical accepted set is indexed in `docs/adr/README.md`:

- ADR 0001 — Record architecture decisions;
- ADR 0002 — Product name and domains;
- ADR 0003 — Initial technical direction;
- ADR 0004 — Human review boundary;
- ADR 0005 — Commercial independence;
- ADR 0006 — Database validation and migration triggers;
- ADR 0007 — Early Ask validation (historical implementation);
- ADR 0008 — Model API, provider security and cost containment;
- ADR 0009 — Governed social signals and linked-source discovery;
- ADR 0010 — Editorial scope, curated products and governed automatic publication;
- ADR 0011 — Advertising, sponsorship and affiliate implementation;
- ADR 0012 — Durable controls, Access administration and publication boundaries;
- ADR 0013 — TRACE Guides, TRACE Lab and Ask knowledge integration;
- ADR 0014 — Context-preserving sharing, snapshots and preview integrity.
- ADR 0015 — Unified editorial intake, TRACE Desk and controlled taxonomy;
- ADR 0016 — Governed Ask TRACE research, source admission and knowledge promotion;
- ADR 0017 — Knowledge Builder, question-gap queue and knowledge-document lifecycle;
- ADR 0018 — Multilingual source ingestion, translation provenance and bilingual publication; and
- ADR 0019 — Open Model Execution Intelligence and Cloudflare data architecture.

Do not reuse an existing number or create a differently titled parallel record. Amend the index and all affected plans whenever a new ADR is accepted or renumbered.

---

## 15. Testing Strategy

Required test categories:

- Unit tests
- Integration tests
- Ingestion tests
- Parser tests
- Duplicate-detection tests
- Trust-score tests
- Citation tests
- Staleness tests
- Correction-workflow tests
- Security tests
- Prompt-injection tests
- Source-poisoning tests
- Rate-limit tests
- Accessibility tests
- SEO tests
- End-to-end tests
- Cost regression tests

### Golden datasets

Maintain curated datasets for:

- Duplicate stories
- Syndicated press releases
- Conflicting claims
- Fake benchmarks
- Corrected stories
- Outdated prices
- Version mismatches
- Social rumours
- Prompt injection
- Misleading vendor claims

---

## 16. Success Metrics

### Product quality

- Percentage of stories with primary sources
- Percentage of claims with citations
- Correction rate
- Time to correction
- Percentage of answers with freshness dates
- Citation validity
- Duplicate reduction
- Human-review rate
- User trust rating

### Engagement

- Daily active users
- Returning visitors
- Newsletter subscribers
- Ask-box usage
- Watchlists created
- Briefing open rate
- Decision-page traffic

### Commercial

- Infrastructure cost
- AI cost per answer
- Revenue per thousand visits
- Affiliate conversion
- Supporter conversion
- Professional conversion
- Sponsor renewal
- Net operating margin

---

## 17. Potential New Features

Later possibilities:

- Browser extension showing evidence ratings beside AI claims
- Public API
- MCP server for AI intelligence retrieval
- Slack or Discord briefing bot
- GitHub bot commenting on model or dependency changes
- “Ask this article” tool
- Saved comparison workspaces
- Model-change diff pages
- Provider outage history
- AI pricing calculator
- Hardware recommendation calculator
- Licence compatibility checker
- Open-source authenticity checker
- Benchmark comparability checker
- Vendor claim tracker
- Public prediction and follow-up ledger
- Expert contributor programme
- Community evidence submissions
- Verified researcher profiles
- Dataset download portal
- Embeddable model cards
- Embeddable benchmark tables
- White-label widgets
- Public methodology version history
- AI ecosystem map
- Quarterly state-of-AI reports
- Curated tool collections
- “What changed since I last visited?”
- Personal research notebook
- Audio daily briefing
- Podcast summary feed
- Mobile PWA
- Regional regulation tracker
- UK and EU AI business guidance

---

## 18. Product Name

**Decision:** The product name is **The Trace Manifest**. See [ADR 0002: Product Name and Domains](docs/adr/0002-product-name-and-domains.md).

### Rationale

"Trace" represents provenance, citations, auditability, correction history, and evidence trails.

"Manifest" represents a structured, current record of claims, models, benchmarks, sources, and changes.

The name does not claim absolute truth and can expand beyond news aggregation.

### Domains

- Primary: `thetracemanifest.com`
- UK: `thetracemanifest.uk` (redirects to canonical `.com` unless later used for a specific UK service)

### Naming criteria (for reference)

The name was selected against the following criteria:

- Domain availability ✓
- UK trademark availability
- GitHub organisation availability
- Social handle availability
- Pronunciation and spelling clarity
- International meaning
- Search-engine distinctiveness
- Avoiding confusion with existing AI products
- Ability to expand beyond news aggregation

### Historical context

Earlier naming exploration included themes around signal/intelligence (SignalAtlas, SignalIndex), evidence/verification (EvidenceWire, ClaimLedger), navigation (ModelCompass, AI Compass), current awareness (AI Current, Frontier Current), and classical references (Argus Signal, Aletheia AI). The full brainstorm is preserved in the commit history of this document.
---

## 19. Recommended First Build

The most sensible first release should include:

1. Server-rendered Astro site with truthful empty states.
2. Durable D1 publication, quota, budget, idempotency, audit and correction controls under ADR 0012.
3. A small approved high-signal AI & Agents source registry.
4. Verified ingestion, deduplication, clustering, evidence classification and failure reporting.
5. Manual review and attributable publication workflow.
6. Fifteen to twenty source-backed AI & Agents stories or briefings.
7. Public feed, story, methodology, source-policy, corrections and about pages.
8. Citation-grounded one-off Ask TRACE with safe insufficient-evidence responses, disabled until launch gates pass.
9. Administrator-only social discovery under ADR 0009.
10. Basic consent-based newsletter signup.
11. Six complete, reviewed TRACE Guides as the first expansion under ADR 0013.

Do not require broad technology verticals, automatic publication, Spotlight, App Radar, full Open Source Radar, commercial activation, public snapshots, public Ask sharing or automated social posting for the first release.

Recommended hosting:

- Cloudflare Pages
- Workers
- D1
- Cron Triggers
- R2 where necessary

Recommended development principle:

> Build a useful editorial system first, then progressively automate it.

---

## 20. Immediate Next Actions

1. ~~Choose a working name~~ → **Done.** The Trace Manifest (ADR-0002)
2. ~~Check domain, trademark, GitHub, and social availability~~ → Domains registered (`thetracemanifest.com`, `.uk`); trademark, GitHub org, and social handles in progress
3. ~~Create repository~~ → **Done.** `github.com/hourwise/The-Trace-Manifest`
4. ~~Add all Phase 0 documentation~~ → **Done.** 20 docs across 7 directories
5. ~~Record and reconcile architecture decisions~~ → **Done.** Canonical ADR set 0001–0014 indexed in `docs/adr/README.md`
6. ~~Finalise source list~~ → **Done.** 65 named sources across 6 sections in `docs/sources/source-registry.md`
7. ~~Define trust labels~~ → **Done.** Evidence label system (6 states) implemented in Phase 1 shell
8. ~~Define MVP data model~~ → **Done.** Entity list and provenance rules in `docs/architecture/initial-data-model.md`
9. Build the Astro shell → **Implemented in repository;** server-rendered routes require desktop and deployment verification
10. Add RSS and GitHub ingestion → **Implemented in Worker source;** connector outcomes, migrations, schedules, and production bindings require deployment verification
11. Add manual editorial workflow → **Implemented behind Cloudflare Access and signed first-party admin routes;** production Access policy and secrets require rollout verification
12. Add model and benchmark records → **Schema and reviewed-publication views implemented;** genuine editorial records and an admin publication workflow remain pending
13. Add daily briefing generation → **Reviewed publication and D1-backed rendering implemented;** live scheduling/content verification remains pending
14. Add citation-grounded Ask prototype → **Grounded MVP implemented at `/ask-trace`, disabled by default;** the former curated mock-answer routes now redirect and no longer present fixtures as live answers
15. Add supporter and newsletter foundations
16. Verify every ADR 0012 migration, Access, origin, audit, publication and Ask TRACE deployment gate in a non-production environment
17. Seed and review 15–20 source-backed AI & Agents stories without invented history or filler
18. Complete and review six TRACE Guides under ADR 0013 before exposing prominent Guide navigation
19. Add administrator-only social discovery with separate linked-source provenance under ADR 0009
20. Keep ADR 0010 expansion, ADR 0011 commercial activation and ADR 0014 public sharing features disabled until their explicit gates are approved

### 20.1 Atomic launch task queue for lower-capability models

These tasks apply the mandatory contract in Section 2.10. Complete only one task ID per work unit. The ordering states dependency; it does not grant authority to deploy, migrate production, change secrets or enable a public feature.

| Task ID | One bounded outcome | Completion evidence |
|---|---|---|
| LAUNCH-01 | Produce a repository-state and launch-gap audit against ADR 0012 and the revised launch scope. | **Complete with launch-blocking findings:** `docs/audit/launch-01-repository-state-and-launch-gap-audit.md` records branch, migrations, bindings, fail-closed feature controls, content boundaries, local results and unverified remote state. No remote action was taken. |
| LAUNCH-02 | Run the clean local validation gate without fixing unrelated failures. | **Complete with a release blocker:** Node 24.12.0 `npm ci` and `npm run ci` passed on 15 July 2026; the separately required production dependency audit found three high-severity findings. Exact status is in `TESTING.md` and the LAUNCH-01 audit. |
| LAUNCH-03 | Prepare the non-production migration run sheet. | **Prepared and reviewed:** `docs/operations/non-production-d1-migration-run-sheet.md`. It documents backup, migration order, verification queries, rollback limits and human approval; no remote migration has been applied. |
| LAUNCH-04 | Apply and verify migrations in non-production only after explicit approval. | **Complete for the D1-only scope:** `docs/audit/launch-04-non-production-d1-migration-evidence.md` records the external backup, ordered schema application, durable-control and fail-closed checks. Preview deployment smoke tests remain blocked by LAUNCH-05R. Stop before production scheduling. |
| LAUNCH-05 | Audit Cloudflare Access, bindings, origins and role allowlists without exposing secrets. | **Complete with launch-blocking findings:** `docs/audit/launch-05-cloudflare-configuration-audit.md`. Missing configuration is recorded without plaintext secrets. Continue with LAUNCH-05R. |
| LAUNCH-05R | Repair the Access, D1 binding and Pages-to-Worker control plane only after explicit operator approval. | **Technically complete; one human browser check remains:** a backup and Time Travel recovery point were captured, then the legacy claims/evidence and missing catalogue forward repairs, stabilisation/security migration, and TRACE Desk migration were applied and verified with `quick_check`, foreign-key validation, preserved feed/cluster counts, seven sections, and exactly nine discovery sources. `main` commit `f6c8785` deployed successfully to Pages and Worker version `5954d7c4-dde2-4ac1-8110-d1dd6f2f8b81` now has the approved production D1/R2 bindings and cron schedule. Anonymous Admin/API requests are intercepted by Access and the direct unsigned Worker Admin request returns `401`; the public home returns `200`. No AI request, audit action, candidate, publication, or ingestion was initiated. See `docs/audit/launch-05r-production-d1-migration-evidence.md` and `docs/audit/launch-05r-production-deployment-evidence.md`. The named publisher must still confirm `/admin`, `/admin/sources`, `/admin/jobs`, and `/admin/review` in a browser. Do not remove the legacy secret first. |
| LAUNCH-06 | Verify anonymous, reader and publisher route boundaries. | Requires LAUNCH-05R completion. Allowed and denied cases, audit events and replay protection are demonstrated in non-production. |
| LAUNCH-07 | Recheck provider model IDs, pricing, retention, terms and account spend controls. | Dated primary-source review and required configuration changes are proposed; public AI remains disabled. |
| LAUNCH-08 | Run the authenticated Ask TRACE evaluation set. | Citation, insufficient-evidence, disagreement, quota, timeout, cost and fail-closed cases meet the approved thresholds. |
| STORY-01 | Publish one representative story through the real review workflow. | Sources, claims, evidence state, reviewer identity/time, correction path and public rendering are verified. |
| STORY-02 | Repeat STORY-01 for one additional high-signal story. | One independently reviewed record; do not bulk-generate or fabricate history. Repeat this task one story at a time until the 15–20 target is reached. |
| SOCIAL-01 | Implement or verify administrator-only social intake under ADR 0009. | Social post and linked source are separate; provenance, review and rejection behaviour are tested. |
| DESK-01 | Apply `migration-0015-editorial-desk.sql` in non-production and verify the taxonomy and nine discovery-source records. | **Complete:** `docs/audit/desk-01-worker-and-non-production-migration-evidence.md` records backup discipline, successful preview migration, table/taxonomy/source verification, and the explicit absence of a production D1 change. |
| DESK-02 | Verify TRACE Desk route boundaries and manual candidate intake. | **Complete in non-production:** Cloudflare Access protected the Preview Desk, and the approved publisher recorded one harmless manual URL candidate. A read-only Preview D1 query confirmed its `new` state; it was not fetched, researched, or published. The production D1 remains unchanged. See `docs/audit/desk-02-route-boundary-evidence.md`. |
| DESK-03 | Run each active discovery feed through the real RSS parser and record health. | **Complete in non-production:** all eight active feeds parsed successfully (including Atom support for The Verge AI and Product Hunt) and were recorded `healthy` in preview D1; Import AI remains inactive. The parser update is deployed. Parsing is not corroboration or publication evidence. See `docs/audit/desk-03-discovery-feed-health-evidence.md`. |
| ASK-01 | Define the ADR 0016 task policy and source-role schema. | **Complete:** versioned task-policy, task-envelope and evidence-provenance types now classify external primary/independent/vendor/community and TRACE-originated records. Ask TRACE filters to admitted, current external evidence before confidence or model invocation; TRACE-derived, quarantined and stale records fail closed. Live research remains disabled. See `docs/audit/ask-01-task-policy-and-source-role-evidence.md`. |
| KNOW-01 | Add the ADR 0017 question-gap and knowledge-document migration only. | **Complete:** `migration-0016-knowledge-builder-foundation.sql` creates closed-by-default question-gap, knowledge-document, revision, provenance, relationship, and job-state records. Forward migration validation passes; no public route, research gateway, model generation, or remote D1 migration is enabled. See `docs/audit/know-01-migration-evidence.md`. |
| KC-00 | Reconcile the implemented Knowledge Builder foundation with source absorption, claim-level provenance, story memory, manual-knowledge evidence inheritance, multi-position Ask TRACE, and historical backfill. | **Complete:** documentation and contracts are reconciled. D1 `knowledge_documents` is the canonical runtime knowledge path; legacy `knowledge_pages`/static TypeScript pages are compatibility-only; ADR 0016 evidence/conclusion modes, claim-relative roles, legacy cutover, cross-store recovery, embedding/PDF/ADR 0018 boundaries, assertion-level citations, and score calibration gates are locked. See [`docs/audit/kc-00-decision-lock-and-status-reconciliation.md`](docs/audit/kc-00-decision-lock-and-status-reconciliation.md). |
| KC-01 | Remove trust claims and automatic upgrades that are not backed by reviewed claim-level evidence. | **Complete:** source-count-derived public labels, tier-count-only upgrades and uncalibrated public numeric scores are suppressed; expiry and unresolved-knowledge warnings are enforced. See [`docs/audit/kc-01-trust-hotfix-evidence.md`](docs/audit/kc-01-trust-hotfix-evidence.md). |
| KC-02 | Add and validate the canonical Knowledge Continuity schema, queue/outbox state and reconciliation primitives. | **Complete:** migrations 0032/0033, Preview-only producer bindings, recovery primitives and migration tests are evidenced in [`docs/audit/kc-02-schema-foundation-evidence.md`](docs/audit/kc-02-schema-foundation-evidence.md). No capture consumer or production mutation is enabled. |
| KC-03A | Refactor safe URL retrieval into a shared, audited server-side boundary. | **Complete locally:** admission, redirect revalidation, content preflight, bounded streaming and timeout behaviour are shared by triage; manual capture wiring and the Queue consumer remain deferred to KC-03E. See [`docs/audit/kc-03a-shared-source-retrieval-evidence.md`](docs/audit/kc-03a-shared-source-retrieval-evidence.md). |
| KC-03B | Add bounded deterministic HTML extraction and reuse it for triage compatibility. | **Complete locally:** title/author/date/description metadata, headings, block text, source locators, truncation and removal diagnostics are covered by regression tests. No persistence, Queue production, AI extraction, or evidence promotion is enabled. See [`docs/audit/kc-03b-html-extraction-evidence.md`](docs/audit/kc-03b-html-extraction-evidence.md). |
| KC-03C | Persist admitted source originals and deterministic extractions privately. | **Complete locally:** permitted originals/extractions are content-addressed in R2, metadata/hashes/keys are recorded in D1, repeated captures are idempotent, and the R2 reconciliation operation verifies both artefacts. Manual capture and the Queue consumer remain deferred to KC-03E. See [`docs/audit/kc-03c-private-source-capture-evidence.md`](docs/audit/kc-03c-private-source-capture-evidence.md). |
| KC-03D | Connect accepted feed items to admitted source documents and enqueue capture jobs. | **Complete locally:** feed admission creates/reuses source documents, bounded `capture_source` jobs, and idempotent Preview Queue messages after feed-row insertion; duplicate observations do not duplicate jobs and failed sends remain retryable. The production Queue binding and consumer remain deferred. See [`docs/audit/kc-03d-feed-capture-queue-evidence.md`](docs/audit/kc-03d-feed-capture-queue-evidence.md). |
| LANG-01 | Add ADR 0018 source-language and translation-provenance fields only. | **Complete:** `migration-0017-multilingual-source-provenance.sql` adds source and detected language, immutable original representation metadata, and feed-item translation provenance. Original and translation hashes must differ; a translation is attached to its original feed item and has independent-evidence weight zero. No translation, review UI, public language route, or remote D1 migration is enabled. See `docs/audit/lang-01-migration-evidence.md`. |
| GUIDE-01 | Implement or verify the ADR 0013 Guide metadata, authorship, verification and freshness contract. | **Complete:** `src/guides/contract.ts` requires named author/reviewer, version, environment, explicit safety flags, section-level external source relationships, verification and freshness dates, and manual-only publication approval. Invalid/missing metadata fails; outdated and withdrawn guides are excluded from procedural retrieval. No Guide record, route, or auto-publication path exists. See `docs/audit/guide-01-contract-evidence.md`. |
| GUIDE-02 | Complete and review “Install Node.js and npm on Windows.” | **In progress:** a manual-only, documentation-reviewed draft and independently validated command-safety records are in `docs/guides/install-node-js-and-npm-on-windows.md` and `src/guides/drafts/install-node-js-and-npm-on-windows.ts`. Official Node.js and Microsoft PATH sources, current LTS/version scope, local non-destructive verification, a PowerShell execution-policy caveat, and rollback guidance are recorded. Clean Windows installation testing, named human review, and manual publication approval remain required. See `docs/audit/guide-02-node-windows-draft-evidence.md`. |
| GUIDE-03 | Complete and review “Git and GitHub for Beginners.” | Destructive/conflict guidance, tested steps and sources are verified. |
| GUIDE-04 | Complete and review “Deploy a Static Website to Cloudflare Pages.” | Current platform steps, cost/security notes and sources are verified. |
| GUIDE-05 | Complete and review “Run a Local AI Model with Ollama.” | Hardware/version limits, security notes, tested steps and sources are verified. |
| GUIDE-06 | Complete and review “Install and Audit an MCP Server Safely.” | Permission, credential, prompt-injection and removal guidance is verified. |
| GUIDE-07 | Complete and review “Secure a New VPS.” | Lockout, firewall, SSH, update, backup and rollback warnings are verified. |
| LAUNCH-09 | Verify sitemap, navigation, search and `noindex` launch boundaries. | Empty/deferred sections are hidden, excluded or noindexed; canonical routes pass. |
| LAUNCH-10 | Produce the final launch-readiness report without enabling launch. | Every gate links to evidence; failures and skipped checks remain blocking; human launch approval is explicit. |

After any task, report the exact next task ID but do not begin it automatically. A task may be repeated only where its row explicitly permits repetition, such as STORY-02.

### 20.2 Launch evidence and run-sheet register

| Item | Current documented state | Next permitted action |
|---|---|---|
| Deployment rules | `DEPLOYMENT.md` now links the migration rehearsal and control-plane repair run sheets. AI flags remain off. | Use it as the top-level deployment checklist; do not treat it as authorisation to deploy. |
| LAUNCH-01 repository audit | Complete with blockers: production dependency audit has three high findings; remote content counts and Pages-side bindings are not locally evidenced. | Plan a reviewed dependency upgrade; do not infer remote state. |
| LAUNCH-02 local validation | CI passed on 15 July 2026 under Node 24.12.0; production dependency audit failed its high-severity gate. | Retest after the reviewed dependency remediation. |
| LAUNCH-03 migration rehearsal | Prepared and reviewed; the preview D1 database is documented as empty. | Completed by the approved LAUNCH-04 D1-only rehearsal; no production command ran. |
| LAUNCH-04 non-production D1 application | D1-only scope completed: external export, three ordered SQL files, durable-control, schema, quick-check and foreign-key evidence are recorded. Pages/Worker preview smoke checks are not evidenceable yet. | LAUNCH-05R must configure and evidence the preview control plane before LAUNCH-06 route-boundary checks. |
| LAUNCH-05 configuration audit | Complete with blockers: no Access application, missing Pages/Worker internal HMAC configuration, missing role configuration, and no evidenced preview bindings. | LAUNCH-05R using the control-plane repair run sheet. |
| LAUNCH-05R repair | Production compatibility/stabilisation/TRACE Desk migrations, the `f6c8785` Pages release, the production Worker deployment, and anonymous fail-closed checks are recorded in `docs/audit/launch-05r-production-d1-migration-evidence.md` and `docs/audit/launch-05r-production-deployment-evidence.md`. Legacy secret intentionally retained. | Named publisher confirms the four Admin browser routes; then begin LAUNCH-06 using the separate reader-only identity. |
| LAUNCH-06 boundary tests | Not started. | Run only after LAUNCH-05R, using a non-production environment and keeping AI disabled. |

The records above are evidence of documentation and audit work, not proof of deployed security controls. A lower-capability model must preserve this distinction in every progress report.

---

## 21. Final Product Positioning

The project should be positioned as:

> Not another AI news site. A current, evidence-linked intelligence platform showing what changed, what is credible, what is disputed, and what people should actually use.

Its long-term defensibility will come from:

- Historical structured data
- Transparent corrections
- Claim-level evidence
- Model and provider versioning
- Benchmark methodology
- Searchable current consensus
- Reader trust
- Commercial independence
- A reusable intelligence API
