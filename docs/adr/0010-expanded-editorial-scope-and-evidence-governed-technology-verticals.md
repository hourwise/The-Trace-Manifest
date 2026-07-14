# ADR 0010: Expanded Editorial Scope and Evidence-Governed Technology Verticals

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Product scope, navigation, source registry, ingestion, classification, review queues, briefings, newsletters and Ask TRACE
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0005 Commercial Independence; ADR 0007 Early Ask Validation; ADR 0008 TRACE Model API
- **Review trigger:** Before activating a new vertical, materially changing homepage balance, or adding more than 25 sources to a non-AI vertical

## 1. Context

The Trace Manifest began as an evidence-linked AI intelligence platform. The existing repository already describes coverage of AI and technology news, research, open source, security, regulation and community signals.

An AI-only feed risks becoming:

- too dependent on provider announcements;
- repetitive;
- narrowly technical;
- vulnerable to hype cycles;
- dominated by low-value repository activity;
- commercially limited;
- less useful to readers whose interests span technology, energy and transport.

The TRACE method applies beyond AI:

- identify what changed;
- distinguish claims from evidence;
- show what is confirmed;
- expose uncertainty and disagreement;
- explain practical consequences;
- retain corrections.

The brand can therefore support selected adjacent and consequential technology subjects without becoming a generic gadget-news aggregator.

## 2. Decision

TRACE will broaden through **explicit evidence-governed verticals**:

1. **AI & Agents** — flagship;
2. **Technology** — consequential general technology;
3. **Green Tech & Energy**;
4. **EV & Mobility**;
5. **Security, Privacy & Regulation**;
6. **Research & Evidence** — cross-cutting;
7. **Community Signals** — cross-cutting discovery layer.

AI remains the primary editorial identity during expansion.

Public positioning:

> **The Trace Manifest is an evidence-led intelligence platform covering AI, consequential technology, cleaner energy and future mobility. Follow the evidence. Understand the change.**

## 3. Scope guardrail

TRACE is not becoming a comprehensive general technology news service.

A story qualifies when it is at least one of:

- materially consequential;
- evidence-rich;
- practically useful;
- regulatory or security significant;
- a genuine technical milestone;
- commercially or societally important;
- widely claimed but poorly evidenced;
- likely to benefit from TRACE’s verification method.

Routine promotion, minor updates and engagement-driven novelty are excluded unless they reveal a larger trend or consequence.

## 4. Vertical definitions

### 4.1 AI & Agents

Coverage includes:

- foundation and specialist models;
- open-weight ecosystems;
- coding agents;
- MCP, tool use and automation;
- model APIs and pricing;
- inference infrastructure;
- benchmarks and evaluations;
- AI safety and security;
- robotics and embodied AI;
- copyright and governance;
- enterprise deployment;
- practical best practices.

This remains the homepage anchor and first fully developed source set.

### 4.2 Technology

Coverage is limited to consequential technology:

- semiconductors and advanced computing;
- cloud and developer infrastructure;
- major open-source ecosystems;
- cybersecurity;
- privacy and digital rights;
- quantum computing;
- robotics;
- space technology;
- communications infrastructure;
- platform policy;
- major acquisitions, failures and architecture changes;
- significant consumer-platform changes.

Normally excluded:

- cosmetic device refreshes;
- rumours without evidence;
- minor app redesigns;
- shopping-list content with no independent value;
- routine venture funding;
- ordinary software commits;
- low-impact feature releases.

### 4.3 Green Tech & Energy

Coverage includes:

- batteries and energy storage;
- solar, wind, tidal and geothermal;
- grid modernisation;
- demand response;
- heat pumps and building efficiency;
- nuclear fission and fusion;
- hydrogen and alternative fuels;
- carbon capture and removal;
- low-carbon industrial processes;
- recycling and circular manufacturing;
- sustainable materials;
- climate-adaptation technology;
- agricultural and food technology where materially relevant.

TRACE must distinguish:

- theoretical proposal;
- simulation;
- laboratory result;
- prototype;
- pilot deployment;
- commercial deployment;
- scaled operation.

“Breakthrough” is not an evidence status.

### 4.4 EV & Mobility

Coverage includes:

- electric cars, vans, buses and HGVs;
- battery chemistry and packs;
- charging infrastructure and standards;
- real-world range and efficiency;
- vehicle-to-grid;
- fleet transition;
- rail and public-transport electrification;
- battery reuse and recycling;
- autonomous-driving systems;
- alternative heavy-transport fuels;
- policy, grants and taxation;
- ownership costs and repairability;
- manufacturing and supply chains.

Ordinary model launches qualify only when they introduce a material technical, economic, safety or market change.

### 4.5 Security, Privacy & Regulation

Coverage includes:

- material vulnerabilities and incidents;
- software-supply-chain security;
- AI and agent security;
- privacy enforcement;
- cyber policy;
- platform regulation;
- technology standards;
- AI, energy and transport regulation;
- consultations and enacted rules;
- licensing changes;
- critical infrastructure.

Legal and regulatory conclusions require primary documents and human review.

### 4.6 Research & Evidence

This is cross-cutting rather than isolated.

It includes:

- peer-reviewed research;
- preprints;
- replications;
- benchmarks;
- standards;
- government and intergovernmental data;
- independent testing;
- systematic reviews;
- lifecycle analyses;
- corrections and retractions.

Research pages should connect to relevant subject verticals.

### 4.7 Community Signals

Community signals are governed by ADR 0009 and never treated as confirmed merely because they are popular.

## 5. Homepage and navigation

Recommended navigation:

```text
Home
AI & Agents
Technology
Green Tech
EV & Mobility
Security & Regulation
Research
Ask TRACE
TRACE Predicts
Newsletter
```

Commercial content belongs outside the editorial taxonomy:

```text
TRACE Selects
Advertise with TRACE
```

Initial homepage curation target:

```text
AI & Agents                 40–50%
Technology                  20–25%
Green Tech & Energy         15–20%
EV & Mobility               10–15%
Security/Research           cross-cutting within the above
```

This is a guide, not a rigid quota. Weak stories must not be promoted merely to fill a category.

## 6. Shared ingestion architecture

All verticals use the same governed pipeline:

```text
Source registry
    -> scheduled or manual acquisition
    -> immutable raw-item record
    -> normalisation
    -> deterministic relevance filtering
    -> exact duplicate detection
    -> semantic duplicate detection
    -> story clustering
    -> vertical and topic classification
    -> entity and claim extraction
    -> evidence classification
    -> vertical-specific admission rules
    -> editorial review
    -> publication
    -> correction and staleness monitoring
```

Raw ingestion does not equal publication.

## 7. Schema changes

```ts
type EditorialVertical =
  | "ai-agents"
  | "technology"
  | "green-tech-energy"
  | "ev-mobility"
  | "security-privacy-regulation";

type CrossCuttingDesk =
  | "research-evidence"
  | "community-signals";

type DevelopmentStage =
  | "theoretical"
  | "simulation"
  | "laboratory"
  | "prototype"
  | "pilot"
  | "early-commercial"
  | "commercial"
  | "scaled"
  | "unknown";
```

Source additions:

```ts
interface SourceVerticalProfile {
  primaryVertical: EditorialVertical;
  secondaryVerticals: EditorialVertical[];
  crossCuttingDesks: CrossCuttingDesk[];

  sourceRole:
    | "primary-official"
    | "primary-technical"
    | "primary-research"
    | "regulatory"
    | "independent-testing"
    | "specialist-journalism"
    | "industry-analysis"
    | "community-discovery";

  geographicCoverage: string[];
  ingestionMethod:
    | "rss"
    | "atom"
    | "api"
    | "github-release"
    | "page-diff"
    | "manual"
    | "email-review";

  automaticIngestionEligible: boolean;
  publicationEligible: boolean;
}
```

