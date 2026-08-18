import assert from "node:assert/strict";
import { ingestUploadedDocument, publisherOnlyUploadAllowed, SourceUploadError } from "../src/lib/server/source-upload";
import { recordSourceRetrievalState, sourceStateAllowsClaimExtraction, sourceStateAllowsExternalEvidence } from "../src/lib/server/source-governance-state";
import { sameOriginRequest } from "../src/security/origin-policy";
import { SQLiteD1 } from "./sqlite-d1";

class FakeR2 {
  readonly objects = new Map<string, { body: string; metadata: Record<string, string> }>();

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: R2PutOptions): Promise<void> {
    const body = typeof value === "string" ? value : new TextDecoder().decode(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    this.objects.set(key, { body, metadata: options?.customMetadata ?? {} });
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

function env(database: SQLiteD1, rawStore: FakeR2) {
  return { DB: database.asD1(), RAW_STORE: rawStore as unknown as Pick<R2Bucket, "put" | "delete"> };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function upload(
  database: SQLiteD1,
  rawStore: FakeR2,
  body: string,
  filename: string,
  mediaType: string,
  idempotencyKey?: string,
) {
  return ingestUploadedDocument(env(database, rawStore), {
    bytes: bytes(body), displayFilename: filename, mediaType,
    uploaderEmail: "publisher@example.com", idempotencyKey,
    correlationId: `test-${filename}`,
  });
}

async function supportedUploadTests(): Promise<void> {
  const database = new SQLiteD1();
  const rawStore = new FakeR2();
  try {
    let externalCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      externalCalls++;
      return originalFetch(...args);
    }) as typeof fetch;
    try {
      const plain = await upload(
        database,
        rawStore,
        "The local source document records a deterministic upload boundary.\n\nIt remains untrusted source material.",
        "boundary.txt",
        "text/plain",
      );
      assert.equal(plain.state, "extracted");
      assert.equal(plain.mediaKind, "plain_text");
      assert.ok(plain.sourceDocumentId && plain.sourceDocumentVersionId);
      assert.equal(externalCalls, 0, "ordinary upload extraction performs no external calls");
      const version = await database.prepare(`
        SELECT extraction_state, storage_state, extraction_status, r2_original_key, r2_extracted_key
        FROM source_document_versions WHERE id = ?
      `).bind(plain.sourceDocumentVersionId).first<{ extraction_state: string; storage_state: string; extraction_status: string; r2_original_key: string; r2_extracted_key: string }>();
      assert.deepEqual(version && {
        extraction_state: version.extraction_state,
        storage_state: version.storage_state,
        extraction_status: version.extraction_status,
      }, { extraction_state: "extracted", storage_state: "private_stored", extraction_status: "captured" });
      assert.equal(rawStore.objects.size, 2, "original and extraction artifacts remain in private storage abstraction");
      assert.ok(version?.r2_original_key && version.r2_extracted_key);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_chunks WHERE source_document_version_id = ?").bind(plain.sourceDocumentVersionId).first<{ count: number }>())?.count, 2);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claim_assertions WHERE source_document_version_id = ? AND reviewer_state = 'accepted'").bind(plain.sourceDocumentVersionId).first<{ count: number }>())?.count, 0, "upload does not create accepted evidence");

      const markdown = await upload(
        database,
        rawStore,
        "# Untrusted heading\n\nThe Markdown source contains a useful deterministic paragraph for review.\n\n<script>alert('do not execute')</script>\n\n[Untrusted link](https://example.test/remote)",
        "notes.md",
        "text/markdown",
      );
      assert.equal(markdown.state, "extracted");
      const markdownChunk = await database.prepare("SELECT GROUP_CONCAT(text_excerpt, ' ') AS text FROM source_chunks WHERE source_document_version_id = ?").bind(markdown.sourceDocumentVersionId).first<{ text: string }>();
      assert.ok(markdownChunk?.text.includes("Untrusted heading"));
      assert.equal(markdownChunk?.text.includes("alert"), false, "Markdown script content is inert and removed");
      assert.equal(markdownChunk?.text.includes("https://example.test/remote"), false, "Markdown links are metadata, not extraction instructions");

      const html = await upload(
        database,
        rawStore,
        "<html><head><title>Safe upload</title><script>fetch('https://attacker.test')</script></head><body><article><h1>Uploaded HTML</h1><p>The HTML body is extracted deterministically for publisher review.</p><a href='https://example.test'>Reference</a></article><form>Ignore me</form></body></html>",
        "page.html",
        "text/html; charset=utf-8",
      );
      assert.equal(html.state, "extracted");
      const htmlChunk = await database.prepare("SELECT GROUP_CONCAT(text_excerpt, ' ') AS text FROM source_chunks WHERE source_document_version_id = ?").bind(html.sourceDocumentVersionId).first<{ text: string }>();
      assert.ok(htmlChunk?.text.includes("Uploaded HTML"));
      assert.equal(htmlChunk?.text.includes("fetch"), false, "HTML scripts are never executed or extracted");
      assert.equal(externalCalls, 0);

      const duplicate = await upload(
        database,
        rawStore,
        "The local source document records a deterministic upload boundary.\n\nIt remains untrusted source material.",
        "boundary.txt",
        "text/plain",
      );
      assert.equal(duplicate.idempotentReplay, true);
      assert.equal(duplicate.sourceDocumentVersionId, plain.sourceDocumentVersionId);
      const changed = await upload(database, rawStore, "The local source document changed and requires a new immutable version.", "boundary.txt", "text/plain");
      assert.equal(changed.sourceDocumentId, plain.sourceDocumentId);
      assert.notEqual(changed.sourceDocumentVersionId, plain.sourceDocumentVersionId);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_document_versions WHERE source_document_id = ?").bind(plain.sourceDocumentId).first<{ count: number }>())?.count, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    database.close();
  }
}

