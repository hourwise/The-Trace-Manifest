# The Trace Manifest — Evidence-Linked Knowledge Base Build Plan

**Status:** Proposed  
**Document type:** Additional build plan with embedded architectural decision  
**Project:** The Trace Manifest  
**Owner:** PCGsoft / hourwise  
**Date:** 12 July 2026  
**Suggested location:** `docs/product/evidence-linked-knowledge-base-build-plan.md`

---

## 1. Decision Summary

The Trace Manifest will add a durable **evidence-linked knowledge base** alongside its current intelligence feed, briefings, model directory, benchmark registry, and citation-grounded answers.

The knowledge base will not operate as a conventional open-edit wiki or as a collection of loosely sourced blog posts. It will be a **living technical reference** in which material claims are connected to evidence, dated, scoped, reviewable, and versioned.

Initial coverage will focus on fields directly connected to the project owner's active technical work and research:

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

The knowledge base must share evidence, entities, claims, and change events with the existing ingestion and intelligence pipeline. News should be capable of proposing updates to relevant reference pages, but publication must remain governed by evidence thresholds and review rules.

### 1.1 Governing decisions and launch sequencing

This plan is constrained by the canonical ADRs and the revised launch scope. It must not introduce a parallel content or retrieval system that bypasses them.

- [ADR 0012](adr/0012-durable-controls-access-admin-and-publication-boundaries.md) supplies the durable publication, audit, identity, evidence-eligibility and Ask TRACE controls on which every live knowledge feature depends.
- [ADR 0009](adr/0009-governed-social-media-signal-intake-linked-source-discovery-and-outbound-linking.md) permits social material only as governed discovery. A social post cannot create or corroborate a knowledge claim; a linked source must be separately admitted with its own provenance.
- [ADR 0010](adr/0010-expanded-editorial-scope-curated-products-and-governed-auto-publication.md) governs future verticals, curated products and automatic-publication gates. The [revised launch scope](<The Trace Manifest — Revised Launch.md>) keeps the first public release focused on AI & Agents and manual approval.
- [ADR 0013](adr/0013-trace-guides-lab-authorship-verification-and-ask-trace-knowledge-integration.md) governs practical guides and TRACE Lab records. Their section-level retrieval must preserve external sources, verification level, version and freshness; they are curated secondary knowledge, not circular evidence.
- [ADR 0011](adr/0011-advertising-sponsorship-affiliate-marketing-and-commercial-implementation.md) prevents commercial values from influencing claims, evidence, rankings, recommendations or retrieval.
- [ADR 0014](adr/0014-context-preserving-sharing-versioned-snapshots-and-social-preview-integrity.md) governs later public sharing. Canonical pages need correction-aware metadata from the start; public snapshots and shareable Ask records require their own bounded publication workflow.

---

## 2. Why This Is a Build Plan Rather Than Only an ADR

An ADR would be appropriate for the narrow architectural decision:

> “Use a structured, evidence-linked, versioned knowledge system rather than an unstructured wiki or isolated article collection.”

However, the proposed capability also requires:

- information architecture;
- data modelling;
- ingestion integration;
- editorial workflows;
- page templates;
- SEO strategy;
- review and correction rules;
- phased implementation;
- tests and acceptance criteria.

For that reason, this document is primarily a build plan. Section 3 may be extracted later into a numbered ADR if the repository requires every durable architectural choice to have its own decision record.

---

## 3. Embedded Architectural Decision

### 3.1 Context

The Trace Manifest currently aims to explain what changed in AI, whether claims are credible, what remains disputed, and what users should do. A chronological feed alone cannot provide durable background knowledge, stable definitions, historical context, or a maintained explanation of complex subjects.

Conventional blog posts become stale and often provide only page-level bibliographies. Conventional wikis frequently permit weak sourcing, silent edits, and ambiguous ownership of claims.

The platform therefore needs a durable knowledge layer that preserves the project's existing principles:

- evidence before popularity;
- primary sources first;
- explainable conclusions;
- visible uncertainty;
- public corrections;
- dated information;
- human review for high-impact claims.

### 3.2 Decision

Build an **evidence-linked knowledge base** using structured entities, claims, evidence relationships, page revisions, review status, and public change history.

Every material factual statement should be attributable, where practicable, to one or more claim records rather than merely to a list of sources at the bottom of a page.

