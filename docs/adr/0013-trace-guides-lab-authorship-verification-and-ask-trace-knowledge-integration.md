# ADR 0013: TRACE Guides, TRACE Lab, Authorship, Technical Verification and Ask TRACE Knowledge Integration

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Technical guides, tutorials, how-to articles, TRACE Lab experiments, authorship, source attribution, command safety, guide versioning, freshness monitoring and Ask TRACE retrieval
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 TRACE Model API; ADR 0010 Expanded Editorial Scope; ADR 0011 Commercial Implementation; ADR 0012 Durable Controls
- **Review trigger:** Before allowing automatic guide publication, accepting executable community contributions, generating personalised command sequences, or using private user content as guide evidence

## 1. Context

TRACE should publish practical evergreen material in addition to news.

Examples:

- setting up local or home AI;
- installing and securing MCP servers;
- using Git and GitHub;
- setting up a VPS;
- deploying applications;
- configuring Cloudflare;
- installing Node.js and npm;
- troubleshooting development problems;
- setting up databases, containers and backups.

These guides can also improve Ask TRACE by providing a curated, readable knowledge layer.

Incorrect technical instructions can:

- delete data;
- expose network services;
- leak credentials;
- weaken authentication;
- create unexpected costs;
- install malicious software;
- lock users out of systems.

Guides therefore need stronger verification, provenance and freshness controls than ordinary news summaries.

## 2. Decision

TRACE will create:

- **TRACE Guides** — practical how-to and explanatory content;
- **TRACE Lab** — content personally built, run or tested under a documented environment;
- **TRACE Blogs or Notes** — attributed analysis, experience and opinion;
- **Ask TRACE knowledge integration** — retrieval from guide sections and their underlying sources.

Guides may be researched and drafted with model assistance, but must always be approved by a named human before publication.

No guide may auto-publish initially.

## 3. Authorship and accountability

Recommended bylines:

```text
Written by Phil Geran
Research and drafting assistance: TRACE
```

or:

```text
A TRACE Guide
Reviewed and tested by Phil Geran
```

For tested content:

```text
TRACE Lab
Built and verified by Phil Geran
```

For untested documentation-based content:

```text
Documentation-reviewed guide
This process has not yet been independently tested by TRACE.
```

The model is an assistant, not the accountable publisher.

## 4. Content types

```ts
type TraceContentType =
  | "story"
  | "analysis"
  | "briefing"
  | "spotlight"
  | "spotlight-update"
  | "app-profile"
  | "repository-profile"
  | "guide"
  | "lab-guide"
  | "blog"
  | "social-signal";
```

### Guide

Step-by-step instructions intended to be followed.

### TRACE Lab

A guide or experiment executed in a documented environment.

### Blog or note

Experience, interpretation or opinion. Factual claims remain sourced.

## 5. Guide categories

Initial categories:

- Local AI;
- MCP & Agents;
- Git & GitHub;
- Servers & Self-Hosting;
- Cloud & Deployment;
- Security;
- Development Tools;
- Troubleshooting;
- Mobile Development;
- Databases;
- Automation.

## 6. Standard guide contract

Every guide should include:

```text
What you will achieve
Who this is for
Difficulty
Requirements
Expected costs
Tested environment
Before you begin
Step-by-step instructions
How to verify success
Security checks
Common errors
How to undo or remove it
What to do next
Sources
Last verified
Review due
```

## 7. Verification levels

```ts
type GuideVerificationStatus =
  | "documentation-reviewed"
  | "partially-tested"
  | "fully-tested"
  | "long-term-tested"
  | "needs-review"
  | "outdated"
  | "withdrawn";
```

Meanings:

- **documentation-reviewed:** compared with current official documentation;
- **partially-tested:** main path tested, not all variations;
- **fully-tested:** completed end to end in a documented clean environment;
- **long-term-tested:** used in a real setup over time;
- **needs-review:** a version or official process changed;
- **outdated:** should not be used for procedural answers;
- **withdrawn:** excluded entirely.

