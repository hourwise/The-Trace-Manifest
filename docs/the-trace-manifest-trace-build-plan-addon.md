# The Trace Manifest — Build Plan Add-on

## T.R.A.C.E. Editorial Intelligence, Ask TRACE, Predictions and Newsletter

**Status:** Proposed  
**Project:** The Trace Manifest  
**Add-on type:** Product and editorial capability expansion  
**Primary identity:** **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence**

---

## 1. Purpose

This add-on extends The Trace Manifest from a source-grounded AI news and knowledge platform into a more recognisable editorial intelligence product.

T.R.A.C.E. becomes the named research and editorial entity across the platform.

The expansion introduces four connected capabilities:

1. **Ask TRACE** — source-grounded questions and answers over indexed material.
2. **TRACE Editorial** — clearly separated summaries, analysis, context and evidence.
3. **TRACE Predicts** — accountable weekly forecasts based on observed reporting, releases and public signals.
4. **The Trace Weekly** — an opt-in newsletter containing the most important developments, editorial analysis, selected reader questions and prediction updates.

The objective is not to create a generic AI chatbot or automated content mill. The objective is to provide a visible, evidence-led editorial layer with explicit provenance, uncertainty and accountability.

---

## 2. Product Position

The Trace Manifest should be positioned as:

> A source-grounded AI intelligence publication with traceable evidence, accountable analysis and scored predictions.

T.R.A.C.E. should be presented as:

> **Traceable Research, Analysis, Context and Evidence**

T.R.A.C.E. is not a fictional all-knowing persona. It is the named interface through which the platform presents researched summaries, analysis, answers and forecasts.

---

## 3. Editorial Laws

### LAW-TRACE-001 — Evidence before assertion

T.R.A.C.E. must not present a factual claim without an attributable source or an explicit statement that the claim is unverified.

### LAW-TRACE-002 — Summary and analysis must remain separate

Neutral summaries, reported claims, confirmed facts, editorial interpretation and predictions must be visibly distinguishable.

### LAW-TRACE-003 — Inference must be labelled

Any conclusion not directly stated by a source must be marked as analysis, inference or prediction.

### LAW-TRACE-004 — Source ownership must remain visible

Every article summary, analysis and answer must link prominently to the original reporting, repository, paper, announcement or primary source.

### LAW-TRACE-005 — Model visibility is publication exposure

Any material supplied to T.R.A.C.E. for answer generation must be treated as potentially exposable. Sensitive, private or restricted material must not enter the public retrieval corpus.

### LAW-TRACE-006 — Predictions must be falsifiable

Each published prediction must define:

- what is expected to happen;
- the forecast period;
- the assigned probability;
- the evidence supporting it;
- what would count as confirmation;
- what would count as failure or invalidation.

### LAW-TRACE-007 — Published predictions are immutable

Once published, the wording, probability and evaluation window of a prediction must not be silently changed.

Corrections may be appended through a visible amendment record.

### LAW-TRACE-008 — Failed predictions remain public

Incorrect, partially correct, unresolved and invalidated forecasts must remain visible in the prediction archive.

### LAW-TRACE-009 — Automation may draft, but publication remains governed

Generated summaries, analysis, newsletter content and predictions must pass the configured review policy before public release.

### LAW-TRACE-010 — Uncertainty is a valid outcome

T.R.A.C.E. must be permitted to answer:

- evidence is insufficient;
- sources conflict;
- the matter remains unresolved;
- no reliable conclusion can yet be drawn.

---

## 4. Scope

### In scope

- T.R.A.C.E. brand identity and platform copy.
- Source-grounded article summaries.
- Separate T.R.A.C.E. editorial analysis.
- Claim classification and uncertainty labelling.
- Ask TRACE question answering.
- Source citations and evidence trails.
- Weekly TRACE Predicts feature.
- Prediction archive and scorecard.
- Newsletter signup and subscriber management.
- The Trace Weekly newsletter workflow.
- Human review and approval controls.
- Corrections and amendment records.
- Basic editorial metrics.
- Abuse controls and rate limiting.

### Out of scope for the first implementation

- Fully autonomous publishing.
- Private enterprise knowledge bases.
- Personalised investment, medical or legal predictions.
- Trading or betting recommendations.
- Unmoderated public comments.
- User-generated predictions.
- Paid subscriptions.
- Mobile applications.
- Fully automated social-media posting.
- Real-time breaking-news push alerts.

