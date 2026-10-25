# EDITORIAL-D4-R1: Pending Review workflow and editorial UI repairs

**Branch:** `claude/trace-editorial-d4-review-workflow`, from `main` at `5cb64af`. PR #7; deployed to Preview only, for QA (see "Preview QA results").
**Scope:** `/admin/review` (D4), plus a separate fix for publisher-only writes on `/admin/desk` and `/admin/social`.
**Boundaries kept:** no migration, no D1/R2 writes, no deployment, no Cron or scheduler 0072 change, no new model calls, public Ask unchanged, Codex's P0 work and PR #6 untouched.

## Before and after

| | Before | After |
|---|---|---|
| Pending Review | Passive cards. To act, an editor had to find the same story in the separate **publishable** dropdown, and blocked items (unverified, outdated, superseded) are never in that dropdown, so their evidence and governance panels were unreachable. | Each card shows its evidence badge, why it needs review, and the next action. **Open review** (publishers) or **Inspect evidence and history** (readers) opens the existing source, claims, assertion-governance and history panels in place. |
| Mode separation | One selection drove everything. | Explicit **review mode**. It clears the publish selection, hides the publish form (publish and archive unavailable), and states that review decisions do not publish. **Open in publish workflow** appears only if the item is also in the publishable list. **Back to Pending Review** returns to the same card. |
| Context | Lost on reload | `?review=<id>` keeps the selection across reloads. Only ids in the server-rendered queue open; stale or invalid ids show a visible notice and load nothing. List filters are untouched. |
| Errors | Messages only in the publish form's status line | Messages appear in both the publish status and the review banner (`role=alert` for errors). Source-load failures show their cause. |
| Reader view | AI Analyze and related-item review were clickable and always returned 403 | AI Analyze renders for publishers only, with an explanation for readers. Related-item results show the recorded review state, or "publisher-only", instead of controls. Evidence, history and related-item **search** remain readable. |
| Mobile | Fixed rows | Pending cards and the review banner wrap, with full-width buttons under 640px |

**What did not change:**
- **The publishable predicate** (`review-queue.ts`) and the pending predicate.
- **The Worker publish guard** (`publish.ts`, which refuses `unverified`, `outdated` and `superseded`).
- **Governance code:** no second implementation. The page still has exactly one admission, one evidence and one source request path.
- **The D6 rule:** one unconditional page script.

## Files

- `src/lib/admin/review-selection.ts` (new): pure rules for review id parsing, publish eligibility by mode, pending guidance, and URL state.
- `src/pages/admin/review.astro`: review mode, actionable cards, reader rendering, status and mobile styles.
- `tests/review-pending-workflow.test.ts` (new) and `package.json` (added to `npm test`).
- **Separate commit:** `src/pages/admin/desk.astro`, `src/pages/admin/social.astro`, `tests/admin-page-write-boundaries.test.ts`.

## Tests and evidence

| Check | Result |
|---|---|
| `tests/review-pending-workflow.test.ts` | Passes. Covers the publisher's governance panel for a blocked pending item, reader inspection without mutation (403 on admission and related-item review), refused publication of blocked evidence with no state change, publishable and pending sets unchanged by selection, 10 repeated selections writing nothing, 404/400 for missing or malformed ids, one governance event per decision (a repeat replays), and page role rendering with the D6 rule. **It fails on the pre-D4 page** (red/green). |
| D1 cost of opening an item | **13 statements with 0 or 250 other clusters.** That is two signed reads, including auth and nonce statements: constant, with no statement over 100 parameters. The SSR pending queue stays one statement, capped at 50. |
| `tests/admin-page-write-boundaries.test.ts` | Passes. **It fails on the original Desk and Social pages.** |
| `npm test`, typecheck, `test:security`, `test:diff`, `test:migrations`, `npm run build` | All pass. The build's D6 role-script check passes. |
| Built output | `review.astro.mjs`: AI Analyze sits in `isPublisher ? … : reader note`; the open action renders for every role; one `renderScript`. `desk.astro.mjs` and `social.astro.mjs`: guards precede all D1 access. |

## Finding fixed in a separate commit (security)

`/admin/desk` and `/admin/social` read and write D1 **directly in page frontmatter**, outside the signed admin proxy, and checked no role. **Any Access-authenticated reader** could:
- change TRACE Desk candidate states, or promote a candidate into a story cluster;
- submit, approve and reject social signals.

This is live on Production today.
- **Fixed here:** Desk is publisher-only. Social refuses non-publisher POSTs before any write and shows readers no write controls.
- **Already in place:** Astro 5's default origin check blocks cross-site form posts.

