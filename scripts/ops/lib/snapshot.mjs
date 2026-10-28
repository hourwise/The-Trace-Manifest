// TRACE-OPS-01: offline comparison of two operator-supplied database snapshots
// (the output of scripts/ops/release-snapshot.sql). Never queries a database.
//
// Signed Worker admin requests write admin_audit_log rows ("allowed" and
// "succeeded", target_type 'admin_route', action = route path) even for reads,
// and the method is not recorded. Audit growth is therefore EXPECTED only when
// every editorial metric is unchanged AND an audit-delta file shows only
// allowlisted admin_route rows; otherwise it is UNVERIFIED or UNEXPECTED.
import { STATUS } from "./report.mjs";

export const CLASS = Object.freeze({ UNCHANGED: "UNCHANGED", EXPECTED: "EXPECTED", UNEXPECTED: "UNEXPECTED", UNVERIFIED: "UNVERIFIED" });

/**
 * Accepts `wrangler d1 execute --json` output or { metrics: {...} }.
 * @param {string} text
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
export function parseSnapshot(text, label) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${label}: not valid JSON`); }
  /** @type {Record<string, unknown>} */
  const metrics = {};
  const rows = Array.isArray(data) ? data.flatMap((statement) => {
    if (statement && statement.success === false) throw new Error(`${label}: the snapshot query reported failure`);
    return statement?.results ?? [];
  }) : data?.metrics ? Object.entries(data.metrics).map(([metric, value]) => ({ metric, value })) : null;
  if (!rows) throw new Error(`${label}: expected wrangler --json output or { "metrics": {...} }`);
  for (const row of rows) {
    if (typeof row?.metric !== "string" || !("value" in row)) throw new Error(`${label}: every row needs "metric" and "value"`);
    if (row.metric in metrics) throw new Error(`${label}: duplicate metric ${row.metric}`);
    metrics[row.metric] = row.value;
  }
  if (!Object.keys(metrics).length) throw new Error(`${label}: no metrics`);
  return metrics;
}

export function auditDeltaSql(baselineMaxId) {
  if (!Number.isSafeInteger(baselineMaxId) || baselineMaxId < 0) throw new Error("baseline max id must be a non-negative integer");
  return `SELECT 'audit.delta.' || target_type || '.' || action || '.' || outcome AS metric, COUNT(*) AS value FROM admin_audit_log WHERE id > ${baselineMaxId} GROUP BY target_type, action, outcome;`;
}

const AUDIT_METRICS = new Set(["audit.total", "audit.max_id"]);

/**
 * rules.metrics: { name: { max_increase?: n, equals?: v } } approved changes.
 * rules.audit_delta_allow: { target_type, actions: [...], outcomes: [...] }.
 */
export function compareSnapshots(before, after, rules = {}, auditDelta = null) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const approved = rules.metrics ?? {};
  const rows = names.map((metric) => {
    const b = before[metric], a = after[metric];
    if (!(metric in before) || !(metric in after)) {
      // A state that appears or disappears (e.g. candidates.state.held 0 -> 1) is a change, not a gap.
      const grouped = /^(clusters\.status|candidates\.state)\./.test(metric);
      return { metric, before: b ?? null, after: a ?? null, class: grouped ? CLASS.UNEXPECTED : CLASS.UNVERIFIED, reason: grouped ? "group appeared or disappeared" : "present in only one snapshot" };
    }
    if (JSON.stringify(b) === JSON.stringify(a)) return { metric, before: b, after: a, class: CLASS.UNCHANGED };
    const rule = approved[metric];
    if (rule && "equals" in rule && JSON.stringify(a) === JSON.stringify(rule.equals)) return { metric, before: b, after: a, class: CLASS.EXPECTED, reason: "matches approved value" };
    if (rule && typeof rule.max_increase === "number" && typeof a === "number" && typeof b === "number" && a >= b && a - b <= rule.max_increase) {
      return { metric, before: b, after: a, class: CLASS.EXPECTED, reason: `approved increase of up to ${rule.max_increase}` };
    }
    if (AUDIT_METRICS.has(metric) && typeof a === "number" && typeof b === "number" && a > b) return { metric, before: b, after: a, class: CLASS.UNVERIFIED, reason: "audit growth pending classification" };
    return { metric, before: b, after: a, class: CLASS.UNEXPECTED, reason: "changed without approval" };
  });

  const editorialChanged = rows.some((r) => !AUDIT_METRICS.has(r.metric) && r.class === CLASS.UNEXPECTED);
  const auditRows = rows.filter((r) => r.class === CLASS.UNVERIFIED && AUDIT_METRICS.has(r.metric));
  let auditNote = null;
  if (auditRows.length) {
    if (!auditDelta) auditNote = "audit log grew; supply an audit-delta file to classify it";
    else {
      const allow = rules.audit_delta_allow;
      const deltaRows = Object.entries(auditDelta).filter(([k]) => k.startsWith("audit.delta."));
      const disallowed = deltaRows.filter(([key]) => {
        if (!allow) return true;
        const rest = key.slice("audit.delta.".length);
        const outcome = rest.slice(rest.lastIndexOf(".") + 1);
        const head = rest.slice(0, rest.lastIndexOf("."));
        const targetType = head.slice(0, head.indexOf("."));
        const action = head.slice(head.indexOf(".") + 1);
        return targetType !== allow.target_type || !allow.actions.includes(action) || !allow.outcomes.includes(outcome);
      });
      const deltaTotal = deltaRows.reduce((n, [, v]) => n + Number(v), 0);
      const growth = Number(after["audit.total"]) - Number(before["audit.total"]);
      if (disallowed.length) {
        for (const r of auditRows) { r.class = CLASS.UNEXPECTED; r.reason = `audit rows outside the allowlist: ${disallowed.map(([k, v]) => `${k}=${v}`).join(", ")}`; }
      } else if (deltaTotal !== growth) {
        auditNote = `audit delta (${deltaTotal} rows) does not account for growth (${growth})`;
      } else if (editorialChanged) {
        for (const r of auditRows) { r.class = CLASS.UNEXPECTED; r.reason = "audit growth alongside unexpected editorial changes"; }
      } else {
        for (const r of auditRows) { r.class = CLASS.EXPECTED; r.reason = `audit-only: ${deltaTotal} allowlisted admin_route row(s); the method is not recorded, editorial metrics unchanged`; }
      }
    }
    if (auditNote) for (const r of auditRows) r.reason = auditNote;
  }

  const counts = Object.fromEntries(Object.values(CLASS).map((c) => [c, rows.filter((r) => r.class === c).length]));
  const status = counts.UNEXPECTED ? STATUS.FAIL : counts.UNVERIFIED ? STATUS.NOT_VERIFIED : STATUS.PASS;
  return { status, counts, differences: rows.filter((r) => r.class !== CLASS.UNCHANGED) };
}
