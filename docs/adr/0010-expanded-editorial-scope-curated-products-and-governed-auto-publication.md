# ADR 0010: Expanded Editorial Scope, Curated Discovery Products and Governed Automatic Publication

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Editorial scope, verticals, ingestion, source registry, story clustering, automatic publication, Spotlight, App Radar, Open Source Radar, newsletters and Ask TRACE
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0005 Commercial Independence; ADR 0008 TRACE Model API; ADR 0009 Social-Media Signal Intake; ADR 0011 Commercial Implementation; ADR 0012 Durable Controls; ADR 0013 TRACE Guides
- **Review trigger:** Before activating a new vertical, adding a new automated source class, raising publication limits, enabling automatic social publication, or permitting a new high-risk category to auto-publish

## 1. Context

TRACE began as an evidence-linked AI intelligence platform. An AI-only feed risks becoming repetitive, dependent on provider announcements and dominated by low-value technical activity.

The TRACE method applies to broader technology subjects:

- identify what changed;
- distinguish claim from evidence;
- show what is confirmed;
- expose uncertainty;
- explain practical consequence;
- preserve corrections and provenance.

TRACE also needs recurring editorial products that are more useful than a raw feed:

- Spotlight;
- App Radar;
- Open Source Radar;
- daily vertical briefings;
- weekly updates.

Automation is desirable, but only where deterministic policy—not the model—controls publication.

## 2. Decision

TRACE will expand through explicit evidence-governed verticals and curated formats.

### Editorial verticals

1. **AI & Agents** — flagship;
2. **Technology**;
3. **Green Tech & Energy**;
4. **EV & Mobility**;
5. **Security, Privacy & Regulation**.

### Cross-cutting desks and formats

- Research & Evidence;
- Community Signals;
- Spotlight;
- App Radar;
- Open Source Radar;
- TRACE Guides and TRACE Lab under ADR 0013.

### Publishing modes

- automatic publication for low-risk eligible candidates;
- admin review for amber-risk candidates;
- mandatory human review for red-risk candidates;
- no publication quota, only configurable caps.

## 3. Public positioning

> **The Trace Manifest is an evidence-led intelligence platform covering AI, consequential technology, cleaner energy and future mobility. Follow the evidence. Understand the change.**

AI remains the flagship during expansion.

Public sharing of TRACE stories and assessments is governed by ADR 0014. Shared scores and evidence labels must remain connected to an assessment date, content version and current correction record.

## 4. Scope guardrail

TRACE is not becoming a comprehensive gadget or press-release aggregator.

A story should be:

- consequential;
- evidence-rich;
- practically useful;
- security or regulatory significant;
- a genuine technical milestone;
- societally or commercially important;
- widely claimed but poorly evidenced;
- especially suited to TRACE verification.

Normally exclude:

- cosmetic product refreshes;
- rumours without evidence;
- routine commits;
- minor app redesigns;
- ordinary funding announcements;
- copied merchant descriptions;
- low-impact feature releases;
- engagement-driven novelty.

## 5. Vertical definitions

### AI & Agents

- models and providers;
- open-weight ecosystems;
- coding agents;
- MCP and automation;
- APIs and pricing;
- inference infrastructure;
- benchmarks;
- robotics;
- AI security, copyright and governance.

### Technology

- semiconductors;
- cloud and developer infrastructure;
- major open-source ecosystems;
- cybersecurity;
- privacy;
- quantum computing;
- robotics;
- space technology;
- communications;
- major platform and architecture changes.

### Green Tech & Energy

- batteries and storage;
- solar, wind, tidal and geothermal;
- grid technology;
- heat pumps and building efficiency;
- hydrogen;
- nuclear and fusion;
- carbon removal;
- low-carbon industry;
- recycling and sustainable materials;
- climate adaptation.

Every claimed breakthrough must be assigned a maturity stage.

### EV & Mobility

- electric cars, vans, buses and HGVs;
- battery systems;
- charging;
- vehicle-to-grid;
- fleet transition;
- transport electrification;
- battery reuse;
- autonomous driving;
- policy, grants and taxation;
- ownership costs and repairability.

### Security, Privacy & Regulation

- vulnerabilities;
- software-supply-chain security;
- AI and agent security;
- privacy enforcement;
- standards;
- regulation and consultations;
- enforcement decisions;
- critical infrastructure.

## 6. Shared ingestion architecture

