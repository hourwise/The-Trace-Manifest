# ADR 0024: Policy-Based System Admission, Batched Acceptance, Pinned Freshness, Revocation and Sampling Audit

- **Status:** Proposed
- **Date:** 25 October 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Assertion governance (admission, reviewer and freshness axes), the Evidence Library (migration 0076), catalogue field eligibility, Ask eligibility, recalculation jobs
- **Related decisions:** ADR 0004; ADR 0012; ADR 0016 (amended in effect for the admission axis of the listed fact classes only); ADR 0019; ADR 0021; ADR 0022; ADR 0023; KC-07, KC-09G and migrations 0068, 0074 and 0076
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§11, §12, §16, §17)
- **Review trigger:** before any rule is added to the machine-checkable list; before system acceptance of the reviewer axis is proposed; after any audit failure; before enabling on Production

## 1. Context

An assertion is Ask-eligible only when it is admitted, accepted and current, with a locator-backed chunk. `supported` also requires two independent provenance groups.

Every governance event today must be written by a `publisher` (migration 0076). The allowed actions are `admit`, `reject`, `accept_review`, `reject_review`, `mark_current` and `mark_stale`. The 0074 rule permits each transition pair at most once per assertion.

At the intended volume, governance by individual clicks is the bottleneck: 0 of 417 Production assertions are eligible.

There is no evidence revocation or restoration (`docs/audit/trace-v1-production-readiness-07.md`). An erroneous automatic decision could not be undone systematically.

## 2. Decision

### 2.1 Precondition: revocation and restoration

1. **No system admission or system freshness may be enabled on any environment until evidence revocation and restoration exist and pass their tests on that environment.**
2. **New governance actions:**
   - `revoke`: from admitted to a new, ineligible `revoked` state;
   - `restore`: from `revoked` to the prior state.

   Both are append-only and carry the reason codes `error`, `rights_withdrawal`, `source_removed`, `upstream_anomaly` and `audit_failure`.
3. A publisher may revoke and restore. The system policy actor may revoke **only** for `source_removed`, `upstream_anomaly` and `audit_failure`. **The system may never restore.**
4. **Cohort revocation:** one request revokes every assertion admitted under a given policy hash and rule within a window, or every assertion in a batch. Each assertion still receives its own event.
5. Recalculation reuses the governance recalculation jobs. It updates claim status, story snapshots, catalogue field eligibility, estimator snapshots (`inputs_revoked`) and Ask eligibility. Public corrections stay human.

### 2.2 The system policy actor

6. Admission rules are a versioned JSON policy document in the repository. The owner approves a policy version once, recorded as an audited event containing the document hash. The Worker refuses to act under an unapproved hash.
7. System events carry:
   - `actor_role = 'system_policy'`;
   - the policy version and hash;
   - the rule id;
   - a hash of the deterministic check results;
   - request and idempotency identifiers.

   The idempotency key is derived from the policy hash, rule, assertion and check-results hash.
8. This requires a migration that succeeds 0076 (number assigned at implementation). It:
   - widens `actor_role` for `admit`, `mark_current`, `mark_stale` and `revoke` only;
   - adds the policy columns;
   - forbids `system_policy` from `accept_review`, `reject_review`, `reject` and `restore`.
9. **Shadow mode first:** a rule computes and records decisions without writing governance events until its agreement with the owner's own decisions is measured (proposed: at least 200 items and 99.5 %, with every disagreement explained).

### 2.3 Machine-checkable classes (closed list)

10. System admission applies **only** to these self-describing facts pinned to immutable identifiers, each re-read by the Worker from the primary source before admission:

    | Class | Fact |
    |---|---|
    | MC-1 | Hugging Face file identity: size and SHA-256 at a revision |
    | MC-2 | A GGUF header field of a file identified by SHA-256 |
    | MC-3 | GitHub release identity: tag, commit, publication time, assets |
    | MC-4 | Licence identifier **declared** by a card at a revision |
    | MC-5 | Base model **declared** by a card at a revision |
    | MC-6 | A `config.json` field at a revision |

11. **System admission grants the admission axis only.** Reviewer acceptance stays human.
12. **Never system-admitted:**
    - interpretive evidence;
    - model-extracted values;
    - community reports;
    - vendor comparative claims;
    - ADR 0004 classes;
    - estimates;
    - news-derived facts;
    - JavaScript-rendered or tabular documentation;
    - any "corroboration" between files of the same repository.

### 2.4 Batched reviewer acceptance

13. Homogeneous batches (same rule or source version and claim class; at most **40 items**; all checks passing) can be accepted with one tap by a publisher. The cap follows from SEED-02's measured rate of about 120 written D1 rows per assertion lifecycle and SEED-03's governance-session cap of 5,000 writes.
14. The batch view shows a seeded random sample of at least three items (or 5 %) in full, plus a field-level diff of the rest.
15. Acceptance writes one `accept_review` event per assertion with a shared batch id.
16. One failing item leaves the batch.
17. Proposed limit: 10 batch accepts a day.

### 2.5 Pinned freshness

18. An admitted, accepted assertion of an MC class is marked `current` by the system actor with basis `version_pinned` and no expiry. This is in the Evidence Library context, where 0076 already permits freshness events.
19. A newer revision **supersedes**; it does not stale the pinned fact. A separate, unpinned "latest revision" fact is maintained.
20. A re-pointed tag or a changed hash under a pinned identifier triggers `mark_stale` plus a revocation proposal.
21. Unpinned facts keep human freshness review.

### 2.6 Evidence Library routing

22. A deterministic router assigns context:
    - `story` when the fact is cited by an approved story;
    - `evidence_library` when it attaches to a catalogue entity or an open question gap, or is an MC-class fact from a watched source;
    - otherwise it remains a candidate and expires with it.

### 2.7 Sampling audit

23. **Burn-in:** a new rule or policy version runs in shadow with 100 % item review for its first three batches or 150 items.
24. **Steady state:** a seeded random sample of max(5, 10 %) per system-admitted batch, and at least 20 items a week across rules. The seed is generated by the Worker and recorded.
25. **Any incorrect item in an MC class** automatically suspends the rule and proposes a cohort revocation, which the owner confirms. The rule returns to burn-in after a fix.
26. A weekly summary reports admissions, samples, errors, suspensions and revocations.

### 2.8 Unchanged

27. The conclusion policy, including the two-independent-provenance-groups requirement for `supported`, is unchanged. The separate P-1 `primary_attributed` option is neither adopted nor rejected by this decision.
28. Story publication is unaffected (ADR 0023).
29. Kill switches: `TRACE_SYSTEM_ADMISSION_ENABLED` (default false) and per-rule suspension.

## 3. Consequences

### Positive

- Hundreds of exact, pinned facts a day can become eligible with minutes of owner time.
- Every automated decision is attributable to a rule and policy version, sampled, and reversible in bulk.
- The Evidence Library gains a steady, governed supply.

### Negative

- Two migrations (revocation and restoration; the system actor) and new UI must be built and proven first.
- A `revoked` admission state touches every eligibility predicate.
- Owner audit time is a permanent cost.

## 4. Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| System acceptance of the reviewer axis | Removes the human accountability ADR 0016 relies on. It may be reconsidered only after sustained clean audits, as a separate decision. |
| Reusing `admit` and `reject` for correction | Blocked by the one-transition-per-pair rule, and conflates error correction with review outcomes |
| Automatic admission before revocation exists | An error would be irreversible at scale |
| Trusting the workstation's values | Violates L-3; the Worker re-reads every value |
