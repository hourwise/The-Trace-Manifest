import assert from "node:assert/strict";
import { SQLiteD1 } from "./sqlite-d1";
import {
  getPublicKnowledgeEvidence,
  getPublicRelatedStories,
  getPublicStoryEvidence,
  relationshipLabel,
} from "../src/lib/server/public-evidence";

async function run(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
      VALUES (1201, 'Reviewed source', 'https://source.example', 'A', 'A', 'primary-technical', 'rss');

      INSERT INTO feed_items
        (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
      VALUES (1201, 1201, 'https://source.example/story', 'public-evidence-feed-hash',
              'Reviewed source story', 'A short source record.', datetime('now'), 'published');

      INSERT INTO story_clusters
        (id, slug, title, topic, summary, publication_status, evidence_status,
         published_at, reviewed_by, reviewed_at)
      VALUES
        (1201, 'public-evidence-story', 'Public evidence story', 'ai-agents',
         'A published story with reviewed evidence.', 'published', 'strongly_supported',
         datetime('now'), 'publisher@example.test', datetime('now')),
        (1202, 'related-evidence-story', 'Related evidence story', 'ai-agents',
         'A separately published related story.', 'published', 'provisionally_supported',
         datetime('now'), 'publisher@example.test', datetime('now')),
        (1203, 'same-topic-story', 'Same topic only', 'ai-agents',
         'This story shares a topic but has no reviewed relationship.', 'published', 'provisionally_supported',
         datetime('now'), 'publisher@example.test', datetime('now')),
        (1204, 'draft-story', 'Draft story', 'ai-agents',
         'A draft must not expose evidence.', 'draft', 'provisionally_supported',
         NULL, NULL, NULL),
        (1205, 'unreviewed-story', 'Unreviewed story', 'ai-agents',
         'An unreviewed story must not expose evidence.', 'published', 'provisionally_supported',
         datetime('now'), NULL, NULL),
        (1206, 'future-story', 'Future story', 'ai-agents',
         'A future story must not expose evidence.', 'published', 'provisionally_supported',
         datetime('now', '+1 day'), 'publisher@example.test', datetime('now')),
        (1207, 'ineligible-story', 'Ineligible story', 'ai-agents',
         'An unverified story must not expose evidence.', 'published', 'unverified',
         datetime('now'), 'publisher@example.test', datetime('now'));

      INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
      VALUES (1201, 1201, 1), (1202, 1201, 1), (1203, 1201, 1);

      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, source_id, media_kind,
         admission_state, copyright_storage_mode)
      VALUES
        ('public-evidence-source', 'https://source.example/story', 'public-evidence-url-hash',
         1201, 'html', 'admitted', 'private_full_text'),
        ('public-evidence-pdf', 'https://source.example/report.pdf', 'public-evidence-pdf-hash',
         1201, 'pdf', 'admitted', 'private_full_text');

      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at,
         http_status, media_type, extraction_status, extraction_state, storage_state)
      VALUES
        ('public-evidence-version', 'public-evidence-source', 'public-evidence-content-hash',
         'https://source.example/story', datetime('now'), 200, 'text/html',
         'captured', 'extracted', 'private_stored'),
        ('public-evidence-pdf-version', 'public-evidence-pdf', 'public-evidence-pdf-content-hash',
         'https://source.example/report.pdf', datetime('now'), 200, 'application/pdf',
         'metadata_only', 'pending', 'private_stored');

      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES
        ('public-evidence-chunk', 'public-evidence-version', 0, 'Private chunk text is not projected.',
         'public-evidence-chunk-hash', 'article:1', 'article:2'),
        ('public-evidence-pdf-chunk', 'public-evidence-pdf-version', 0, 'Impossible legacy PDF chunk.',
         'public-evidence-pdf-chunk-hash', 'page:1', 'page:2');

      INSERT INTO provenance_groups
        (id, root_source_document_id, origin_type, explanation, determined_by, determination_method, reviewed_at)
      VALUES ('public-evidence-provenance', 'public-evidence-source', 'primary',
              'The reviewed source is the direct origin.', 'publisher@example.test', 'editor_review', datetime('now'));

      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES
        ('public-evidence-claim', 'The reviewed source documents the launch.', 'specification_defined', 'product', 'active', 'high'),
        ('public-evidence-unresolved', 'An unresolved claim must not be presented.', 'editorial_synthesis', 'general', 'active', 'standard'),
        ('public-evidence-pdf-claim', 'A PDF claim must not bypass the PDF boundary.', 'specification_defined', 'general', 'active', 'standard');

      INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
      VALUES
        (1201, 'public-evidence-claim', 'primary', 'high', 1),
        (1201, 'public-evidence-unresolved', 'caveat', 'standard', 2),
        (1201, 'public-evidence-pdf-claim', 'supporting', 'standard', 3),
        (1204, 'public-evidence-claim', 'primary', 'high', 1),
        (1205, 'public-evidence-claim', 'primary', 'high', 1),
        (1206, 'public-evidence-claim', 'primary', 'high', 1),
        (1207, 'public-evidence-claim', 'primary', 'high', 1);

      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id,
         start_locator, end_locator, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state,
         provenance_group_id, extraction_method, extraction_version, confidence,
         reviewer_state, reviewed_by, reviewed_at)
      VALUES
        ('public-evidence-assertion', 'public-evidence-claim', 'public-evidence-version',
         'public-evidence-chunk', 'article:1', 'article:2',
         'The source documents the launch.', 'supports', 'evidence', 'direct',
         'factual_support', 'admitted', 'current', 'public-evidence-provenance',
         'deterministic', 'test-v1', 0.95, 'accepted', 'publisher@example.test', datetime('now')),
        ('public-evidence-pdf-assertion', 'public-evidence-pdf-claim', 'public-evidence-pdf-version',
         'public-evidence-pdf-chunk', 'page:1', 'page:2',
         'The PDF claim is intentionally excluded.', 'supports', 'evidence', 'direct',
         'factual_support', 'admitted', 'current', 'public-evidence-provenance',
         'deterministic', 'test-v1', 0.95, 'accepted', 'publisher@example.test', datetime('now'));

      INSERT INTO story_relationships
        (id, source_story_id, target_story_id, relationship, explanation, confidence, created_by, reviewed_at)
      VALUES ('public-evidence-relation', 1201, 1202, 'updates',
              'The later story updates the earlier event.', 0.9,
              'publisher@example.test', datetime('now'));

      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         status, visibility, evidence_status, direct_answer, document_json,
         policy_version, approved_by, approved_at, created_by)
      VALUES ('public-evidence-knowledge', 'What did the source document?',
              'public-evidence-knowledge-hash', 'ai-agents', 'definition',
              'approved', 'public_knowledge', 'strongly_supported',
              'The source documents the launch.', '{}', 'test-v1',
              'publisher@example.test', datetime('now'), 'publisher@example.test');

      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, display_order, reviewed_by, reviewed_at)
      VALUES ('public-evidence-knowledge', 'public-evidence-claim', 'answer',
              'supports', 1, 'publisher@example.test', datetime('now'));

      INSERT INTO knowledge_document_claim_assertions
        (knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id,
         relationship, reviewed_by, reviewed_at)
      VALUES ('public-evidence-knowledge', 'answer', 'public-evidence-claim',
              'public-evidence-assertion', 'supports', 'publisher@example.test', datetime('now'));
    `);

    const storyEvidence = await getPublicStoryEvidence(database.asD1(), 1201);
    assert.equal(storyEvidence.totalClaimCount, 3);
    assert.equal(storyEvidence.resolvedClaimCount, 1, 'only the extracted reviewed assertion is public evidence');
    assert.equal(storyEvidence.unresolvedClaimCount, 2, 'unresolved and PDF claims are disclosed as unresolved');
    assert.equal(storyEvidence.assertionCount, 1);
    assert.equal(storyEvidence.sourceCount, 1);
    assert.equal(storyEvidence.provenanceGroupCount, 1);
    assert.equal(storyEvidence.claims[0]?.assertions[0]?.assertionText, 'The source documents the launch.');
    assert.equal(storyEvidence.claims[0]?.assertions[0]?.sourceUrl, 'https://source.example/story');
    assert.equal(storyEvidence.claims[0]?.assertions[0]?.startLocator, 'article:1');
    assert.equal((storyEvidence.claims[0]?.assertions[0] as unknown as Record<string, unknown>).chunkText, undefined,
      'public projection does not expose private source chunk text');

    for (const ineligibleStoryId of [1204, 1205, 1206, 1207]) {
      const ineligible = await getPublicStoryEvidence(database.asD1(), ineligibleStoryId);
      assert.equal(ineligible.totalClaimCount, 0,
        `public evidence helper rejects ineligible story ${ineligibleStoryId} at its own boundary`);
    }

    database.sqlite.exec(`
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES
        ('public-evidence-many', 'An early claim has many assertions.', 'specification_defined', 'general', 'active', 'standard'),
        ('public-evidence-later-a', 'A later claim has one assertion.', 'specification_defined', 'general', 'active', 'standard'),
        ('public-evidence-later-b', 'Another later claim has one assertion.', 'specification_defined', 'general', 'active', 'standard');
      INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
      VALUES
        (1201, 'public-evidence-many', 'supporting', 'standard', 4),
        (1201, 'public-evidence-later-a', 'supporting', 'standard', 5),
        (1201, 'public-evidence-later-b', 'supporting', 'standard', 6);
    `);
    const assertionInsert = database.sqlite.prepare(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id,
         start_locator, end_locator, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state,
         provenance_group_id, extraction_method, extraction_version, confidence,
         reviewer_state, reviewed_by, reviewed_at)
      VALUES (?, ?, 'public-evidence-version', 'public-evidence-chunk', ?, ?, ?,
              'supports', 'evidence', 'direct', 'factual_support', 'admitted', 'current',
              'public-evidence-provenance', 'deterministic', 'test-v1', 0.9,
              'accepted', 'publisher@example.test', datetime('now'))
    `);
    for (let index = 1; index <= 5; index++) {
      assertionInsert.run(`public-evidence-many-${index}`, 'public-evidence-many', `many:${index}`, `many:${index + 1}`, `Early assertion ${index}.`);
    }
    assertionInsert.run('public-evidence-later-a-1', 'public-evidence-later-a', 'later-a:1', 'later-a:2', 'Later assertion A.');
    assertionInsert.run('public-evidence-later-b-1', 'public-evidence-later-b', 'later-b:1', 'later-b:2', 'Later assertion B.');
    const boundedClaims = await getPublicStoryEvidence(database.asD1(), 1201);
    assert.equal(boundedClaims.claims.find((claim) => claim.claimId === 'public-evidence-many')?.assertions.length, 4,
      'the per-claim public assertion cap is four');
    assert.equal(boundedClaims.claims.find((claim) => claim.claimId === 'public-evidence-later-a')?.assertions.length, 1,
      'a later claim is not starved by an earlier claim with many assertions');
    assert.equal(boundedClaims.claims.find((claim) => claim.claimId === 'public-evidence-later-b')?.assertions.length, 1,
      'every later eligible claim receives its reviewed assertion');

    await database.prepare("UPDATE source_document_versions SET retrieved_url = 'https://user:password@source.example/story' WHERE id = 'public-evidence-version'").run();
    await database.prepare("UPDATE source_documents SET canonical_url = 'https://user:password@source.example/story' WHERE id = 'public-evidence-source'").run();
    const credentialedUrlEvidence = await getPublicStoryEvidence(database.asD1(), 1201);
    assert.equal(credentialedUrlEvidence.claims[0]?.assertions[0]?.sourceUrl, null,
      'public URLs reject embedded credentials');

    const related = await getPublicRelatedStories(database.asD1(), 1201);
    assert.deepEqual(related.map((item) => item.slug), ['related-evidence-story']);
    assert.equal(related[0]?.relationshipLabel, 'Updates');
    assert.equal("confidence" in (related[0] ?? {}), false,
      'internal relationship confidence remains ordering metadata and is not public');
    assert.equal(relationshipLabel('updates', 'outgoing'), 'Updates');
    assert.equal(relationshipLabel('updates', 'incoming'), 'Updated by');
    assert.equal(relationshipLabel('retracts', 'outgoing'), 'Related',
      'unknown directional relationships use a neutral public label');

    const knowledgeEvidence = await getPublicKnowledgeEvidence(database.asD1(), 'public-evidence-knowledge');
    assert.equal(knowledgeEvidence.totalClaimCount, 1);
    assert.equal(knowledgeEvidence.resolvedClaimCount, 1);
    assert.equal(knowledgeEvidence.claims[0]?.sectionKey, 'answer');
    assert.equal(knowledgeEvidence.claims[0]?.assertions[0]?.sourceDocumentId, 'public-evidence-source');

    console.log("Public evidence projection tests passed.");
  } finally {
    database.close();
  }
}

await run();
