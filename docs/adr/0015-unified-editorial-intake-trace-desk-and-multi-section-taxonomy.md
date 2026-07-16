# ADR 0015: Unified Editorial Intake, TRACE Desk, and Multi-Section Taxonomy

**Status:** Accepted  
**Date:** 16 July 2026

## Context

The Trace Manifest currently discovers source material through automated ingestion, groups related items into story clusters, and exposes an admin review page for editorial analysis and publication.

The existing flow assumes that a publishable candidate already exists as an automatically generated cluster. It does not yet provide a single editorial workflow for:

- Automatically discovered stories
- Manually pasted article links
- Manually pasted social-media posts
- Operator-written leads or tips
- Additional evidence for an existing or developing story
- Full stories, short briefs, explainers, analysis, corrections, and later knowledge content

The current admin review interface also exposes implementation details such as loading a cluster list, selecting an identifier, requesting AI analysis, filling publication fields, and publishing. This creates unnecessary friction, particularly when operating from a mobile device.

The platform is expected to launch with AI and agent coverage but may later add sections such as green technology, science, business, policy, and security. If stories are modelled only around a single free-form topic field or an AI-specific URL structure, later expansion will require disruptive schema and interface changes.

The editorial system therefore requires one canonical intake and publication lifecycle, one mobile-friendly operating surface, and a structured taxonomy that supports future sections without broadening the initial public launch.

## Decision

The Trace Manifest will implement a unified editorial operating surface named **TRACE Desk**.

TRACE Desk will be the canonical admin interface for receiving, investigating, reviewing, categorising, drafting, publishing, updating, holding, archiving, withdrawing, and correcting editorial material.

All intake methods will converge on one canonical **editorial candidate** lifecycle. Manual entries must not bypass source admission, deduplication, cluster matching, claim extraction, evidence assessment, conflict detection, human-review rules, or publication controls.

### Canonical editorial lifecycle

All story material will follow this logical sequence:

```text
source or operator lead
→ intake validation
→ source record
→ editorial candidate
→ deduplication
→ existing-cluster matching or new-cluster creation
→ classification
→ claim extraction
→ corroboration and conflict detection
→ TRACE draft generation
→ human review where required
→ publication, hold, archive, or rejection
→ later update, withdrawal, correction, or supersession
```

Automated ingestion and manual intake are different entry points into the same lifecycle. They must not create parallel publication systems.

### Supported intake modes

TRACE Desk will support the following canonical intake modes:

1. **Automated discovery**
   - RSS, official feeds, repositories, research sources, approved aggregators, and other configured sources
   - Existing scheduled ingestion remains supported

2. **Article or document URL**
   - An operator pastes a URL
   - The system validates and safely fetches the target
   - The source is deduplicated and checked against existing stories
   - TRACE identifies likely primary evidence and corroborating sources
   - A private candidate and draft are prepared

3. **Social-media post URL**
   - An operator pastes a supported social URL
   - The post and any linked external article are retained as separate source records
   - The account and post are classified as official, vendor, journalist, specialist, or community evidence
   - Social content is never silently promoted from a report or claim into confirmed fact
   - Initial launch support may be manual and provider-limited

4. **Manual lead or tip**
   - An operator supplies a working title, note, copied excerpt, optional links, and editorial reason
   - Operator notes are treated as leads, not evidence, unless supported by admitted sources
   - TRACE investigates the lead within configured scope and source policy

5. **Additional evidence**
   - A source may be attached to an existing candidate, cluster, or published story
   - New evidence triggers claim, conflict, freshness, and draft-revision checks
   - Earlier versions and publication history remain preserved

### Candidate states

Editorial candidates will use explicit lifecycle states, including at minimum:

- `new`
- `enriching`
- `researching`
- `drafting`
- `draft_ready`
- `needs_review`
- `held`
- `published`
- `archived`
- `rejected`
- `withdrawn`
- `superseded`
- `failed`