Knowledge pages will be rendered from a mixture of:

- structured facts and claims;
- editorial explanation;
- diagrams and examples;
- linked intelligence events;
- source records;
- revision metadata.

### 3.3 Rejected alternatives

#### Conventional blog-only publishing

Rejected because articles become stale, duplicate explanations, and do not naturally expose claim-level provenance or structured updates.

#### Open community wiki

Rejected for the initial product because uncontrolled edits, inconsistent sourcing, moderation requirements, and vandalism risk conflict with the trust model.

#### Fully automated RAG-generated reference pages

Rejected because generated prose can merge sources incorrectly, conceal uncertainty, and silently change meaning. Retrieval and drafting may assist editors, but automated output must not become canonical without validation.

#### Independent knowledge base disconnected from the feed

Rejected because it would duplicate evidence storage and prevent new events from identifying which established pages or claims may need revision.

### 3.4 Consequences

Positive consequences:

- durable search traffic;
- higher-value technical reference material;
- visible subject-matter depth;
- stronger grounding for the Ask surface;
- reusable evidence across feed items, pages, briefings, and answers;
- public revision history;
- a clear distinction between fact, interpretation, vendor claim, and inference.

Costs and risks:

- more editorial review;
- schema complexity;
- stale-page management;
- risk of over-expanding subject coverage;
- need for claim granularity rules;
- need to prevent SEO goals from weakening evidence standards.

---

## 4. Product Role

The Trace Manifest will contain two complementary layers.

### 4.1 Intelligence layer

Answers:

- What happened?
- What changed?
- When did it change?
- Who reported it?
- What evidence exists?
- Is the report confirmed, disputed, or incomplete?

Typical surfaces:

- feed;
- daily and weekly briefings;
- release records;
- research updates;
- provider changes;
- benchmark events;
- GitHub activity;
- corrections.

### 4.2 Knowledge layer

Answers:

- What is this technology?
- How does it work?
- What does it not do?
- What are the main risks?
- Which terms are commonly confused?
- What has changed over time?
- Which claims are established, disputed, or implementation-specific?
- What should a developer or organisation consider before adopting it?

Typical surfaces:

- subject hubs;
- concepts;
- protocols;
- architecture guides;
- comparisons;
- timelines;
- threat and risk pages;
- implementation patterns;
- glossaries;
- practical checklists;
- evidence maps.

---

## 5. Initial Information Architecture

Suggested public route:

```text
/knowledge
```

Suggested first-level hubs:

```text
/knowledge/mcp
/knowledge/agents
/knowledge/automation
/knowledge/memory
/knowledge/orchestration
/knowledge/tool-use
/knowledge/security
/knowledge/governance
/knowledge/local-models
/knowledge/coding-agents
/knowledge/evaluation
/knowledge/observability
```

Each hub should contain several page types.

### 5.1 Core concept pages

Examples:

- What is the Model Context Protocol?
- What is an AI agent?
- What is agent memory?
- What is tool calling?
- What is an AI gateway?
- What is context engineering?

### 5.2 Comparison pages

Examples:

- MCP vs function calling
- Agents vs workflows vs automation
- Agent memory vs ordinary application state
- Audit logs vs enforceable governance
- Local agents vs hosted agents
- MCP gateways vs API gateways
- Human approval vs policy enforcement

### 5.3 Architecture and implementation pages

Examples:

- Anatomy of an MCP host, client, and server
- Building a governed tool-execution path
- Designing memory with source provenance
- Separating orchestration from execution authority
- Designing approval binding
- Designing agent audit records
- Local-first agent architecture

### 5.4 Risk and security pages

Examples:

- MCP security risks
- Tool poisoning
- Indirect prompt injection
- Credential exposure
- Confused-deputy failures
- Approval mutation
- Untrusted memory influencing execution
- Bypass paths around governance layers

### 5.5 Timeline and change pages

Examples:

- MCP specification timeline
- Major coding-agent releases
- Agent framework evolution
- Important AI gateway changes
- Significant memory-system research

### 5.6 Practical reference pages

Examples:

- MCP implementation checklist
- Agent evaluation checklist
- Tool-risk classification guide
- Local-model hardware guide
- Questions to ask an AI-agent vendor
- Evidence checklist for benchmark claims