```text
Source registry
    -> scheduled or manual acquisition
    -> immutable raw item
    -> normalisation
    -> deterministic relevance filtering
    -> exact duplicate detection
    -> semantic duplicate detection
    -> story clustering
    -> vertical and topic classification
    -> entity and claim extraction
    -> evidence classification
    -> rights and automation policy
    -> TRACE draft
    -> deterministic validation
    -> GREEN / AMBER / RED policy decision
    -> automatic publication or review
    -> correction and staleness monitoring
```

Raw ingestion never equals publication.

## 7. Source rights and automation policy

Every source must carry an explicit automation profile.

```ts
interface SourceAutomationPolicy {
  sourceId: string;

  acquisition:
    | "official-rss"
    | "official-atom"
    | "official-api"
    | "licensed-feed"
    | "open-licence"
    | "open-government-licence"
    | "github-release"
    | "manual-link"
    | "public-page-metadata";

  rightsBasis:
    | "publisher-terms"
    | "explicit-licence"
    | "open-government-licence"
    | "creative-commons"
    | "link-and-original-summary"
    | "manual-review-required";

  mayFetchMetadata: boolean;
  mayFetchArticleText: boolean;
  mayStoreArticleText: boolean;
  mayUseForModelInput: boolean;
  mayQuote: boolean;
  mayUseImages: boolean;
  autoPublishEligible: boolean;

  mandatoryAttribution: string;
  termsReviewedAt: string;
  termsReviewDueAt: string;
}
```

Default for ordinary news publishers:

```text
Fetch metadata:           yes
Store full article:       no by default
Publish full article:     no
Publish original summary: subject to policy
Link to original:         yes
Reuse images:             no without permission
```

TRACE must not assume that RSS grants republication rights.

## 8. Editorial classification schema

```ts
type EditorialVertical =
  | "ai-agents"
  | "technology"
  | "green-tech-energy"
  | "ev-mobility"
  | "security-privacy-regulation";

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

interface StoryEditorialClassification {
  primaryVertical: EditorialVertical;
  secondaryVerticals: EditorialVertical[];
  topics: string[];

  significance: "minor" | "notable" | "major" | "critical";
  developmentStage?: DevelopmentStage;

  commercialClaimPresent: boolean;
  independentEvidencePresent: boolean;
  primaryEvidencePresent: boolean;
  sensitivePersonalClaimPresent: boolean;
  humanReviewRequired: boolean;
}
```

## 9. Governed automatic publication

### 9.1 Principle

> **The model may draft. Deterministic application policy decides whether publication is permitted.**

The model cannot directly transition an item to published status.

### 9.2 GREEN — potentially auto-publishable

- official releases;
- official changelogs;
- confirmed pricing and availability changes;
- software deprecations;
- government publications and consultations;
- public regulatory notices;
- official security advisories after disclosure;
- research papers with clear metadata;
- benchmark releases with accessible methodology;
- company announcements clearly labelled as company claims;
- official EV policy and grant changes;
- release stories from already approved open-source projects;
- app listing profiles clearly labelled as not independently tested;
- stories with primary evidence and independent support.

### 9.3 AMBER — editorial queue

- green-tech breakthroughs;
- battery performance and lifecycle claims;
- developer-supplied benchmark claims;
- unreplicated research;
- one-source secondary reporting;
- material claims involving named individuals;
- paywalled sources not fully reviewed;
- unknown publishers;
- new repositories;
- privacy, health, finance or security app claims;
- meaningful disagreement between sources.

### 9.4 RED — mandatory review

Never auto-publish initially:

- social posts;
- Spotlight updates;
- TRACE Predicts;
- allegations of crime or misconduct;
- leaks or stolen information;
- sensitive personal information;
- political and election claims;
- medical, financial or legal advice;
- active exploit instructions;
- corrections and retractions;
- sponsored or affiliate content;
- product rankings and “best” recommendations;
- unsupported extraordinary claims;
- anything failing citation validation.

## 10. Automatic publication limits

Up to three automatic posts per vertical per day may be permitted, but three is a cap, never a quota.

Recommended initial configuration:

```ts
const AUTO_PUBLISH_LIMITS = {
  perVerticalPerDay: 2,
  globalPerDay: 8,
  perSourcePerDay: 2,
  perOrganisationPerDay: 1,
  perStoryCluster: 1,
};
```

Possible later maximum:

```ts
const MAXIMUM_APPROVED_LIMITS = {
  perVerticalPerDay: 3,
  globalPerDay: 10,
};
```

No empty slot should be filled merely to satisfy volume.

Hard counters must use an atomic D1 ledger or Durable Object, not approximate rate limiting.

## 11. Automatic-publication gates

Every candidate must pass all relevant gates.

### Source gate

- approved registry entry;
- source enabled;
- terms and rights reviewed;
- expected domain and feed;
- no bypassed access control;
- explicitly auto-publish eligible.

### Story gate

- approved vertical;
- significance threshold passed;
- not a routine commit;
- not a duplicate;
- date and origin known;
- original link available;
- no already published equivalent cluster.

### Evidence gate

- eligible primary or authoritative evidence;
- material claims linked to source IDs;
- commercial claims attributed;
- disagreement preserved;
- current evidence;
- no retracted or rejected source.

### Content gate

- factual headline;
- original TRACE value;
- no copied article body;
- limited attributed quotation only where needed;
- “why it matters” included;
- uncertainty and caveats included;
- valid structured output;
- citation validation passed;
- prompt injection not reproduced.

### Risk gate

- no mandatory-review topic;
- no unnecessary sensitive personal data;
- no legal hold;
- no commercial influence;
- daily caps available;
- circuit breakers closed.

Any failed gate sends the candidate to review or rejection.

## 12. Publication states

```ts
type PublicationState =
  | "ingested"
  | "rejected"
  | "clustered"
  | "drafting"
  | "validation-failed"
  | "eligible-for-auto-publish"
  | "awaiting-review"
  | "scheduled"
  | "published-automatic"
  | "published-reviewed"
  | "held"
  | "corrected"
  | "withdrawn";
```

Only the policy engine may create `published-automatic`.

## 13. Automatic-post transparency

Automatically published posts should be compact and clearly labelled.

Suggested format:

```text
What happened
Why it matters
What is confirmed
What remains uncertain
Relevant context
Sources
```

Suggested label:

> **Automatically prepared by TRACE from approved sources and passed through TRACE publication checks. Not manually reviewed before publication.**

A later manual review may add:

> **Reviewed by TRACE editorial.**

## 14. Spotlight

Spotlight is a cross-vertical editorial format.

Possible subjects:

- companies;
- projects;
- technologies;
- research programmes;
- regulations;
- developing issues;
- infrastructure transitions.

A permanent Spotlight page should contain:

```text
What it is
Why it matters
Current status
Confirmed developments
Claims awaiting evidence
Key organisations
Risks and limitations
Timeline
Weekly updates
What to watch next
Sources and corrections
```

Spotlight updates may be drafted automatically but always require admin approval.

```ts
interface TraceSpotlight {
  id: string;
  slug: string;
  title: string;
  primaryVertical: EditorialVertical;

  subjectType:
    | "technology"
    | "project"
    | "company"
    | "organisation"
    | "research-programme"
    | "regulation"
    | "developing-event";

  subjectId?: string;
  updateCadence: "weekly" | "paused" | "event-driven";
  lastReviewedAt: string;
  nextReviewAt?: string;
}
```

## 15. App Radar

App Radar is a curated Technology feature covering iOS, iPadOS, Android, web and cross-platform applications.

Qualifying applications should be:

- genuinely useful or original;
- technically interesting;
- privacy-conscious;
- accessible;
- open source;
- relevant to TRACE verticals;
- a meaningful update;
- worthy of scrutiny because of important claims.

App Radar must not become a complete new-app feed.

### App review depth

```ts
type AppReviewDepth =
  | "listing-reviewed"
  | "developer-material-reviewed"
  | "demonstration-reviewed"
  | "installed-and-tested"
  | "long-term-tested";
```

An automatically produced profile may be called **listing reviewed**, not a review or recommendation.

Required wording:

> **Listing reviewed:** TRACE prepared this profile from the official store listing and developer information. The app has not been independently installed or tested.

### App data model

