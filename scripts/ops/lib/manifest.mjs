// TRACE-OPS-01: release manifest and site profile validation. Unknown keys,
// ambiguous targets and missing identities are refused, never defaulted.
const HEX40 = /^[0-9a-f]{40}$/;
const TARGETS = new Set(["production", "preview"]);

function exactKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) throw new Error(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label}.${key} is not a known field`);
}

export function validateManifest(manifest, { commitOverride = null } = {}) {
  exactKeys(manifest, ["schema", "release_id", "target", "expected_commit", "approval_reference", "profile", "pages", "cron", "database"], ["worker", "mandatory_scope", "notes"], "manifest");
  if (manifest.schema !== "trace-release-manifest-v1") throw new Error("manifest.schema must be trace-release-manifest-v1");
  if (!TARGETS.has(manifest.target)) throw new Error("manifest.target must be exactly \"production\" or \"preview\"");
  if (typeof manifest.release_id !== "string" || !manifest.release_id.trim()) throw new Error("manifest.release_id is required");
  if (typeof manifest.approval_reference !== "string" || !manifest.approval_reference.trim()) throw new Error("manifest.approval_reference must reference the owner-approved release decision");
  let commit = manifest.expected_commit;
  let source = "manifest";
  if (commitOverride !== null) {
    if (manifest.expected_commit !== null) throw new Error("the manifest already pins expected_commit; --commit may only fill a null expected_commit");
    commit = commitOverride;
    source = "command line / CI event";
  }
  if (!HEX40.test(commit ?? "")) throw new Error("expected commit must be a full 40-character lowercase SHA");
  exactKeys(manifest.pages, ["project"], ["expected_deployment_id"], "manifest.pages");
  if (manifest.pages.expected_deployment_id != null && !/^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(manifest.pages.expected_deployment_id)) throw new Error("manifest.pages.expected_deployment_id must be a short or full deployment id");
  exactKeys(manifest.cron, ["expected"], ["mandatory"], "manifest.cron");
  if (!Array.isArray(manifest.cron.expected) || manifest.cron.expected.some((c) => typeof c !== "string")) throw new Error("manifest.cron.expected must be an array of cron strings");
  if (manifest.cron.expected.length) throw new Error("manifest.cron.expected must be [] while STOP-BURN is in force");
  if (manifest.worker) {
    exactKeys(manifest.worker, ["name"], ["expected_version_id", "expected_bindings"], "manifest.worker");
    if (manifest.worker.expected_version_id != null && !/^[0-9a-f-]{36}$/.test(manifest.worker.expected_version_id)) throw new Error("manifest.worker.expected_version_id must be a version UUID");
    for (const b of manifest.worker.expected_bindings ?? []) exactKeys(b, ["name", "type"], ["id"], "manifest.worker.expected_bindings[]");
  }
  exactKeys(manifest.database, ["approved_changes", "snapshot_required"], ["audit_delta_allow", "notes"], "manifest.database");
  if (typeof manifest.database.snapshot_required !== "boolean") throw new Error("manifest.database.snapshot_required must be true or false");
  if (manifest.database.approved_changes !== "none" && (typeof manifest.database.approved_changes !== "object" || Array.isArray(manifest.database.approved_changes))) throw new Error("manifest.database.approved_changes must be \"none\" or { metric: rule }");
  if (manifest.database.audit_delta_allow) exactKeys(manifest.database.audit_delta_allow, ["target_type", "actions", "outcomes"], [], "manifest.database.audit_delta_allow");
  if (manifest.mandatory_scope) exactKeys(manifest.mandatory_scope, [], ["deployment", "public", "access"], "manifest.mandatory_scope");
  return { commit, commitSource: source };
}

export function validateProfile(profile, target) {
  exactKeys(profile, ["schema", "target", "site_host", "allow_hosts", "access", "pages_project", "workers", "limits", "public_routes", "admin_routes"], ["repo", "branch", "notes"], "profile");
  if (profile.schema !== "trace-site-profile-v1") throw new Error("profile.schema must be trace-site-profile-v1");
  if (profile.target !== target) throw new Error(`profile is for ${profile.target}, manifest targets ${target}`);
  if (!profile.allow_hosts.includes(profile.site_host)) throw new Error("profile.site_host must be in allow_hosts");
  if (profile.allow_hosts.some((h) => h.includes("*") || h !== h.toLowerCase())) throw new Error("allow_hosts must be exact lowercase host names");
  exactKeys(profile.access, ["application_host"], ["team_host"], "profile.access");
  exactKeys(profile.limits, ["timeout_ms", "max_response_bytes", "public_retries", "max_site_requests", "max_github_requests", "max_cloudflare_requests", "deployment_poll_attempts", "deployment_poll_interval_ms"], [], "profile.limits");
  const l = profile.limits;
  if (l.timeout_ms > 30_000 || l.max_response_bytes > 5_000_000 || l.public_retries > 3 || l.max_site_requests > 40 || l.max_github_requests > 40 || l.max_cloudflare_requests > 20 || l.deployment_poll_attempts > 30 || l.deployment_poll_interval_ms > 60_000) throw new Error("profile.limits exceed the TRACE-OPS-01 ceilings");
  const ids = new Set();
  for (const r of profile.public_routes) {
    exactKeys(r, ["id", "path", "expect"], [], "profile.public_routes[]");
    if (!r.id.startsWith("public.") || ids.has(r.id) || !r.path.startsWith("/")) throw new Error(`bad public route ${r.id}`);
    ids.add(r.id);
  }
  for (const r of profile.admin_routes) {
    exactKeys(r, ["id", "path"], [], "profile.admin_routes[]");
    if (!r.id.startsWith("access.") || ids.has(r.id) || !r.path.startsWith("/")) throw new Error(`bad admin route ${r.id}`);
    ids.add(r.id);
  }
  // Worst case: every public route retried, every admin route once.
  const worst = profile.public_routes.length * (1 + l.public_retries) + profile.admin_routes.length;
  if (worst > l.max_site_requests) throw new Error(`worst-case site requests ${worst} exceed max_site_requests ${l.max_site_requests}`);
  for (const w of profile.workers) exactKeys(w, ["label", "name"], [], "profile.workers[]");
}