---

## 6. Initial Cornerstone Page Set

The first release should remain narrow and authoritative. Recommended launch set:

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

No page should be published merely to reach a numerical target. A smaller set with strong evidence and useful diagrams is preferable to a large thin-content library.

---

## 7. Standard Knowledge Page Contract

Every canonical knowledge page should support the following structure.

```text
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

Optional sections:

- compatibility matrix;
- code examples;
- glossary;
- diagrams;
- vendor-specific behaviour;
- local deployment notes;
- legal or licensing notes;
- practical checklist.

---

## 8. Claim-Level Evidence Model

A bibliography alone is insufficient. The system should support a direct relationship between a material claim and the evidence that supports, challenges, qualifies, or supersedes it.

Example:

```text
Claim:
“MCP does not by itself provide a complete execution-authorisation policy.”

Claim type:
Protocol scope statement

Status:
Supported

Scope:
The base protocol; individual hosts, gateways, and products may add policy controls.

Evidence:
- protocol specification;
- official architecture documentation;
- official security guidance;
- observed implementation documentation.

Counter-evidence:
None currently recorded.

Last checked:
2026-07-12

Reviewer:
Editorial review record

Version:
claim-v1
```

### 8.1 Evidence relationship types

At minimum:

- supports;
- partially supports;
- qualifies;
- contradicts;
- reports;
- reproduces;
- fails to reproduce;
- supersedes;
- corrects;
- contextualises.

### 8.2 Claim classes

Suggested classes:

- specification-defined;
- official vendor claim;
- observed implementation behaviour;
- independent research finding;
- benchmark result;
- community report;
- legal or regulatory statement;
- editorial synthesis;
- Trace Manifest inference.

### 8.3 Inference labelling

Inferences must never be presented as directly sourced facts.

An inference record should identify:

- supporting evidence;
- reasoning summary;
- confidence;
- scope;
- known alternatives;
- reviewer;
- date.

---

## 9. Suggested Data Model

Names are illustrative and should be aligned with the existing D1 schema and migration conventions.

### 9.1 Knowledge entities

```sql
knowledge_entities
- id
- slug
- name
- entity_type
- summary
- canonical_status
- created_at
- updated_at
```

Entity types may include:

- concept;
- protocol;
- product;
- provider;
- model;
- framework;
- project;
- organisation;
- benchmark;
- risk;
- standard;
- technique.

### 9.2 Knowledge pages

```sql
knowledge_pages
- id
- entity_id
- slug
- title
- summary
- page_type
- publication_status
- review_status
- current_revision_id
- first_published_at
- last_reviewed_at
- next_review_due_at
- created_at
- updated_at
```

### 9.3 Page revisions

```sql
knowledge_page_revisions
- id
- page_id
- revision_number
- content_source
- content_hash
- change_summary
- change_reason
- author_actor_id
- reviewer_actor_id
- created_at
- approved_at
- published_at
```

Published revisions should be immutable. Corrections create a new revision rather than rewriting history.

### 9.4 Claims

```sql
knowledge_claims
- id
- canonical_text
- claim_type
- claim_status
- scope_note
- valid_from
- valid_until
- confidence_class
- materiality
- created_at
- updated_at
```

### 9.5 Page-to-claim mapping

```sql
knowledge_page_claims
- page_revision_id
- claim_id
- section_key
- display_order
- presentation_mode
```

### 9.6 Claim evidence

```sql
claim_evidence_links
- id
- claim_id
- source_id
- feed_item_id
- evidence_relationship
- evidence_excerpt_or_locator
- source_snapshot_id
- independence_class
- added_by
- added_at
```

### 9.7 Knowledge change proposals

```sql
knowledge_change_proposals
- id
- page_id
- claim_id
- triggering_feed_item_id
- proposal_type
- proposed_change
- rationale
- classifier_version
- proposal_status
- created_at
- reviewed_at
- reviewed_by
```

### 9.8 Related-page graph

```sql
knowledge_relationships
- source_entity_id
- target_entity_id
- relationship_type
- direction
- explanation
- created_at
```

Examples:

- implements;
- extends;
- competes_with;
- depends_on;
- replaces;
- contrasts_with;
- exposes;
- mitigates;
- is_risk_of.

---

## 10. Integration With the Existing Intelligence Pipeline

The knowledge base must consume the output of the same source and evidence system rather than creating a second ingestion stack.

Target flow:

```text
source ingestion
    ↓