```ts
interface TraceAppProfile {
  id: string;
  slug: string;
  name: string;
  developerName: string;
  developerWebsite?: string;

  platforms: Array<"ios" | "ipad-os" | "android" | "web">;

  appStoreUrl?: string;
  appStoreId?: string;
  googlePlayUrl?: string;
  googlePlayPackageName?: string;

  categories: string[];
  verticals: EditorialVertical[];

  pricingModel: "free" | "paid" | "freemium" | "subscription" | "unknown";
  reviewDepth: AppReviewDepth;
  privacyPolicyUrl?: string;
  sourceCodeUrl?: string;

  developerClaims: string[];
  traceObservations: string[];
  limitations: string[];

  lastCheckedAt: string;
  listingStatus: "available" | "removed" | "region-restricted" | "unknown";
}
```

### App automation boundary

Potentially automatic:

- official store URL;
- known developer;
- basic factual metadata;
- no high-risk claims;
- no recommendation language;
- clear not-tested label.

Mandatory review:

- “best”, “safe”, “privacy-friendly” or recommendation claims;
- children’s apps;
- health, finance, security or surveillance apps;
- sideloaded downloads;
- suspicious subscriptions;
- unclear developer identity.

Do not scrape app stores at scale without a separate current terms review.

## 16. Open Source Radar

Open Source Radar is a curated Technology section.

Possible categories:

- New & Noteworthy;
- Important Releases;
- AI & Agent Tools;
- Developer Tools;
- Privacy & Security;
- Mobile Apps;
- Open Hardware;
- Maintainer Spotlight;
- Projects to Watch.

Publicly visible source code is not automatically open source.

```ts
type RepositoryAvailability =
  | "open-source"
  | "source-available"
  | "public-unlicensed"
  | "proprietary-public-mirror"
  | "licence-unclear";

type RepositoryReviewDepth =
  | "metadata-reviewed"
  | "readme-reviewed"
  | "documentation-reviewed"
  | "source-structure-reviewed"
  | "installed-and-tested"
  | "security-reviewed";
```

### Repository data model

```ts
interface TraceRepositoryProfile {
  id: string;
  host: "github" | "gitlab" | "codeberg" | "other";
  owner: string;
  repositoryName: string;
  canonicalUrl: string;

  displayName: string;
  traceSummary: string;

  availability: RepositoryAvailability;
  licenceSpdxId?: string;
  primaryLanguage?: string;

  latestReleaseTag?: string;
  latestReleaseAt?: string;

  repositoryStatus:
    | "active"
    | "low-activity"
    | "maintenance"
    | "archived"
    | "abandoned"
    | "unknown";

  maturity: "experimental" | "alpha" | "beta" | "stable" | "mature" | "unknown";
  reviewDepth: RepositoryReviewDepth[];
  discoveredViaSocialSignalId?: string;
  relatedStoryClusterIds: string[];
  lastCheckedAt: string;
}
```

### Repository automation boundary

Potentially automatic:

- release from an already approved project;
- recognised open-source licence;
- meaningful official release notes;
- no licence or ownership change;
- no security warning;
- no suspicious binary distribution;
- citation validation passed.

Mandatory review:

- new project;
- missing or custom licence;
- ownership transfer;
- security-sensitive tooling;
- cryptocurrency or financial software;
- precompiled binaries with unclear provenance;
- malware warnings;
- extraordinary performance claims;
- anonymous social discovery only.

Reject or quarantine:

- stolen or leaked proprietary code;
- credentials;
- malware;
- phishing;
- impersonation;
- pirated software;
- doxxing;
- deliberately concealed purpose.

GitHub ingestion should focus on releases, advisories, licence changes, archival and major state changes—not ordinary commits.

## 17. Green-tech claim controls

A claimed breakthrough must record:

- organisation;
- primary research or technical source;
- claimed improvement;
- baseline;
- maturity stage;
- test conditions;
- scale;
- replication status;
- lifecycle caveats;
- route to scale;
- commercial conflict.

Prefer wording such as:

- “the company says”;
- “the laboratory reports”;
- “under the stated test conditions”;
- “not independently replicated”;
- “commercial scale has not been demonstrated”.

## 18. EV claim controls

Distinguish:

- official test cycle;
- independent testing;
- owner report;
- environmental conditions;
- vehicle configuration;
- peak charging rate versus charging curve;
- announced versus delivered infrastructure;
- list price versus ownership cost.

Policy stories should link to primary government or regulator sources where available.

## 19. Homepage and navigation

Recommended navigation:

```text
Home
AI & Agents
Technology
Green Tech
EV & Mobility
Security & Regulation
Research
Spotlight
App Radar
Open Source Radar
TRACE Guides
Ask TRACE
TRACE Predicts
Newsletter
```

