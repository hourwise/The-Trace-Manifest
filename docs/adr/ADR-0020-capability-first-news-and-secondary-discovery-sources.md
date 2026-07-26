# ADR-0020: Capability-First News Classification and Secondary Discovery Sources

- **Status:** Proposed
- **Date:** 2026-07-26
- **Decision owners:** TRACE editorial and platform maintainers
- **Applies to:** Ingestion, source registry, clustering, editorial triage, story rendering, briefings, notifications, source audit
- **Related ADRs:** ADR-0009 to ADR-0013
- **Target milestone:** Post-launch ingestion refinement / first expansion

## Context

The Trace Manifest is intended to help readers understand what has materially changed in AI without requiring them to follow a continuous stream of announcements, social posts, videos, newsletters, benchmarks, funding stories, and repeated commentary.

Research into Manteia Prophecy, Onset, Hacker News AI, AI Search, Lev Selector, and community discussion about AI-news overload highlighted four product needs:

1. TRACE must distinguish practical capability changes from narrative churn.
2. Secondary sources such as YouTube channels and newsletters can be valuable for discovery, but must not automatically become evidence.
3. TRACE should measure whether its ingestion system misses stories surfaced by trusted curators.
4. Published stories should tell readers what they can now do, what evidence supports the claim, and what remains unclear.

The existing TRACE design already includes source ingestion, clustering, evidence taxonomy, review queues, story publication, corrections, briefings, Ask TRACE, Guides, and Predicts. This ADR extends those systems rather than creating a separate news pipeline.

## Decision

TRACE will introduce a **capability-first editorial classification layer** and a controlled **secondary discovery-source pipeline**.

The system will:

- classify relevant clusters as capability, narrative, or mixed;
- prioritise reproducible and practically meaningful capability changes;
- register approved YouTube channels, newsletters, and aggregators as discovery sources;
- require discovery-derived claims to be resolved to original or stronger sources before publication;
- surface useful external video links without treating commentary as primary evidence;
- audit TRACE coverage against selected third-party curators;
- add a reader-facing “What can I do now?” block to suitable capability stories;
- preserve “What remains unclear” and evidence-state labels in published analysis.

## 1. Editorial classification

Every publishable cluster must receive one of the following classifications.

### 1.1 Capability

A capability story reports a material change in what a person or system can do.

Examples include:

- a model or tool performing a task that was not previously practical;
- a reproducible performance improvement;
- new local-model or hardware support;
- a meaningful reduction in inference or training cost;
- a released API, model, repository, dataset, framework, or workflow;
- an independently demonstrated technique;
- a material change in access, limits, context size, latency, or deployment requirements.

### 1.2 Narrative

A narrative story primarily concerns discussion around AI rather than a newly available capability.

Examples include:

- funding and valuation;
- executive commentary;
- speculative roadmaps;
- repeated opinion cycles;
- political positioning;
- market rumours;
- social-media disputes;
- general hype without a new usable result.

Narrative stories remain valid when they materially affect regulation, access, pricing, ownership, safety, employment, market structure, or public policy.

### 1.3 Mixed

A mixed story contains both a capability change and a significant narrative or market consequence.

The editorial record must identify which claims belong to each side.

## 2. Capability-priority fields

Capability clusters will receive structured fields:

```yaml
editorial_class: capability | narrative | mixed

capability:
  new_capability: string | null
  previous_limitation: string | null
  intended_users:
    - string
  access_status: available_now | preview | waitlist | announced | unavailable | unknown
  access_requirements:
    hardware: string | null
    software: string | null
    account_or_plan: string | null
    geography: string | null
  evidence_state: demonstrated | independently_reproduced | vendor_benchmark | individual_test | demo_only | claimed | unknown
  reproducibility: reproducible | partially_reproducible | not_reproducible | unknown
  practical_impact: low | moderate | high | potentially_transformative | unknown
  durability: transient | uncertain | likely_durable | unknown
  try_it_links:
    - url: string
      label: string
      source_type: repository | documentation | model | dataset | demo | paper | official_page
```

These values are editorial metadata and must not be generated without an evidence reference or an explicit `unknown` value.

## 3. Reader-facing capability block

Suitable capability stories will include a concise block titled:

## What can I do now?

It should answer:

- what has become possible;
- who can use it;
- whether it is available now;
- required hardware, software, plan, API, or waitlist;
- whether the result is independently confirmed;
- where the reader can try or inspect it.

The block must not imply general availability when access is restricted or merely announced.

## 4. Secondary discovery sources

TRACE will add an explicit source role for sources whose primary value is finding stories rather than proving claims.