Story-cluster additions:

```ts
interface StoryEditorialClassification {
  primaryVertical: EditorialVertical;
  secondaryVerticals: EditorialVertical[];
  topics: string[];

  significance:
    | "minor"
    | "notable"
    | "major"
    | "critical";

  developmentStage?: DevelopmentStage;
  commercialClaimPresent: boolean;
  independentEvidencePresent: boolean;
  primaryEvidencePresent: boolean;
  humanReviewRequired: boolean;
}
```

## 8. Universal publication gate

Score candidate stories against:

- materiality;
- evidence quality;
- primary-source availability;
- independent corroboration;
- reader usefulness;
- novelty;
- geographic relevance;
- durability;
- uncertainty;
- potential harm if wrong;
- commercial-claim intensity.

High engagement is not a substitute for evidence or materiality.

## 9. Vertical-specific editorial gates

### 9.1 AI & Agents

Require at least one of:

- official release or changelog;
- reproducible artefact;
- benchmark or evaluation;
- independent technical analysis;
- documented pricing, availability or policy change;
- meaningful security report;
- regulatory primary source.

Routine commits are excluded unless they form part of a release, advisory, licence change, repository archival or other major event.

### 9.2 Technology

Require a clear consequence:

- material user or developer impact;
- industry architecture shift;
- meaningful security/privacy effect;
- significant infrastructure change;
- credible technical milestone;
- major legal or market consequence.

### 9.3 Green Tech & Energy

A “breakthrough” candidate must record:

- institution or organisation;
- research or technical source;
- claimed improvement;
- baseline comparison;
- development stage;
- test conditions;
- demonstrator scale;
- independent replication status;
- lifecycle or systems caveat where relevant;
- stated route to scale;
- commercial conflicts.

Vendor press releases alone cannot establish commercial readiness.

### 9.4 EV & Mobility

Performance claims should distinguish:

- official laboratory cycle;
- independent testing;
- owner report;
- seasonal or environmental conditions;
- vehicle configuration;
- charging curve versus peak rate;
- announced versus delivered infrastructure;
- list price versus actual ownership cost.

Policy stories should link to the government or regulator source where available.

### 9.5 Security, Privacy & Regulation

High-impact incidents and legal interpretations require human review.

Distinguish:

- vulnerability report;
- exploitation confirmed;
- proof of concept;
- vendor acknowledgement;
- patch available;
- regulatory proposal;
- consultation;
- enacted rule;
- guidance;
- enforcement decision.

## 10. Greenwashing and commercial-claim controls

```ts
interface EnvironmentalClaimAssessment {
  claimType:
    | "emissions"
    | "efficiency"
    | "recyclability"
    | "renewable"
    | "carbon-neutral"
    | "zero-emission"
    | "lifecycle"
    | "other";

  boundaryDefined: boolean;
  baselineDefined: boolean;
  lifecycleEvidencePresent: boolean;
  thirdPartyVerificationPresent: boolean;
  developmentStage: DevelopmentStage;
  scaleDemonstrated: boolean;
  caveats: string[];
}
```

Prefer wording such as:

- “the company says”;
- “the laboratory reports”;
- “under the stated test conditions”;
- “not yet independently replicated”;
- “commercial scale has not been demonstrated”.

Avoid unqualified:

- revolutionary;
- game-changing;
- zero impact;
- unlimited;
- solved;
- commercially ready;
- world-changing.

## 11. Source-expansion plan

Do not add hundreds of feeds at once.

### Wave 0 — Stabilise AI

Before broadening:

- eliminate routine GitHub commit noise;
- make RSS ingestion reliable;
- ensure story clustering works;
- show clusters rather than raw items in review;
- confirm evidence labels;
- complete live frontend wiring.

### Wave 1 — Technology pilot

Add approximately 10–15 sources across:

- cybersecurity;
- semiconductors;
- developer infrastructure;
- privacy;
- specialist technology reporting;
- official technical sources.