Commercial pages remain separate:

```text
TRACE Selects
Advertise with TRACE
```

Initial homepage balance guide:

```text
AI & Agents                 40–50%
Technology                  20–25%
Green Tech & Energy         15–20%
EV & Mobility               10–15%
Security and research       cross-cutting
```

## 20. Ask TRACE implications

Ask TRACE must support:

- vertical;
- date range;
- geography;
- maturity stage;
- evidence type;
- source type;
- app, repository and Spotlight context.

It must not mix unrelated verticals merely because of shared keywords.

TRACE Guides are governed separately by ADR 0013.

## 21. Rollback and monitoring

Every automatically published item must retain:

- source snapshot IDs;
- prompt and model version;
- policy version;
- exact citations;
- validation results;
- publication reason;
- automatic/manual status;
- correction history;
- one-click unpublish.

Required kill switches:

- global auto-publish;
- per-vertical;
- per-source;
- per-content type;
- per-model;
- per-policy version.

Monitor:

- unsupported-claim rate;
- duplicate rate;
- correction rate;
- unpublish rate;
- attribution errors;
- classification errors;
- complaints;
- primary-source coverage;
- per-source and per-vertical volume.

Suggested pause conditions:

- any key or security incident;
- two unsupported factual claims in seven days;
- correction rate above 2%;
- duplicate rate above 3%;
- uncertain source terms;
- model or prompt change without evaluation;
- validation unavailable;
- atomic publication ledger unavailable.

## 22. Implementation phases

### Phase V0 — Stabilise current pipeline

- remove routine GitHub commit noise;
- complete RSS ingestion;
- complete clustering;
- show clusters rather than raw items;
- complete live frontend wiring;
- confirm evidence labels.

### Phase V1 — Schema and automation policy

- vertical fields;
- source rights and automation policy;
- publication risk state;
- atomic daily ledger;
- kill switches;
- publication-state machine.

### Phase V2 — Low-risk automatic beta

- enable one or two approved source classes;
- cap at two per vertical and eight globally;
- show automatic label;
- collect correction and complaint metrics;
- require immediate rollback.

### Phase V3 — Spotlight

- permanent subject pages;
- weekly update records;
- evidence timeline;
- automated draft;
- mandatory admin approval.

### Phase V4 — App Radar

- app schema;
- store-link validation;
- developer submission;
- review-depth labels;
- listing-only automation;
- human approval for recommendations.

### Phase V5 — Open Source Radar

- repository profiles;
- licence classification;
- release-focused GitHub ingestion;
- project safety checks;
- auto-publish approved-project releases;
- review new projects.

### Phase V6 — New vertical pilots

- Technology;
- Green Tech & Energy;
- EV & Mobility;
- staged source activation;
- review backlog controls;
- no empty vertical launch.

## 23. Acceptance criteria

### Product

- AI remains flagship;
- each public vertical has meaningful content;
- homepage is not a raw firehose;
- Spotlight, App Radar and Open Source Radar are curated;
- commercial content is separate.

### Automation

- model cannot directly publish;
- hard daily caps are atomic;
- one failed gate prevents auto-publication;
- social posts and Spotlight require approval;
- automatic posts have a visible label;
- rollback and kill switches work.

### Editorial

- green-tech maturity is shown;
- EV test types are distinguished;
- new repositories require review;
- app profiles state review depth;
- weak stories are never published to fill quotas.

### Rights and safety

- source policy records rights basis;
- full articles are not mirrored;
- images are not reused without permission;
- repositories are not labelled open source without licence evidence;
- app-store data is not scraped at scale without separate approval.

## 24. Consequences

### Positive

- broader and more varied publication;
- manageable daily automation;
- stronger evergreen and discovery products;
- less dependence on AI-provider announcements;
- larger potential audience and newsletter value;
- GitHub becomes useful rather than noisy.

### Negative

- larger editorial and legal surface;
- more domain expertise required;
- automation needs strong monitoring;
- curated products require admin time;
- broader scope can dilute the brand if rushed.

## 25. Decision summary

TRACE will expand into consequential technology, green technology and future mobility while retaining AI as the flagship. It will add Spotlight, App Radar and Open Source Radar. Low-risk stories may auto-publish under deterministic rights, evidence, risk and volume gates. Three posts per vertical per day is a maximum, not a target. Social posts and Spotlight remain admin-approved.