---

## 5. T.R.A.C.E. Brand Integration

### Required naming

Use the full form on first introduction:

> **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence**

Use **TRACE** in ordinary interface copy after the first introduction.

### Required navigation additions

Recommended primary or secondary navigation entries:

- Ask TRACE
- TRACE Analysis
- TRACE Predicts
- Newsletter

### Suggested interface copy

#### Ask TRACE

> Search the evidence, follow the source trail and understand what changed.

#### TRACE Analysis

> Reporting separated from interpretation, with sources, context and uncertainty kept visible.

#### TRACE Predicts

> Accountable weekly forecasts based on current reporting, releases and public signals.

#### Newsletter

> The week’s most important AI developments, what they mean, and what TRACE expects next.

### Brand voice

TRACE should be:

- calm;
- evidence-led;
- concise;
- sceptical without being dismissive;
- explicit about uncertainty;
- resistant to hype;
- willing to distinguish marketing claims from demonstrated facts.

TRACE should avoid:

- exaggerated certainty;
- anthropomorphic claims of understanding;
- promotional language;
- clickbait;
- fake quotations;
- invented consensus;
- vague predictions that cannot be evaluated.

---

## 6. Editorial Content Model

Every processed story should support distinct content layers.

### 6.1 Source record

Represents the original external material.

```ts
interface TraceSource {
  id: string;
  canonicalUrl: string;
  title: string;
  publisher: string;
  author?: string;
  publishedAt?: string;
  observedAt: string;
  sourceType:
    | "news"
    | "blog"
    | "documentation"
    | "repository"
    | "paper"
    | "announcement"
    | "social-post"
    | "video"
    | "podcast"
    | "other";
  primarySource: boolean;
  contentHash?: string;
  trustNotes?: string;
}
```

### 6.2 Story record

Represents the platform’s own structured treatment of a source or source cluster.

```ts
interface TraceStory {
  id: string;
  slug: string;
  headline: string;
  dek?: string;
  sourceIds: string[];
  topicIds: string[];
  status:
    | "draft"
    | "in-review"
    | "approved"
    | "published"
    | "corrected"
    | "withdrawn";
  summary: string;
  analysis?: string;
  context?: string;
  caveats?: string[];
  confidence: "high" | "medium" | "low" | "unresolved";
  publishedAt?: string;
  updatedAt: string;
}
```

### 6.3 Claim record

Claims should be extractable and classifiable independently of article prose.

```ts
type TraceClaimClass =
  | "reported"
  | "confirmed"
  | "claimed"
  | "inferred"
  | "analysis"
  | "unresolved"
  | "disputed";

interface TraceClaim {
  id: string;
  storyId: string;
  text: string;
  classification: TraceClaimClass;
  sourceIds: string[];
  confidence: number;
  notes?: string;
}
```

### 6.4 Correction record

```ts
interface TraceCorrection {
  id: string;
  storyId: string;
  createdAt: string;
  summary: string;
  previousText?: string;
  correctedText?: string;
  reason: string;
}
```

---

## 7. TRACE Editorial

TRACE Editorial should add value beyond an ordinary generated summary.

### Required article structure

Each TRACE-enhanced article should support:

1. **What happened**  
   A concise neutral summary.

2. **What is confirmed**  
   Facts independently supported by available sources.

3. **What is claimed**  
   Statements made by companies, authors or commentators that have not been independently demonstrated.

4. **TRACE Analysis**  
   Why the development matters, what may be overstated, and how it relates to earlier events.

5. **Context**  
   Relevant previous releases, policies, projects or market movements.

6. **Evidence and caveats**  
   Source list, uncertainty, missing information and conflicts.

7. **Related traces**  
   Connected stories, projects, people, repositories, papers and previous predictions.

### Editorial workflow

```text
Source ingestion
→ canonicalisation
→ deduplication
→ source clustering
→ claim extraction
→ neutral summary draft
→ evidence mapping
→ TRACE analysis draft
→ uncertainty review
→ human approval
→ publication
→ correction monitoring
```

### Publication controls

The system must support:

- reviewer identity;
- review timestamp;
- approval status;
- visible correction history;
- source count;
- primary-source indicator;
- stale-story warning where material has materially changed.

