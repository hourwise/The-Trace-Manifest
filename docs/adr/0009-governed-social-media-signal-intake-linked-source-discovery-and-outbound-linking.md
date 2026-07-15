# ADR 0009: Governed Social-Media Signal Intake, Linked-Source Discovery and Outbound Linking

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Editorial review, community signals, story discovery, linked articles, linked papers, linked repositories, TRACE-assisted summaries and public social-signal cards
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 TRACE Model API, Endpoint Security and Cost Containment; ADR 0010 Expanded Editorial Scope
- **Review trigger:** Before enabling any automated social API, embed, scraper, social-account monitoring, full-thread ingestion or automatic extraction of every link contained in a social post

## 1. Context

Important technology stories often emerge first on Reddit, X, Bluesky, Mastodon, LinkedIn, YouTube, GitHub Discussions and specialist forums.

Social posts can provide:

- discovery signals;
- first-hand reports;
- maintainer statements;
- early reports of bugs, outages and security issues;
- commentary on published articles;
- links to research papers and official documents;
- links to Git repositories, releases and advisories;
- community reaction and practical experience.

Official APIs may be costly or restricted. Automated scraping can create contractual, copyright, privacy, reliability and security risks. TRACE therefore needs a controlled way to accept useful public links without becoming a substitute social feed.

## 2. Decision

TRACE will implement a **manual, governed social-signal intake workflow**.

The initial workflow will:

1. accept a direct URL submitted by an editor or approved contributor;
2. validate and canonicalise the social URL;
3. store limited reviewer-supplied metadata;
4. classify the post as a discovery signal or attributed claim;
5. allow a reviewer to add linked material separately;
6. create separate source candidates for linked articles, papers, official documents, repositories, releases and advisories;
7. optionally ask TRACE to draft a short original summary from reviewer notes;
8. require human approval before a social card is published;
9. link readers to the original platform;
10. avoid automatic mirroring, full-thread scraping and media rehosting.

This ADR does not authorise bulk or automatic social-platform ingestion.

## 3. Governing principles

### 3.1 Social posts are signals, not proof

> **A social post is an attributed signal or claim by default. Popularity, verification badges, likes, reposts and comment volume do not establish evidential authority.**

### 3.2 Linked material is independent

> **An article, paper, official document, repository, release or advisory linked from a social post must enter TRACE as a separate source candidate and be assessed independently.**

The social post records how TRACE discovered the source. It does not determine:

- credibility;
- evidence classification;
- licence status;
- repository safety;
- publication eligibility;
- confidence;
- whether the linked item belongs in the same story.

TRACE may:

- reject the social post but retain the linked source;
- retain the post only as internal provenance;
- attach it as attributed commentary;
- publish it as a separate community signal;
- remove it later without removing an independently supported story.

## 4. Approved initial flow

```text
Editor submits public social URL
    -> URL validation and canonicalisation
    -> pending social-signal record
    -> reviewer opens original in browser
    -> reviewer records why it matters
    -> reviewer identifies linked material
    -> each linked item becomes a separate candidate
    -> normal source admission and story clustering
    -> optional TRACE social-summary draft
    -> human approval
    -> social card published, retained internally or rejected
```

TRACE must not automatically follow every URL embedded in every social post during the initial implementation.

## 5. Supported linked-material types

The review interface should provide:

```text
Add linked material

[ Add published article ]
[ Add research paper ]
[ Add official announcement or document ]
[ Add Git repository ]
[ Add release or changelog ]
[ Add security advisory ]
[ Add project website ]
```

Each action creates or connects to a normal TRACE source record.

## 6. Discovery provenance

```ts
type DiscoveryMethod =
  | "social-signal"
  | "rss"
  | "atom"
  | "official-api"
  | "manual-submission"
  | "article-link"
  | "citation"
  | "repository-link"
  | "release-link"
  | "related-reading";

interface SourceDiscoveryRelationship {
  id: string;
  discoveredSourceId: string;
  discoveryMethod: DiscoveryMethod;

  socialSignalId?: string;
  referringSourceId?: string;
  submittedByUserId?: string;

  discoveredAt: string;
}
```

A source may have multiple discovery relationships.

## 7. Public-content boundary

TRACE may accept only content intended to be publicly accessible.

Reject or quarantine:

- protected X posts;
- private groups or communities;
- login-circumvented material;
- leaked private messages;
- private Discord or Slack content without documented permission;
- stolen credentials or private repositories;
- content accessed using shared credentials;
- local or private-network URLs;
- deleted content provided only as an unattributed screenshot;
- doxxing or unlawfully disclosed personal data;
- links requiring a technical restriction to be bypassed.

A reviewer being able to view something does not prove TRACE may reproduce it.

## 8. Public presentation

A social card may contain:

- platform label;
- TRACE-authored headline;
- short TRACE-authored summary;
- author display name or handle where useful;
- publication time where known;
- evidence-status label;
- corroboration status;
- direct outbound link;
- related TRACE story;
- linked-source count where useful.

