import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const page = readFileSync("src/pages/admin/extract-claims.astro", "utf8");
const documentation = readFileSync("docs/audit/editorial-03d-extraction-audit-certification.md", "utf8");

function certificationPresentationTests(): void {
  assert.match(page, /Recent extraction runs/);
  assert.match(page, /migration 0075/);
  assert.match(page, /Earlier extraction activity cannot be reconstructed here/);
  assert.match(page, /auditRunId/);
  assert.match(page, /Run ID/);
  assert.match(page, /shortRunId/);

  for (const wording of [
    "Running — Run did not record normal completion. It may have been interrupted.",
    "Completed normally — all selected items reached a terminal outcome.",
    "Completed with failures — successful effects remain durable.",
    "Failed — the runner did not complete normally; any recorded items and effects remain durable.",
    "Interrupted — the interruption was recorded and no normal completion was recorded.",
  ]) {
    assert.match(page, new RegExp(wording.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const label of [
    "Selected items",
    "Processed items",
    "No-claim items",
    "Failed items",
    "Extracted claim candidates",
    "New assertions",
    "Successful canonical writes",
  ]) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(page, /Evidence created/i);
  assert.doesNotMatch(page, /canonical-writer calls/i);
  assert.match(page, /legacy <code>evidenceCreated<\/code>/);

  assert.match(page, /Ledger reconciled/);
  assert.match(page, /Ledger mismatch/);
  assert.match(page, /Ledger reconciliation unavailable/);
  assert.match(page, /Stored/);
  assert.match(page, /Derived/);
  assert.match(page, /This audit finding is not changed automatically/);
  assert.match(page, /completion is not certified/);

  for (const label of ["Manual", "Scheduler", "System scheduler", "Inserted", "Reused", "Failed", "Pending", "No claims", "Technical insertion detail"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /one or more canonical effects succeeded; those effects remain durable/);
  assert.match(page, /Canonical claim ID/);
  assert.match(page, /Assertion ID/);
  assert.match(page, /Selection order/);

  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /body\.setAttribute\("role", "alert"\)/);
  assert.match(page, /cell\.scope = "col"/);
  assert.match(page, /name\.scope = "row"/);
  assert.match(page, /Stored run summary compared with counters derived/);
  assert.match(page, /overflowX = "auto"/);

  assert.match(page, /recentRunsDisclosure\?\.addEventListener\("toggle"/);
  assert.match(page, /runDetails\.addEventListener\("toggle"/);
  assert.match(page, /loadedRunDetails\.has\(run\.runId\)/);
  assert.doesNotMatch(page, /setInterval|setTimeout/);
  assert.match(page, /itemLimit/);
  assert.match(page, /effectLimit/);
}

function certificationDocumentationTests(): void {
  assert.match(documentation, /AUTHENTICATED_BROWSER_QA_UNAVAILABLE/);
  assert.match(documentation, /AUDIT_UX_CERTIFIED_WITH_BROWSER_QA_UNAVAILABLE/);
  assert.match(documentation, /Ledger reconciled/);
  assert.match(documentation, /Ledger mismatch/);
  assert.match(documentation, /completed_with_failures/);
  assert.match(documentation, /pre-0075/i);
  assert.match(documentation, /No Retry/i);
}

certificationPresentationTests();
certificationDocumentationTests();
console.log("editorial extraction audit certification tests passed");
