# ADR 0017: TRACE Knowledge Builder, Question Gap Queue, and Knowledge Document Lifecycle

**Status:** Accepted  
**Date:** 16 July 2026

## Context

The Trace Manifest requires a governed way to expand the knowledge available to Ask TRACE.

Some knowledge needs will be identified deliberately by the editor. Others will emerge from real user behaviour when Ask TRACE cannot answer a question, finds that existing evidence is stale, or performs a useful live-research answer that is not yet part of the approved knowledge base.

Without a dedicated workflow, useful research may remain trapped in one-off answers, repeated unanswered questions may be lost, and the knowledge base may become fragmented through duplicate or inconsistently formatted documents.

The platform therefore requires a one-stop Knowledge Builder inside TRACE Desk that can:

- Accept editor-supplied questions
- Capture repeated unanswered Ask TRACE questions
- Capture successfully researched live answers
- Generate governed research plans
- Produce structured knowledge documents
- Support editor review, correction, approval, expiry, and later refresh
- Promote approved knowledge into Ask TRACE
- Create or update public TRACE Guides from the same approved knowledge
- Prevent unreviewed model output from entering the trusted knowledge base

ADR 0015 defines TRACE Desk and the unified editorial operating surface.

ADR 0016 defines governed research, source admission, knowledge-first answering, live-research labels, and editor-controlled knowledge promotion.

This ADR defines the user interface, schemas, queues, lifecycle, and approval semantics for turning questions and researched answers into durable TRACE knowledge.

## Decision

TRACE Desk will include a dedicated **TRACE Knowledge Builder** workspace.

The Knowledge Builder will be the canonical interface for creating, reviewing, approving, updating, expiring, rejecting, merging, and publishing TRACE knowledge.

“One-click generation” means one click starts a governed research-and-drafting workflow. It does not mean one click silently approves model output or publishes unreviewed material.

## Knowledge Builder workspace

TRACE Desk will expose a Knowledge Builder area with at least the following views:

- New question
- Unanswered questions
- Researched answers
- Draft knowledge
- Approved knowledge
- Expiring or stale knowledge
- Guides linked to knowledge
- Rejected or held candidates

The interface will be mobile-friendly and will allow the editor to move from research request to review and approval without leaving TRACE Desk.

## Manual question creation

The editor may enter a question into a text box and optionally provide:

- Section
- Topic
- Knowledge type
- Intended audience
- Freshness requirement
- Research notes
- Preferred or excluded sources
- Desired output depth
- Whether a public guide may be appropriate

The system will then:

```text
editor question
→ scope and safety check
→ canonicalisation
→ duplicate and overlap check
→ existing knowledge retrieval
→ research eligibility decision
→ bounded research plan
→ governed source retrieval
→ evidence and claim analysis
→ structured knowledge draft
→ editor review
```

The system must check whether the question:

- Already has an approved answer
- Should update an existing answer
- Belongs inside an existing guide
- Is better represented as a story, brief, explainer, or current-status record
- Is too narrow, duplicated, out of scope, prohibited, or unsupported
- Requires immediate human review because of risk or impact

## Question-gap capture

Ask TRACE will create a **question gap** when it cannot provide a sufficient approved answer.

Gap creation may occur when Ask TRACE returns:

- `insufficient`
- `stale`
- `disputed`
- `research_unavailable`
- `knowledge_missing`
- `out_of_scope` where future scope expansion may be relevant
- A low-confidence retrieval result
- A repeated question whose current answer quality is inadequate

Gap capture must apply privacy, abuse, and retention controls before storage.

Sensitive, malicious, personally identifying, or clearly prohibited requests must not be stored as ordinary knowledge candidates.

## Canonical question grouping

The system will retain the original wording of user questions for audit and analysis but will also group semantically equivalent questions under a canonical question.

For example:

```text
What is the best closed model for coding?
Which proprietary AI is best at programming?
What is the best paid coding LLM?
```

may map to:

```text
canonical_question:
What is the best closed AI model for coding?
```

The canonical record will retain:

- Canonical identifier
- Canonical wording
- Sanitised example phrasings
- Request count
- First and most recent request dates
- Suggested section and topics
- Failure reason
- Closest existing knowledge
- Research eligibility
- Risk class
- Priority
- Editor disposition

Canonicalisation must not erase materially different intent.