### 4.1 Source roles

```yaml
source_role:
  - primary_evidence
  - official_announcement
  - independent_reporting
  - specialist_analysis
  - discovery_aggregator
  - community_signal
  - video_commentary
  - social_signal
```

A source may hold multiple roles, but every role must be configured explicitly in the source registry.

### 4.2 Discovery-source defaults

Discovery sources will use the following default policy:

```yaml
may_trigger_cluster: true
may_add_discovery_signal: true
may_support_claim: conditional
may_confirm_claim: false
auto_publish: false
original_source_lookup_required: true
```

A discovery source may support a narrowly scoped claim about its own work, testing, observation, or interview. It may not independently confirm a broader technical claim unless editorial review promotes the source role for that claim.

## 5. Initial approved sources

### 5.1 AI Search

```yaml
name: AI Search
source_type: youtube_channel
source_role:
  - discovery_aggregator
  - video_commentary
topics:
  - ai_news
  - models
  - tools
  - research
cadence: per_upload
auto_publish: false
original_source_lookup_required: true
```

Primary use:

- high-volume story discovery;
- identifying tools, releases, and papers missed by feeds;
- optional reader-facing “Watch or listen” links;
- topic and entity extraction.

### 5.2 Lev Selector

```yaml
name: Lev Selector
source_type: youtube_channel
source_role:
  - specialist_analysis
  - video_commentary
  - discovery_aggregator
topics:
  - ai_research
  - model_capabilities
  - local_ai
  - technical_analysis
cadence: weekly
auto_publish: false
original_source_lookup_required: true
```

Primary use:

- specialist research discovery;
- technical context;
- historical comparisons;
- identifying less-visible papers, releases, and capability trends.

### 5.3 Hacker News AI

```yaml
name: Hacker News AI
source_type: newsletter
source_role:
  - discovery_aggregator
  - community_signal
topics:
  - ai_news
  - developer_tools
  - research
cadence: weekly
authority: aggregator
auto_publish: false
underlying_source: Hacker News
original_source_lookup_required: true
```

Primary use:

- weekly missed-story audit;
- comparison against community interest;
- discovery of highly discussed original links.

TRACE should ingest Hacker News directly where practical. Hacker News AI must not be treated as evidence merely because a story appeared in its newsletter.

## 6. YouTube ingestion policy

TRACE will support allowlisted YouTube channels as a distinct source type.

### 6.1 Staged processing

```text
New channel upload detected
→ ingest title, description, publication time, channel and outbound links
→ classify topic and relevance
→ compare entities and links against existing clusters
→ create or enrich a discovery candidate
→ process captions only when the candidate passes relevance thresholds
→ extract candidate claims and timestamps
→ locate original papers, repositories, documentation or announcements
→ send qualified candidates to editorial triage
```

TRACE must not download or fully process every allowlisted video by default.

### 6.2 Caption handling

- Captions may be absent, creator-supplied, or automatically generated.
- Automatically generated captions must not be treated as exact quotations without verification.
- Stored transcript material should be limited to what is operationally necessary.
- TRACE must not republish substantial transcript text.
- Extracted claims should preserve timestamps linking to the relevant video section.
- Video commentary must remain clearly attributed.

### 6.3 Quota and polling

Where the YouTube Data API is used:

- poll fixed allowlisted channel or playlist identifiers;
- avoid broad recurring search queries;
- store the latest observed video identifier and publication time;
- use incremental retrieval;
- apply retries, backoff, and quota monitoring;
- do not block the main ingestion pipeline if YouTube is unavailable.

## 7. Original-source resolution

When a discovery source identifies a potentially important story, TRACE must attempt to resolve it to stronger material, including:

1. official documentation or announcement;
2. repository, release, model card, or dataset;
3. original research paper;
4. benchmark artefact or reproducible test;
5. independent technical reporting;
6. direct statement from a relevant named participant.

The discovery candidate must be marked `unresolved` until at least one appropriate original or stronger source is attached.

```yaml
discovery_resolution:
  status: unresolved | partially_resolved | resolved | rejected
  discovered_by_source_id: string
  original_sources:
    - source_id: string
      relationship: announcement | implementation | research | benchmark | independent_test | reporting
  rejection_reason: string | null
```

Unresolved candidates may remain in an internal queue but must not be presented as confirmed news.

## 8. Coverage comparison and missed-story audit

TRACE will implement a periodic comparator job for selected discovery aggregators.

For each comparator edition or reporting window, record:

- stories already present in TRACE;
- stories detected but not promoted;
- stories entirely missed;
- stories rejected by TRACE and why;
- stories TRACE covered that the comparator omitted;
- time difference between first external appearance and TRACE detection.

Example record:

```yaml
coverage_audit:
  comparator_source_id: string
  period_start: datetime
  period_end: datetime
  matched_clusters: integer
  missed_candidates: integer
  rejected_candidates: integer
  trace_exclusive_clusters: integer
  median_detection_delta_minutes: number | null
```

A missed item does not automatically indicate failure. The audit must distinguish:

- meaningful omission;
- intentional topic exclusion;
- duplicate or low-value coverage;
- unsupported hype;
- story outside the current TRACE launch scope.

## 9. Story presentation

### 9.1 What remains unclear

Every deep analysis should include a “What remains unclear” section when material uncertainty exists.

The section must identify:

- unavailable details;
- unsupported vendor claims;
- benchmark limitations;
- access ambiguity;
- unknown pricing or licensing;
- missing independent testing;
- unresolved contradictions.

It must not be filled with generic uncertainty language solely to satisfy a template.

### 9.2 Evidence labels

Claims may be displayed with labels such as:

- Confirmed
- Corroborated
- Official claim
- Independent test
- Early report
- Community observation
- TRACE inference
- Unverified
- Unknown

The displayed label must map to the canonical evidence taxonomy rather than introduce a second incompatible system.

### 9.3 Watch or listen

Stories may include an optional “Watch or listen” section.

Each item should contain:

```yaml
media_link:
  title: string
  creator: string
  url: string
  timestamp_seconds: integer | null
  relationship: explanation | commentary | demonstration | interview | roundup
  evidence_role: none | contextual | individual_test | primary_statement
```

Links are supplemental. Their presence must not inflate the TRACE score or evidence strength unless the media itself contains admissible evidence.

## 10. Feed and briefing behaviour

### 10.1 Capability feed filter

The public feed should support filtering by:

- All
- Capability changes
- Narrative and market
- Research
- Tools and releases
- Local AI
- Policy and regulation

“Capability changes” should prioritise stories that alter practical user or developer possibilities.

### 10.2 Briefing composition

The daily or weekly briefing should:

- lead with high-impact capability changes;
- group repetitive narrative items into a single cluster;
- state when no material capability change occurred;
- avoid filling a fixed quota with low-value stories;
- end with a caught-up state when all significant items have been reviewed.

Suggested completion state:

> You’re caught up. TRACE has no remaining significant verified developments in this briefing window.

## 11. Notifications

Capability alerts should contain the minimum useful answer without requiring a click:

- what changed;
- why it matters;
- access status;
- current evidence state;
- TRACE score or assessment;
- link to the full story.

Notifications must not be sent for unresolved discovery candidates.

## 12. Ranking implications

Capability classification may influence triage priority but must not override evidence quality.

Suggested ranking factors:

```text
priority =
  significance
  × evidence_strength
  × practical_impact
  × novelty
  × scope_relevance
  × time_sensitivity
```

Narrative stories with major regulatory, economic, access, safety, or market effects may outrank ordinary capability releases.

Exact scoring weights remain an implementation detail and require calibration using editorial outcomes.

## 13. Data provenance and audit

Every derived field introduced by this ADR must retain:

- originating source identifiers;
- extraction or editorial actor;
- model/provider where applicable;
- prompt or classifier version;
- creation time;
- last review time;
- reviewer decision;
- correlation identifier;
- change history.

Automated classification must be reviewable and reversible.

## 14. Safety, copyright, and platform compliance

- TRACE must link to videos rather than rehosting them.
- TRACE must not publish substantial transcript reproductions.
- Exact quotations require verification against the media.
- Creator commentary must not be represented as independently established fact.
- Source polling and metadata use must comply with platform terms.
- Malicious text in titles, descriptions, captions, feeds, or linked pages must be treated as untrusted input.
- Discovery content must pass existing ingestion sanitisation and prompt-injection defences.
- Outbound URLs must use existing URL validation, allowlisting, and safe-rendering controls.
- No source added by this ADR receives automatic publication rights.

## 15. Implementation plan

### Phase A — Schema and registry

1. Add `editorial_class`.
2. Add capability metadata fields.
3. Add secondary source roles and discovery policies.
4. Add YouTube and newsletter source types where missing.
5. Add discovery-resolution records.
6. Add coverage-audit records.
7. Update validation schemas and migrations.
8. Add fixtures and contract tests.

### Phase B — Ingestion adapters