normalisation
    ↓
classification and entity extraction
    ↓
story clustering
    ↓
claim extraction
    ↓
evidence evaluation
    ↓
knowledge-impact detection
    ↓
change proposal
    ↓
human review where required
    ↓
new page revision
    ↓
public change history
```

### 10.1 Knowledge-impact detection

A newly ingested item may:

- create a new entity;
- support an existing claim;
- contradict an existing claim;
- make a claim outdated;
- change pricing, capability, licensing, or security status;
- trigger a timeline entry;
- suggest a new comparison;
- require a page review without changing the page automatically.

### 10.2 Automatic publication boundaries

The following should not be auto-published without review:

- high-impact security claims;
- allegations of wrongdoing;
- legal interpretation;
- disputed benchmark conclusions;
- claims that contradict a current canonical page;
- vendor comparisons with commercial consequences;
- conclusions based mainly on social or community reports;
- substantive changes to definitions or architectural guidance.

Low-risk metadata updates may eventually be automated, provided they are fully audited and reversible.

---

## 11. Editorial and Trust Rules

### 11.1 Primary sources first

Use primary sources where available:

- specifications;
- official documentation;
- repositories;
- release notes;
- standards;
- research papers;
- model cards;
- security advisories;
- regulatory publications.

Secondary sources may explain or independently test claims but should not silently replace available primary evidence.

### 11.2 Sources must be attached to claims

Do not publish pages that contain a long source list with no clear indication of which evidence supports which statement.

### 11.3 Vendor claims remain vendor claims

A provider statement does not become independently confirmed because it appears in official documentation.

### 11.4 Implementation-specific behaviour must be scoped

Do not generalise from one MCP host, agent framework, gateway, or model provider to the entire category.

### 11.5 Public corrections and supersession

When a material claim changes:

- preserve the previous claim status;
- mark it corrected, superseded, or outdated;
- record the reason;
- link the triggering evidence;
- publish a revision entry.

### 11.6 Project-owner implementations

PCGsoft and hourwise projects may be used as transparent implementation examples, including Ananke, Mnemosyne, Horae, Runtime Contracts, and Moirae Code.

They must not be presented as independent validation of general industry claims. Relevant disclosures should identify:

- project ownership;
- development status;
- whether results are self-reported;
- whether independent validation exists;
- alternative approaches where known.

---

## 12. SEO Strategy Worth Incorporating

The recently discussed SEO post contains several tactics that fit this build plan, but they must be adapted to The Trace Manifest's evidence standards.

### 12.1 Exact-question and exact-problem pages

Use the language people genuinely search rather than relying only on broad editorial titles.

Examples:

- Is MCP secure?
- Does MCP include authentication?
- What is the difference between MCP and function calling?
- What is an AI agent?
- Are AI agents just workflows?
- How do AI agents remember things?
- Can an approved agent action change before execution?
- What is tool poisoning?
- Do audit logs make an AI agent safe?
- What is the best architecture for a local AI agent?

These should not become low-quality one-question stubs. Where several phrases express the same intent, they should resolve to one strong canonical page with suitable headings and structured answers.

### 12.2 Free evidence-based micro-tools

Small free tools can attract highly relevant users and demonstrate the product's methods.

Candidates:

#### MCP exposure checker

Accepts a server manifest or configuration and reports:

- exposed tools;
- declared permissions;
- risky write, send, delete, payment, deployment, or permission-changing actions;
- missing descriptions;
- missing approval metadata;
- likely governance gaps.

It must clearly state that this is a configuration review, not proof of runtime safety.

#### Agent governance checklist generator

Asks structured questions and produces:

- governance gaps;
- approval requirements;
- audit requirements;
- bypass risks;
- recommended evidence to collect.

#### AI claim evidence checklist

Allows a user to enter a product or benchmark claim and returns a checklist of evidence needed to assess it.

#### Local-model requirement comparator

Compares published RAM, VRAM, quantisation, licence, and context requirements using dated sources.

#### Security-header or provenance metadata checker

Potentially useful if aligned with Reticle Systems or shared PCGsoft infrastructure, but it should not blur the identity of the two products.

Micro-tools should link directly to the relevant knowledge pages and should use the same evidence records where practical.

### 12.3 Comparison and alternative pages

High-intent comparison pages are worth adding, but only when the comparison is genuinely useful and fair.

Strong examples:

- MCP vs function calling
- MCP vs REST APIs
- agent gateways vs API gateways
- agents vs workflows
- hosted agents vs local agents
- LangGraph vs other orchestration approaches
- approval workflows vs policy enforcement
- audit logging vs execution governance

“Alternative to [product]” pages should not be mass-generated. Publish them only when:

- there is meaningful search intent;
- alternatives can be compared using stable criteria;
- commercial relationships are disclosed;
- claims are evidence-linked;
- the page can be maintained.

### 12.4 Topic clusters and internal linking

The knowledge base should use subject clusters rather than isolated posts.

Example MCP cluster:

```text
What is MCP?
├── MCP architecture
├── MCP security
├── MCP authentication and authorisation
├── MCP vs function calling
├── MCP gateways
├── MCP tool poisoning
├── Building an MCP server
└── MCP specification timeline
```

Every page should link to:

- its parent hub;
- prerequisite concepts;
- close comparisons;
- relevant risks;
- recent intelligence events;
- practical tools;
- deeper implementation pages.

### 12.5 Content repurposing

A canonical knowledge-page revision can generate controlled derivative content:

- a briefing item;
- a LinkedIn post;
- a short social summary;
- a newsletter section;
- a diagram;
- a video or podcast outline;
- a “what changed” post.

Derivative content must link back to the canonical page and must not introduce unsupported claims. The canonical page remains the maintained source of truth.

### 12.6 Start before full platform completion

Durable pages take time to be discovered and trusted. The first cornerstone pages can be published incrementally once they meet editorial standards, rather than waiting for every planned knowledge feature.

This does not justify publishing placeholders or thin pages.

### 12.7 Search-demand feedback loop

Search demand may help prioritise page order, but it must not determine evidence ratings or editorial conclusions.

Suggested loop:

```text
search question or recurring user problem
    ↓
