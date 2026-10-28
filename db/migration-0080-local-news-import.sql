-- P4: forward-only, disabled-by-default hosted intake sidecar. Requires 0077.
-- 0072 is reserved; 0077-0079 belong to other features. Never apply remotely
-- without separate approval. Existing source_hash and candidate states survive.
ALTER TABLE editorial_candidates ADD COLUMN source_url_hash TEXT
 CHECK(source_url_hash IS NULL OR (length(source_url_hash)=64 AND source_url_hash NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE editorial_candidates ADD COLUMN source_url_identity_issue TEXT CHECK(source_url_identity_issue IS NULL OR source_url_identity_issue IN ('invalid_url','oversize_url'));
CREATE INDEX idx_editorial_candidate_url_hash ON editorial_candidates(source_url_hash,id);
CREATE INDEX idx_editorial_candidate_unindexed_url ON editorial_candidates(id)
 WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL;
CREATE TABLE news_import_packages (
 package_id TEXT NOT NULL PRIMARY KEY, bundle_hash TEXT NOT NULL UNIQUE CHECK(length(bundle_hash)=64),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json)),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)), imported_by TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE, imported_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE news_import_versions (
 version_id TEXT NOT NULL PRIMARY KEY CHECK(length(version_id)=64), item_id TEXT NOT NULL CHECK(length(item_id)=64),
 source_key TEXT NOT NULL, content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
 url_hash TEXT NOT NULL CHECK(length(url_hash)=64), source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
 candidate_id TEXT NOT NULL UNIQUE REFERENCES editorial_candidates(id) CHECK(candidate_id='local-news-p4:'||version_id),
 retrieved_at TEXT NOT NULL, proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)),
 UNIQUE(item_id,content_hash)
);
CREATE INDEX news_import_versions_url ON news_import_versions(url_hash,version_id);
CREATE INDEX news_import_versions_candidate ON news_import_versions(candidate_id,version_id);
CREATE TABLE news_import_deliveries (
 package_id TEXT NOT NULL REFERENCES news_import_packages(package_id),
 version_id TEXT NOT NULL REFERENCES news_import_versions(version_id),
 PRIMARY KEY(package_id,version_id)
);
CREATE TABLE news_import_proposals (
 version_id TEXT NOT NULL PRIMARY KEY REFERENCES news_import_versions(version_id),
 review_state TEXT NOT NULL DEFAULT 'held' CHECK(review_state IN('held','needs_review','rejected')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0),
 hold_reason TEXT NOT NULL CHECK(json_valid(hold_reason)),
 reviewed_by TEXT, review_reason TEXT, reviewed_at TEXT
);
CREATE TABLE news_import_events (
 event_id TEXT NOT NULL PRIMARY KEY, version_id TEXT NOT NULL REFERENCES news_import_versions(version_id),
 operator_email TEXT NOT NULL, operator_role TEXT NOT NULL CHECK(operator_role='publisher'),
 action TEXT NOT NULL CHECK(action IN('import_held','import_existing','release','reject')),
 reason TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX news_import_events_version ON news_import_events(version_id,event_id);
CREATE INDEX news_import_proposals_review ON news_import_proposals(review_state,version_id);
CREATE TRIGGER news_import_package_identity BEFORE INSERT ON news_import_packages
 WHEN EXISTS(SELECT 1 FROM news_import_packages WHERE package_id=NEW.package_id AND bundle_hash<>NEW.bundle_hash)
 BEGIN SELECT RAISE(ABORT,'conflicting news package identity'); END;
CREATE TRIGGER news_import_proposal_transition BEFORE UPDATE ON news_import_proposals
 WHEN OLD.review_state<>'held' OR NEW.review_state NOT IN('needs_review','rejected')
 OR NEW.revision<>OLD.revision+1 OR NEW.hold_reason<>OLD.hold_reason OR NEW.version_id<>OLD.version_id
 OR NEW.reviewed_by IS NULL OR length(trim(NEW.reviewed_by))<1 OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason))<1 OR length(NEW.review_reason)>1000 OR NEW.reviewed_at IS NULL
 BEGIN SELECT RAISE(ABORT,'invalid news review transition'); END;