Keep additional raw volume below roughly 100 items per day until filters are measured.

### Wave 2 — Green Tech & Energy pilot

Add approximately 10–15 high-signal sources across:

- public agencies;
- intergovernmental organisations;
- research institutions;
- specialist energy reporting;
- grid and storage sources;
- standards and regulators.

### Wave 3 — EV & Mobility pilot

Add approximately 8–12 sources across:

- government and regulators;
- independent testing;
- charging and infrastructure;
- battery research;
- commercial vehicle and fleet transition;
- specialist EV reporting.

### Wave 4 — Controlled expansion

Expand only when:

- false-positive rate is acceptable;
- review backlog is bounded;
- at least 60% of promoted stories contain primary evidence;
- duplicate clusters are controlled;
- vertical pages remain coherent;
- daily review remains manageable.

## 12. Candidate source classes

Named sources belong in `docs/sources/source-registry.md` after URL, cadence, terms and reliability review.

### Technology

- official security advisories;
- major open-source release feeds;
- standards bodies;
- semiconductor manufacturers;
- cloud and infrastructure changelogs;
- specialist technology journalism;
- independent technical analysts.

### Green Tech & Energy

- IEA;
- IRENA;
- UK government departments and regulators;
- National Grid and system operators;
- research journals and universities;
- national laboratories;
- standards bodies;
- independent energy analysis;
- specialist climate and energy journalism.

### EV & Mobility

- UK transport and grant sources;
- European Commission and regulators;
- Euro NCAP and safety bodies;
- IEA transport data;
- charging standards and infrastructure;
- independent road and charging tests;
- battery research organisations;
- commercial-vehicle and fleet sources;
- manufacturer announcements as vendor-reported evidence.

## 13. Ask TRACE implications

Ask TRACE must support vertical filtering while retaining one evidence contract.

A question may specify:

- vertical;
- date range;
- geography;
- maturity stage;
- evidence type;
- source preference.

Model context must not mix unrelated verticals merely because they share keywords.

Examples:

- “Which solid-state battery claims have reached pilot scale?”
- “What UK EV charging grants are currently open?”
- “Has this fusion result been independently replicated?”
- “What changed in agent security this week?”

Every answer remains source-bounded and citation-validated under ADR 0008.

## 14. TRACE Predicts implications

TRACE Predicts may later publish vertical forecasts.

Each forecast must record:

- vertical;
- prediction statement;
- time horizon;
- evidence snapshot;
- causal rationale;
- confidence;
- invalidation conditions;
- resolution criteria.

Predictions must not be generated merely to fill a vertical. Human approval remains required.

## 15. Newsletter implications

Newsletter preferences may include:

- AI & Agents;
- Technology;
- Green Tech & Energy;
- EV & Mobility;
- Security & Regulation;
- weekly full briefing.

Preferences require explicit selection. Newsletter signup remains separable from account creation.

Commercial email and sponsorship disclosure are governed by ADR 0011 and applicable privacy rules.

## 16. SEO and page architecture

Each vertical should have:

- canonical landing page;
- description and inclusion policy;
- latest stories;
- evidence labels;
- topic navigation;
- RSS feed;
- newsletter preference;
- structured internal links;
- clear separation from commercial pages.

Do not launch empty or thin pages. A vertical becomes public only when it has:

- at least 10 worthwhile items;
- a functioning source pipeline;
- editorial policy text;
- a populated feed route;
- tested metadata and canonical URLs.

## 17. Admin and review-page changes

Add:

- vertical filter;
- topic filter;
- development-stage filter;
- commercial-claim flag;
- independent-evidence flag;
- primary-evidence flag;
- significance;
- geographic relevance;
- greenwashing-risk flag;
- publishability reason;
- discard reason.

Default review order should favour:

1. critical and high-impact items;
2. clusters with primary and independent evidence;
3. time-sensitive regulation and security;
4. source diversity;
5. editorial balance.

