# The Trace Manifest — Revised Launch Scope

## Launch principle

TRACE will launch as a **focused, populated AI and agents intelligence platform**, not as a broad technology site with unfinished or empty sections.

The broader product vision remains valid, but features and verticals will remain hidden behind feature flags until they contain enough high-quality material to justify a public route.

The first release will prioritise:

* credible evidence handling;
* useful published content;
* a working Ask TRACE experience;
* a small collection of evergreen guides;
* manual editorial control;
* enough indexed material for search engines and readers to understand the site.

## Governing decisions and planning order

This launch scope is the delivery sequence for the canonical ADR set rather than a replacement for it:

- [ADR 0012](adr/0012-durable-controls-access-admin-and-publication-boundaries.md) is the prerequisite for durable publication, identity, audit and Ask TRACE controls.
- [ADR 0009](adr/0009-governed-social-media-signal-intake-linked-source-discovery-and-outbound-linking.md) limits launch social discovery to administrator-reviewed signals and separately evaluated linked sources.
- [ADR 0010](adr/0010-expanded-editorial-scope-curated-products-and-governed-auto-publication.md) defines later verticals and automatic-publication controls; the AI & Agents-only launch boundary in this document takes precedence until its content and stability gates are met.
- [ADR 0013](adr/0013-trace-guides-lab-authorship-verification-and-ask-trace-knowledge-integration.md) governs the first Guides expansion, including human ownership, source provenance, command safety, freshness and Ask TRACE retrieval.
- [ADR 0011](adr/0011-advertising-sponsorship-affiliate-marketing-and-commercial-implementation.md) keeps commercial features deferred behind their disclosure, audit and independence controls.
- [ADR 0014](adr/0014-context-preserving-sharing-versioned-snapshots-and-social-preview-integrity.md) keeps public snapshots, public Ask sharing and automated social posting out of the initial launch.

---

# Launch Foundation

## 1. AI & Agents only

Initial public coverage will focus on:

* AI models and providers;
* coding agents;
* MCP and tool use;
* automation;
* model APIs and pricing;
* open-weight models;
* AI security;
* important research and benchmarks;
* relevant regulation;
* major open-source AI projects.

Green technology, EVs, general technology, App Radar, Open Source Radar, Spotlight and TRACE Predicts remain planned but are not required for the first public launch.

Open-source releases may still appear as ordinary AI stories where directly relevant, without launching a full Open Source Radar section.

---

## 2. Approved high-signal sources

The initial source set should remain deliberately small.

Priority source classes:

* official model-provider blogs;
* official API changelogs;
* official documentation;
* official GitHub releases and advisories;
* major research papers;
* government and regulator publications;
* trusted specialist technology reporting;
* established international news organisations;
* independent technical analysis.

A readable news report may provide context, but TRACE should locate and attach the underlying official announcement, paper, release or documentation wherever possible.

Routine GitHub commits must not enter the editorial feed.

---

## 3. Manual content seeding

Before launch, the site should be populated manually with a controlled set of worthwhile stories.

Suggested starting target:

* **15–20 published stories or briefings**
* covering approximately four to six weeks of significant AI developments;
* spread across several core topics rather than one provider;
* each with at least one strong source;
* each with a TRACE-authored summary;
* each with evidence classification and publication date.

Initial story mix could include:

* major model releases;
* important API or pricing changes;
* coding-agent developments;
* MCP and tool-security stories;
* open-source model releases;
* benchmark or research findings;
* meaningful regulation or security announcements.

This gives TRACE enough content to demonstrate its method without creating an unmanageable historical archive.

---

## 4. TRACE-assisted editorial workflow

The TRACE assistant may help generate:

* headline candidates;
* concise summaries;
* “why this matters” explanations;
* source classifications;
* evidence-gap suggestions;
* initial confidence proposals;
* tags and topic classification;
* related-story suggestions.

However:

* every initial story is reviewed manually;
* the model cannot assign final evidence status;
* the model cannot publish;
* unsupported statements are removed;
* final confidence is determined by policy;
* the original sources remain visible;
* ambiguous classifications default to review.

Initial publication state:

```text
Source submitted
    → TRACE draft generated
    → evidence and citation checks
    → manual review
    → publish, revise or reject
```

Automatic publishing remains disabled at launch.

---

## 5. Correct story clustering

Multiple sources discussing the same event should produce one story cluster rather than several repetitive posts.

Example:

```text
Official provider announcement
GitHub release
Independent news report
Technical analysis
Community discussion
        ↓
One TRACE story cluster
```

The public story may show the most useful sources while preserving all internal discovery relationships.

