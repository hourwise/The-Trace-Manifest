# ADR 0014: Context-Preserving Sharing, Versioned Snapshots and Social Preview Integrity

- **Status:** Accepted
- **Date:** 14 July 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Story sharing, TRACE Guides, TRACE Lab, Spotlight, App Radar, Open Source Radar, Ask TRACE answers, evidence scores, social previews, public snapshots, correction history and share analytics
- **Related decisions:** ADR 0008 TRACE Model API, Endpoint Security and Cost Containment; ADR 0009 Governed Social-Media Signal Intake; ADR 0010 Expanded Editorial Scope and Governed Automatic Publication; ADR 0011 Advertising and Commercial Implementation; ADR 0012 Durable Controls; ADR 0013 TRACE Guides, TRACE Lab and Ask TRACE Knowledge Integration
- **Review trigger:** Before enabling public sharing of private Ask TRACE conversations, downloadable evidence cards, automated social posting, third-party share analytics, signed or cryptographically verifiable snapshots, or a new shareable content type

## 1. Context

Most websites share only a title and URL.

That is insufficient for TRACE because a TRACE page may also contain:

- an original TRACE summary;
- an evidence classification;
- a confidence label or score;
- a reason for that confidence;
- unresolved uncertainty;
- a last-checked date;
- corrections;
- a historical version;
- links to primary and supporting sources.

If a reader shares only the article URL, the context that makes TRACE useful may be lost.

If a reader shares only a score, the score may be misunderstood.

If a story is later corrected, a previously shared assessment may no longer match the current page.

If a private Ask TRACE answer is shared directly, it may disclose personal conversation context or preserve an answer that has not been regenerated against the current eligible corpus.

TRACE therefore needs a governed sharing model that preserves evidence context, correction history, privacy and version identity.

## 2. Decision

TRACE will implement a **context-preserving sharing system**.

A share action will:

1. generate a TRACE-owned share payload;
2. include a short TRACE summary where appropriate;
3. include evidence status;
4. include a readable confidence label;
5. include the assessment or verification date;
6. link to the current canonical TRACE record by default;
7. preserve the source content version associated with the share event;
8. support a native device share sheet where available;
9. provide safe copy and email fallbacks;
10. avoid exposing private conversations or recipient information.

Later versions may support immutable public snapshots.

The share system will not treat a score, headline or summary as complete when separated from its evidence context.

## 3. Governing law

> **A TRACE share must carry enough context to prevent a claim, score or summary from becoming detached from its evidence status, assessment date and correction record.**

A shared item must link to:

- the current canonical TRACE page; or
- an identifiable historical snapshot that also links to the current page.

## 4. Shareable content types

### 4.1 Launch-eligible content

Initially shareable:

- published TRACE stories;
- published TRACE Guides;
- published TRACE Lab records;
- public insufficient-evidence assessments;
- public methodology and explainer pages.

### 4.2 Later content

May become shareable after their own publication workflows are stable:

- Spotlight pages and updates;
- App Radar profiles;
- Open Source Radar profiles;
- resolved TRACE Predictions;
- selected public Ask TRACE answers;
- public correction records.

### 4.3 Never directly shareable

The following must not receive public share URLs:

- unpublished drafts;
- review queue items;
- internal source candidates;
- reviewer notes;
- admin-only social signals;
- private Ask TRACE conversations;
- private account data;
- unpublished corrections;
- legal holds;
- removed material that must not remain public;
- content whose rights status prohibits public presentation.

## 5. Shareability state

```ts
type ShareabilityState =
  | "not-shareable"
  | "canonical-only"
  | "snapshot-available"
  | "withdrawn"
  | "legally-restricted";
```

Only content in a published and validated state may become `canonical-only` or `snapshot-available`.

A model cannot change shareability state.

## 6. Standard share payload

```ts
interface TraceSharePayload {
  contentType:
    | "story"
    | "guide"
    | "lab-guide"
    | "spotlight"
    | "spotlight-update"
    | "app-profile"
    | "repository-profile"
    | "prediction"
    | "insufficient-evidence"
    | "public-ask-trace-answer";

  contentId: string;
  contentVersionId: string;

  title: string;
  shortSummary: string;

  evidenceLabel?: string;
  confidenceLabel?: string;
  confidenceScore?: number;
  confidenceReason?: string;

  verificationLabel?: string;
  lastAssessedAt: string;

  canonicalUrl: string;
  snapshotUrl?: string;

  shareabilityState: ShareabilityState;
}
```