---

## 8. Ask TRACE

Ask TRACE should answer from the indexed evidence base rather than behaving as an unrestricted general chatbot.

### Core user experience

A user asks a question such as:

> What changed in MCP security this week?

TRACE returns:

- a concise answer;
- the main developments;
- why they matter;
- conflicting or unresolved points;
- source citations;
- the date range considered;
- a confidence label;
- related stories;
- a notice when evidence is incomplete.

### Required answer envelope

```ts
interface AskTraceAnswer {
  id: string;
  question: string;
  answer: string;
  keyPoints: string[];
  sourceIds: string[];
  storyIds: string[];
  confidence: "high" | "medium" | "low" | "insufficient-evidence";
  generatedAt: string;
  evidenceWindow?: {
    from?: string;
    to?: string;
  };
  caveats?: string[];
}
```

### Ask TRACE retrieval rules

Ask TRACE must:

- prefer primary sources where available;
- rank recent material where the question is time-sensitive;
- include older context where required;
- avoid citing unrelated results;
- disclose source disagreement;
- avoid answering beyond the indexed evidence without clearly marking general background;
- refuse to invent missing information;
- distinguish source fact from TRACE interpretation.

### Initial limits

For the first release:

- public questions only;
- no account required for a small daily allowance;
- rate limits per IP or session;
- maximum source set per answer;
- no private document upload;
- no unrestricted web browsing from the public question box;
- no high-stakes personalised advice.

### Abuse protection

Include:

- prompt-injection-resistant retrieval boundaries;
- source-content sanitisation;
- query length limits;
- rate limiting;
- output moderation;
- blocked attempts to expose hidden system prompts or internal metadata;
- logging without retaining unnecessary personal data.

---

## 9. TRACE Predicts

TRACE Predicts should be a weekly editorial forecast product, not an entertainment horoscope or vague trend section.

### Publishing cadence

Recommended:

- one edition per week;
- three to five predictions per edition;
- forecast window normally seven days;
- occasional longer-horizon predictions clearly marked.

### Prediction record

```ts
type PredictionOutcome =
  | "pending"
  | "correct"
  | "partially-correct"
  | "incorrect"
  | "unresolved"
  | "invalidated";

interface TracePrediction {
  id: string;
  slug: string;
  title: string;
  prediction: string;
  probability: number;
  forecastStart: string;
  forecastEnd: string;
  evidenceSourceIds: string[];
  relatedStoryIds: string[];
  reasoningSummary: string;
  confirmationCriteria: string;
  failureCriteria: string;
  status: PredictionOutcome;
  publishedAt: string;
  evaluatedAt?: string;
  evaluationNotes?: string;
  amendmentIds?: string[];
}
```

### Prediction workflow

```text
Weekly evidence set assembled
→ candidate signals extracted
→ candidate predictions generated
→ duplicates and vague claims removed
→ probability assigned
→ confirmation and failure criteria written
→ evidence checked
→ human review
→ prediction locked
→ publication
→ later evaluation
→ public scorecard update
```

### Prediction quality requirements

Reject any prediction that:

- cannot be confirmed or disproved;
- has no defined time window;
- merely predicts that a broad trend will continue;
- depends on private or unverifiable information;
- is framed to count almost any outcome as success;
- contains financial advice;
- is materially identical to another prediction;
- lacks enough evidence to justify publication.

### Public prediction archive

The archive should show:

- prediction wording;
- original probability;
- publication date;
- forecast deadline;
- supporting evidence;
- result;
- evaluation notes;
- amendments;
- related stories published after the forecast.

### Scorecard

The public scorecard should initially report simple measures:

- total predictions;
- correct;
- partially correct;
- incorrect;
- unresolved;
- invalidated;
- accuracy excluding unresolved;
- performance grouped by probability band.

Later phases may add formal calibration measures such as Brier score.

### Governance requirement

Predictions must not be retrospectively reworded to fit outcomes.

---

## 10. The Trace Weekly Newsletter

### Purpose

The newsletter should become the recurring weekly digest and retention channel for the platform.

### Proposed title

> **The Trace Weekly**

Alternative subtitle:

> The week’s biggest AI developments, what they mean, and what TRACE expects next.

### Recommended edition structure

1. **The five biggest developments**  
   Concise summaries with links.

