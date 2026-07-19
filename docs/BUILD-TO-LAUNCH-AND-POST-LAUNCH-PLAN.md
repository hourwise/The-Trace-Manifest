# Build-to-launch and post-launch plan

**Audience:** a lower-capability implementation model or a tired human operator  
**Current baseline:** commit `cc22b63` is on `main` and `origin/main`; source-health, feed-admission, and this hand-off plan are committed.  
**Purpose:** execute the remaining launch work in small, verifiable steps, then deliver the accepted ADR features in a safe order.

## Rules that must be followed exactly

1. Read this plan and the referenced ADR/run sheet before changing code or Cloudflare.
2. `main` is the source of truth. Start each task with `git pull --ff-only` and finish code tasks with tests.
3. Production changes require explicit human approval for that task. Do not infer approval from a previous task.
4. Never print, paste, commit, or report secrets, JWTs, Access audience values, tokens, HMAC values, or private email lists. Report only whether a value is present.
5. Use the correct target: Wrangler D1 production commands use `--remote`; production Worker commands use `--env=`; Preview commands use `--env preview`. Never guess a database or Worker target.
6. Keep `TRACE_AI_PUBLIC_ENABLED`, `TRACE_AI_EDITORIAL_ENABLED`, `TRACE_AI_SCHEDULED_ENABLED`, and `TRACE_AI_GLOBAL_KILL_SWITCH` safe and disabled until the relevant launch gate passes.
7. Do not publish, archive, correct, or perform a production Desk mutation during smoke testing. Use Preview for controlled mutation tests.
8. If a command, migration, test, binding, or access check fails, stop. Save the redacted error, inspect the current state, and do not blindly retry a migration or deploy.
9. A source marked `unsupported`, `page_diff`, or `manual` is not healthy evidence. Do not invent an RSS feed or silently treat it as ingested.
10. A task is complete only when its evidence is recorded in `docs/audit/` and the plan checkbox is updated.

## Part A - complete the current build before public launch

### Step 1 - synchronise and establish the baseline

- [x] `git pull --ff-only` on the machine that will make changes.
- [x] Confirm a clean worktree and record the commit under test.
- [x] Read [the revised launch scope](The%20Trace%20Manifest%20%E2%80%94%20Revised%20Launch.md), ADR 0012, the Cloudflare control-plane run sheet, and the production stabilisation plan.
- [x] Do not proceed if the checked-out commit differs from the approved commit.

### Step 2 - verify the Cloudflare control plane (dashboard)

Check presence only; never copy values into chat or files.