intent grouping
    ↓
evidence availability check
    ↓
canonical page or section
    ↓
related free tool where useful
    ↓
measure discovery and usefulness
    ↓
improve coverage
```

### 12.8 SEO tactics that should not be adopted uncritically

Do not encode the following as project rules:

- “Paid advertising never works.”
- “Every competitor needs an alternative page.”
- “Publish at maximum frequency.”
- “More pages automatically means more traffic.”
- “SEO traffic proves factual authority.”

The post's strongest lessons are exact-intent coverage, useful micro-tools, comparison content, repurposing, and patience—not unsupported universal marketing conclusions.

---

## 13. Structured Search and Page Metadata

Each knowledge page should support:

- canonical URL;
- concise title;
- evidence-aware meta description;
- last reviewed date;
- date modified;
- author and reviewer;
- breadcrumbs;
- article or technical-article structured data where suitable;
- FAQ structured data only when visible questions and answers genuinely exist;
- stable heading hierarchy;
- machine-readable citation or source references where feasible;
- Open Graph metadata;
- internal entity identifiers;
- sitemap inclusion;
- noindex rules for drafts, low-value filters, admin surfaces, and duplicate parameter pages.

The site should avoid displaying a false “freshness” date merely because a template or minor metadata field changed.

---

## 14. Public User Experience

### 14.1 Knowledge landing page

The `/knowledge` page should provide:

- search;
- subject hubs;
- cornerstone guides;
- recently updated pages;
- recently disputed or corrected claims;
- latest protocol and product changes;
- glossary access;
- explanation of evidence labels.

### 14.2 Evidence drawer

Material claims should expose a compact evidence interface showing:

- status;
- evidence sources;
- source class;
- date;
- scope;
- contradictions;
- last reviewed;
- revision history.

### 14.3 “What changed?” panel

Every revised page should show:

- previous version date;
- current version date;
- concise change summary;
- triggering evidence;
- whether the conclusion changed.

### 14.4 Related current intelligence

Reference pages should show recent linked events without allowing transient headlines to overwhelm the durable explanation.

### 14.5 Disputed and outdated content

Disputed, corrected, or outdated statements should remain discoverable with visible warnings and links to the current interpretation.

---

## 15. Admin and Editorial Workflow

Suggested workflow:

```text
Draft
→ Evidence gathering
→ Claim mapping
→ Editorial review
→ Trust review when required
→ Approved
→ Published
→ Monitoring
→ Revision proposed
→ Revised or reaffirmed
```

Admin capabilities should include:

- create and edit pages;
- attach claims;
- attach or detach evidence;
- compare revisions;
- accept or reject automated update proposals;
- mark pages due for review;
- record correction reasons;
- manage aliases and redirects;
- preview structured metadata;
- view evidence gaps;
- view orphaned pages and claims;
- view pages affected by new intelligence.

The operational admin interface must be authenticated and authorised at the Worker/API layer, not only hidden in the frontend.

---

## 16. Review Cadence

Suggested default review intervals:

- rapidly changing protocols, providers, and products: 30–60 days;
- active security topics: event-triggered plus 30 days;
- architecture concepts: 90–180 days;
- stable definitions: 180–365 days;
- legal or regulatory pages: event-triggered and jurisdiction-specific;
- comparison pages: when either compared system changes materially.

A page may be automatically flagged for review when:

- linked evidence is corrected;
- a source becomes unavailable;
- a new contradictory claim appears;
- an entity receives a major release;
- pricing or licensing changes;
- a page exceeds its review interval.

---

## 17. Phase Plan

### Phase KB-0 — Documentation and decision lock

Deliverables:

- approve this plan;
- optionally extract the embedded decision into a numbered ADR;
- add the knowledge-base scope to the master build plan and roadmap;
- define terminology;
- confirm initial page set;
- define editorial ownership.

Exit criteria:

- knowledge layer is explicitly distinguished from feed, briefings, and Ask;
- scope and non-goals are recorded;
- no assumption of open community editing;
- SEO does not override trust rules.

### Phase KB-1 — Static content foundation

Deliverables:

- `/knowledge` landing page;
- hub and page templates;
- content collections or equivalent Astro structure;
- page metadata contract;
- evidence and revision UI prototypes;
- first three cornerstone pages;
- internal linking;
- sitemap and canonical handling.

Recommended first pages:

1. What is MCP?
2. Agents vs workflows vs automation
3. MCP security and the execution-governance gap

Exit criteria:

- pages build and deploy;
- sources are visible;
- claims can be tied to evidence at least through structured frontmatter or data files;
- pages show last reviewed and revision information;
- no placeholder pages are indexed.

### Phase KB-2 — Structured entity and claim storage

Deliverables:

- database migrations;
- entity registry;
- claims;
- evidence links;
- page revisions;
- relationship graph;
- read API;
- seed importer for static pages.

Exit criteria:

- published pages can resolve structured claims and evidence;
- revisions are immutable;
- source and claim relationships survive reruns;
- tests cover idempotency and referential integrity.

### Phase KB-3 — Editorial administration

Deliverables:

- authenticated admin pages;
- draft and review states;
- claim editor;
- evidence attachment;
- revision comparison;
- correction and supersession workflow;
- audit events.

Exit criteria:

- unauthorised users cannot create, edit, approve, or publish;
- every publication action is attributable;
- corrections create a new revision;
- previous published revisions remain retrievable.

### Phase KB-4 — Intelligence-to-knowledge linkage

Deliverables:

- entity linking from feed items;
- knowledge-impact detector;
- change proposals;
- related intelligence panel;
- timeline generation;
- review queues.

Exit criteria:

- a new feed item can propose a page or claim update;
- proposals never silently alter published content;
- proposal engine records its version, input, and explanation;
- rejected proposals remain auditable.

### Phase KB-5 — Search, Ask, and discovery

Deliverables:

- knowledge search;
- entity-aware results;
- Ask answers grounded in current page revisions and underlying evidence;
- citation links to claims and source records;
- stale-page warnings;
- synonym and alias handling.

Exit criteria:

- answers cite the supporting evidence;
- superseded claims are not returned as current without warning;
- page revision date is visible;
- retrieval boundaries are tested.

### Phase KB-6 — SEO and free tools

Deliverables:

- exact-question page backlog;
- topic cluster map;
- one or two free micro-tools;
- comparison-page criteria;
- derivative-content workflow;
- search performance measurement;
- page usefulness feedback.

Recommended first tool:

**MCP Exposure and Governance Checklist**, because it aligns closely with the first knowledge cluster and with the owner's existing technical expertise.

Exit criteria:

- tools contain clear scope and limitation statements;
- tool outputs link to canonical knowledge pages;
- no unverified result is presented as a security certification;
- pages avoid mass-generated thin content;
- measurement does not affect evidence ratings.

### Phase KB-7 — Public contribution workflow

This phase is optional and should not begin until moderation and provenance systems are mature.

Potential capabilities:

- source suggestions;
- correction submissions;
- evidence challenges;
- page improvement proposals;
- expert review attribution.

Do not permit direct anonymous editing of canonical pages.

---

## 18. Testing Requirements

### 18.1 Data and migration tests

- claim-evidence integrity;
- revision immutability;
- deletion and supersession behaviour;
- duplicate entity aliases;
- redirect safety;
- idempotent imports;
- stale review calculations.

### 18.2 Rendering tests

- page metadata;
- canonical URLs;
- evidence labels;
- revision history;
- disputed claims;
- missing evidence;
- mobile layout;
- accessible evidence controls.

### 18.3 Workflow tests

- draft to publication;
- rejected revision;
- correction;
- supersession;
- unauthorised edit attempt;
- review-required claim;
- automated proposal rejection;
- source correction propagation.

### 18.4 Retrieval tests

- current claim preferred over superseded claim;
- disputed status preserved;
- source citation returned;
- scope note retained;
- inference clearly labelled;
- no cross-entity claim leakage.

### 18.5 SEO tests

- no duplicate canonical routes;
- no indexed drafts;
- sitemap correctness;
- redirect chains;
- structured metadata validity;
- exact-question aliases resolve to canonical pages;
- no automatically generated empty tag pages.

---

## 19. Success Measures

Trust and quality measures:

- proportion of material claims with direct evidence links;
- proportion of pages reviewed within cadence;
- correction response time;
- number of unresolved contradictory claims;
- source diversity;
- primary-source coverage;
- stale-page count;
- retrieval citation accuracy.

Usefulness measures:

- successful knowledge searches;
- page completion and onward navigation;
- repeated visits to subject hubs;
- tool-to-page engagement;
- questions answered without unsupported synthesis;
- user-submitted corrections and evidence additions.

Discovery measures:

- indexed canonical pages;
- non-branded search impressions;
- exact-question visibility;
- links earned from technical communities;
- traffic to durable pages versus transient feed items.

Traffic must not be used as a proxy for truthfulness or evidence quality.

---

## 20. Non-Goals

The initial knowledge base will not:

- become an unrestricted public wiki;
- cover every AI topic;
- auto-publish model-generated articles;
- create a mysterious aggregate trust score;
- rank the owner's projects above alternatives without evidence;
- treat vendor documentation as independent confirmation;
- mass-produce “alternative to” pages;
- become a generic programming tutorial site;
- replace original specifications or source repositories;
- guarantee security through a checklist or static scan.

---

## 21. Recommended Repository Updates

After accepting this plan:

1. Add this file under `docs/product/`.
2. Add a short entry to `ROADMAP.md` identifying the knowledge layer as a later parallel workstream rather than interrupting Phase 3 stabilisation.
3. Add a concise reference in `ai_intelligence_platform_master_build_plan.md`.
4. Add `/knowledge` to the public information architecture only when at least one complete hub and three strong pages exist.
5. Create a separate ADR only if the repository's documentation policy expects durable architecture decisions to be independently numbered.

Suggested ADR title:

```text
ADR-00XX — Adopt a Versioned, Evidence-Linked Knowledge Layer
```

Suggested implementation issue title:

```text
Build the Evidence-Linked Knowledge Base Foundation
```

---

## 22. Immediate Recommendation

Do not interrupt the current Phase 3 classification and evidence-pipeline work to build the entire knowledge system.

The immediate work should be:

1. accept and store the architectural direction;
2. add the workstream to the roadmap;
3. ensure current Phase 3 entity, claim, provenance, and clustering designs do not block future knowledge-page linkage;
4. publish the first static cornerstone pages only after the current pipeline is stable enough to provide reliable evidence records.

The knowledge base should grow from the evidence architecture, not become a separate content site bolted onto it.
