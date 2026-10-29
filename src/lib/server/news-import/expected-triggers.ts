// Generated from migration 0080; unknown mutation triggers fail closed.
export const EXPECTED_IMPORT_TRIGGERS = [
  {
    "name": "news_import_candidate_identity_guard",
    "sql": "CREATE TRIGGER news_import_candidate_identity_guard BEFORE UPDATE OF id,submitted_url,lead_text,source_hash ON editorial_candidates WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.submitted_url IS NOT OLD.submitted_url OR NEW.lead_text IS NOT OLD.lead_text OR NEW.source_hash IS NOT OLD.source_hash) BEGIN SELECT RAISE(ABORT,'immutable imported candidate identity'); END"
  },
  {
    "name": "news_import_candidate_no_replace",
    "sql": "CREATE TRIGGER news_import_candidate_no_replace BEFORE INSERT ON editorial_candidates WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=NEW.id) BEGIN SELECT RAISE(ABORT,'immutable imported candidate identity'); END"
  },
  {
    "name": "news_import_candidate_state_guard",
    "sql": "CREATE TRIGGER news_import_candidate_state_guard BEFORE UPDATE OF state ON editorial_candidates WHEN NEW.state<>OLD.state AND EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id WHERE v.candidate_id=OLD.id AND ((OLD.state='held' AND p.review_state IN ('needs_review','rejected') AND NEW.state=p.review_state) OR (OLD.state='needs_review' AND p.review_state='needs_review' AND NEW.state='published'))) BEGIN SELECT RAISE(ABORT,'use governed news resolution; reopening is not authorised'); END"
  },
  {
    "name": "news_import_changed_legacy_url",
    "sql": "CREATE TRIGGER news_import_changed_legacy_url AFTER UPDATE OF submitted_url ON editorial_candidates WHEN NEW.submitted_url IS NOT OLD.submitted_url BEGIN UPDATE editorial_candidates SET source_url_hash=NULL,source_url_identity_issue=NULL WHERE id=NEW.id; END"
  },
  {
    "name": "news_import_deliveries_no_delete",
    "sql": "CREATE TRIGGER news_import_deliveries_no_delete BEFORE DELETE ON news_import_deliveries BEGIN SELECT RAISE(ABORT,'immutable news delivery'); END"
  },
  {
    "name": "news_import_deliveries_no_replace",
    "sql": "CREATE TRIGGER news_import_deliveries_no_replace BEFORE INSERT ON news_import_deliveries WHEN EXISTS(SELECT 1 FROM news_import_deliveries WHERE package_id=NEW.package_id AND version_id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'immutable news delivery replacement'); END"
  },
  {
    "name": "news_import_deliveries_no_update",
    "sql": "CREATE TRIGGER news_import_deliveries_no_update BEFORE UPDATE ON news_import_deliveries BEGIN SELECT RAISE(ABORT,'immutable news delivery'); END"
  },
  {
    "name": "news_import_events_no_delete",
    "sql": "CREATE TRIGGER news_import_events_no_delete BEFORE DELETE ON news_import_events BEGIN SELECT RAISE(ABORT,'immutable news event'); END"
  },
  {
    "name": "news_import_events_no_replace",
    "sql": "CREATE TRIGGER news_import_events_no_replace BEFORE INSERT ON news_import_events WHEN EXISTS(SELECT 1 FROM news_import_events WHERE event_id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'immutable news event replacement'); END"
  },
  {
    "name": "news_import_events_no_update",
    "sql": "CREATE TRIGGER news_import_events_no_update BEFORE UPDATE ON news_import_events BEGIN SELECT RAISE(ABORT,'immutable news event'); END"
  },
  {
    "name": "news_import_link_same_url",
    "sql": "CREATE TRIGGER news_import_link_same_url BEFORE INSERT ON news_import_version_links WHEN EXISTS(SELECT 1 FROM news_import_versions a JOIN news_import_versions b ON b.version_id=NEW.related_version_id WHERE a.version_id=NEW.version_id AND a.url_hash<>b.url_hash) BEGIN SELECT RAISE(ABORT,'version links require same canonical URL'); END"
  },
  {
    "name": "news_import_links_no_delete",
    "sql": "CREATE TRIGGER news_import_links_no_delete BEFORE DELETE ON news_import_version_links BEGIN SELECT RAISE(ABORT,'immutable version link'); END"
  },
  {
    "name": "news_import_links_no_replace",
    "sql": "CREATE TRIGGER news_import_links_no_replace BEFORE INSERT ON news_import_version_links WHEN EXISTS(SELECT 1 FROM news_import_version_links WHERE version_id=NEW.version_id AND related_version_id=NEW.related_version_id) BEGIN SELECT RAISE(ABORT,'immutable version link'); END"
  },
  {
    "name": "news_import_links_no_update",
    "sql": "CREATE TRIGGER news_import_links_no_update BEFORE UPDATE ON news_import_version_links BEGIN SELECT RAISE(ABORT,'immutable version link'); END"
  },
  {
    "name": "news_import_package_identity",
    "sql": "CREATE TRIGGER news_import_package_identity BEFORE INSERT ON news_import_packages WHEN EXISTS(SELECT 1 FROM news_import_packages WHERE package_id=NEW.package_id AND bundle_hash<>NEW.bundle_hash) BEGIN SELECT RAISE(ABORT,'conflicting news package identity'); END"
  },
  {
    "name": "news_import_packages_no_delete",
    "sql": "CREATE TRIGGER news_import_packages_no_delete BEFORE DELETE ON news_import_packages BEGIN SELECT RAISE(ABORT,'immutable news package'); END"
  },
  {
    "name": "news_import_packages_no_replace",
    "sql": "CREATE TRIGGER news_import_packages_no_replace BEFORE INSERT ON news_import_packages WHEN EXISTS(SELECT 1 FROM news_import_packages WHERE package_id=NEW.package_id) BEGIN SELECT RAISE(ABORT,'immutable news package replacement'); END"
  },
  {
    "name": "news_import_packages_no_update",
    "sql": "CREATE TRIGGER news_import_packages_no_update BEFORE UPDATE ON news_import_packages BEGIN SELECT RAISE(ABORT,'immutable news package'); END"
  },
  {
    "name": "news_import_proposal_initial",
    "sql": "CREATE TRIGGER news_import_proposal_initial BEFORE INSERT ON news_import_proposals WHEN NEW.review_state<>'held' OR NEW.revision<>0 OR NEW.reviewed_by IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.reviewed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'invalid initial news review state'); END"
  },
  {
    "name": "news_import_proposal_transition",
    "sql": "CREATE TRIGGER news_import_proposal_transition BEFORE UPDATE ON news_import_proposals WHEN OLD.review_state<>'held' OR NEW.review_state NOT IN('needs_review','rejected') OR NEW.revision<>OLD.revision+1 OR NEW.hold_reason<>OLD.hold_reason OR NEW.version_id<>OLD.version_id OR NEW.reviewed_by IS NULL OR length(trim(NEW.reviewed_by))<1 OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason))<1 OR length(NEW.review_reason)>1000 OR NEW.reviewed_at IS NULL BEGIN SELECT RAISE(ABORT,'invalid news review transition'); END"
  },
  {
    "name": "news_import_proposals_no_delete",
    "sql": "CREATE TRIGGER news_import_proposals_no_delete BEFORE DELETE ON news_import_proposals BEGIN SELECT RAISE(ABORT,'immutable news proposal history'); END"
  },
  {
    "name": "news_import_proposals_no_replace",
    "sql": "CREATE TRIGGER news_import_proposals_no_replace BEFORE INSERT ON news_import_proposals WHEN EXISTS(SELECT 1 FROM news_import_proposals WHERE version_id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'immutable news proposal replacement'); END"
  },
  {
    "name": "news_import_resolution_owner",
    "sql": "CREATE TRIGGER news_import_resolution_owner AFTER UPDATE ON news_import_proposals BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM news_import_versions v JOIN editorial_candidates c ON c.id=v.candidate_id WHERE v.version_id=NEW.version_id AND c.state='held') THEN RAISE(ABORT,'held imported owner required') END; UPDATE editorial_candidates SET state=NEW.review_state,reviewed_by=NEW.reviewed_by,reviewed_at=NEW.reviewed_at,updated_at=datetime('now') WHERE id=(SELECT candidate_id FROM news_import_versions WHERE version_id=NEW.version_id); END"
  },
  {
    "name": "news_import_versions_no_delete",
    "sql": "CREATE TRIGGER news_import_versions_no_delete BEFORE DELETE ON news_import_versions BEGIN SELECT RAISE(ABORT,'immutable news version'); END"
  },
  {
    "name": "news_import_versions_no_replace",
    "sql": "CREATE TRIGGER news_import_versions_no_replace BEFORE INSERT ON news_import_versions WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE version_id=NEW.version_id) BEGIN SELECT RAISE(ABORT,'immutable news version replacement'); END"
  },
  {
    "name": "news_import_versions_no_update",
    "sql": "CREATE TRIGGER news_import_versions_no_update BEFORE UPDATE ON news_import_versions BEGIN SELECT RAISE(ABORT,'immutable news version'); END"
  }
] as const;
