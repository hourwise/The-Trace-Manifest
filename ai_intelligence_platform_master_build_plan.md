# AI Intelligence Platform — Master Build Plan

**Status:** Concept / Pre-build  
**Document purpose:** Define the product, architecture, MVP, roadmap, monetisation, governance, and required documentation from the beginning.  
**Product name:** The Trace Manifest  
**Primary domains:** thetracemanifest.com · thetracemanifest.uk  
**Primary goal:** Build a public AI intelligence platform that aggregates current information, evaluates evidence quality, tracks models and benchmarks, and helps users answer practical questions using dated, cited sources.

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

## Phase 3 — Curation and Trust Layer

Build:

- Topic classification
- Source classification
- Semantic deduplication
- Story clustering
- Entity extraction
- Claim extraction
- Evidence labels
- Conflict detection
- Manual review queue
- Correction workflow
- Rating explanation panel

---

## Phase 3B — Evidence-Linked Knowledge Base

**Status:** Proposed  
**Dependency:** Phase 3 (Curation and Trust) must be substantially complete before this phase begins. The knowledge base consumes classified items, clustered stories, extracted entities, claims, and evidence relationships from the pipeline.

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

## Phase 4 — Model, Provider, and Benchmark Data

Build:

- Model directory
- Provider directory
- Pricing history
- Benchmark registry
- Benchmark-run records
- Benchmark health
- Comparison tables
- “Best for” views
- Versioning and supersession

---

## Phase 5 — Ask Box

Build:

- Retrieval layer
- Citation assembly
- Answer structure
- Freshness checks
- Confidence labels
- Rate limiting
- Caching
- Abuse protection
- Query analytics
- Public question history where appropriate

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

Create an ADR folder immediately:

- `docs/adr/0001-record-architecture-decisions.md`
- `docs/adr/0002-frontend-framework.md`
- `docs/adr/0003-database-choice.md`
- `docs/adr/0004-source-ingestion-policy.md`
- `docs/adr/0005-trust-scoring-model.md`
- `docs/adr/0006-human-review-boundary.md`
- `docs/adr/0007-reddit-and-social-content.md`
- `docs/adr/0008-search-and-retrieval.md`
- `docs/adr/0009-ai-model-selection.md`
- `docs/adr/0010-monetisation-independence.md`
- `docs/adr/0011-correction-ledger.md`
- `docs/adr/0012-authentication-and-accounts.md`
- `docs/adr/0013-hosting-and-deployment.md`
- `docs/adr/0014-public-api.md`
- `docs/adr/0015-data-retention.md`

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

1. Astro public site
2. Curated feed
3. Daily briefing
4. Source registry
5. Basic evidence labels
6. Model pages
7. Benchmark pages
8. GitHub radar
9. Research feed
10. Citation-grounded ask box
11. Manual review queue
12. Corrections ledger
13. Newsletter signup
14. Supporter option
15. Affiliate and sponsor disclosure foundations

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
5. ~~Record initial ADRs~~ → **Done.** 7 ADRs (0001–0007) all accepted
6. ~~Finalise source list~~ → **Done.** 65 named sources across 6 sections in `docs/sources/source-registry.md`
7. ~~Define trust labels~~ → **Done.** Evidence label system (6 states) implemented in Phase 1 shell
8. ~~Define MVP data model~~ → **Done.** Entity list and provenance rules in `docs/architecture/initial-data-model.md`
9. ~~Build static Astro shell~~ → **Done.** 26 pages, RSS, sitemap, responsive nav, accessibility baseline
10. ~~Add RSS and GitHub ingestion~~ → **Done.** Worker built with RSS, GitHub Releases, arXiv, and Hacker News fetchers; cron schedules configured; pending Cloudflare deploy
11. ~~Add manual editorial workflow~~ → **Done.** Admin UI built (sources, jobs, review queue pages); review queue per ADR-0004
12. ~~Add model and benchmark records~~ → **Done.** Static templates built with placeholder data; full structured data in Phase 4
13. ~~Add daily briefing generation~~ → **Done.** Daily and weekly briefing templates built
14. ~~Add citation-grounded ask prototype~~ → **Done.** 20 curated Q&As on `/ask` + typed ask results detail page at `/ask/[question]` with evidence breakdown, source provenance, and posture sidebar
15. Add supporter and newsletter foundations

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
