# ADR 0023: Story Inbox with Pre-Run Drafts and One-Tap Human Publication

- **Status:** Proposed
- **Date:** 25 October 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** TRACE Desk, editorial candidates, clustering, drafting, publication, knowledge candidates from stories
- **Related decisions:** ADR 0004 Human Review Boundary (unchanged); ADR 0008; ADR 0010 (its automatic-publication allowance is **not** used by this decision); ADR 0012 #8; ADR 0015 (lifecycle and draft persistence, extended); ADR-0020 (Proposed; capability classification); ADR 0021; ADR 0024
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§7, §12, §14.1)
- **Review trigger:** before any story is published without a human tap; before the daily draft cap or budget is raised; if validator pass rates or owner edit rates show drafts are unreliable

## 1. Context

At the intended volume of about 50 stories a day, the current flow of several manual clicks per cluster would take hours. ADR 0015 already defines the canonical lifecycle, candidate states (including `draft_ready`, `held`, `archived`) and server-side draft persistence with provenance. ADR 0004 requires human review for high-risk classes. The owner has decided that **all** publication stays human.

Separately, approving a story does not create Ask-eligible knowledge (KNOWLEDGE-10).

## 2. Decision

### 2.1 The inbox

1. TRACE Desk gains a **story inbox**: one card per cluster, holding a **pre-run draft**, deterministic check results, provenance groups, risk flags, the draft's cost and the knowledge candidates found in its sources.
2. The card's actions are **Approve**, **Edit then Approve**, **Skip** (archive) and **Hold**. Approve calls the existing publication route with the owner's Access identity and the final text. **That tap is the human review.** Nothing else publishes.
3. Approve is disabled while any blocking validator fails or while the draft is stale.

### 2.2 Deterministic preparation

4. **Canonicalisation, deduplication and clustering** are deterministic. Same canonical URL or same origin link merges automatically. Title-similarity and entity-overlap matches are shown as proposals.
5. **Ranking** is a versioned weighted score (capability class, primary source present, watched entity, independent groups, novelty, duplicate suspicion, muted topics, recency). The weights change only by owner decision and are recorded per card. No learned ranking.
6. **Fact sheets** list entities, versions, numbers and dates with source locators. They are deterministic.

### 2.3 Drafts

7. Only the top **K** clusters by rank are drafted ahead of time. K starts at **10 a day** and rises to 25, 40 or 50 only by owner decision after each week's measured report. The rest show "draft on demand".
8. **Drafts are prepared on the local workstation** in the nightly off-peak window (22:00–00:45 UTC), using the T1 model assigned by ADR 0021 (`deepseek-flash`, non-thinking mode), with:
   - input ≤ 12,000 tokens and output ≤ 1,500;
   - one attempt and no retries;
   - the workstation task budget of US$0.30 a day, within the combined weekly cap of US$6.25 (ADR 0021 §2.8).

   Owner-triggered drafting in the Worker remains available under the unchanged editorial daily budget.
8a. Drafts arrive in Cloudflare only through the importer role (ADR 0021 §2.9) as **untrusted proposals**. The Worker re-runs the blocking validators against its own captured source versions before Approve is enabled.
9. The model receives the fact sheet, bounded permitted extracts, the output schema and the TRACE constitution. It has no URLs and no tools.
10. **Blocking validators:**
    - every number, version, date and model name appears in the fact sheet or a quoted span;
    - every quoted span re-finds in its source version;
    - no citation outside the cluster's source set;
    - schema and length.

    **Non-blocking flags:** the ADR 0004 risk lexicon; single-origin clusters.
11. A draft whose sources change becomes stale (ADR 0015). Regeneration never overwrites operator edits without an explicit action.

### 2.4 Timers

12. A `draft_ready` card that is not acted on becomes `held` after a configurable interval (default 72 h). A `held` card becomes `archived` with reason `unreviewed_timeout` after a further interval (default 7 days). Archived items can be restored.
13. Timers are evaluated on inbox preparation or opening (request-driven). **No Cloudflare Cron is introduced.**

### 2.5 Triggers

14. Inbox preparation is triggered by the owner ("Prepare inbox") or by a workstation timer calling an authenticated, request-driven route. Automated news-feed discovery remains gated by the scheduler 0072 track or the importer (ADR 0021).

### 2.6 Stories and knowledge

15. Approving a story **never** admits, accepts or refreshes a fact.
16. The card lists knowledge candidates from the story's sources, routed by ADR 0024:
    - catalogue facts become primary-source acquisition triggers;
    - self-describing facts go to the machine-checkable classes where a primary exists;
    - everything else goes to batch or item review;
    - keep-worthy non-story facts go to the Evidence Library.

### 2.7 Independence

17. Deterministic shared-origin signals may only merge provenance groups toward an origin: derivative articles, syndication, and vendor-cited coverage. Splitting is human. **The two-independent-groups requirement is unchanged.**

## 3. Consequences

### Positive

- Owner time per story falls to roughly 20 seconds for a clean approval.
- Drafts are traceable to sources, cost and model.
- High-risk content is flagged, and no publication happens without a human.
- Knowledge absorption is decoupled from publication, so stories stop being mistaken for knowledge.

### Negative

- Pre-run drafting spends money on stories that may be skipped (bounded by K and the budget).
- Approval at speed risks rubber-stamping. This is mitigated by blocking validators, provenance chips and the weekly audit sample (ADR 0024).
- The 50-a-day target needs automated discovery, which stays gated.

## 4. Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| ADR 0010 GREEN-class automatic publication | The owner requires human publication at this stage. It remains available for a future, separate decision. |
| Drafting every candidate | Cost without value for low-rank items |
| Learned ranking | Opaque, and needs training data TRACE does not have |
| Model-chosen classification stored without a tap | Violates ADR 0021 rule 14 |
