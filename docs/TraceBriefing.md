# TRACE Briefing — build plan

**Status:** proposed feature — not yet implemented  
**Product owner:** TRACE editorial  
**Implementation order:** after the deployment/readiness items in the build-to-launch plan; before newsletter automation or auto-publication.

## 1. Product decision

TRACE Briefing is the curated editorial front door for The Trace Manifest. It selects the consequential, evidence-backed AI developments rather than attempting to summarise every story in the feed.

The initial product is a **weekday TRACE Daily Briefing** and a **Sunday TRACE Weekly Briefing**. A weekday edition is normally drafted for review around 07:00–08:00 UK time. A scheduled run may also result in **no edition** when there are not enough consequential, well-supported developments. This is an intentional editorial outcome, not an error.

The launch mode is reviewed publication: automation may select candidates and draft structured copy, but only an authenticated human editor may approve and publish. Briefings are never social posts and are never auto-posted.

## 2. Scope and non-goals

### First production version

- A 30-hour, evidence-eligible story candidate window.
- One lead and up to four key developments; zero to two provisional signals.
- Deterministic candidate scoring and diversity selection.
- One bounded editorial-model generation from an evidence packet.
- Schema, citation/reference and policy validation.
- Mandatory human review in `/admin/briefings`.
- Permanent dated editions, a briefing archive and a prominent latest-edition homepage card.
- Daily RSS for briefing editions only if it accurately represents the edition.

### Explicitly out of scope

- Newsletter sending, subscription collection and personalisation.
- Public submissions or public briefing editing.
- Automatic publication.
- Automated social-media posting.
- Repeated automatic regeneration loops.
- General-web access by the drafting model.

The eventual Trace Weekly newsletter, predictions and public sharing remain separate roadmap items. They may consume approved briefing data later but must not enlarge this feature’s first implementation.

## 3. Editorial format

Every published Daily Briefing uses this hierarchy:

1. **Opening overview** — two or three sentences explaining the day’s shape and visible uncertainty.
2. **Today’s lead** — headline, evidence label, what happened, why it matters, practical consequence, caveat, source count and TRACE story link.
3. **Key developments** — three or four compact entries: what changed, why it matters, evidence status, what to watch and story link.
4. **Signals we are watching** — zero to two clearly provisional items, labelled `vendor-reported`, `community-reported`, `unverified`, `disputed` or `preliminary`.
5. **What this means for you** — only meaningful, audience-specific practical takeaways.
6. **What to watch next** — concrete expected evidence, releases, votes, reproductions or clarifications.
7. **Evidence snapshot and editorial footer** — sources reviewed, stories considered, evidence mix, published/updated time, edition version, corrections and methodology links.

Weekly Briefing uses the same evidence and review boundary, but selects the week’s strongest themes on Sunday rather than producing a daily edition.

## 4. Governing boundaries

- Only already-published, eligible TRACE stories can enter the main briefing sections.
- Evidence status, source counts, source IDs and story IDs come from governed data; the model cannot create or alter them.
- Social attention can make an item worth monitoring but never raises its factual confidence.
- Generated text may draft wording and comparisons only from the supplied evidence packet. It cannot choose unknown candidates, browse the web, publish, or change an approval state.
- Human review is mandatory for every initial edition. A failed draft enters the review queue with its reason; it is not silently retried.
- Published editions are immutable. Corrections create a visible later version or correction record, never a silent overwrite.
- A no-edition decision must be recorded with an editorially useful reason.

These rules extend the existing publication, evidence, social-intake and model-governance ADR boundaries; they do not weaken them.

## 5. Target data model

Replace the current single mutable briefing record with a versioned edition model. Migrate legacy records rather than running the old `briefings` and `published_briefings` concepts indefinitely.

### `briefings`

| Field | Notes |
|---|---|
| `id` | immutable edition identity |
| `briefing_type` | `daily`, `weekly`, `special` |
| `edition_date` | editorial date in UK time |
| `status` | `candidate`, `drafted`, `review`, `approved`, `published`, `skipped`, `rejected`, `corrected` |
| `title`, `dek`, `overview` | approved editorial content |
| `lead_story_id` | eligible published story |
| `publication_version` | monotonically increasing per edition date/type |
| `generated_at`, `reviewed_at`, `published_at`, `reviewed_by` | lifecycle audit |
| `generation_model`, `generation_prompt_version` | reproducibility, not public secrets |
| `candidate_window_start`, `candidate_window_end`, `candidate_count`, `included_count`, `source_count` | evidence snapshot |
| `validation_status`, `skip_reason` | outcome and failure visibility |
| `created_at`, `updated_at` | audit fields |

### `briefing_items`

Stores the selected story, section (`lead`, `development`, `signal`, `watch_next`), position, editorial copy, evidence-status snapshot, story-version snapshot, editor note and inclusion provenance.

### `briefing_candidates`

Stores every considered story: component scores, total briefing score, selected flag, selection reason and rejection reason. This is essential for later ranking evaluation.

Use correction/version relationships so `/briefing/daily/YYYY-MM-DD` remains permanent. A later correction must retain the earlier version and visibly identify the replacement.

## 6. Deterministic selection pipeline

### 6.1 Candidate eligibility