CREATE TRIGGER news_import_proposals_no_delete BEFORE DELETE ON news_import_proposals
 BEGIN SELECT RAISE(ABORT,'immutable news proposal history'); END;
CREATE TRIGGER news_import_packages_no_update BEFORE UPDATE ON news_import_packages BEGIN SELECT RAISE(ABORT,'immutable news package'); END;
CREATE TRIGGER news_import_packages_no_delete BEFORE DELETE ON news_import_packages BEGIN SELECT RAISE(ABORT,'immutable news package'); END;
CREATE TRIGGER news_import_versions_no_update BEFORE UPDATE ON news_import_versions BEGIN SELECT RAISE(ABORT,'immutable news version'); END;
CREATE TRIGGER news_import_versions_no_delete BEFORE DELETE ON news_import_versions BEGIN SELECT RAISE(ABORT,'immutable news version'); END;
CREATE TRIGGER news_import_deliveries_no_update BEFORE UPDATE ON news_import_deliveries BEGIN SELECT RAISE(ABORT,'immutable news delivery'); END;
CREATE TRIGGER news_import_deliveries_no_delete BEFORE DELETE ON news_import_deliveries BEGIN SELECT RAISE(ABORT,'immutable news delivery'); END;
CREATE TRIGGER news_import_events_no_update BEFORE UPDATE ON news_import_events BEGIN SELECT RAISE(ABORT,'immutable news event'); END;
CREATE TRIGGER news_import_events_no_delete BEFORE DELETE ON news_import_events BEGIN SELECT RAISE(ABORT,'immutable news event'); END;

-- Each immutable version owns exactly one review candidate. No ordinary reopen.
CREATE TRIGGER news_import_candidate_state_guard BEFORE UPDATE OF state ON editorial_candidates
 WHEN NEW.state<>OLD.state AND EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=OLD.id)
 AND NOT EXISTS(SELECT 1 FROM news_import_versions v JOIN news_import_proposals p ON p.version_id=v.version_id WHERE v.candidate_id=OLD.id
 AND ((OLD.state='held' AND p.review_state IN ('needs_review','rejected') AND NEW.state=p.review_state)
 OR (OLD.state='needs_review' AND p.review_state='needs_review' AND NEW.state='published')))
 BEGIN SELECT RAISE(ABORT,'use governed news resolution; reopening is not authorised'); END;
CREATE TRIGGER news_import_candidate_no_replace BEFORE INSERT ON editorial_candidates
 WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'immutable imported candidate identity'); END;
CREATE TRIGGER news_import_candidate_identity_guard BEFORE UPDATE OF id,submitted_url,lead_text,source_hash ON editorial_candidates
 WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE candidate_id=OLD.id)
 AND (NEW.id IS NOT OLD.id OR NEW.submitted_url IS NOT OLD.submitted_url OR NEW.lead_text IS NOT OLD.lead_text OR NEW.source_hash IS NOT OLD.source_hash)
 BEGIN SELECT RAISE(ABORT,'immutable imported candidate identity'); END;
CREATE TRIGGER news_import_resolution_owner AFTER UPDATE ON news_import_proposals
 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM news_import_versions v JOIN editorial_candidates c ON c.id=v.candidate_id WHERE v.version_id=NEW.version_id AND c.state='held') THEN RAISE(ABORT,'held imported owner required') END;
 UPDATE editorial_candidates SET state=NEW.review_state,reviewed_by=NEW.reviewed_by,reviewed_at=NEW.reviewed_at,updated_at=datetime('now') WHERE id=(SELECT candidate_id FROM news_import_versions WHERE version_id=NEW.version_id);
 END;