Do not order only by ingestion time or social engagement.

## 18. Metrics

Track by vertical:

- raw items;
- deterministic rejects;
- clusters;
- duplicate ratio;
- review backlog;
- average review time;
- promoted stories;
- primary-source coverage;
- independent corroboration;
- correction rate;
- reader engagement;
- newsletter opt-in.

Commercial metrics remain separate from editorial scoring.

Pause expansion when backlog or correction rate rises materially.

## 19. Implementation phases

### Phase V0 — Schema readiness

- Add vertical and maturity-stage types.
- Add source-to-vertical mapping.
- Add story classification fields.
- Add migrations and indexes.
- Backfill existing content as `ai-agents`.
- Preserve current URLs.

### Phase V1 — Navigation and feature flags

- Add feature-flagged routes.
- Add vertical-aware feed queries.
- Add vertical-aware RSS.
- Add homepage curation configuration.
- Do not publish empty sections.

### Phase V2 — Technology pilot

- Register selected sources.
- Add deterministic rules.
- Add review filters.
- Seed initial evergreen explainers.
- Measure noise before public launch.

### Phase V3 — Green Tech pilot

- Add maturity-stage model.
- Add environmental-claim assessment.
- Add source set.
- Add editorial labels.
- Test breakthrough-claim workflow.

### Phase V4 — EV & Mobility pilot

- Add range, charging and policy claim fields where needed.
- Add sources.
- Add geography and vehicle-type filters.
- Test primary-policy-source requirement.

### Phase V5 — Public launch

- Enable populated vertical pages.
- Add homepage modules.
- Add newsletter preferences.
- Add Ask TRACE vertical selection.
- Publish scope and editorial standards.

## 20. Acceptance criteria

### Product

- AI remains clearly the flagship;
- each public vertical has meaningful content;
- vertical browsing avoids unrelated noise;
- homepage is not a raw chronological firehose;
- commercial content is not classified as news.

### Ingestion

- sources declare verticals and roles;
- ordinary GitHub commits are filtered;
- duplicate clustering works across verticals;
- registry controls cadence and eligibility;
- growth does not overwhelm review capacity.

### Editorial

- green-tech stories show maturity stage;
- EV claims distinguish official and independent tests;
- regulatory stories link primary documents where available;
- vendor claims are attributed;
- weak stories are not published to fill quotas.

### Technical

- vertical fields are indexed;
- routes are feature flagged;
- backfill is reversible;
- queries support multiple verticals;
- Ask TRACE filters cannot bypass evidence admission;
- classification and routing have tests.

## 21. Consequences

### Positive

- greater story variety;
- less dependence on AI provider announcements;
- larger potential audience;
- stronger newsletter and sponsorship opportunities;
- TRACE’s evidence method becomes more distinctive;
- greenwashing and EV claims become useful verification areas.

### Negative

- larger source and review workload;
- more domain expertise required;
- more legal and scientific nuance;
- greater risk of shallow aggregation;
- taxonomy becomes more complex;
- rushed expansion could dilute the brand.

### Accepted trade-off

TRACE will broaden carefully, with AI as the anchor and evidence quality as the constraint. It will prefer a small number of strong verticals over indiscriminate technology coverage.

## 22. Required documentation updates

Update:

- `README.md`;
- `docs/product/product-charter.md`;
- `docs/product/mvp-scope.md`;
- `docs/sources/source-registry.md`;
- `docs/sources/ingestion-scale.md`;
- `docs/trust/editorial-independence.md`;
- `ROADMAP.md`;
- master build plan;
- newsletter and RSS documentation;
- SEO route inventory.

## 23. Decision summary

TRACE will expand from a narrowly interpreted AI news platform into an evidence-led intelligence platform for AI, consequential technology, green technology and future mobility. Expansion will occur through feature-flagged verticals, shared provenance and review controls, vertical-specific evidence gates and staged source pilots. It will not become an unfiltered general technology feed.
