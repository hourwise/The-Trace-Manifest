# ADR 0009: Governed Social-Media Signal Intake and Outbound Linking

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Editorial review, community signals, story discovery, source intake, TRACE-assisted summaries and public story cards
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 TRACE Model API, Endpoint Security and Cost Containment
- **Review trigger:** Before enabling any automated social-platform API, embed, scraper, page fetcher, account monitoring or bulk social-data storage

## 1. Context

Important technology stories often emerge first on Reddit, X, Bluesky, Mastodon, LinkedIn, YouTube, GitHub Discussions and specialist forums.

Official APIs can be costly, rate-limited or contractually restricted. Automated scraping can create legal, contractual, privacy, reliability and security risks. Public social posts can nevertheless be useful as:

- discovery signals;
- first-hand reports;
- maintainer statements;
- early reports of bugs, outages and security problems;
- links to primary evidence;
- community reaction;
- tips for stories that later become independently corroborated.

TRACE therefore needs a safe initial method for adding direct links without reproducing a platform, creating a substitute feed, or treating popularity as proof.

## 2. Decision

TRACE will implement a **manual, governed social-signal intake workflow**.

The initial workflow will:

1. accept a direct URL submitted by an editor or approved contributor;
2. validate and canonicalise the URL;
3. store limited reviewer-supplied metadata;
4. classify the item as a discovery signal or attributed claim;
5. optionally ask TRACE to draft a short original summary from reviewer notes;
6. require human approval before public display;
7. display TRACE-authored text, limited attribution and an outbound link;
8. open the original post on its own platform;
9. avoid automatic full-page scraping, mirroring, media rehosting and thread reproduction;
10. keep social material separate from confirmed evidence until corroborated.

This ADR does **not** authorise automated social-platform ingestion.

## 3. Core policy

> **Social posts are signals and attributed claims, not verified facts by default. TRACE may point readers to a public original and explain why it matters, but it must not silently convert social popularity into evidential authority.**

A social signal may contribute to a story cluster. Publication status and confidence must depend on the evidence available for the underlying claim.

## 4. Initial platform allowlist

The initial allowlist may include:

- Reddit;
- X;
- Bluesky;
- Mastodon and other ActivityPub instances;
- LinkedIn;
- YouTube;
- GitHub Discussions and Issues;
- specialist public forums;
- other explicitly approved public platforms.

Each platform must have a URL parser and canonicalisation rule before acceptance.

Unknown domains are rejected by default.

## 5. Public-content boundary

TRACE may accept only content intended to be publicly accessible.

Reject or quarantine:

- protected X posts;
- private, restricted or quarantined communities where access is not public;
- private groups;
- login-circumvented content;
- leaked private messages;
- private Discord or Slack material without documented permission;
- content obtained through shared credentials;
- local, private-network or non-HTTP URLs;
- content requiring a technical restriction to be bypassed;
- deleted content supplied only as an unattributed screenshot;
- doxxing, stolen credentials or unlawfully disclosed personal data.

A reviewer being able to view an item does not prove that TRACE may reproduce it.

## 6. Public presentation

The default public card contains:

- platform label;
- TRACE-authored headline;
- short TRACE-authored summary;
- author display name or handle only where useful;
- original publication time where known;
- evidence-status label;
- corroboration status;
- direct outbound link;
- related TRACE story where applicable.

Example:

```text
COMMUNITY SIGNAL · REDDIT

Developers report unexpected tool-call arguments after a recent
agent update.

Several users describe behaviour that has not yet been independently
reproduced. TRACE has not found an official acknowledgement.

Status: Uncorroborated community report
[Open the original discussion on Reddit]
```

The card must not resemble an official embed unless TRACE is using an authorised official embed under the applicable terms.

## 7. Summary, quotation and media rules

### 7.1 Default approach

Summarise rather than copy.

The summary must:

- use original TRACE wording;
- attribute the claim;
- distinguish observation, opinion and speculation;
- avoid implying independent confirmation;
- state whether corroboration was found;
- omit unnecessary personal information;
- avoid sensational wording;
- remain materially faithful;
- link to the original context.

### 7.2 Quotations

Use short quotations only when exact wording is editorially necessary.

A reviewer must confirm that:

- the wording is exact;
- omission is not misleading;
- attribution is sufficient;
- no more is reproduced than necessary;
- the surrounding work adds independent value;
- the post remains available;
- protected media is not reproduced.

This ADR does not establish a universal safe quotation length. Copyright and fair-dealing assessments are contextual.

### 7.3 Images, video and audio

TRACE must not initially:

- download and rehost social images;
- reproduce video or audio;
- use profile photographs;
- republish screenshots routinely;
- retain deleted media;
- present third-party media as TRACE-owned.

Media should be viewed on the original platform. Rehosting requires a separate rights decision.

## 8. TRACE AI boundary

