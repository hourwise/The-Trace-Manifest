import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advisoriesFrom, evaluateAudit, GUARDS } from "../scripts/audit-production.mjs";

const advisory = (name: string, id: string, severity: string) => ({
  name, severity, title: `${id} fixture`, url: `https://github.com/advisories/${id}`, source: 1,
});
const report = (...vias: ReturnType<typeof advisory>[]) => ({
  vulnerabilities: Object.fromEntries(vias.map((via) => [via.name, { severity: via.severity, via: [via, "transitive-name"] }])),
});
const policy = {
  threshold: "critical",
  exceptions: [{ advisory: "GHSA-crit-0001", package: "astro", expires: "2027-01-31", guards: ["guard-a"] }],
};
const guardsOk = { "guard-a": true };

// The excepted critical passes; lower severities are below the gate.
let result = evaluateAudit({ report: report(advisory("astro", "GHSA-crit-0001", "critical"), advisory("vite", "GHSA-high-0001", "high")), policy, today: "2026-10-22", guardResults: guardsOk });
assert.equal(result.ok, true);
assert.deepEqual(result.excepted, ["critical astro GHSA-crit-0001 (expires 2027-01-31)"]);

// A new critical, even in the same package, is not covered.
result = evaluateAudit({ report: report(advisory("astro", "GHSA-crit-0002", "critical")), policy, today: "2026-10-22", guardResults: guardsOk });
assert.equal(result.ok, false);
assert.match(result.blocking[0], /GHSA-crit-0002 has no exception/);
assert.deepEqual(result.stale, ["astro GHSA-crit-0001"], "an exception whose advisory disappeared is reported as stale");

// The same advisory id in another package is not covered.
result = evaluateAudit({ report: report(advisory("other", "GHSA-crit-0001", "critical")), policy, today: "2026-10-22", guardResults: guardsOk });
assert.equal(result.ok, false);

// Expiry and guard failures void the exception.
result = evaluateAudit({ report: report(advisory("astro", "GHSA-crit-0001", "critical")), policy, today: "2027-02-01", guardResults: guardsOk });
assert.match(result.blocking[0], /expired on 2027-01-31/);
result = evaluateAudit({ report: report(advisory("astro", "GHSA-crit-0001", "critical")), policy, today: "2026-10-22", guardResults: { "guard-a": false } });
assert.match(result.blocking[0], /guards no longer hold: guard-a/);

// An unusable audit report fails closed.
assert.equal(evaluateAudit({ report: null, policy, today: "2026-10-22", guardResults: guardsOk }).ok, false);
assert.equal(evaluateAudit({ report: { error: { code: "ENOAUDIT" } }, policy, today: "2026-10-22", guardResults: guardsOk }).ok, false);

assert.equal(advisoriesFrom(report(advisory("astro", "GHSA-crit-0001", "critical"))).length, 1, "string 'via' entries are not advisories");

// The committed policy names only real guards and stays scoped to one advisory.
const committed = JSON.parse(readFileSync("scripts/audit-exceptions.json", "utf8"));
assert.equal(committed.threshold, "critical");
for (const exception of committed.exceptions) {
  assert.match(exception.advisory, /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  assert.match(exception.expires, /^\d{4}-\d{2}-\d{2}$/);
  for (const guard of exception.guards) assert.ok(guard in GUARDS, `${guard} is implemented`);
}
// The guards hold in this tree.
for (const guard of Object.keys(GUARDS)) assert.equal(GUARDS[guard as keyof typeof GUARDS](process.cwd()), true, `${guard} holds`);

console.log("production dependency gate tests passed");