Example:

```text
COMMUNITY SIGNAL · REDDIT

Developers report unexpected tool-call arguments after a recent
agent update.

The reports are anecdotal. TRACE has linked the discussion to the
project advisory and an independent technical analysis.

Status: Partially corroborated
[Open the original discussion]
[Read the TRACE story]
```

The card must not imitate an official embed unless an authorised embed is deliberately used under current platform terms.

## 9. Summary, quotation and media rules

### 9.1 Summaries

TRACE should summarise rather than copy.

Summaries must:

- use original TRACE wording;
- attribute claims;
- distinguish observation, opinion and speculation;
- avoid implying independent confirmation;
- state corroboration status;
- omit unnecessary personal data;
- avoid sensational wording;
- remain faithful to the original context;
- link to the original.

### 9.2 Quotations

Short quotations may be used only when exact wording is editorially necessary.

A reviewer must confirm:

- exact wording;
- sufficient attribution;
- no misleading omission;
- no more than necessary is reproduced;
- the quotation remains available;
- the surrounding work adds independent editorial value.

This ADR does not establish a universal safe quotation length.

### 9.3 Media

TRACE must not initially:

- rehost social images;
- reproduce videos or audio;
- reuse profile photographs;
- routinely publish screenshots;
- retain deleted media;
- imply ownership of third-party media.

## 10. TRACE AI boundary

DeepSeek or another model must not independently browse arbitrary social URLs in this workflow.

Approved flow:

```text
Reviewer opens original
    -> reviewer records bounded notes
    -> model drafts a short structured summary
    -> deterministic validation
    -> human approval
```

The model may receive:

- platform;
- reviewer notes;
- limited approved excerpt;
- claim type;
- linked source IDs;
- corroboration status;
- required output schema.

The model must not receive:

- platform credentials or cookies;
- private messages;
- unrestricted browsing instructions;
- arbitrary page content fetched from an untrusted URL;
- unnecessary personal data.

## 11. Evidence states

```ts
type SocialEvidenceStatus =
  | "unreviewed"
  | "discovery-signal"
  | "community-report"
  | "first-hand-claim"
  | "maintainer-statement"
  | "expert-opinion"
  | "general-opinion"
  | "corroborated"
  | "disputed"
  | "superseded"
  | "removed"
  | "rejected";
```

A maintainer statement remains self-reported unless independently supported.

## 12. Data model

```ts
interface SocialSignal {
  id: string;

  platform:
    | "reddit"
    | "x"
    | "bluesky"
    | "mastodon"
    | "linkedin"
    | "youtube"
    | "github-discussion"
    | "forum"
    | "other-approved";

  canonicalUrl: string;
  canonicalUrlHash: string;
  externalPostId?: string;

  submittedByUserId: string;
  submittedAt: string;
  submissionReason: string;

  authorDisplayName?: string;
  authorHandle?: string;
  originalPublishedAt?: string;

  reviewerNotes: string;
  limitedExcerpt?: string;
  traceSummary?: string;

  evidenceStatus: SocialEvidenceStatus;

  corroborationStatus:
    | "not-checked"
    | "none-found"
    | "partially-corroborated"
    | "corroborated"
    | "contradicted";

  linkedSourceIds: string[];
  relatedClaimIds: string[];
  relatedStoryClusterId?: string;

  linkStatus:
    | "unknown"
    | "available"
    | "login-required"
    | "removed"
    | "blocked"
    | "unsafe";

  reviewStatus:
    | "pending"
    | "approved"
    | "rejected"
    | "withdrawn";

  reviewedByUserId?: string;
  reviewedAt?: string;
  lastLinkCheckAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

Public APIs must not expose reviewer notes or submitter identity.

## 13. URL and SSRF security

The intake endpoint must:

- accept `POST` only;
- require editor or approved-contributor authorisation;
- enforce a small body limit;
- validate URL syntax;
- allow only approved schemes;
- reject credentials in URLs;
- reject localhost, loopback, private, link-local and metadata-service ranges;
- reject unapproved ports;
- normalise host aliases;
- strip tracking parameters;
- compute a canonical hash;
- detect duplicates;
- avoid unlimited redirects;
- avoid fetching a URL merely to validate syntax.

Any later link-check fetcher must have SSRF protection, size limits, timeouts, redirect limits, content-type checks and per-domain rate limits.

## 14. Linked articles and papers

A linked article or paper enters the normal source pipeline:

```text
Canonicalise final publisher URL
    -> duplicate check
    -> identify publisher and date
    -> classify primary, secondary, research, vendor or opinion
    -> store permitted metadata
    -> create or join story cluster
    -> generate original TRACE summary where permitted
    -> publish or review under ADR 0010
