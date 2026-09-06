import assert from "node:assert/strict";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  resolveAdminSection,
  isAdminPath,
} from "../src/lib/admin-navigation";

const links = ADMIN_NAV_ITEMS.map((item) => item.href);
const ids = ADMIN_NAV_ITEMS.map((item) => item.id);

assert.equal(new Set(links).size, links.length, "admin navigation links must be unique");
assert.equal(new Set(ids).size, ids.length, "admin navigation section IDs must be unique");
assert.equal(ADMIN_NAV_GROUPS.length, 3);
assert.equal(ADMIN_NAV_ITEMS.length, 10);

assert.equal(resolveAdminSection("/admin"), "overview");
assert.equal(resolveAdminSection("/admin/desk"), "desk");
assert.equal(resolveAdminSection("/admin/review"), "review");
assert.equal(resolveAdminSection("/admin/knowledge"), "knowledge");
assert.equal(resolveAdminSection("/admin/knowledge/claim-matches"), "knowledge");
assert.equal(resolveAdminSection("/admin/knowledge/doc/example?tab=evidence"), "knowledge");
assert.equal(resolveAdminSection("/admin/knowledge/"), "knowledge");
assert.equal(resolveAdminSection("/feed"), null);
assert.equal(resolveAdminSection("/"), null);
assert.equal(resolveAdminSection("/administrator"), null);
assert.equal(isAdminPath("/admin/social"), true);
assert.equal(isAdminPath("/stories/example"), false);

console.log("admin-navigation tests passed");