At 05:30 UK time, query stories published or materially updated in the preceding 24–30 hours that have:

- a substantive summary, topic and at least one attributable source;
- valid publication and evidence eligibility;
- no supersession or invalidating correction;
- no near-duplicate representation in the same candidate set; and
- no recent briefing inclusion without a material update.

Exclude raw feed items, unsupported/vague summaries, stale resurfacing, unresolved single-source rumours from main sections and content lacking publication eligibility.

### 6.2 Score and diversify

Calculate and retain a transparent score:

`impact + evidence quality + corroboration + practical relevance + novelty + freshness + topic priority - duplication - uncertainty penalty - promotional-content penalty`

Initial weighting: impact 25%, evidence quality 20%, practical relevance 15%, corroboration/independence 15%, novelty 10%, freshness 10%, diversity 5%.

Take the highest ranked candidates, then apply deterministic diversity limits: no more than two per provider or topic, no duplicate underlying event, and prefer at least two subject areas unless one event genuinely dominates. Produce one proposed lead, three to five developments, zero to three signals and rejected candidates with reasons.

### 6.3 Bounded draft and validation

Build an evidence packet for each selected candidate containing only the neutral story summary, claims, evidence status, supporting/conflicting source records and classes, timestamps, topic, related knowledge pages, TRACE URL and permitted factual statements.

The model returns schema-validated JSON with overview, lead, developments, signals, takeaways and watch-next entries. Reject drafts that use unknown IDs, alter evidence labels, make unsupported claims, use a weak lead, omit required fields, use promotional/overconfident language or fail the JSON contract. Allow one manual, authorised regenerate action from the review screen; never loop automatically.

## 7. Editorial review and publication

`/admin/briefings` must show the proposed lead, selected and rejected candidates, scores/reasons, evidence labels, source links, generated draft, validation warnings and lifecycle audit. An editor can edit wording, replace an eligible lead, remove or demote entries to signals, add an editorial note, approve, reject, postpone, skip or manually regenerate once.

Publishing records the reviewed version and makes only that approved version public. The initial operational modes are:

- **Reviewed publication (default):** scheduled drafting; human approval required.
- **No-edition:** insufficient eligible material; record the reason and keep the latest valid edition visible on the homepage.
- **Conditional auto-publication (later):** only after measured success across 30–60 reviewed editions and a separately approved policy change.

## 8. Public routes and presentation

- `/briefing` — archive of published editions.
- `/briefing/daily` — latest approved daily edition, or latest valid edition with clear date when no new edition exists.
- `/briefing/daily/YYYY-MM-DD` — permanent dated edition; correction/version history visible.
- `/briefing/weekly` and dated weekly routes — equivalent weekly presentation.

The homepage card appears directly after the introduction or featured story. It shows the edition date/time, one-sentence overview, development count, underlying-source count, strongest evidence label, primary read link and smaller archive link. It must keep displaying the latest valid briefing when today has no edition.

## 9. Delivery sequence

### B1 — Canonical data model and manual edition

- Design migration from both existing briefing tables to the versioned model.
- Build the public page layout, archive/dates and corrections/version display.
- Build `/admin/briefings` for manual selection and structured publishing.
- Publish one reviewed manual edition in Preview before production approval.

### B2 — Candidate selection

- Implement eligibility query, deterministic scoring, diversity rules and candidate audit.
- Present proposed candidates in the admin screen; editors still write the briefing.
- Add fixtures and tests for duplicate, weak-evidence, corrected and no-edition cases.

### B3 — Governed drafting

- Build bounded evidence packets and the JSON draft contract.
- Add validation, one manual regenerate action and visible failure states.
- Add tests proving model output cannot alter evidence, candidates or approval.

### B4 — Scheduling and homepage/RSS integration

- Add UK-time scheduled candidate/draft jobs for weekdays and Sunday weekly.
- Add idempotency, run audit and safe no-edition outcomes.
- Replace the current homepage statistic/card and make RSS describe briefing editions accurately.

### B5 — Evaluation and policy review

- Record editor additions, removals, rewrites and reasons.
- Review selection/draft quality after several weeks.
- Consider auto-publication only through a new ADR/policy decision and evidence-backed gate.

## 10. Acceptance criteria for first production version

- A human can manually create, review, publish, correct and archive a dated briefing without overwriting history.
- The public daily page visibly separates the lead, developments, provisional signals, takeaways, watch-next and evidence snapshot.
- Candidate selection is reproducible and stores selected/rejected reasons.
- The model receives only bounded governed evidence and cannot change evidence labels, selection or approval state.
- Invalid drafts fail closed into a reviewable state.
- No edition is published without an authenticated editor’s approval.
- The homepage remains useful when today has no edition.
- Tests cover eligibility, diversity, versioning, correction history, validation, permissions, schedule idempotency and no-edition behaviour.

## 11. Planning dependencies

Before B1, resolve the worker deployment/readiness checks in [the build-to-launch plan](BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md) and establish which of its dated status assertions remain true. The launch scope and build-plan add-on remain governing sources for evidence, human publication, social and model boundaries; where this plan conflicts with old newsletter timing, this document controls the Briefing MVP: no newsletter is required or added.