## Unanswered Questions queue

TRACE Desk will expose a ranked queue of unanswered or inadequately answered questions.

Each queue item will show at minimum:

- Canonical question
- Number of requests
- First and latest request dates
- Section and topic
- Reason for failure
- Existing related knowledge
- Volatility
- Expected research cost
- Suggested output type
- Risk and review requirements

Available actions will include:

- Generate answer
- Merge with an existing question
- Update existing knowledge
- Add to an existing guide
- Turn into a new guide
- Mark out of scope
- Hold
- Ignore
- Reject

## Researched Answers queue

When Ask TRACE performs live research and produces a useful answer, the system may create a private **researched-answer candidate**.

This queue will show:

- Canonical question
- Live answer
- Answer mode
- Research date
- Source count
- Source-tier mix
- Evidence status
- Contradictions or uncertainty
- Prompt and policy version
- Suggested knowledge action
- Suggested review and expiry dates
- Number of times the question has been asked

A live-researched answer remains distinct from approved knowledge until editor approval.

## Knowledge types

Knowledge entries will use a controlled type taxonomy.

Initial types will include:

- `definition`
- `explainer`
- `comparison`
- `recommendation`
- `how_to`
- `current_status`
- `timeline`
- `product_profile`
- `model_profile`
- `policy_summary`
- `security_advisory`
- `frequently_asked_question`

The type determines required sections, evidence expectations, review rules, and default freshness policy.

TRACE may suggest a type, but the editor may override it.

## Structured knowledge document

Every generated knowledge document will follow a validated schema.

The canonical representation will be structured data stored in the platform database. Markdown may be generated for portability, editing, review, export, and version control.

A knowledge document will retain at minimum:

- Knowledge identifier
- Canonical question
- Alternative question phrasings
- Section
- Topics
- Knowledge type
- Status
- Evidence status
- Direct answer
- Detailed explanation
- Use-case distinctions
- Method or assessment criteria
- Material claims
- Claim-to-source links
- Supporting sources
- Contradictory sources
- Known limitations
- Unknowns
- Related TRACE stories
- Related knowledge
- Related guides
- Valid-from date
- Review-after date
- Hard-expiry date
- Prompt version
- Policy version
- Model provider and identifier
- Source-set hash
- Research-plan record
- Editor identity
- Revision history
- Correction and supersession history

A generated Markdown form may use a structure equivalent to:

```markdown
---
id: knowledge-example
canonical_question: Example question
section: ai-agents
topics:
  - example-topic
knowledge_type: explainer
status: draft
evidence_status: provisionally_supported
valid_from: YYYY-MM-DD
review_after: YYYY-MM-DD
hard_expiry: YYYY-MM-DD
prompt_policy_version: trace-knowledge-v1
source_set_hash: ...
---

# Question

## Direct answer

## Detailed explanation

## How TRACE assessed this

## Evidence

## Important limitations

## What remains uncertain

## Related TRACE knowledge

## Review and expiry
```

The database schema, not the generated Markdown file, remains canonical unless a later ADR changes this decision.

## Research and generation states

A knowledge-generation job will expose explicit states such as:

- `queued`
- `checking_scope`
- `checking_existing_knowledge`
- `planning_research`
- `searching`
- `retrieving_sources`
- `admitting_sources`
- `extracting_claims`
- `checking_conflicts`
- `drafting`
- `validating`
- `draft_ready`
- `needs_review`
- `approved`
- `held`
- `rejected`
- `expired`
- `failed`

The interface will show progress in human-readable terms.

Failures must be specific, retained, and retryable where appropriate.

Examples include:

- Question outside enabled scope
- Research prohibited
- Insufficient reliable evidence
- Source admission failure
- Conflicting evidence requires review
- Research budget exhausted
- Validation failure
- Audit failure
- Provider unavailable

Partial research must not be silently promoted into approved knowledge.

## Question prioritisation

The Unanswered Questions queue may rank questions using:

- Request frequency
- Relevance to enabled TRACE sections
- Expected usefulness
- Strategic editorial value
- Search or SEO value
- Current news relevance
- Evidence availability
- Knowledge gap severity
- Volatility
- Research cost
- Risk class

The editor may pin, deprioritise, merge, or dismiss any queue item.

Automated ranking is advisory and does not approve research or publication.

## Approval flow

The Knowledge Builder will support the following editor actions:

- Approve as Knowledge
- Publish as Guide
- Approve Temporarily
- Merge into Existing Knowledge
- Add to Existing Guide
- Return for More Research
- Convert to Story or Brief
- Hold
- Reject
- Mark Out of Scope

## Approve as Knowledge

**Approve as Knowledge** makes the structured entry available to Ask TRACE retrieval.

It does not automatically create a public guide page.

This action is appropriate for:

- Narrow FAQs
- Definitions
- Supporting factual records
- Product capability answers
- Model or API status answers
- Material useful conversationally but too small for a public guide

Approved knowledge retains evidence, provenance, review dates, and expiry policy.

## Publish as Guide

**Publish as Guide** will normally perform two linked actions:

1. Approve the underlying structured knowledge
2. Create or update a public TRACE Guide based on that approved knowledge

A guide is not a disconnected duplicate of the knowledge entry.

The relationship is:

```text
approved knowledge
→ Ask TRACE retrieval

approved knowledge
→ public TRACE Guide
```

A guide may draw from one or many approved knowledge entries.

A knowledge entry may exist without a public guide.

A public TRACE Guide must be grounded in approved knowledge unless a separate editorial content type and review policy explicitly permits otherwise.

## Guide overlap and synchronisation

Knowledge and guides overlap in factual foundation but serve different purposes.

### Knowledge entry

- Structured
- Evidence-oriented
- Optimised for retrieval
- May be concise
- May answer a narrow question
- Carries freshness and expiry rules
- Used by Ask TRACE

### TRACE Guide

- Publicly readable
- Editorially structured
- May combine several knowledge entries
- May include examples, navigation, comparisons, and broader context
- Optimised for human reading and discoverability

Guide publication must record which knowledge entries and revisions support each guide section.

When a linked knowledge entry changes or expires, the affected guide sections will be marked stale.

The system may propose a guide update but must not silently overwrite approved editorial text.

## Approve Temporarily

**Approve Temporarily** makes a knowledge entry retrievable for a short, explicit validity period.

This is appropriate for:

- Current model recommendations
- Pricing comparisons
- API availability
- Rapidly changing product capability
- Breaking or developing questions

Temporary approval requires:

- Valid-from date
- Review-after date
- Hard-expiry date
- Visible freshness label
- Automatic removal from normal retrieval after hard expiry unless refreshed

Temporary approval does not automatically create a durable public guide.

## More research

The editor may return a draft for another bounded research pass with focused instructions, such as:

- Find more independent evaluations
- Check current UK pricing
- Prefer official documentation
- Exclude vendor benchmarks from the deciding evidence
- Resolve a named contradiction
- Compare a missing use case

The new research revision must preserve:

- Earlier draft
- Earlier source set
- Editor instruction
- New research plan
- Added and rejected sources
- Resulting changes

The system must not erase previous evidence or reasoning history.

## Knowledge promotion rules

A researched answer must not be approved automatically.

Before approval, the system must check:

- Scope
- Source admission
- Evidence sufficiency
- Contradictions
- Duplication
- Freshness
- Review requirements
- Knowledge type
- Expiry
- Relationship to existing guides and stories
- Whether the answer should update rather than create

Major benchmark conclusions, “best model” rankings, legal claims, security claims, and other high-impact material remain subject to ADR 0004.

## Knowledge deduplication

Before creating a new entry, the system will check for:

- Equivalent canonical questions
- Existing entries with overlapping claims
- Existing guide sections
- Existing product or model profiles
- Current-status records
- Existing stories that should be linked
- Superseded or expired knowledge that should be refreshed

Possible outcomes include:

- Create new entry
- Update existing entry
- Merge entries
- Add a guide subsection
- Update a guide
- Create a current-status record
- Convert into a story
- Hold as a research gap
- Reject

The editor must be shown the proposed relationship before approval.

## Knowledge freshness and expiry

Every approved knowledge entry will have an explicit freshness policy.

Illustrative defaults include:

| Knowledge type | Typical review interval |
|---|---:|
| Current recommendation | 7–30 days |
| Pricing or API availability | 1–7 days |
| Breaking or developing status | Hours or days |
| Product capability | 30–90 days |
| Technical explainer | 6–12 months |
| Historical fact | On correction or new evidence |
| Regulation | On official change |

These are defaults and may be overridden by evidence or editorial judgement.

