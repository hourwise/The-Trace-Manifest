/** Exact accepted write indexes. Unknown indexes invalidate the prewrite reservation. */
export const IDENTITY_WRITE_INDEXES=[
 ['idx_admin_audit_operator','admin_audit_log','CREATE INDEX idx_admin_audit_operator ON admin_audit_log(operator_email, created_at)'],
 ['idx_admin_audit_target','admin_audit_log','CREATE INDEX idx_admin_audit_target ON admin_audit_log(target_type, target_id, created_at)'],
 ['idx_admin_nonces_expiry','admin_request_nonces',"CREATE INDEX idx_admin_nonces_expiry ON admin_request_nonces(expires_at)"],
 ['idx_editorial_candidate_unindexed_url','editorial_candidates','CREATE INDEX idx_editorial_candidate_unindexed_url ON editorial_candidates(id) WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL'],
 ['idx_editorial_candidate_url_hash','editorial_candidates','CREATE INDEX idx_editorial_candidate_url_hash ON editorial_candidates(source_url_hash,id)'],
 ['idx_editorial_candidates_language','editorial_candidates','CREATE INDEX idx_editorial_candidates_language ON editorial_candidates(source_language, detected_language, translation_status)'],
 ['idx_editorial_candidates_source_hash','editorial_candidates','CREATE INDEX idx_editorial_candidates_source_hash ON editorial_candidates(source_hash, created_at DESC)'],
 ['idx_editorial_candidates_state_created','editorial_candidates','CREATE INDEX idx_editorial_candidates_state_created ON editorial_candidates(state, created_at DESC)'],
 ['sqlite_autoindex_admin_audit_log_1','admin_audit_log',null],
 ['sqlite_autoindex_admin_request_nonces_1','admin_request_nonces',null],
 ['sqlite_autoindex_editorial_candidates_1','editorial_candidates',null],
] as const;