The public payload must not expose:

- internal record IDs;
- reviewer identity unless publicly credited;
- private notes;
- prompt contents;
- model hidden reasoning;
- account IDs;
- conversation IDs;
- internal confidence calculations not intended for readers.

## 7. Score and confidence integrity

A numeric score must never be shared without a readable label and explanation.

Not permitted:

```text
TRACE score: 68/100
```

Permitted:

```text
Evidence confidence: Medium — 68/100

The release is confirmed, but the performance claims have not yet
been independently tested.
```

Where a numeric score could create false precision, TRACE may share only:

- High;
- Medium;
- Low;
- Insufficient evidence;
- Disputed.

The share layer must use the same public score version and confidence policy as the story page.

It must not calculate a new score independently.

## 8. Recommended share message

Example story share:

```text
TRACE: DeepSeek announces a new agent model

Summary:
DeepSeek has announced a model intended for agent and tool-use
workflows. Availability is confirmed, but the published performance
claims have not yet been independently replicated.

Evidence status:
Official announcement with unverified vendor performance claims

TRACE confidence:
Medium — 68/100

Last checked:
14 July 2026

Read the full TRACE assessment and inspect the sources:
https://www.thetracemanifest.com/stories/example
```

Example insufficient-evidence share:

```text
TRACE assessment: Insufficient evidence

Claim:
The new model is twice as fast as its predecessor.

Available:
One vendor announcement.

Missing:
Independent testing, reproducible methodology and raw benchmark data.

View the current evidence:
https://www.thetracemanifest.com/evidence/example
```

## 9. Quick and full share formats

TRACE should support at least two generated formats.

### 9.1 Quick share

Optimised for SMS and messaging applications:

```text
DeepSeek has announced a new agent model. The release is confirmed,
but the performance claims remain independently unverified.

TRACE confidence: Medium
https://www.thetracemanifest.com/stories/example
```

### 9.2 Full TRACE share

Optimised for email, WhatsApp and copy-to-clipboard:

- headline;
- summary;
- evidence status;
- confidence;
- confidence reason;
- last assessed date;
- canonical or snapshot URL.

The website cannot reliably know which destination the operating system will select.

The default native payload should therefore remain concise.

A separate **Copy full TRACE summary** action may provide the longer version.

## 10. Native sharing

Where supported, TRACE will use the browser or operating system’s native share interface.

The user must initiate the action through an explicit gesture, such as pressing Share.

The implementation should pass:

- title;
- short text;
- canonical or snapshot URL.

TRACE must expect that some destination applications may ignore:

- title;
- text;
- line breaks;
- metadata fields.

The canonical URL and page preview must therefore remain sufficient on their own.

## 11. Fallback actions

Where native sharing is unavailable or fails, provide:

```text
Share
├── Copy TRACE summary and link
├── Copy link only
├── Email
└── Cancel
```

Later additions may include:

- download evidence card;
- copy citation;
- create snapshot;
- post to an approved TRACE-owned social account.

TRACE does not need separate direct integrations with WhatsApp, SMS, email clients and every social platform during the initial implementation.

## 12. Canonical sharing

The initial default is to share the current canonical TRACE page.

Example:

```text
/stories/deepseek-agent-model
```

The share record should still preserve:

- version shared;
- evidence label at sharing time;
- confidence at sharing time;
- assessment timestamp.

The recipient opening the canonical page sees the current assessment and correction history.

## 13. Versioned snapshots

Later, TRACE may support immutable or append-only public snapshots.

Example route:

```text
/share/story/{storyId}/version/{versionId}
```

A snapshot should preserve:

- title;
- summary;
- evidence label;
- confidence label and score;
- confidence reason;
- assessment date;
- source relationships;
- story version;
- correction state at that time.

A historical snapshot must display:

> **This assessment has since been updated. View the current TRACE record.**

The historical snapshot must not silently redirect to the current story and erase the original context.

## 14. Snapshot integrity

```ts
interface TraceShareSnapshot {
  id: string;
  publicToken: string;

  contentType: TraceSharePayload["contentType"];
  contentId: string;
  contentVersionId: string;

  payload: TraceSharePayload;

  createdAt: string;
  createdByUserId?: string;

  currentCanonicalUrl: string;

  status:
    | "active"
    | "superseded"
    | "withdrawn"
    | "legally-restricted";

  supersededByVersionId?: string;
  withdrawalReasonCode?: string;
}
```