DeepSeek or another model must not independently browse arbitrary social URLs through this workflow.

Approved flow:

```text
Reviewer opens original
    -> reviewer records bounded notes
    -> model drafts short summary
    -> structured validation
    -> human approval
    -> publication
```

The model may receive:

- platform;
- reviewer notes;
- limited approved excerpt;
- claim type;
- corroborating source IDs;
- required output schema.

The model must not receive:

- platform credentials or cookies;
- private messages;
- unrestricted browsing instructions;
- arbitrary page content fetched from an untrusted URL;
- unnecessary personal data.

ADR 0008 controls token limits, call limits, logging and loop prevention.

## 9. Evidence classification

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

Interpretation:

- **discovery-signal:** lead only;
- **community-report:** attributed anecdotal report;
- **first-hand-claim:** author claims direct knowledge;
- **maintainer-statement:** attributable statement by a project maintainer or authorised account;
- **expert-opinion:** relevant analysis from a person with demonstrable expertise;
- **corroborated:** supported by separate eligible evidence;
- **disputed:** materially challenged by credible evidence;
- **removed:** original no longer available;
- **rejected:** unsuitable for editorial, legal or safety reasons.

A maintainer statement remains self-reported unless independently supported.

## 10. Data model

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

  relatedSourceIds: string[];
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

Public APIs must not expose internal reviewer notes or submitter identity.

## 11. URL security and canonicalisation

The intake endpoint must:

- accept `POST` only;
- require editor or approved-contributor authorisation;
- enforce a small request body;
- validate URL syntax;
- permit only `https` and approved `http` cases;
- reject credentials in URLs;
- reject IP-literal hosts unless explicitly approved;
- reject localhost, loopback, private, link-local and metadata-service ranges;
- reject non-standard ports by default;
- normalise platform aliases;
- strip tracking parameters;
- extract stable post identifiers where possible;
- compute a canonical hash;
- detect duplicates before insertion;
- never follow unlimited redirects;
- never perform a server-side fetch merely to validate syntax.

If availability checks are later introduced, use a dedicated restricted fetcher with SSRF protection, response-size limits, timeouts, redirect limits, content-type checks and per-domain rate limits.

## 12. Platform-specific rules

### 12.1 Reddit

- Accept direct links to public posts and comments.
- Do not bulk retrieve or store threads.
- Do not use Reddit APIs or embeds without separate approval.
- Do not imply partnership with Reddit.
- Do not preserve deleted content merely because TRACE saw it.
- Treat usernames as pseudonymous identifiers and minimise storage.
- Use Reddit as the reader destination.

Reddit APIs and official embeds are governed by separate terms. Manual linking does not authorise automated collection.

### 12.2 X

- Accept direct links to public posts.
- Reject protected-post workflows.
- Do not fetch timelines or replies automatically.
- Do not reproduce engagement counts.
- Do not imply that account verification establishes truth.
- Do not use official embeds without separate approval.
- Use the original X URL as the destination.

X provides a copy-link function for public posts. Protected posts are not public merely because a reviewer follows the account.

### 12.3 Federated and other platforms

- Retain the host as part of source identity.
- Do not assume every server has identical terms.
- Check instance-specific access conditions where needed.
- Distinguish an author account from a server endorsement.
- Avoid crawling complete threads.

## 13. Deletion, edits and link rot

TRACE must support:

- marking an original as edited;
- recording the last review date;
- marking an original unavailable;
- withdrawing the card;
- updating corroboration;
- retaining only the minimum audit record needed for corrections;
- removing reproduced quotation text when continued display is not justified.

A removed social source does not automatically invalidate a story supported by independent evidence. The story should state that the original post is unavailable where material.

## 14. Complaint and takedown process

Public cards must provide a route to report:

- inaccurate attribution;
- misleading summary;
- privacy concern;
- copyright concern;
- impersonation;
- removed or protected source;
- unsafe or illegal content.

Workflow:

1. record the complaint;
2. temporarily hide high-risk material where appropriate;
3. preserve an internal audit record;
4. review the original and evidence;
5. correct, withdraw or restore;
6. publish a correction where material.

## 15. Editorial workflow

```text
Submit URL
    -> validate and canonicalise
    -> duplicate check
    -> create pending signal
    -> reviewer opens original
    -> classify author and claim
    -> record why it matters
    -> search for primary and independent evidence
    -> optionally request bounded TRACE summary
    -> validate summary
    -> approve, reject or attach to cluster
    -> publish outbound-link card where warranted
```

No item becomes public solely because it was submitted.

## 16. Review-page implementation

Add an **Add social signal** action with:

- URL;
- detected platform;
- why this matters;
- author/handle, optional;
- publication date, optional;
- claim type;
- limited excerpt, optional;
- reviewer notes;
- related story, optional;
- related evidence, optional.

Filters:

- platform;
- review status;
- evidence status;
- corroboration;
- link status;
- story cluster;
- submitter;
- age.

Actions:

- open original;
- approve;
- reject;
- request TRACE summary;
- attach to story;
- mark corroborated;
- mark disputed;
- mark removed;
- withdraw public card.

## 17. Public UI requirements

- Use labels such as **Community signal**, **First-hand claim**, **Maintainer statement** or **Opinion**.
- Do not use **Verified** as a synonym for true.
- Show **Uncorroborated** prominently where applicable.
- Use external-link styling.
- Open the original in a new tab or browser context.
- Use `rel="noopener noreferrer"` on ordinary outbound links.
- Do not use platform branding in a way that suggests sponsorship.
- Do not display unexplained raw confidence numbers.

## 18. Future API gate

Any proposal for a Reddit, X or other social API requires a new decision covering:

- current platform terms;
- API cost;
- permitted fields;
- rate limits;
- deletion handling;
- storage duration;
- user-content rights;
- personal-data processing;
- model-training restrictions;
- monitoring scope;
- security and secret storage;
- failure and budget controls;
- substitute-product risk.

Absence of a technical barrier is not permission.

## 19. Implementation phases

### Phase S1 — Manual intake

- Create `social_signals` migration.
- Add platform allowlist and URL parsers.
- Add canonicalisation and duplicate detection.
- Add authorised intake endpoint.
- Add review form and queue.
- Add audit events.
- No model call and no server-side fetch.

### Phase S2 — TRACE-assisted summaries

- Add bounded input schema.
- Add social-summary task to the model gateway.
- Limit to one model call.
- Validate structured output.
- Require human approval.
- Record model, prompt version, tokens and cost.

### Phase S3 — Public cards

- Add distinct card component.
- Add safe outbound links.
- Add related-story association.
- Add public status labels.
- Add report/correction route.
- Test accessibility and mobile display.

### Phase S4 — Link lifecycle

- Add manual availability status.
- Add controlled link checking only after SSRF review.
- Add edit/removal workflow.
- Add takedown queue.
- Integrate corrections.

### Phase S5 — Possible official integrations

- Recheck terms and pricing.
- Produce a separate decision.
- Pilot one narrow integration.
- Do not enable bulk ingestion by default.

## 20. Acceptance criteria

### Security

- private-network URLs are rejected;
- duplicate canonical links are blocked;
- unapproved platforms are rejected;
- public clients cannot create signals;
- no platform credentials are stored;
- no arbitrary server-side fetch occurs in S1;
- model cannot call the URL;
- internal notes do not leak.

### Editorial integrity

- every public card has human approval;
- every card shows evidence status;
- summaries do not imply unsupported corroboration;
- popularity does not influence confidence by itself;
- deletion can be reflected publicly;
- primary evidence is preferred in full stories.

### Rights and privacy

- full posts and media are not mirrored;
- quotations are limited and reviewed;
- protected/private content is rejected;
- complaint and takedown routes exist;
- unnecessary personal data is not stored.

### Reliability

- canonicalisation has tests;
- platform parsers fail closed;
- malformed URLs cannot enter the queue;
- removed links do not break pages.

## 21. Consequences

### Positive

- timely discoveries without initial API cost;
- original context remains inspectable;
- TRACE avoids becoming a social mirror;
- human review reduces misinformation and prompt-injection risk;
- social material enriches discovery while remaining labelled.

### Negative

- manual review limits scale;
- posts may disappear before review;
- metadata may require manual entry;
- summaries depend on reviewer notes;
- policy changes still require monitoring.

### Accepted trade-off

TRACE prioritises lawful, controlled and transparent use over completeness or real-time automated coverage.

## 22. Required documentation updates

Update:

- `docs/sources/source-registry.md`;
- `docs/sources/ingestion-scale.md`;
- `docs/trust/editorial-independence.md`;
- `docs/product/mvp-scope.md`;
- `ROADMAP.md`;
- admin review documentation;
- privacy notice and correction process.

## 23. External references checked

Checked on 14 July 2026:

- Reddit User Agreement: https://redditinc.com/policies/user-agreement
- Reddit Developer Terms: https://redditinc.com/policies/developer-terms
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
- X Help — sharing a post link: https://help.x.com/en/using-x/post-and-moment-url
- X Help — public and protected posts: https://help.x.com/en/safety-and-security/public-and-protected-posts
- X Help — embedding a post: https://help.x.com/en/using-x/how-to-embed-a-post
- UK government copyright exceptions: https://www.gov.uk/guidance/exceptions-to-copyright

Terms must be rechecked before enabling any API, embed, automated fetch or systematic collection.

## 24. Decision summary

TRACE will initially accept manually submitted direct links to public social posts. It will publish short, original, human-approved summaries and send readers to the original platform. It will not automatically scrape, mirror or bulk ingest social content, and it will not treat social claims as verified without corroboration.
