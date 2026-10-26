# TRACE Weekly issue drafts and approval (TRACE-RESTORE-01 Task E)

**Branch:** `claude/trace-weekly-issue-drafts`, stacked on `claude/trace-newsletter-signup` (PR #13). It uses that branch's outbox, escaping and `IssueRenderer` hook.
**State:** preparation works locally. **Nothing sends:**
- dispatch is gated by `TRACE_NEWSLETTER_DISPATCH_ENABLED` (off by default);
- sending is gated by `TRACE_EMAIL_DELIVERY_ENABLED` (off, PR #13);
- no Cron or scheduler was added or reused, and there is no model inference.

## Workflow (publisher-only: `/admin/newsletter/issues`)

1. **Generate a draft** for an issue date. The draft uses stories that are **currently publicly eligible** (`publicStoryEligibilitySql`: published and reviewed, evidence not blocked, withdrawn and superseded excluded). They must have been published in the **7 UTC days ending on that date**, ordered newest first with ties broken by id, and at most 8 are included. Summaries and why-it-matters text are clipped at word boundaries. With no eligible story, nothing is created. Generating again supersedes earlier unready versions for that date (`version` 1, 2, …).
2. **Review the selected stories,** with links to their public pages.
3. **Exclude unsuitable stories** (at least one must remain).
4. **Edit the introduction** (plain text, 20–1,200 characters).
5. **Preview** the exact HTML in a sandboxed `<iframe srcdoc>` (no scripts), plus the plain-text version.
6. **Approve the exact content.** Approval records the content hash (intro plus frozen story snapshot). Any later edit returns the issue to draft and clears the approval. Approval is refused if any story has been withdrawn, become ineligible, or had its published headline, summary, why-it-matters or evidence status change since the draft.
7. **Mark ready for manual dispatch.** This re-checks the stories and fixes a unique `dispatch_key`.
8. **Queue for confirmed subscribers** (the future send interface). Off unless `TRACE_NEWSLETTER_DISPATCH_ENABLED=true`. In one batch, each step conditional on the previous, it:
   - marks the issue dispatched;
   - writes the audit row;
   - inserts one outbox row per **confirmed** subscriber, with idempotent keys.

   It works **once** per issue. The outbox then sends only rows for a **dispatched** issue, through PR #13's gated processor (`dispatchedIssueRenderer`), with `List-Unsubscribe`.

Every action writes an `admin_audit_log` row (`target_type = 'newsletter_issue'`). Readers get 403.

## Email format

- **Content:** a "TRACE Weekly" heading with the issue date; the introduction; "Top stories" (headline linked to the TRACE story page, evidence label and publication date, summary, and "Why it matters" when reviewed text exists); evidence and methodology context; the corrections ledger link; unsubscribe information.
- **Two formats:** HTML (inline styles, one 600px column for phones and common clients) and plain text.
- **Untrusted text stays inert.** Every database value is HTML-escaped or emitted as plain text, never interpreted. A summary saying "ignore previous instructions", or containing markup or `javascript:` links, appears as literal text. Every link points at TRACE.
- **Deterministic:** the same issue and URLs give the same output and hash.

## Database

`db/migration-0079-newsletter-issues.sql` adds `newsletter_issues`:
- the frozen `snapshot_json` and `content_hash`;
- approval fields, with a `CHECK` that an approved, ready or dispatched issue's `approved_content_hash` equals its `content_hash`;
- a unique `dispatch_key`;
- a unique `(issue_date, version)`.

It is additive; 0072 is reserved, and 0077 and 0078 precede it.

## Tests

| Test | Covers |
|---|---|
| `tests/newsletter-issues.test.ts` (in `npm test`) | The window, and selection rules: withdrawn, superseded, blocked-evidence and out-of-window stories excluded; deterministic order. No eligible stories gives no draft. Non-publishers refused. Regeneration supersedes and is deterministic. Repeat approval refused. Editing invalidates approval; stale hash refused. A story changed after the draft blocks approval. Ready only from approved. Dispatch disabled by default, then once only, to confirmed subscribers only. Sending through the outbox, with an unsubscribed recipient skipped. The full audit trail. HTML escaping of hostile text, only TRACE links, plain-text version, deterministic rendering. |
| `tests/newsletter-issues-render.test.ts` (`npm run ci`, after the build) | The built list and detail pages: publisher 200, reader 403, unknown issue 404, sandboxed preview, escaped story text, dispatch shown as disabled. |

**Full checks:** `npm test`, typecheck, `test:security`, `test:migrations`, `test:diff`, `npm run build`, `test:newsletter-render` and `test:newsletter-issues-render` all pass.

## Release

Merge after PR #13. Apply 0079 (after 0078) before using the issue pages; without it, the list page shows "migration 0079 not applied". Merging deploys Pages; there is no Worker change.