Failure must be visible and retryable. A failed enrichment or model request must not silently discard the candidate.

### TRACE draft persistence

TRACE-generated editorial drafts will be persisted server-side rather than existing only in browser fields.

A draft will retain:

- Candidate or cluster identifier
- Prompt and policy version
- Model provider and model identifier
- Source-set hash
- Generation time
- Generation status
- Headline
- Straight summary
- TRACE editorial analysis
- Why this matters
- Key facts
- Known uncertainties
- Suggested evidence status
- Suggested section and topics
- Suggested format and urgency
- Suggested related stories
- Operator edits and review state

When material evidence changes, the draft will be marked stale. Regeneration must not overwrite approved operator edits without an explicit merge or replacement action.

### TRACE Desk interface

TRACE Desk will be mobile-first and will replace the dropdown-first publication workflow as the primary editorial experience.

The main queue will present ranked candidate cards showing:

- Working headline
- Discovery or submission time
- Primary section and topics
- Source count and source mix
- Evidence status
- Conflict or uncertainty indicators
- TRACE priority recommendation
- Draft status
- Urgency
- Developing-story status
- Available actions

Default actions will include:

- Review
- Publish
- Save draft
- Hold
- Add evidence
- Mark as brief
- Archive as not news
- Reject
- Withdraw or correct where applicable

After an action, the operator may move directly to the next recommended candidate.

### Editorial ranking

Candidate ordering may consider:

- Freshness
- Source quality
- Independent corroboration
- Public significance
- Relevance to enabled TRACE sections
- Novelty against existing coverage
- Evidence conflict
- Developing-story activity
- Editorial urgency
- Draft readiness

A ranking is advisory. It must not determine publication automatically.

### Publication formats

The canonical story-format taxonomy will include at minimum:

- `full_story`
- `brief`
- `developing_update`
- `analysis`
- `explainer`
- `guide_update`
- `correction`

Story format is separate from subject classification and urgency.

### Multi-section taxonomy

The system will distinguish the following concepts:

#### Section

A broad editorial vertical. A story normally has one primary section.

Initial and future examples include:

- AI & Agents
- Green Technology
- Science
- Technology
- Business
- Policy & Regulation
- Security

Only enabled sections appear publicly. Additional sections may exist in the taxonomy while remaining hidden from navigation, automated public publication, and public Ask TRACE scope.

#### Topic

A more specific subject within or across sections.

Examples for AI & Agents include:

- Models
- Coding models
- Agents
- MCP
- Automation
- Open source
- AI safety
- AI regulation
- Infrastructure
- Benchmarks
- Robotics
- Developer tools
- Funding and business

A story may have multiple topics. One may be marked primary.

#### Story format

The editorial form of the public item, such as full story, brief, analysis, or explainer.

#### Urgency

The time-sensitive editorial status:

- `routine`
- `developing`
- `breaking`
- `major`
- `evergreen`

“Breaking news” is an urgency state, not a subject category.

#### Development status

The story’s relationship to continuing events:

- `single_event`
- `developing`
- `updated`
- `resolved`
- `superseded`

### Classification authority

TRACE may suggest:

- Primary section
- Primary and secondary topics
- Story format
- Urgency
- Development status
- Significance or priority

Each suggestion must include confidence and provenance.

Classification provenance will distinguish:

- `deterministic`
- `trace_suggested`
- `operator_selected`
- `operator_overridden`

Low-confidence classification must enter review and must not silently become public.

### Taxonomy storage

Sections and topics will use controlled identifiers and slugs rather than unrestricted free-form values.

The implementation should support entities equivalent to:

```text
sections
topics
story_topic_assignments
```

Candidate, cluster, and publication records will reference the controlled taxonomy and retain classification confidence, source, and review state.

Taxonomy changes must preserve canonical story URLs.

### Public URL policy

Canonical story URLs will remain independent of section:

```text
/stories/[slug]
```

Section and topic landing pages may use:

```text
/sections/[section-slug]
/topics/[topic-slug]
```