2. **What actually matters**  
   TRACE’s editorial view on signal versus noise.

3. **What changed since last week**  
   Continuing stories and follow-up developments.

4. **Open-source watch**  
   Significant repositories, releases, standards and technical projects.

5. **Ask TRACE**  
   One selected reader question and source-grounded answer.

6. **TRACE Predicts**  
   Three to five forecasts for the coming week.

7. **Last week’s prediction scorecard**  
   Outcomes and brief evaluation.

8. **From PCGsoft / project updates**  
   Optional and restrained; should not overwhelm the editorial product.

### Subscriber record

```ts
interface NewsletterSubscriber {
  id: string;
  email: string;
  status: "pending" | "active" | "unsubscribed" | "suppressed";
  consentAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
  source?: string;
  locale?: string;
}
```

### Subscription requirements

- explicit consent;
- double opt-in where practical;
- visible privacy notice;
- unsubscribe link in every message;
- sender identity and contact details;
- suppression handling;
- consent timestamp;
- no pre-ticked marketing consent;
- no purchased email lists;
- no hidden cross-marketing consent.

### Newsletter workflow

```text
Candidate stories selected
→ TRACE summaries assembled
→ editorial commentary drafted
→ prediction section inserted
→ previous predictions evaluated
→ links and citations validated
→ human review
→ test email
→ approval
→ scheduled send
→ delivery and unsubscribe metrics recorded
```

---

## 11. Data and Storage Requirements

Recommended entities:

- sources;
- source snapshots;
- stories;
- claims;
- topics;
- entities;
- story-source relationships;
- corrections;
- questions;
- answers;
- answer citations;
- predictions;
- prediction evaluations;
- prediction amendments;
- newsletter subscribers;
- newsletter editions;
- newsletter edition items;
- newsletter send records;
- editorial approvals;
- audit records.

### Retention guidance

- published stories and predictions: permanent unless legally withdrawn;
- correction history: permanent;
- subscriber consent records: retained while needed for compliance;
- raw question logs: minimise and expire;
- unpublished generated drafts: configurable retention;
- source snapshots: retain according to copyright and operational policy;
- analytics events: aggregate where possible.

---

## 12. API and Service Boundaries

Suggested service boundaries:

```text
Source Ingestion Service
Story and Claim Processing Service
Editorial Review Service
Ask TRACE Retrieval Service
Prediction Service
Newsletter Service
Subscriber Service
Search Service
Audit and Corrections Service
```

### Example public endpoints

```text
GET  /api/stories
GET  /api/stories/:slug
POST /api/ask-trace
GET  /api/predictions
GET  /api/predictions/:slug
GET  /api/predictions/scorecard
POST /api/newsletter/subscribe
POST /api/newsletter/confirm
POST /api/newsletter/unsubscribe
```

### Internal endpoints

```text
POST /internal/stories/:id/generate-summary
POST /internal/stories/:id/generate-analysis
POST /internal/stories/:id/approve
POST /internal/predictions/generate-candidates
POST /internal/predictions/:id/approve
POST /internal/predictions/:id/evaluate
POST /internal/newsletters/:id/generate
POST /internal/newsletters/:id/approve
POST /internal/newsletters/:id/send
```

Internal write operations must require authenticated editorial roles.

---

## 13. Security and Trust Requirements

### Identity and authority

The model must not supply:

- reviewer identity;
- publication authority;
- subscriber status;
- tenant or workspace identity;
- approval status;
- sender credentials;
- API keys;
- prediction outcomes.

These must be derived from trusted server-side context.

### Secrets

Email-provider credentials and model-provider keys must:

- remain server-side;
- be encrypted at rest;
- never appear in prompts;
- never be included in public logs;
- be revocable;
- use least-privilege scopes.

### Publication safety

Every generated content operation should retain:

- model and version;
- prompt or prompt-template version;
- source set;
- generation timestamp;
- reviewer;
- approval decision;
- final published content hash.

### Prompt injection

Source documents must be treated as untrusted input.

The processing layer must prevent source text from:

- changing system instructions;
- authorising publication;
- requesting secret disclosure;
- altering source attribution;
- overriding safety or editorial rules.

---

## 14. Search and Retrieval

### Search modes

The platform should support:

- keyword search;
- topic search;
- entity search;
- source search;
- semantic retrieval;
- date-range filtering;
- primary-source filtering;
- related-story discovery.

### Retrieval ranking signals

Possible ranking factors:

- source relevance;
- primary-source status;
- publication date;
- story confidence;
- source trust notes;
- citation frequency;
- topic match;
- entity match;
- contradiction status;
- correction status.

### Retrieval transparency

Ask TRACE answers should expose enough information for a user to understand:

- which stories were used;
- which external sources support them;
- when those sources were published;
- whether the answer relied on analysis or direct reporting.

---

## 15. User Interface Additions

### Home page

Add:

- TRACE introduction;
- Ask TRACE search box;
- latest TRACE Analysis;
- latest TRACE Predicts;
- newsletter signup;
- previous prediction performance summary.

### Article page

Add blocks for:

- source summary;
- claim labels;
- TRACE Analysis;
- evidence and caveats;
- related traces;
- corrections;
- Ask TRACE follow-up prompt.

### Ask TRACE page

Include:

- question field;
- suggested questions;
- answer;
- confidence;
- sources;
- date range;
- related stories;
- feedback controls.

### TRACE Predicts page

Include:

- this week’s predictions;
- probability indicators;
- evidence links;
- evaluation deadline;
- archive;
- public scorecard;
- methodology.

### Newsletter page

Include:

- value proposition;
- frequency;
- example sections;
- signup form;
- privacy explanation;
- archive of previous editions where suitable.

---

## 16. Analytics

Track only metrics that support product and editorial improvement.

### Ask TRACE

- questions submitted;
- successful answers;
- insufficient-evidence outcomes;
- citation click-through;
- user feedback;
- repeated question themes;
- latency;
- abuse blocks.

### Editorial

- story views;
- source link clicks;
- correction rate;
- article completion;
- related-story navigation;
- newsletter selection frequency.

### Predictions

- predictions per week;
- outcome distribution;
- probability-band performance;
- archive engagement;
- evidence click-through;
- amendments.

### Newsletter

- confirmed subscriptions;
- unsubscribes;
- delivery failures;
- opens where legally and technically appropriate;
- click-through;
- subscriber growth source;
- spam complaints.

Avoid invasive tracking.

---

## 17. Accessibility Requirements

All new features must meet the existing site’s accessibility standard.

Required:

- keyboard-operable Ask TRACE;
- properly associated form labels;
- accessible validation errors;
- non-colour-only confidence and probability indicators;
- readable source lists;
- reduced-motion support;
- semantic heading structure;
- status text for screen readers;
- no auto-updating answer region without appropriate live-region handling;
- accessible newsletter confirmation and unsubscribe flows.

---

## 18. SEO and Discoverability

### Indexable pages

- TRACE identity page;
- TRACE Analysis archive;
- individual story pages;
- TRACE Predicts archive;
- individual prediction pages;
- prediction methodology;
- newsletter archive;
- topic and entity pages.

### Structured data candidates

- `NewsArticle` or `Article`;
- `Organization`;
- `Person` where human editorial authors are shown;
- `BreadcrumbList`;
- `FAQPage` only where content genuinely qualifies;
- newsletter editions as `CreativeWork` or `Article`.

Do not falsely represent generated content as human-authored.

### Metadata

Each published page should include:

- canonical URL;
- title;
- description;
- publication and modification dates;
- source attribution;
- social preview metadata;
- correction status where applicable.

---

## 19. Delivery Phases

### Phase A — Identity and editorial structure

- Adopt the full T.R.A.C.E. name.
- Add TRACE brand copy.
- Add claim classifications.
- Separate summary from analysis.
- Add source and caveat panels.
- Add correction support.

**Exit criteria:**

- TRACE appears consistently across the platform.
- At least one story can be published with summary, claims, analysis, context and evidence.
- Corrections can be recorded visibly.

### Phase B — Newsletter foundation

- Add subscriber database.
- Add signup and confirmation flow.
- Add unsubscribe and suppression handling.
- Create newsletter edition model.
- Add manual editorial assembly.
- Send a test edition.

**Exit criteria:**

- A user can subscribe and unsubscribe safely.
- Consent records are stored.
- A reviewed edition can be sent to a test list.

### Phase C — Ask TRACE MVP

