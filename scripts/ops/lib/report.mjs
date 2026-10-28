// TRACE-OPS-01: check results, verdicts and receipts (JSON + Markdown).
// A verdict is PASS only when every mandatory check passed. A mandatory check
// that could not run or could not be verified makes the verdict NOT_VERIFIED,
// never PASS.
import { createHash } from "node:crypto";

export const STATUS = Object.freeze({ PASS: "PASS", FAIL: "FAIL", NOT_VERIFIED: "NOT_VERIFIED", NOT_RUN: "NOT_RUN" });
const ALL_STATUSES = new Set(Object.values(STATUS));

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export class CheckLog {
  constructor() { this.checks = []; this.stopConditions = []; }

  /**
   * Records one check. `stop` names a stop condition raised by a FAIL.
   * @param {{ id: string, mandatory: boolean, status: string, summary: string, evidence?: Record<string, unknown>, stop?: string | null, startedAt?: string, attempts?: number }} check
   */
  record({ id, mandatory, status, summary, evidence = {}, stop = null, startedAt, attempts }) {
    if (!ALL_STATUSES.has(status)) throw new Error(`Unknown status ${status} for ${id}`);
    if (this.checks.some((check) => check.id === id)) throw new Error(`Duplicate check ${id}`);
    const now = new Date().toISOString();
    const check = { id, mandatory: Boolean(mandatory), status, summary, evidence, started_at: startedAt ?? now, finished_at: now };
    if (attempts !== undefined) check.attempts = attempts;
    this.checks.push(check);
    if (status === STATUS.FAIL && stop && !this.stopConditions.includes(stop)) this.stopConditions.push(stop);
    return check;
  }

  verdict() {
    const failed = this.checks.filter((c) => c.status === STATUS.FAIL);
    const mandatory = this.checks.filter((c) => c.mandatory);
    const unverifiedMandatory = mandatory.filter((c) => c.status === STATUS.NOT_VERIFIED || c.status === STATUS.NOT_RUN);
    const unverifiedOptional = this.checks.filter((c) => !c.mandatory && (c.status === STATUS.NOT_VERIFIED || c.status === STATUS.NOT_RUN));
    if (mandatory.length === 0) return { status: STATUS.NOT_VERIFIED, text: "No mandatory checks were defined, so nothing is verified." };
    if (failed.length) {
      return { status: STATUS.FAIL, text: `FAIL: ${failed.length} check(s) failed (${failed.map((c) => c.id).join(", ")}).` };
    }
    if (unverifiedMandatory.length) {
      return { status: STATUS.NOT_VERIFIED, text: `NOT VERIFIED: ${unverifiedMandatory.length} mandatory check(s) could not be verified (${unverifiedMandatory.map((c) => c.id).join(", ")}). Release verification did not pass.` };
    }
    return {
      status: STATUS.PASS,
      text: `PASS: all ${mandatory.length} mandatory checks passed.`
        + (unverifiedOptional.length ? ` ${unverifiedOptional.length} optional check(s) were not verified (${unverifiedOptional.map((c) => c.id).join(", ")}); they are outside this run's mandatory scope.` : ""),
    };
  }
}

/** 0 = PASS, 1 = a check failed, 2 = mandatory verification incomplete. */
export function exitCode(verdict) {
  return verdict.status === STATUS.PASS ? 0 : verdict.status === STATUS.FAIL ? 1 : 2;
}

export function buildReceipt({ tool, target, releaseId, approvalReference, identities, mode, budget, log, evidenceFiles = [], generatedAt = new Date().toISOString() }) {
  return {
    schema: "trace-release-receipt-v1",
    tool,
    generated_at: generatedAt,
    target,
    release_id: releaseId,
    approval_reference: approvalReference,
    approval_reference_verified: false,
    identities,
    mode,
    request_budget: budget,
    checks: log.checks,
    stop_conditions: log.stopConditions,
    evidence_files: evidenceFiles,
    verdict: log.verdict(),
  };
}

const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function renderMarkdown(receipt) {
  const lines = [];
  const v = receipt.verdict;
  lines.push(`# TRACE release verification: ${v.status}`, "");
  lines.push(v.text, "");
  lines.push(`- **Target:** ${receipt.target}`);
  lines.push(`- **Release:** ${receipt.release_id}`);
  lines.push(`- **Approval reference (recorded, not verified):** ${receipt.approval_reference}`);
  lines.push(`- **Expected commit:** \`${receipt.identities.expected_commit ?? "none"}\` (${receipt.identities.commit_source})`);
  if (receipt.identities.pages) lines.push(`- **Pages deployment:** expected \`${receipt.identities.pages.expected_deployment_id ?? "not specified"}\`, observed \`${receipt.identities.pages.observed_deployment_id ?? "not observed"}\``);
  if (receipt.identities.worker) lines.push(`- **Worker version:** expected \`${receipt.identities.worker.expected_version_id ?? "not specified"}\`, observed \`${receipt.identities.worker.observed_version_id ?? "not observed"}\``);
  lines.push(`- **Generated:** ${receipt.generated_at} by ${receipt.tool.name} ${receipt.tool.version}`);
  lines.push(`- **Modes:** ${Object.entries(receipt.mode).map(([k, on]) => `${k} ${on ? "on" : "off"}`).join(", ")}`);
  lines.push(`- **Requests used:** ${Object.entries(receipt.request_budget).map(([k, b]) => `${k} ${b.used}/${b.limit}`).join(", ")}`, "");
  if (receipt.stop_conditions.length) {
    lines.push("## Stop conditions raised", "", ...receipt.stop_conditions.map((s) => `- **${s}**`), "");
  }
  lines.push("## Checks", "", "| Check | Mandatory | Status | Result |", "|---|---|---|---|");
  for (const c of receipt.checks) lines.push(`| \`${c.id}\` | ${c.mandatory ? "yes" : "no"} | **${c.status}** | ${escapeCell(c.summary)} |`);
  const skipped = receipt.checks.filter((c) => c.status === STATUS.NOT_RUN || c.status === STATUS.NOT_VERIFIED);
  if (skipped.length) {
    lines.push("", "## Not run or not verified", "", ...skipped.map((c) => `- \`${c.id}\` (${c.status}): ${c.summary}`));
  }
  if (receipt.evidence_files.length) {
    lines.push("", "## Evidence files", "", "| File | SHA-256 |", "|---|---|", ...receipt.evidence_files.map((f) => `| ${escapeCell(f.path)} | \`${f.sha256}\` |`));
  }
  lines.push("", "This report is read-only verification. It changes nothing and approves nothing.", "");
  return lines.join("\n");
}