A story may appear in several topic views without changing its canonical URL.

### Hidden future sections

The system may classify and retain candidates for a disabled section, but disabled sections must not:

- Appear in public navigation
- Be exposed as active Ask TRACE subjects
- Be automatically published
- Be included in public feeds unless explicitly approved

This allows the architecture to support later expansion while preserving an AI-focused launch.

### Manual intake security

Manual URL and social intake must:

- Require authenticated publisher access
- Enforce same-origin browser requests
- Use server-side fetching
- Reject private, loopback, link-local, internal, and prohibited network destinations
- Restrict protocols and redirects
- Bound content size and retrieval time
- Apply source admission and content preflight
- Treat retrieved content as untrusted data
- Preserve source provenance and content hashes
- Audit allowed, denied, succeeded, and failed actions
- Keep provider credentials and internal-service secrets server-side

The browser must never receive an unrestricted fetch capability or model-provider secret.

### Human review

ADR 0004 remains authoritative for mandatory human-review boundaries.

Initial launch policy will require human approval before ordinary public story publication, even where a candidate is low risk and highly supported.

Automatic publication may be considered later only through a separate accepted decision with deterministic eligibility rules, monitoring, rollback, correction, and audit requirements.

### Corrections and updates

New evidence attached to a published story may result in:

- No public change
- Metadata or evidence-state update
- Story update
- Developing-story update
- Correction
- Withdrawal
- Supersession by a new story

Published text must not be silently replaced without retaining revision and correction history.

## Consequences

- TRACE Desk becomes the primary newsroom operating surface.
- Automated and manual discoveries share one evidence and publication lifecycle.
- Manual social and URL submissions cannot bypass source or review controls.
- Editorial work becomes substantially faster and more practical from a phone.
- TRACE commentary and classification are prepared before the operator opens a candidate whenever possible.
- Future sections can be enabled without redesigning canonical stories or public URLs.
- The schema and migration work are larger than simply extending the existing review form.
- Server-side draft persistence, revision handling, and stale-draft detection are required.
- Taxonomy management and classification tests become part of the platform contract.
- Social-provider support may remain limited at launch because provider access and extraction rules vary.
- The AI-only launch remains focused while the architecture remains capable of broader expansion.

## Implementation Requirements

The implementation plan must include:

- Canonical editorial-candidate schema and state machine
- Manual URL, social, lead, and evidence intake endpoints
- Safe server-side content retrieval
- Candidate-to-cluster matching
- Persistent TRACE editorial drafts
- Draft staleness and regeneration controls
- Ranked TRACE Desk queue
- Mobile-first review and publication screen
- Controlled sections and topics
- Format, urgency, and development-state fields
- Classification confidence and provenance
- Hidden-section enforcement
- Revision, correction, withdrawal, and supersession handling
- Full audit records for intake, analysis, review, and publication
- Tests proving manual intake cannot bypass publication and evidence controls

## Amendment: launch discovery-feed admission

The launch registry may activate a deliberately small discovery batch: Google AI Blog, The Verge AI, MarkTechPost, ByteByteGo, Product Hunt, Import AI, The Pragmatic Engineer, Stratechery, and MCP Radar. Each record must retain its concrete feed or adapter endpoint, source tier, cadence, and treatment; a bare homepage is not an ingestion endpoint.

These additions improve lead discovery only. They do not alter ADR 0004's review boundary or turn derivative reporting, newsletters, rankings, or product listings into independent corroboration. A cluster must preserve citation lineage where possible so that an official announcement, a report about it, and several newsletter summaries are not counted as several independent confirmations. Sources with an unavailable, restricted, or unverified feed remain inactive or quarantined until a bounded parser check succeeds.

The initial TRACE Desk implementation must include publisher-only manual URL, social URL, lead, and additional-evidence intake. It must write a candidate record with a source hash and audit trail, but it must not fetch arbitrary destinations in the browser, create public content, or bypass source admission, clustering, or human review.