CREATE TRIGGER news_import_changed_legacy_url AFTER UPDATE OF submitted_url ON editorial_candidates
 WHEN NEW.submitted_url IS NOT OLD.submitted_url
 BEGIN UPDATE editorial_candidates SET source_url_hash=NULL,source_url_identity_issue=NULL WHERE id=NEW.id; END;

CREATE TRIGGER news_import_proposal_initial BEFORE INSERT ON news_import_proposals
 WHEN NEW.review_state<>'held' OR NEW.revision<>0 OR NEW.reviewed_by IS NOT NULL OR NEW.review_reason IS NOT NULL OR NEW.reviewed_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'invalid initial news review state'); END;

-- SQLite REPLACE may skip DELETE triggers when recursive triggers are off.
-- Refuse replacement at INSERT time as well as ordinary UPDATE/DELETE.
CREATE TRIGGER news_import_packages_no_replace BEFORE INSERT ON news_import_packages
 WHEN EXISTS(SELECT 1 FROM news_import_packages WHERE package_id=NEW.package_id)
 BEGIN SELECT RAISE(ABORT,'immutable news package replacement'); END;
CREATE TRIGGER news_import_versions_no_replace BEFORE INSERT ON news_import_versions
 WHEN EXISTS(SELECT 1 FROM news_import_versions WHERE version_id=NEW.version_id)
 BEGIN SELECT RAISE(ABORT,'immutable news version replacement'); END;
CREATE TRIGGER news_import_deliveries_no_replace BEFORE INSERT ON news_import_deliveries
 WHEN EXISTS(SELECT 1 FROM news_import_deliveries WHERE package_id=NEW.package_id AND version_id=NEW.version_id)
 BEGIN SELECT RAISE(ABORT,'immutable news delivery replacement'); END;
CREATE TRIGGER news_import_proposals_no_replace BEFORE INSERT ON news_import_proposals
 WHEN EXISTS(SELECT 1 FROM news_import_proposals WHERE version_id=NEW.version_id)
 BEGIN SELECT RAISE(ABORT,'immutable news proposal replacement'); END;
CREATE TRIGGER news_import_events_no_replace BEFORE INSERT ON news_import_events
 WHEN EXISTS(SELECT 1 FROM news_import_events WHERE event_id=NEW.event_id)
 BEGIN SELECT RAISE(ABORT,'immutable news event replacement'); END;

-- A link records common canonical URL, never inferred chronological supersession.
CREATE TABLE news_import_version_links (
 version_id TEXT NOT NULL REFERENCES news_import_versions(version_id),
 related_version_id TEXT NOT NULL REFERENCES news_import_versions(version_id),
 relationship TEXT NOT NULL CHECK(relationship='same_canonical_url_order_unverified'),
 PRIMARY KEY(version_id,related_version_id),CHECK(version_id<>related_version_id)
);
CREATE TRIGGER news_import_links_no_update BEFORE UPDATE ON news_import_version_links BEGIN SELECT RAISE(ABORT,'immutable version link'); END;
CREATE TRIGGER news_import_links_no_delete BEFORE DELETE ON news_import_version_links BEGIN SELECT RAISE(ABORT,'immutable version link'); END;
CREATE TRIGGER news_import_links_no_replace BEFORE INSERT ON news_import_version_links
 WHEN EXISTS(SELECT 1 FROM news_import_version_links WHERE version_id=NEW.version_id AND related_version_id=NEW.related_version_id)
 BEGIN SELECT RAISE(ABORT,'immutable version link'); END;

CREATE TRIGGER news_import_link_same_url BEFORE INSERT ON news_import_version_links
 WHEN EXISTS(SELECT 1 FROM news_import_versions a JOIN news_import_versions b ON b.version_id=NEW.related_version_id WHERE a.version_id=NEW.version_id AND a.url_hash<>b.url_hash)
 BEGIN SELECT RAISE(ABORT,'version links require same canonical URL'); END;