Future cryptographic hashes or signatures may be added, but they are not required for the initial implementation.

## 15. Corrections and updates

When a shared story changes:

1. the canonical page displays the current version;
2. prior versions remain preserved under the append-only history model;
3. substantive corrections are visible;
4. snapshots remain associated with their original version;
5. snapshots show whether a newer version exists;
6. live Open Graph metadata reflects the current canonical version;
7. withdrawn material shows an appropriate status;
8. Ask TRACE stops using invalidated evidence under the evidence-lifecycle rules.

A correction must not overwrite a prior shared assessment without preserving its history.

## 16. Withdrawal and legal restrictions

A withdrawn snapshot may show a minimal status page where lawful and appropriate:

```text
This TRACE assessment has been withdrawn.

Reason:
The primary source was withdrawn and the claim can no longer be
supported.

View the correction record.
```

Where continued publication is legally restricted, TRACE may remove the public body and retain only the minimum internal audit record.

`legally-restricted` content must not be available through:

- native sharing;
- public snapshots;
- Open Graph previews;
- public APIs;
- search indexing.

## 17. Rich social previews

Every shareable canonical page should provide current Open Graph and equivalent metadata.

Required properties:

- title;
- TRACE-authored description;
- canonical URL;
- representative share image;
- content type;
- last assessed date where practical.

Example description:

```text
Release confirmed. Performance claims not yet independently
replicated. TRACE confidence: Medium.
```

The preview should communicate:

- what changed;
- evidence status;
- confidence;
- TRACE identity.

It should not imply that TRACE is the original publisher of third-party reporting.

## 18. Generated share cards

TRACE may generate a restrained evidence card for link previews.

Example:

```text
THE TRACE MANIFEST

DeepSeek announces a new agent model

OFFICIAL ANNOUNCEMENT
Performance claims not independently verified

CONFIDENCE: MEDIUM
Checked 14 July 2026
```

Generated cards must:

- use TRACE branding;
- avoid third-party logos unless permission exists;
- avoid third-party article images by default;
- remain readable at social-preview sizes;
- include an assessment date;
- avoid misleading “breaking news” styling;
- avoid presenting a vendor claim as a confirmed result.

## 19. Content-specific templates

### 19.1 Story

Include headline, short summary, evidence status, confidence, assessment date and TRACE URL.

### 19.2 Guide

Include guide purpose, difficulty, verification status, last verified date and guide URL.

### 19.3 TRACE Lab

Include tested purpose, environment, verification status, tested date, result and URL.

### 19.4 Spotlight

Include subject, current status, latest meaningful update, update date and full timeline URL.

### 19.5 App Radar

Include app name, supported platforms, why it was selected, review depth, last checked date and TRACE URL.

A listing-only profile must not imply independent testing.

### 19.6 Open Source Radar

Include project purpose, detected licence, maturity, latest meaningful release, review depth and TRACE URL.

### 19.7 Prediction

Include prediction statement, confidence, resolution date, status and methodology link.

Only published predictions may be shared.

### 19.8 Insufficient evidence

Include claim assessed, what TRACE found, what is missing, what would resolve it and evidence page URL.

## 20. Ask TRACE sharing

Private Ask TRACE conversation URLs must not be publicly shareable.

A user may later choose:

```text
Create shareable TRACE answer
```

The system must then:

1. identify the exact question intended for publication;
2. remove private conversational context;
3. remove personal information;
4. re-run retrieval against the current eligible corpus;
5. generate a bounded public answer;
6. validate citations;
7. validate evidence and uncertainty labels;
8. create a separate public record;
9. show the generation and evidence date;
10. require explicit user confirmation before publication.

A shared public answer is not a public copy of the conversation.

## 21. Public Ask TRACE answer model

```ts
interface PublicAskTraceAnswer {
  id: string;
  slug: string;

  publicQuestion: string;
  publicAnswer: string;

  sourceIds: string[];
  guideIds: string[];
  storyIds: string[];

  evidenceStatus: string;
  confidenceLabel?: string;
  confidenceScore?: number;
  confidenceReason?: string;

  generatedAt: string;
  lastEvidenceCheckAt: string;

  originatingConversationId?: string; // private, never exposed
  createdByUserId?: string;           // private, never exposed

  publicationStatus:
    | "draft"
    | "awaiting-confirmation"
    | "published"
    | "withdrawn";
}
```