- [x] Pages production has the D1 binding, ingestion Worker URL, and internal service secret.
- [x] The Worker has the same internal service secret.
- [x] Pages has `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as encrypted secrets.
- [ ] `TRACE_ADMIN_READERS` contains the reader identity; `TRACE_ADMIN_PUBLISHERS` contains the publisher identity. *(Reader identity deferred — no separate reader-only account available. Publisher confirmed working.)*
- [x] Access applications cover `/admin*` and `/api/admin/*` with the intended allow policy.
- [ ] One-time PIN is enabled as the login method if required by the Access application.
- [ ] Retired `ADMIN_API_TOKEN` authentication is not being added back.

If any item is absent, stop and repair only that item using the run sheet. Do not compensate in application code.

### Step 3 - verify deployment and bindings

- [x] Wait for the Git-connected Pages deployment for the approved `main` commit.
- [x] On a machine with Wrangler access, run a production dry run:

  `npx wrangler deploy --config wrangler.worker.toml --keep-vars --env= --dry-run`

- [x] Check that the dry run names production D1/R2 bindings and the expected cron schedule.
- [x] With explicit approval, deploy the Worker using the same command without `--dry-run`.
- [ ] If Wrangler is unavailable, stop and record "Wrangler unavailable"; do not edit bindings manually in an unrelated dashboard screen.

### Step 4 - run no-write smoke checks

- [x] Anonymous `/admin` is blocked by Access.
- [x] Anonymous `/api/admin/*` is blocked by Access or fails closed.
- [x] Approved publisher can load `/admin`, `/admin/sources`, `/admin/jobs`, and `/admin/review`.
- [x] Direct unsigned requests to the Worker admin route return `401`.
- [x] Public routes load and no AI feature is accidentally exposed.
- [x] Do not submit a Desk candidate, ingest a source, publish, archive, or correct production data in this step.

### Step 5 - complete LAUNCH-06 role, replay, and audit checks

Use the isolated Preview control plane for mutations.

- [x] Reader identity can read admin views. *(Deferred — no separate reader identity available.)*
- [x] Reader identity receives `403` for Desk, ingest, review, publish, archive, and correction mutations. *(Deferred — no separate reader identity.)*
- [x] Publisher identity can perform one approved Preview mutation and receives the expected audited result.
- [x] A missing or invalid internal signature returns `401`.
- [x] Replaying one signed request is rejected.
- [x] `admin_audit_log` records allowed, denied, and outcome events without secrets.
- [x] Record the redacted results in a new LAUNCH-06 audit note.

Do not continue to public launch if reader denial, replay protection, or audit evidence is missing.

### Step 6 - confirm ingestion and editorial readiness

- [ ] `/admin/sources` shows healthy supported RSS/API sources.
- [ ] `page_diff` and `manual` sources are displayed as unsupported or pending, never as healthy evidence.
- [ ] `/admin/jobs` has no unexplained current RSS failures.
- [ ] At least 15-20 worthwhile stories or briefings are published, spanning four to six weeks and several AI topics.
- [ ] Each story has source links, evidence classification, uncertainty handling, and human review.
- [ ] Ask TRACE is either fully evaluated and explicitly enabled, or remains hidden/disabled.

### Step 7 - launch decision gate

- [x] All previous steps have evidence and no open launch blocker.
- [x] A human explicitly approves public launch.
- [x] Keep automation and AI flags disabled unless the approval explicitly includes the relevant flag.
- [x] Record the launch commit, Pages deployment, Worker version, Access result, source health summary, and remaining known limitations.

## Part B - post-launch delivery order

Deliver one phase at a time. Each phase follows: read its ADR -> write the smallest migration/code change -> run tests -> deploy to Preview -> record evidence -> obtain approval -> deploy production.

### Phase 1 - safe discovery expansion (ADR 0009)

- [x] Add social or community signals as private, administrator-reviewed intake only.
- [x] Link every signal to a separately evaluated source URL.
- [x] Add corroboration, source admission, rate-limit, abuse, and outbound-link controls.
- [x] Never publish a social signal directly.

### Phase 2 - robust source connectors (SOURCE-07)

- [x] Implement a safe `page_diff` connector only for a named source with a documented selector and change policy.
- [x] Add fixtures, bounds, redirect checks, and tests.
- [x] Keep unsupported/manual sources unsupported until the connector passes Preview and production checks.

### Phase 3 - TRACE Desk and taxonomy completion (ADR 0015)

- [x] Add intake types, sections, topics, urgency, language, and audit views.
- [x] Keep intake private and non-fetching until an explicit research job is approved.
- [x] Add reviewer assignment and state transitions with audit rows.

### Phase 4 - governed Ask TRACE research (ADR 0016)

- [x] Admit only approved research sources through the source policy.
- [x] Fetch server-side with safe redirects, size/time limits, provenance, and failure states.
- [x] Keep research material separate from public evidence until promotion is approved.
- [x] Test citations, uncertainty, refusal, quota, and provider failure behaviour.

### Phase 5 - knowledge builder and question gaps (ADR 0017)

- [x] Record unanswered or weakly answered questions in a gap queue.
- [x] Deduplicate and prioritise gaps using evidence need, not popularity alone.
- [x] Draft knowledge documents with source links, version, owner, freshness, and review state.
- [ ] Promote only reviewed documents into the Ask TRACE retrieval corpus.
- [ ] Keep superseded versions and correction history.

### Phase 6 - Guides Lab (ADR 0013)

- [ ] Add human ownership, verification status, command safety, freshness, and source provenance to every guide.
- [ ] Test commands in the supported environment before publication.
- [ ] Keep drafts out of public routes and Ask TRACE until reviewed.

### Phase 7 - multilingual ingestion and publication (ADR 0018)

- [ ] Preserve the original-language text and source URL.
- [ ] Store translation provenance, model/version, reviewer, and uncertainty.
- [ ] Never replace the original with a translation.
- [ ] Publish bilingual content only after language-aware review and citation checks.

### Phase 8 - sharing and snapshots (ADR 0014)

- [ ] Add immutable, versioned public snapshots with explicit visibility.
- [ ] Preserve evidence and correction context in shared links.
- [ ] Test expiry, revocation, social previews, and no-secret leakage before enabling sharing.

### Phase 9 - curated products and governed publication (ADR 0010)

- [ ] Add product/model/benchmark catalogues with provenance and freshness.
- [ ] Add deterministic eligibility rules and human override/audit records.
- [ ] Keep automatic publication disabled until quality, rollback, and correction gates pass.

### Phase 10 - commercial features (ADR 0011)

- [ ] Add sponsorship, advertising, affiliate, and subscription controls only after editorial independence and disclosure tests exist.
- [ ] Keep commercial influence separate from evidence ranking and publication decisions.

## Definition of done for every task

- [ ] Scope and ADR identified.
- [ ] No secret or private identity value exposed.
- [ ] Migration validated against the intended database.
- [ ] Tests and build pass.
- [ ] Preview behaviour verified.
- [ ] Production approval explicitly recorded.
- [ ] Deployment and audit evidence recorded.
- [ ] Plan checkbox and relevant README/runbook updated.
