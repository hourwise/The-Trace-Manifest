# TRACE Local News P4 — tracked issues

The owner opened this register on 2026-10-29, after DR2 of P4-R2 `65fa4a2`. Each entry is a separate issue. **Neither is authorised for implementation in R2.1.** Each needs its own owner decision and reviewed mission.

Source: `docs/audit/trace-local-news-p4-r2-dr2-review.md`, findings N1 and N4.

---

## N1 — A released import cannot be withdrawn

- **Severity:** Medium. Owner decision.
- **Status:** Open; not authorised.
- **Blocks the pilot:** No, while the operating rule below is followed.

**What happens.** Once a held imported proposal is released to `needs_review`, these block every path out except promotion to `published`:

- the database triggers (`news_import_candidate_state_guard` and the resolution owner);
- the application guard (`pendingImportGuard` and the `allOwned` refusal).

Nothing can reject, withdraw or archive it. Similarly, once a URL is clustered, later versions can only be rejected or left held.

**Interim operating rule.** Release only what will be promoted. Leave anything uncertain held.

**Why it is not fixed in R2.1.** Any withdrawal path changes migration 0080, its trigger certificate and the bound implementation files, so the Preview proposal would have to be reissued again.

**What closure needs:**

- an owner decision on the intended lifecycle: withdraw, reject or archive, and by whom;
- a migration and trigger change with its certificate regenerated;
- tests of the new path and of every refusal it must keep;
- a new proposal;
- an independent review.

---

## N4 — No remote identity-maintenance path

- **Severity:** High for Preview.
- **Status:** Open; not authorised.
- **Blocks the pilot:** Yes, if the condition below holds.

**What happens.**

- The bounded candidate lookup uses the identity index with a limit of 51.
- If more than 50 legacy URL candidates have no `source_url_hash`, import refuses with `bounded_identity_backfill_required`.
- `backfillCandidateIdentities` (25 rows and at most 26 writes per batch, each batch audited) can run only through the local CLI. That CLI accepts only files on drive D:.
- Under R2.1 C2, that CLI lives only on the local-tooling branch.
- Nothing can backfill a remote D1 database.

**Unknown.** The Preview backlog has not been measured. A read-only Preview inventory needs separate approval. That inventory would run the bounded backlog probe and check sources 7 and 20 and the trigger list.

**What closure needs:**

- If the inventory finds 50 or fewer unindexed URL candidates, N4 does not block the pilot and stays open as a scaling issue.
- If it finds more than 50, a reviewed mission is needed. It must cover:
  - a governed remote maintenance path, with publisher authority, a write budget per batch, audit rows, a window and stop criteria;
  - or a one-off approved maintenance migration;
  - its own cost estimate (DR2's representative figure: 3,750 rows, about 150 batches and about 3,900 writes);
  - owner approval before any remote write.