- Build source-grounded retrieval.
- Add question interface.
- Add answer envelope.
- Add citations and confidence.
- Add rate limiting and abuse controls.
- Add feedback.

**Exit criteria:**

- Ask TRACE answers only from approved indexed material.
- Answers show supporting sources.
- Insufficient evidence produces an explicit non-answer.
- Prompt injection tests pass.

### Phase D — TRACE Predicts MVP

- Add prediction model.
- Add candidate generation.
- Add review and locking.
- Add publication page.
- Add manual evaluation.
- Add archive.

**Exit criteria:**

- Predictions include probability, evidence, timeframe and evaluation criteria.
- Published predictions cannot be silently edited.
- Outcomes remain visible.

### Phase E — Weekly integrated edition

- Generate The Trace Weekly draft from approved stories.
- Include Ask TRACE selection.
- Include predictions.
- Include previous forecast evaluation.
- Add final review and send workflow.

**Exit criteria:**

- A complete weekly edition can be assembled from platform records.
- All links and sources are validated before send.
- Predictions and scorecard are included.

### Phase F — Public scorecard and calibration

- Add aggregate prediction metrics.
- Add probability-band analysis.
- Add methodology page.
- Add formal calibration metric when enough predictions exist.

**Exit criteria:**

- Users can inspect historical performance.
- Results can be independently checked from the archive.
- The methodology explains partial and invalidated outcomes.

---

## 20. Testing Requirements

### Editorial tests

- summary does not contain unsupported claims;
- claim labels map to evidence;
- analysis is visibly separate;
- corrections remain visible;
- withdrawn stories are handled correctly.

### Ask TRACE tests

- retrieves relevant sources;
- rejects unrelated citations;
- handles conflicting sources;
- handles insufficient evidence;
- resists prompt injection in source content;
- does not expose internal prompts or secrets;
- respects rate limits.

### Prediction tests

- rejects missing timeframes;
- rejects vague predictions;
- locks published wording;
- records amendments;
- evaluates outcomes consistently;
- scorecard totals reconcile with archive.

### Newsletter tests

- requires valid consent;
- confirmation tokens expire;
- unsubscribe works without login;
- suppressed addresses are not mailed;
- broken links are detected;
- test sends are clearly marked;
- duplicate sends are prevented through idempotency.

### Security tests

- editorial actions require correct role;
- public users cannot publish;
- model output cannot set approval state;
- provider keys never appear in logs or prompts;
- source content cannot override system policy;
- subscriber data is not publicly queryable.

---

## 21. Acceptance Criteria

This add-on is complete when:

1. The platform uses the identity **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence**.
2. TRACE-enhanced articles distinguish summary, claims, analysis, context and caveats.
3. Ask TRACE answers from approved indexed evidence with citations and uncertainty.
4. Predictions are evidence-linked, probabilistic, time-bounded and falsifiable.
5. Published predictions are locked and remain visible after evaluation.
6. A public archive shows prediction outcomes.
7. Newsletter subscription, confirmation and unsubscribe flows work.
8. The Trace Weekly can include major stories, analysis, Ask TRACE, predictions and a scorecard.
9. Generated content requires the configured review policy before publication or sending.
10. Corrections and amendments are visible and auditable.
11. Secrets, subscriber data and internal prompts are not exposed.
12. Accessibility, SEO and responsive behaviour meet the existing project standard.

---

## 22. Recommended Immediate Next Actions

1. Add this document to the project build-plan or roadmap directory.
2. Add the full TRACE name to the primary product documentation.
3. Reserve the following navigation and route names:
   - `/ask-trace`
   - `/analysis`
   - `/predicts`
   - `/newsletter`
4. Add the editorial laws to the governing documentation.
5. Implement newsletter signup before the full newsletter workflow so interest can be collected early.
6. Build article summary and analysis separation before Ask TRACE.
7. Begin TRACE Predicts only after the source corpus and editorial pipeline are stable enough to produce evidence-based forecasts.
8. Preserve all predictions and evaluations from the first public edition onward.

---

## 23. Final Product Statement

> **T.R.A.C.E. — Traceable Research, Analysis, Context and Evidence — is the source-grounded editorial intelligence layer of The Trace Manifest. It explains what happened, distinguishes evidence from claims, answers questions from the recorded source base, and publishes accountable forecasts whose results remain visible.**