**Recorded for owner decision (not changed):**
1. **Proxy, audit and attribution:** both pages still bypass the proxy's audit trail and attribute writes to `'Admin'`. Moving them onto the proxy routes (`candidates`, `social-signals`) would add the signed, audited, operator-attributed path.
2. **Social approve:** it tries to insert an `'approved'` `knowledge_documents` row ("so Ask TRACE can retrieve it"), which contradicts ADR 0009. With `knowledge_type = 'social_signal'` outside the table's CHECK list and `INSERT OR IGNORE`, the row is most likely silently dropped. Remove this path or route it through governed knowledge promotion.
3. **Editorial Ask:** `/admin/ask` still shows readers a form that the server refuses (UX only).

## Unresolved

- Browser QA as the **reader** has not been run (deferred by the owner). The reader boundaries are covered by the local tests only; see "Preview QA results".
- The pending queue is capped at 50 (unchanged). Paging beyond 50 is not added.

## Next safe Preview QA checklist (needs separate deploy approval)

1. **Deploy:** deploy the branch's Worker (unchanged code) and Pages to Preview by direct upload. Cron stays `[]`; no migration.
2. **Publisher, Pending Review:** open a blocked item (unverified or outdated).
   - The banner shows "not publication-eligible", the publish form is hidden, and Publish and Archive are absent.
   - Sources and claims load, and governance controls and history work on a `[QA-…]` fixture assertion.
   - Back returns to the same card.
3. **Publisher:** open a pending item that is also publishable, load the publishable list, and use **Open in publish workflow**. The publish form returns with the item selected.
4. **Reload** with `?review=<id>`: the same item reopens. `?review=999999` and `?review=abc` show the notice and load nothing.
5. **Reader:**
   - pending cards show **Inspect evidence and history**;
   - there is no AI Analyze button, only the note;
   - related search works, with no Apply controls;
   - no governance controls appear, and history opens.
6. **Reader on Social and Desk:**
   - `/admin/social` lists signals, with the read-only note and no forms;
   - a direct form POST returns 403;
   - `/admin/desk` returns 403.
7. **Mobile width:** cards and banner wrap, and buttons are full-width.
8. **Read-only checks:** D1 counts are unchanged except for intended `[QA-…]` governance decisions; schedules are `[]`.

## Preview QA results (2026-10-25)

**Deployment (owner-approved, Preview only):** Pages built from `349e0fe` and uploaded directly to the `launch-05r-preview` alias (deployment `63aed908`; rollback target is the previous alias deployment `ed744c77`). The Preview Worker was not redeployed (unchanged code, `d8e4d10c`). No migration. Preview Cron schedules stayed `[]`. No test records were created and no governance decisions, submissions or publications were made.

**Publisher (checklist steps 2, 4, 6 and 7): pass.**

| Check | Result |
|---|---|
| Pending Review cards | 10 cards, each with its evidence badge, reasons, a "Next:" action and **Open review**. Publisher controls (AI Analyze, governance) present. |
| Open a blocked item (#16, unverified) | Banner shows "not publication-eligible". Publish form hidden, publish selection cleared, Publish and Archive disabled, **Open in publish workflow** hidden. Sources and claims load; governance buttons and both history toggles render; history loads. |
| Reload with `?review=16` | The same item reopens in review mode. |
| `?review=999999` / `?review=abc` | "No longer in the review queue" / "not valid" notice; nothing loads; `?review=` is removed from the URL. |
| Back to Pending Review (from #13) | Publish form restored, URL cleared, focus returns to the same card. |
| `/admin/social` (publisher) | 200. Submission form, approve/reject forms and AI import button present; no read-only note. |
| `/admin/desk` (publisher) | 200, with its candidate forms. |
| Mobile (375 px) | No horizontal overflow; card header stacks; **Open review** and **Back** buttons are full width. |

**Not exercised:**
- **Step 3 (Open in publish workflow):** Preview has no item that is both pending and publishable. The rule is covered by `canPublishSelection` unit tests and the page test.
- **Steps 5 and 6 as the reader:** deferred by the owner. Reader behaviour (no AI Analyze, no related-item Apply controls, no governance controls, Social read-only with POST 403, Desk 403) is covered by `tests/review-pending-workflow.test.ts` and `tests/admin-page-write-boundaries.test.ts`, not by browser QA.
- **Step 8 (D1 recount):** no writes were made during publisher QA; the recount was planned to follow the reader checks.