The originating account and conversation relationship remain private.

## 22. Public Ask TRACE answer lifecycle

If evidence later changes:

- mark the answer as potentially stale;
- regenerate only through the normal evidence workflow;
- preserve the earlier answer version;
- display corrections;
- link to the latest version;
- exclude withdrawn evidence immediately.

A public Ask TRACE answer is a versioned publication, not an immortal model response.

## 23. Copyright and attribution

Share text must use original TRACE wording.

TRACE must not automatically include:

- copied article bodies;
- long quotations;
- third-party images;
- social-media screenshots;
- full repository README content;
- source code;
- full app-store descriptions;
- publisher branding.

The share links to TRACE.

The TRACE page links prominently to the original sources.

Short quotations remain governed by the relevant editorial and rights policies.

## 24. Source attribution in shared material

Where space permits, a full share may state:

```text
Based on:
Official DeepSeek announcement and independent technical reporting.
```

The share should not list many raw source URLs.

The TRACE page remains the canonical evidence map.

The short share payload must not imply that TRACE independently observed an event where it relied on reporting or an official statement.

## 25. Privacy

TRACE may record aggregate share events such as:

- share action initiated;
- content type;
- content ID;
- content version;
- native share attempted;
- copy summary used;
- copy link used;
- snapshot created;
- timestamp.

TRACE must not attempt to collect:

- recipient identity;
- contact lists;
- destination message contents;
- chosen individual recipient;
- private data from the destination application;
- contents of the user’s clipboard after leaving TRACE.

## 26. Share analytics model

```ts
interface TraceShareEvent {
  id: string;

  contentType: TraceSharePayload["contentType"];
  contentId: string;
  contentVersionId: string;

  action:
    | "native-share-opened"
    | "summary-copied"
    | "link-copied"
    | "email-opened"
    | "snapshot-created";

  occurredAt: string;

  accountId?: string;
  anonymousSessionId?: string;

  destinationPlatform?: never;
  recipient?: never;
}
```

Analytics should be aggregated and retained only as long as needed.

## 27. Security

The share system must prevent:

- arbitrary public snapshot creation from private content;
- guessing private content IDs;
- stored cross-site scripting in titles or summaries;
- open redirects;
- unsafe destination URLs;
- snapshot mutation;
- unbounded share-image generation;
- abuse of email-share endpoints;
- leakage of internal metadata;
- cache poisoning.

Controls include:

- server-side authorisation;
- canonical content lookup;
- schema validation;
- sanitisation;
- signed or unguessable snapshot tokens;
- rate limiting;
- idempotency;
- output encoding;
- content-security policy;
- safe image rendering;
- bounded payload lengths.

## 28. Email sharing

A simple email share may use a `mailto:` link initially.

The generated subject and body must:

- remain concise;
- contain the TRACE URL;
- avoid sensitive information;
- avoid attaching third-party content;
- avoid automatically sending email.

A later server-sent email feature requires:

- explicit user action;
- recipient validation;
- abuse controls;
- consent and privacy review;
- separate implementation approval.

## 29. Automated social posting

This ADR does not authorise automated posting to TRACE-owned social accounts.

A later implementation must separately decide:

- platform integrations;
- editorial approval;
- scheduling;
- corrections;
- deletion;
- platform-specific formatting;
- API terms;
- account security;
- reply and moderation policy.

Share payload generation may later be reused by that system.

## 30. Accessibility

The sharing interface must:

- use a labelled button;
- support keyboard activation;
- expose status messages to assistive technology;
- not rely on colour alone for confidence;
- provide text alternatives for share cards;
- preserve readable line lengths;
- show copy success or failure clearly;
- permit dismissal without trapping focus.

## 31. Search and indexing

Canonical story and guide pages may be indexed normally.

Snapshot pages should:

- default to `noindex, follow` unless they provide independent public value;
- identify the canonical current page;
- avoid duplicate search results.

Withdrawn and legally restricted snapshots must not remain indexable.

## 32. Caching

Canonical preview metadata may be cached.

Cache keys must include:

- content ID;
- content version;
- preview template version;
- language;
- image size where relevant.

A substantive correction should invalidate the current preview cache.

Historical snapshot previews remain tied to their original version and must not be silently regenerated with current content.

## 33. Localisation

Share payloads may later support TRACE interface languages.

The evidence state must retain one canonical internal value while presenting a translated public label.

Translation must not alter:

- confidence score;
- source relationship;
- evidence classification;
- correction status;
- assessment date.

The canonical TRACE URL should remain stable.

## 34. Failure behaviour

If native sharing fails:

- do not lose the page state;
- offer copy summary and copy link;
- do not automatically retry repeatedly;
- do not create duplicate snapshots;
- display a clear error;
- log only bounded technical metadata.

If snapshot creation fails, default to canonical sharing.

## 35. Implementation phases

### Phase SH1 — Canonical story sharing

- add Share button;
- generate short TRACE payload;
- use native sharing where supported;
- add copy-summary fallback;
- add copy-link fallback;
- add basic email action;
- add aggregate share events.

### Phase SH2 — Rich previews

- add dynamic Open Graph metadata;
- generate TRACE-branded share cards;
- include evidence label and date;
- add correction-aware cache invalidation;
- test common messaging previews.

### Phase SH3 — Guide and Lab templates

- add content-specific payloads;
- display verification status;
- include last verified date;
- preserve source-linked canonical pages.

### Phase SH4 — Versioned snapshots

- add snapshot schema;
- add immutable version relationship;
- add current-version banner;
- add withdrawal state;
- add `noindex` policy;
- add unguessable public tokens.

### Phase SH5 — Public Ask TRACE answers

- add explicit create-shareable-answer flow;
- remove private context;
- re-ground against current corpus;
- validate citations;
- require user confirmation;
- preserve answer versions and corrections.

### Phase SH6 — Later extensions

Separate approval required for:

- download evidence cards;
- QR codes;
- signed snapshots;
- server-sent sharing;
- automated social posting;
- public embeds;
- third-party analytics.

## 36. Acceptance criteria

### Context integrity

- shared scores always include a readable label;
- shared assessments include a date;
- every share links to a canonical or versioned record;
- correction history remains reachable;
- historical snapshots identify newer versions.

### Privacy

- private Ask TRACE conversations are not directly public;
- recipients are never collected;
- contacts are never requested;
- public answers contain no private conversation context;
- internal IDs are not exposed.

### Rights

- shared text is TRACE-authored;
- third-party bodies and media are not copied;
- original sources remain linked from the TRACE page;
- app-store and repository content is not reproduced wholesale.

### Security

- unpublished content cannot generate a public share;
- snapshot tokens cannot be guessed easily;
- payloads are sanitised;
- redirects are controlled;
- share-image generation is bounded;
- repeated actions are idempotent.

### Corrections

- canonical pages show the latest version;
- prior versions remain preserved;
- corrected previews update;
- historical snapshot previews do not mutate silently;
- withdrawn sources propagate under the evidence-lifecycle rules.

## 37. Required cross-references (implemented)

ADR 0010 states:

> **Public sharing of TRACE stories and assessments is governed by ADR 0014. Shared scores and evidence labels must remain connected to an assessment date, content version and current correction record.**

ADR 0013 states:

> **Private Ask TRACE conversations are not directly public or shareable. Any shareable answer must be regenerated as a bounded public record, stripped of private conversation context, validated against the current eligible corpus and governed by ADR 0014.**

## 38. Consequences

### Positive

- shared TRACE links carry meaningful evidence context;
- scores are less likely to be misunderstood;
- corrections remain visible;
- guides become easier to distribute;
- insufficient-evidence results become shareable analytical products;
- Ask TRACE answers can later be shared without exposing private conversations;
- rich previews reinforce TRACE’s trust model.

### Negative

- versioned snapshots add storage and routing complexity;
- social-preview caches may remain stale temporarily;
- destination applications may ignore supplied share text;
- public Ask TRACE answers require a separate publication workflow;
- withdrawal and legal restrictions require careful handling.

### Accepted trade-off

TRACE will accept additional versioning and presentation complexity rather than allowing its assessments to circulate as context-free scores, stale summaries or private conversation links.

## 39. Decision summary

TRACE will provide a context-preserving share feature using native device sharing where available and safe fallbacks elsewhere.

Shared content will include a TRACE-authored summary, evidence status, confidence label, assessment date and a link to the canonical or versioned record.

Scores will never be shared without readable context.

Canonical pages will display the current assessment and correction history. Later versioned snapshots will preserve the exact assessment shared while clearly linking to any newer version.

Private Ask TRACE conversations will never be shared directly. Any public Ask TRACE answer must be regenerated, stripped of personal context, re-grounded against the current eligible corpus and published as a separate versioned record.