Story clustering must be tested before increasing ingestion volume.

---

## 6. Evidence taxonomy

The initial public evidence states should remain understandable.

Recommended launch labels:

* **Official announcement**
* **Confirmed primary record**
* **Vendor-reported claim**
* **Independent reporting**
* **Independent corroboration**
* **Research result**
* **Community report**
* **Disputed**
* **Insufficient evidence**
* **Superseded**

The model may suggest a classification, but deterministic rules and human review determine the final label.

Unknown or ambiguous evidence states become:

```text
HOLD FOR REVIEW
```

They never default to publication.

---

## 7. Append-only claims and corrections

TRACE must preserve earlier versions when a story changes.

The system should retain:

* original claim;
* original publication time;
* source relationships;
* later evidence;
* corrected wording;
* reason for correction;
* correction time;
* current version.

Published material may be updated, but its prior state must not be silently erased.

This requirement should be implemented before a large archive is created.

---

## 8. Basic public feed and story pages

The initial public site needs only a small set of complete routes:

```text
Home
Latest
AI & Agents
Guides
Ask TRACE
About
Methodology
Sources
Corrections
Newsletter
```

The homepage should include:

* latest important stories;
* a short explanation of TRACE;
* featured guide;
* Ask TRACE entry point;
* newsletter signup;
* evidence-method explanation;
* links to source and corrections policies.

Do not expose navigation for empty future sections.

---

## 9. One-off Ask TRACE

The first Ask TRACE version should:

* accept one independent question;
* retrieve only approved TRACE content and sources;
* provide a bounded answer;
* show citations;
* distinguish fact, claim and analysis;
* show uncertainty;
* link to related stories and guides;
* avoid persistent conversation memory;
* return a useful insufficient-evidence result when necessary.

Anonymous usage should be tightly limited.

Saved recurring conversations can follow after authentication and account ownership controls are complete.

---

## 10. Useful “Insufficient Evidence” responses

TRACE should not respond with only:

> Insufficient evidence.

It should explain:

```text
What TRACE found

What is currently supported

What remains unconfirmed

What evidence is missing

What would change the answer

Available sources
```

Example:

```text
TRACE found one official vendor announcement but no independent
testing.

Missing evidence:
- published methodology;
- third-party benchmark;
- reproducible test results.

TRACE cannot currently confirm the performance claim.
```

This makes uncertainty one of the product’s strengths.

---

## 11. Provider-neutral model gateway

DeepSeek may be the initial provider, but the application must use TRACE-owned request and response contracts.

Provider-specific behaviour must remain inside the adapter.

TRACE-owned systems determine:

* evidence admission;
* confidence;
* citations;
* publication eligibility;
* model-call limits;
* retries;
* budgets;
* output validation.

No DeepSeek-specific response format should become the permanent public TRACE contract.

---

## 12. Review queue and publication policy

The launch review queue should support:

* priority;
* significance;
* source quality;
* evidence status;
* duplication;
* publication readiness;
* hold reason;
* rejection reason.

Initial priorities:

```text
P0 — correction, safety or legal issue
P1 — important time-sensitive story
P2 — strong ordinary candidate
P3 — useful but non-urgent
P4 — archive, merge or reject
```

The queue must have capacity limits so it does not grow indefinitely.

Low-value candidates should be filtered or archived before they become editorial tasks.

---

## 13. Admin-only social discovery

Social-link submission remains restricted to administrators initially.

There will be no public reader-submission form at launch.

The admin workflow may accept links from:

* Reddit;
* X;
* Bluesky;
* Mastodon;
* LinkedIn;
* YouTube;
* specialist forums;
* GitHub Discussions.

A social post can lead to a separately admitted:

* article;
* paper;
* official source;
* repository;
* release;
* advisory.

The social post itself requires manual review. A useful linked article or repository may be retained even when the post is rejected.

---

## 14. Basic newsletter signup

Launch requires only:

* email entry;
* confirmation;
* privacy wording;
* unsubscribe support;
* one general weekly TRACE newsletter preference.

Complex topic preferences, account integration, sponsorship and automated newsletter generation can follow later.

The first newsletters may be manually assembled from published TRACE content.

---

# First Expansion

## 15. TRACE Guides

TRACE Guides should be part of the first expansion and ideally be available at or shortly after launch.

They provide:

* evergreen search traffic;
* practical reader value;
* foundational Ask TRACE knowledge;
* internal links from stories;
* evidence for testing retrieval;
* material that remains useful during slow news periods.

Target:

> **Publish at least six complete guides before prominently launching the Guides section.**

---

## 16. Recommended first six guides