## 8. Guide data model

```ts
interface TraceGuide {
  id: string;
  slug: string;
  title: string;

  category:
    | "local-ai"
    | "mcp-agents"
    | "git-github"
    | "servers-self-hosting"
    | "cloud-deployment"
    | "security"
    | "development-tools"
    | "troubleshooting"
    | "mobile-development"
    | "databases"
    | "automation";

  difficulty: "beginner" | "intermediate" | "advanced";
  verificationStatus: GuideVerificationStatus;

  testedOperatingSystems: string[];
  testedVersions: Record<string, string>;

  authorUserId: string;
  reviewedByUserId: string;

  estimatedCost?: string;

  destructiveStepsPresent: boolean;
  networkExposurePresent: boolean;
  credentialsRequired: boolean;
  rootOrAdministratorAccessRequired: boolean;
  downloadsExecutableCode: boolean;

  publishedAt: string;
  lastVerifiedAt: string;
  reviewDueAt: string;
}
```

Every edit that changes instructions creates a new guide version.

## 9. Source requirements

Guides derived from external material must preserve their sources.

Possible source types:

- official documentation;
- standards;
- package documentation;
- repository documentation;
- security advisories;
- government guidance;
- independent technical evidence;
- TRACE Lab results.

```ts
interface GuideSourceRelationship {
  guideVersionId: string;
  sourceId: string;

  relationship:
    | "instruction-source"
    | "security-source"
    | "compatibility-source"
    | "pricing-source"
    | "background"
    | "contradicting-source";

  supportsSections: string[];
  lastCheckedAt: string;
}
```

A guide should never cite only another TRACE summary where the original authority exists.

## 10. Factual blogs and opinion blogs

### Factual or instructional blogs

Require sources for externally verifiable claims.

Examples:

- setting up MCP;
- securing a server;
- hardware requirements;
- Cloudflare deployment;
- EV battery analysis.

### Experience or opinion

May state personal experience without an external citation.

Example:

> During the TRACE build, routine GitHub commit ingestion created an unusably noisy review queue.

Any added factual claim—such as a platform limit, price or version—must cite the current source.

### TRACE analysis label

```text
TRACE ANALYSIS

This section represents TRACE’s interpretation of the cited evidence.
It is not a statement made by the underlying sources.
```

## 11. Command safety

Commands require independent review from explanatory prose.

For every command, record:

- operating system;
- shell;
- working directory;
- administrator requirement;
- whether it writes or deletes;
- whether it opens a port;
- whether it downloads executable code;
- variables to replace;
- expected output;
- rollback where practical.

Commands requiring prominent warning include:

```text
curl ... | sh
rm -rf
chmod 777
sudo
docker run --privileged
--network host
firewall changes
disk formatting
database migrations
secret creation or rotation
```

They are not automatically prohibited, but must never appear unexplained.

## 12. Guide workflow

```text
Guide proposed
    -> official and primary sources gathered
    -> TRACE creates structured draft
    -> commands and versions checked
    -> security and cost review
    -> test where practical
    -> named human approval
    -> publication
    -> freshness monitoring
    -> update, warning or withdrawal
```

Model output cannot directly publish a guide.

## 13. Ask TRACE knowledge role

TRACE Guides and TRACE Lab records are eligible Ask TRACE retrieval sources.

They are curated secondary knowledge, not replacements for underlying sources.

Public sharing of a Guide, TRACE Lab record or Ask TRACE answer is governed by ADR 0014. Private Ask TRACE conversations are not directly public or shareable; any public answer must be regenerated as a bounded record against the current eligible corpus.

```ts
type TraceKnowledgeRole =
  | "primary-source"
  | "official-documentation"
  | "research"
  | "independent-reporting"
  | "trace-guide"
  | "trace-lab-result"
  | "trace-analysis"
  | "community-signal";
```

## 14. Ask TRACE retrieval policy

### “How do I…?”

Prefer:

1. current matching TRACE Guide;
2. TRACE Lab record;
3. official documentation;
4. current troubleshooting evidence;
5. community material only when clearly labelled.

### “What changed?”

Prefer:

1. official announcement or changelog;
2. current documentation;
3. independent reporting;
4. TRACE Guide for background.

### “Is this safe?”

Prefer:

1. security advisory;
2. official documentation;
3. independent research;
4. TRACE Lab testing;
5. guide safety notes.

A guide must never outrank newer conflicting primary evidence.

## 15. Ask TRACE answer pattern

```text
User question
    -> retrieve relevant guide sections
    -> retrieve underlying official sources
    -> retrieve newer eligible evidence
    -> verify guide freshness and test status
    -> generate bounded answer
    -> cite guide
    -> cite underlying sources
    -> link full guide
```

Example:

```text
Quick answer

Your project may be stored on D: while Node.js is installed on C:.
The Node installation directory must be available through PATH.

Read the full TRACE Guide:
Installing Node.js and npm on Windows

Sources:
- TRACE Guide
- Official Node.js documentation
- Microsoft PATH documentation
```

## 16. No circular evidence

Valid:

```text
Official documentation
    -> TRACE Guide
    -> Ask TRACE answer
```

Invalid:

```text
Ask TRACE answer
    -> guide generated from that answer
    -> future Ask TRACE answer cites guide
    -> guide appears independently confirmed
```

Every factual guide section must trace to an external source or documented TRACE Lab result.

Ask TRACE answers are not admitted as evidence merely because they previously appeared in a conversation.

## 17. Guide chunking and indexing

Do not index a complete long guide as one object.

Chunk by semantic section:

- summary;
- requirements;
- installation;
- configuration;
- verification;
- security;
- troubleshooting;
- rollback;
- sources.

```ts
interface GuideKnowledgeChunk {
  id: string;
  guideId: string;
  guideVersionId: string;
  headingPath: string[];
  content: string;

  category: string;
  difficulty: string;
  operatingSystems: string[];
  technologies: string[];
  testedVersions: Record<string, string>;

  verificationStatus: GuideVerificationStatus;

  sourceIds: string[];
  lastVerifiedAt: string;
  reviewDueAt: string;
}
```

Each chunk must retain section-level source IDs.

## 18. Retrieval ranking

For procedural questions, rank using:

```text
semantic relevance
+ operating-system match
+ software-version match
+ fully tested status
+ recent verification
+ official sources attached
- stale version
- unresolved issue
- documentation-only status
```

A tested Windows guide should outrank a generic Linux guide for a Windows question.

## 19. Freshness controls

```text
Current
    -> eligible for direct procedural answers

Review due soon
    -> eligible with warning

Known version change
    -> background only

Outdated
    -> excluded from procedural retrieval

Withdrawn
    -> excluded entirely
```

Example warning:

> TRACE has a related guide, but it was last tested against an older major version. The steps below use the current official documentation.

## 20. Guide monitoring

Possible automatic triggers:

- official documentation change;
- major package version;
- command deprecation;
- security advisory;
- broken source link;
- failed automated test;
- changed cloud pricing;
- reader report;
- changed provider UI.

Automation may flag or draft an update. It must not silently republish changed instructions.

## 21. Ask TRACE answer modes

Possible modes:

- Quick answer;
- Step-by-step;
- Explain the concept;
- Troubleshoot;
- Open the full guide.

Signed-in recurring conversations may guide a user through steps, but prior assistant turns remain interpretive context, not evidence.

## 22. Reader contributions

Verified users may later:

- report a broken step;
- suggest an amendment;
- submit an OS-specific variation;
- confirm a guide worked;
- propose a guide.

Reader input creates a review item and never directly edits a published guide.

Executable community contributions require a separate security review.

## 23. Commercial boundary

ADR 0011 applies.

A guide may contain affiliate links, but it must also provide:

- generic requirements;
- non-affiliate alternatives;
- disclosure before commercial links;
- price checked date;
- explanation of relevance;
- separation between instructions and commission.

Commission never influences technical instructions.

## 24. Initial guide programme

### Local AI

- run a local model at home;
- Ollama versus LM Studio;
- local AI without a dedicated GPU;
- private document chatbot;
- safe home-network exposure.

### MCP and agents

- what MCP is;
- install an MCP server;
- connect MCP to a client;
- inspect tool calls;
- secure MCP credentials;
- audit an MCP server.

### Git and GitHub

- install Git on Windows;
- clone a repository;
- move between computers;
- pull and push safely;
- recover from a bad commit;
- keep secrets out of Git;
- use Git in VS Code.

### Servers and deployment

- secure a VPS;
- SSH keys;
- install Docker;
- reverse proxy;
- Cloudflare domain setup;
- backups;
- monitoring;
- Astro to Cloudflare;
- D1 migrations;
- Supabase Edge Functions.

## 25. Implementation phases

### Phase G1 — Guide foundation

- guide and guide-version schemas;
- categories and difficulty;
- verification labels;
- author and reviewer attribution;
- tested-environment metadata;
- safety flags;
- guide routes;
- manual editorial workflow;
- corrections and reader reports.

### Phase G2 — TRACE Lab

- reproducible test records;
- clean-environment checklist;
- command verification;
- expected output;
- rollback steps;
- tested-version badges;
- outdated warnings.

### Phase G3 — Source provenance

- section-level source relationships;
- source-status checks;
- prevent publication without required provenance;
- show sources publicly;
- add TRACE analysis labelling.

### Phase G4 — Freshness monitoring

- monitor official documentation;
- detect major versions;
- flag stale commands;
- create review tasks;
- never republish automatically.

### Phase G5 — Ask TRACE integration

- index guide versions;
- chunk by section;
- preserve source IDs;
- add freshness and test metadata;
- add OS and version filters;
- exclude outdated and withdrawn content;
- add full-guide links;
- add underlying-source links;
- add quick and step-by-step modes;
- test newer primary evidence overriding stale guides;
- test circular-citation prevention;
- record which guide chunks were used.

### Phase G6 — Reader contributions

- suggest a guide;
- report a broken step;
- submit a variation;
- verified contributor workflow;
- human moderation;
- no direct executable merge.

## 26. Acceptance criteria

### Authorship and publication

- every guide has a named accountable reviewer;
- model output cannot auto-publish;
- authorship and assistance are disclosed;
- every procedural edit creates a version.

### Sources

- factual instructions preserve underlying sources;
- guide sections map to source IDs;
- Ask TRACE exposes both guide and primary sources;
- no circular evidence is accepted.

### Technical safety

- dangerous commands are flagged;
- admin/root requirements are shown;
- network exposure is shown;
- rollback exists where practical;
- tested environment is displayed.

### Freshness

- outdated guides are excluded from procedural retrieval;
- version changes create review tasks;
- last verified and review due are visible;
- automatic updates cannot silently republish.

### Ask TRACE

- guide chunks are retrieved by section;
- OS and version filters work;
- current official evidence overrides stale guide content;
- full guide and underlying sources are linked;
- retrieval audit records identify used chunks.

## 27. Consequences

### Positive

- evergreen search traffic;
- strong practical value;
- better Ask TRACE answers;
- transparent authorship;
- source-backed technical help;
- natural links from news to guides;
- affiliate opportunities without compromising trust.

### Negative

- testing is time-consuming;
- technical guides decay;
- command mistakes carry higher risk;
- maintaining versions and sources adds work;
- not every guide can be fully tested immediately.

## 28. Decision summary

TRACE will publish source-backed Guides and tested TRACE Lab content under named human responsibility. Guides will be indexed for Ask TRACE at section level, with testing, version, freshness and source metadata. Ask TRACE may summarise a guide and link the full article, but it must also preserve and expose the underlying sources and must never treat its own previous answers as independent evidence.