1. Add allowlisted YouTube channel polling.
2. Capture metadata and outbound links before captions.
3. Add selective caption processing.
4. Add Hacker News AI newsletter or page comparator ingestion.
5. Ensure Hacker News direct ingestion remains the preferred underlying source.
6. Add retry, backoff, deduplication, and quota telemetry.

### Phase C — Classification and resolution

1. Implement capability, narrative, and mixed classification.
2. Add confidence and reason codes.
3. Add original-source lookup tasks.
4. Prevent unresolved discovery candidates from reaching publication.
5. Add human review controls to correct classifications.
6. Record all changes in the editorial audit trail.

### Phase D — Editorial interface

1. Add discovery candidate queue.
2. Display who or what discovered each candidate.
3. Display unresolved source requirements.
4. Add capability metadata editor.
5. Add “What can I do now?” preview.
6. Add “What remains unclear” editor.
7. Add “Watch or listen” timestamped links.
8. Add missed-story audit view.

### Phase E — Public experience

1. Add capability feed filter.
2. Render capability blocks.
3. Render evidence labels.
4. Render “What remains unclear”.
5. Render “Watch or listen”.
6. Add caught-up briefing state.
7. Update notification templates.

### Phase F — Evaluation

1. Run the comparator for at least four weeks.
2. Review missed and intentionally rejected stories.
3. Measure detection and resolution latency.
4. Review false capability classifications.
5. Review whether secondary-source discovery improves coverage.
6. Adjust ranking weights only after documented evaluation.

## 16. Acceptance criteria

This ADR is implemented when:

- [ ] Every publishable cluster can be classified as capability, narrative, or mixed.
- [ ] Capability stories can store structured availability, evidence, reproducibility, and practical-impact fields.
- [ ] AI Search, Lev Selector, and Hacker News AI can be represented in the source registry with constrained discovery roles.
- [ ] A secondary source can trigger a discovery candidate without being treated as confirming evidence.
- [ ] Unresolved discovery candidates cannot be auto-published.
- [ ] YouTube metadata is processed before captions or full-content analysis.
- [ ] Relevant video links can be attached with timestamps and evidence roles.
- [ ] Stories can render “What can I do now?” and “What remains unclear”.
- [ ] Briefings can produce a caught-up state without filling an arbitrary story quota.
- [ ] A comparator audit identifies matched, missed, rejected, and TRACE-exclusive stories.
- [ ] All automated classifications and source-resolution changes are auditable.
- [ ] Tests cover source-role enforcement, publication blocking, deduplication, and evidence mapping.
- [ ] Copyright, source attribution, URL safety, and prompt-injection controls are validated.

## 17. Non-goals

This ADR does not:

- create a general-purpose YouTube search engine;
- make video transcripts primary TRACE content;
- permit automatic publishing from YouTube, Reddit, newsletters, or aggregators;
- replace the canonical evidence taxonomy;
- guarantee that popular community stories are important;
- require TRACE to cover every AI story;
- create the TRACE Predicts ledger;
- add native mobile applications;
- define final numerical ranking weights;
- replace human editorial review for ambiguous or high-impact claims.

## 18. Consequences

### Positive

- TRACE becomes more useful to readers overwhelmed by repetitive AI news.
- Practical capability changes become easier to discover.
- Secondary sources improve recall without weakening evidence standards.
- External curators become measurable coverage comparators.
- Readers receive clearer availability and reproducibility information.
- Video explanations can be surfaced without conflating commentary and proof.
- Briefings can optimise for completion rather than endless engagement.

### Negative

- Additional source types increase ingestion and moderation complexity.
- Caption processing may introduce quota, accuracy, and copyright concerns.
- Capability classification will require calibration and editorial correction.
- Original-source resolution adds latency before publication.
- Coverage auditing creates additional operational work.
- Some popular stories will be intentionally excluded, requiring documented reasons.

### Risks

- Capability labels could overstate weak demonstrations.
- Popular secondary sources could distort editorial priorities.
- Automatic captions could create false claims.
- Discovery-source content could contain prompt injection or malicious links.
- “What can I do now?” may become promotional if evidence requirements are weak.
- Comparator metrics could incentivise quantity over judgement.

These risks are mitigated by explicit source roles, publication blocking, provenance, human review, original-source resolution, and existing TRACE security controls.

## 19. Decision summary

TRACE will not treat every AI announcement as equally important.

It will distinguish practical capability changes from narrative churn, use approved YouTube channels and newsletters as constrained discovery inputs, resolve discovered claims to stronger original sources, and present capability stories around the question:

> What can the reader do now that they could not do before?

This decision strengthens TRACE’s purpose as an evidence-led intelligence service rather than another infinite AI-news feed.