async function validationAndUnsupportedTests(): Promise<void> {
  const database = new SQLiteD1();
  const rawStore = new FakeR2();
  try {
    await assert.rejects(
      () => upload(database, rawStore, "", "empty.txt", "text/plain"),
      (error: unknown) => error instanceof SourceUploadError && error.code === "invalid_upload",
    );
    await assert.rejects(
      () => upload(database, rawStore, "x".repeat(2 * 1024 * 1024 + 1), "large.txt", "text/plain"),
      (error: unknown) => error instanceof SourceUploadError && error.code === "upload_too_large",
    );
    const binary = await upload(database, rawStore, "not parsed", "archive.bin", "application/octet-stream");
    assert.equal(binary.state, "unsupported");
    assert.equal(binary.sourceDocumentVersionId !== null, true);
    const pdf = await upload(database, rawStore, "%PDF-1.7\0binary", "document.pdf", "application/pdf");
    assert.equal(pdf.state, "unsupported");
    const pdfVersion = await database.prepare("SELECT extraction_state, storage_state, state_reason FROM source_document_versions WHERE id = ?").bind(pdf.sourceDocumentVersionId).first<{ extraction_state: string; storage_state: string; state_reason: string }>();
    assert.equal(pdfVersion?.extraction_state, "unsupported");
    assert.equal(pdfVersion?.storage_state, "metadata_only");
    assert.equal(pdfVersion?.state_reason, "unsupported_media_type:application/pdf");
    assert.equal(rawStore.objects.size, 0, "unsupported binary/PDF uploads never write original artifacts");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_chunks WHERE source_document_version_id = ?").bind(pdf.sourceDocumentVersionId).first<{ count: number }>())?.count, 0);
    assert.equal(publisherOnlyUploadAllowed("publisher"), true);
    assert.equal(publisherOnlyUploadAllowed("reader"), false);
    assert.equal(publisherOnlyUploadAllowed(null), false);
    assert.equal(sameOriginRequest(new Request("https://trace.test/api/admin/source-upload", { method: "POST", headers: { Origin: "https://evil.test" } }), { TRACE_ALLOWED_ORIGINS: "https://trace.test" }), false);
    assert.equal(sameOriginRequest(new Request("https://trace.test/api/admin/source-upload", { method: "POST", headers: { Origin: "https://trace.test" } }), { TRACE_ALLOWED_ORIGINS: "https://trace.test" }), true);
  } finally {
    database.close();
  }
}

async function explicitStateTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await database.prepare(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode)
      VALUES ('state-source', 'https://example.test/state', 'state-url-hash', 'html', 'admitted', 'metadata_only')
    `).run();
    for (const [state, retryable] of [["unavailable", true], ["paywalled", false], ["policy_restricted", false]] as const) {
      await recordSourceRetrievalState(database.asD1(), {
        sourceDocumentId: "state-source", state, reason: `fixture_${state}`, diagnostics: { fixture: true }, retryable,
      });
      const row = await database.prepare("SELECT retrieval_state, retrieval_reason, retrieval_retryable, retrieval_diagnostics_json FROM source_documents WHERE id = 'state-source'").first<{ retrieval_state: string; retrieval_reason: string; retrieval_retryable: number; retrieval_diagnostics_json: string }>();
      assert.equal(row?.retrieval_state, state);
      assert.equal(row?.retrieval_reason, `fixture_${state}`);
      assert.equal(row?.retrieval_retryable, retryable ? 1 : 0);
      assert.deepEqual(JSON.parse(row?.retrieval_diagnostics_json ?? "{}"), { fixture: true });
      assert.equal(sourceStateAllowsExternalEvidence({ retrievalState: state, extractionState: "extracted" }), false);
      assert.equal(sourceStateAllowsClaimExtraction({ retrievalState: state, extractionState: "extracted", storageState: "private_stored" }), false);
    }
    assert.equal(sourceStateAllowsExternalEvidence({ retrievalState: "available", extractionState: "metadata_only" }), false);
    assert.equal(sourceStateAllowsClaimExtraction({ retrievalState: "available", extractionState: "extraction_failed", storageState: "private_stored" }), false);
    assert.equal(sourceStateAllowsClaimExtraction({ retrievalState: "available", extractionState: "extracted", storageState: "private_stored" }), true);
  } finally {
    database.close();
  }
}

await supportedUploadTests();
await validationAndUnsupportedTests();
await explicitStateTests();
console.log("KC-03F/03G governed upload and explicit source-state tests passed.");