```

TRACE must not:

- bypass a paywall;
- reproduce the full article;
- imply full review when only metadata was available;
- use a social poster’s interpretation as the article’s classification.

## 15. Linked repositories and releases

A linked Git repository enters the Open Source Radar pipeline under ADR 0010.

TRACE should:

1. confirm that the destination is public;
2. extract owner and repository name;
3. check for an existing profile;
4. retrieve approved metadata;
5. detect or review the licence;
6. assess project status and maturity;
7. inspect meaningful releases rather than raw commits;
8. apply safety and editorial checks;
9. attach it to a story or Open Source Radar candidate.

Public visibility does not automatically mean open source.

```ts
type RepositoryAvailability =
  | "open-source"
  | "source-available"
  | "public-unlicensed"
  | "proprietary-public-mirror"
  | "licence-unclear";
```

## 16. Platform-specific rules

### Reddit

- Accept public post and comment links.
- Do not bulk store threads.
- Do not preserve deleted content merely because TRACE saw it.
- Minimise username storage.
- Do not imply partnership.
- Use Reddit as the original destination.

### X

- Accept public post links.
- Reject protected-post workflows.
- Do not fetch complete timelines or replies.
- Do not reproduce engagement counts.
- Do not imply that a verified account establishes truth.
- Use X as the original destination.

### Federated platforms and forums

- Retain the host as part of source identity.
- Do not assume identical terms across servers.
- Avoid crawling complete threads.
- Distinguish author identity from server endorsement.

## 17. Deletion, edits and complaints

TRACE must support:

- edited-source status;
- last-reviewed date;
- unavailable-source status;
- social-card withdrawal;
- corroboration updates;
- minimum audit retention;
- removal of reproduced quotation text where continued display is unjustified.

Public cards must provide a route to report inaccurate attribution, misleading summaries, privacy or copyright concerns, protected content, impersonation and unsafe material.

## 18. Review-page implementation

Add an **Add social signal** action with:

- URL;
- detected platform;
- why it matters;
- author/handle, optional;
- publication date, optional;
- claim type;
- limited excerpt, optional;
- reviewer notes;
- linked-material controls;
- related story, optional.

Actions:

- open original;
- approve;
- reject;
- request TRACE summary;
- add linked article;
- add linked paper;
- add linked repository;
- add linked release or advisory;
- attach to story;
- mark corroborated;
- mark disputed;
- mark removed;
- withdraw public card.

## 19. Automatic-publication boundary

Social posts are always admin-approved initially.

Linked sources may enter the governed automatic-publication pipeline only after being separated from the post and independently satisfying ADR 0010.

- social post: mandatory review;
- linked official release: potentially auto-publishable;
- linked independent article: potentially auto-publishable if source policy permits;
- linked new repository: mandatory review;
- linked release from an approved repository: potentially auto-publishable.

## 20. Implementation phases

### Phase S1 — Manual intake

- schema and migration;
- platform allowlist and parsers;
- canonicalisation and duplicate detection;
- authorised endpoint;
- review form and queue;
- audit events;
- no model call and no server-side fetch.

### Phase S2 — Linked-source discovery

- discovery relationships;
- linked article, paper, official-source and repository actions;
- final-destination entry;
- source-candidate creation;
- cluster attachment;
- retain linked source when post is rejected.

### Phase S3 — TRACE summaries

- bounded input schema;
- one-call social-summary task;
- structured validation;
- human approval;
- model and cost audit.

### Phase S4 — Public cards and lifecycle

- distinct card component;
- safe outbound links;
- related-story links;
- complaint route;
- edit, removal and correction workflow.

### Phase S5 — Possible official integrations

- recheck terms and pricing;
- create a separate decision;
- pilot one narrow integration;
- do not enable bulk ingestion by default.

## 21. Acceptance criteria

### Security

- private-network URLs are rejected;
- duplicates are blocked;
- unapproved platforms are rejected;
- public users cannot create signals;
- model cannot call submitted URLs;
- reviewer notes remain private;
- no arbitrary fetch occurs in the initial phase.

### Editorial integrity

- every public social card has human approval;
- every card displays evidence status;
- linked sources are independently classified;
- a post may be rejected while its linked source is retained;
- popularity does not influence confidence by itself.

### Rights and privacy

- full posts and media are not mirrored;
- protected/private content is rejected;
- quotations are limited and reviewed;
- takedown and complaint routes exist;
- unnecessary personal data is not stored.

## 22. Consequences

### Positive

- social platforms become a high-value discovery layer;
- linked articles and repositories feed stronger stories;
- original context remains inspectable;
- TRACE avoids unauthorised bulk scraping;
- provenance shows how sources were found.

### Negative

- manual review limits scale;
- posts may disappear;
- metadata may require manual entry;
- linked material can create duplicate candidates;
- future platform changes still require monitoring.

## 23. External references to recheck before implementation

- Reddit User Agreement, Developer Terms and Data API Terms;
- X public/protected post, link and embed guidance;
- UK government copyright exceptions guidance;
- GitHub licence and REST API documentation.

## 24. Decision summary

TRACE will use social media as a manually reviewed discovery layer. Social posts remain attributed signals. Articles, papers, official documents, repositories, releases and advisories linked from them become independent source candidates. TRACE may reject the social post while retaining useful linked material.