### 1. How to Install Node.js and npm on Windows

Cover:

* installing Node.js;
* checking `node -v` and `npm -v`;
* Windows PATH;
* repositories stored on another drive;
* PowerShell execution-policy errors;
* uninstalling or updating Node.js.

### 2. Git and GitHub for Beginners: Clone, Pull, Commit and Push

Cover:

* installing Git;
* cloning a repository;
* opening it in VS Code;
* checking status;
* pulling changes;
* committing;
* pushing;
* avoiding accidental branches;
* resolving basic conflicts.

### 3. How to Deploy a Static Website to Cloudflare Pages

Cover:

* connecting GitHub;
* build and output directories;
* environment variables;
* custom domains;
* common deployment failures;
* verifying the live build.

### 4. How to Run a Local AI Model at Home with Ollama

Cover:

* hardware expectations;
* installing Ollama;
* selecting a small model;
* running a first prompt;
* privacy implications;
* performance limitations;
* safe local-network access.

### 5. How to Install and Audit an MCP Server Safely

Cover:

* what MCP is;
* finding the official project;
* checking the repository;
* reviewing required credentials;
* understanding tool permissions;
* installation;
* verifying tool calls;
* removal and cleanup.

### 6. How to Secure a New VPS Before Hosting an Application

Cover:

* updates;
* non-root user;
* SSH keys;
* firewall;
* exposed ports;
* automatic security updates;
* backups;
* Docker considerations;
* how to avoid locking yourself out.

These are common, useful searches and connect naturally to TRACE’s AI, agent and development coverage.

---

## 17. Guide publication rules

Every guide must include:

* intended audience;
* difficulty;
* requirements;
* expected costs;
* tested operating system and versions;
* source documentation;
* security warnings;
* verification steps;
* troubleshooting;
* rollback or removal instructions;
* last verified date;
* review due date.

Guides are manually approved and never auto-published.

---

## 18. Ask TRACE guide integration

Once guides are published, Ask TRACE should index them by section.

Example chunks:

```text
Requirements
Installation
Configuration
Verification
Security
Troubleshooting
Removal
Sources
```

Ask TRACE may:

* provide a quick answer;
* summarise the relevant guide section;
* link to the full guide;
* show the underlying official sources;
* warn when a guide is becoming stale;
* prefer newer official documentation where it conflicts with a guide.

A TRACE Guide is curated secondary knowledge. It is not a replacement for its underlying sources.

---

# Launch Content and SEO Controls

## 19. Do not publish empty sections

Future routes should remain:

* feature flagged;
* absent from primary navigation;
* excluded from the sitemap;
* excluded from internal search;
* marked `noindex` if a preview route must exist.

A section becomes public only when it has enough content to be useful.

Suggested minimums:

| Section                  |                               Minimum before public launch |
| ------------------------ | ---------------------------------------------------------: |
| Latest feed              |                                              15–20 stories |
| Guides                   |                                          6 complete guides |
| AI & Agents landing page |                                        10 relevant stories |
| Corrections              |                  Policy page; no fake corrections required |
| Ask TRACE                | Enough approved material to answer tested launch questions |
| Newsletter archive       |                          Launch after the first real issue |

---

## 20. Seed content should remain honest

Do not backdate invented news or create filler.

The initial archive may contain:

* recent significant stories;
* evergreen explainers;
* retrospective context pieces;
* clearly dated analyses;
* guides;
* methodology pages.

A retrospective article should be labelled as such rather than presented as breaking news.

---

## 21. Recommended launch target

A credible first public version could contain:

```text
15–20 source-backed AI stories
6 TRACE Guides
1 working Ask TRACE interface
1 methodology page
1 source-policy page
1 corrections-policy page
1 about page
1 newsletter signup
1 admin-only social intake workflow
```

That is enough to feel deliberate and populated without pretending the entire long-term product already exists.

---

# Deferred Until After Launch Stability

The following remain documented but inactive:

* recurring Ask TRACE conversations;
* public contributor submissions;
* automatic publishing;
* Spotlight;
* App Radar;
* full Open Source Radar;
* Green Tech & Energy;
* EV & Mobility;
* TRACE Predicts;
* advanced newsletter personalisation;
* advertising and affiliate implementation.

They should be introduced only after the launch foundation is stable and the evidence lifecycle is functioning correctly.

---

# Final launch law

> **TRACE will launch narrow, populated and trustworthy. It will prefer a small number of useful stories and guides over empty navigation, weak automation or unfinished verticals. Manual editorial seeding will establish the initial corpus, test the evidence model and give Ask TRACE a reliable foundation before the platform expands.**