Ask TRACE must not rely normally on hard-expired knowledge.

Expired entries may remain visible for history and audit but must be excluded, refreshed, or clearly labelled stale before use.

## Knowledge review queue

TRACE Desk will provide dedicated queues for:

- Drafts awaiting review
- Temporary entries nearing review
- Hard expiry approaching
- Entries invalidated by corrections
- Entries affected by changed source material
- Entries contradicted by newer evidence
- Guides whose supporting knowledge changed
- Duplicate candidates
- Failed or incomplete research jobs

## Security and governance

Knowledge Builder actions must:

- Require authenticated publisher access
- Enforce role and same-origin controls
- Use the governed research gateway from ADR 0016
- Keep model and search credentials server-side
- Treat source content as untrusted data
- Apply safe retrieval and content preflight
- Preserve provenance and content hashes
- Bound search, retrieval, model, time, and cost budgets
- Record prompt, policy, model, and source versions
- Audit generation, review, approval, rejection, expiry, and publication
- Fail closed when evidence, validation, or audit is unavailable

The browser must not receive unrestricted search, fetch, or model-provider capabilities.

## Privacy

Question-gap analytics must minimise personal data.

The platform should prefer storing:

- Canonicalised question
- Sanitised examples
- Aggregate request counts
- Time ranges
- Failure reasons
- Scope and topic classifications

Raw user wording should be retained only where needed for quality, abuse, audit, or consented product improvement, and should follow defined retention rules.

Questions containing sensitive personal data must not become knowledge candidates without sanitisation and explicit review.

## Consequences

- TRACE can deliberately build knowledge around likely user questions.
- Actual unanswered questions provide a demand-driven knowledge roadmap.
- Useful live research can be reused rather than lost.
- Approved knowledge and public guides share one factual foundation.
- Ask TRACE can retrieve concise structured knowledge even when no public guide exists.
- Public guides can combine several approved knowledge entries without duplicating their evidentiary records.
- Fast-changing answers can be approved temporarily and expire safely.
- Knowledge quality improves through deduplication, evidence requirements, and editor approval.
- The platform gains additional schema, queue, revision, expiry, and guide-synchronisation complexity.
- Editorial review remains necessary for high-impact, comparative, disputed, or rapidly changing material.
- The Knowledge Builder becomes a core part of TRACE Desk rather than a separate administration system.

## Implementation Requirements

The implementation plan must include:

- Knowledge Builder interface inside TRACE Desk
- Manual question form
- Canonical question and alternative phrasing schema
- Question-gap capture from Ask TRACE
- Unanswered Questions queue
- Researched Answers queue
- Knowledge type taxonomy
- Knowledge-generation state machine
- Structured knowledge document schema
- Markdown export or review representation
- Duplicate and overlap detection
- Existing-knowledge and existing-guide matching
- Approval, temporary approval, hold, rejection, and merge actions
- Knowledge-to-guide relationship records
- Guide-section staleness tracking
- Review-after and hard-expiry enforcement
- Research revision history
- Source, claim, prompt, policy, and model provenance
- Privacy filtering and retention controls
- Full audit records
- Tests proving unreviewed research cannot enter approved knowledge or public guides
- Tests proving hard-expired knowledge is not silently used by Ask TRACE
- Tests proving guide publication also approves or references approved underlying knowledge

## Amendment: retrieval provenance and public knowledge publishing

Knowledge Builder must treat published TRACE stories, briefs, guides, and corrections as high-value internal context only. When it reuses them, it must inherit their underlying source bundle and claim-to-source mappings. It must never count a TRACE publication, a translation of a source, or several TRACE publications derived from the same announcement as independent evidence.

Every approved public knowledge entry and TRACE Guide must be rendered as stable, canonical, crawlable HTML. The page must visibly show authorship or editorial credit, evidence status, source credits, publication and modification dates, limitations, uncertainty, and related TRACE records. Public pages must enter the XML sitemap and internal navigation and expose appropriate structured metadata. Visibility is explicit: `internal`, `public_knowledge`, `public_guide`, `embargoed`, or `retired`.

Public crawlability does not grant every crawler permission for AI-search retrieval or training. Robots and reuse policies must be configurable independently for conventional search bots and recognised AI crawlers. Multilingual public URLs and `hreflang` are governed by ADR 0018.
