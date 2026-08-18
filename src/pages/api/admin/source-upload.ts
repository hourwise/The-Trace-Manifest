import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../security/origin-policy";
import { ingestUploadedDocument, MAX_UPLOAD_BYTES, publisherOnlyUploadAllowed, SourceUploadError } from "../../../lib/server/source-upload";

export const prerender = false;

interface UploadEnvironment extends AccessEnvironment, OriginPolicyEnvironment {
  DB?: D1Database;
  RAW_STORE?: R2Bucket;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as UploadEnvironment;
  const identity = await authenticateAccessRequest(request, env);
  if (!identity) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const rows = await env.DB.prepare(`
      SELECT intake.id, intake.display_filename, intake.media_type, intake.media_kind,
             intake.content_hash, intake.byte_length, intake.outcome_state, intake.state_reason,
             intake.created_at, intake.source_document_id, intake.source_document_version_id,
             version.retrieval_state, version.extraction_state, version.storage_state
      FROM source_upload_intakes intake
      LEFT JOIN source_document_versions version ON version.id = intake.source_document_version_id
      ORDER BY intake.created_at DESC, intake.id DESC
      LIMIT 50
    `).all<UploadStatusRow>();
    return Response.json({ uploads: rows.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Upload status is unavailable." }, { status: 503 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as UploadEnvironment;
  const identity = await authenticateAccessRequest(request, env);
  if (!identity || !publisherOnlyUploadAllowed(identity.role)) {
    return Response.json({ error: "Publisher access is required." }, { status: 403 });
  }
  if (!sameOriginRequest(request, env)) {
    await recordUploadAudit(env.DB, identity.email, null, request, "denied", "origin_rejected");
    return Response.json({ error: "Origin rejected." }, { status: 403 });
  }
  if (!env.DB || !env.RAW_STORE) return Response.json({ error: "Upload storage is unavailable." }, { status: 503 });

  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    await recordUploadAudit(env.DB, identity.email, null, request, "failed", "upload_too_large");
    return Response.json({ error: "The multipart upload exceeds the configured limit." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    await recordUploadAudit(env.DB, identity.email, null, request, "failed", "malformed_multipart");
    return Response.json({ error: "The multipart upload is malformed." }, { status: 400 });
  }
  const file = form.get("file");
  if (typeof File === "undefined" || !(file instanceof File)) {
    await recordUploadAudit(env.DB, identity.email, null, request, "failed", "file_missing");
    return Response.json({ error: "A single document file is required." }, { status: 400 });
  }

  try {
    const result = await ingestUploadedDocument(
      { DB: env.DB, RAW_STORE: env.RAW_STORE },
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        displayFilename: file.name,
        mediaType: file.type,
        uploaderEmail: identity.email,
        idempotencyKey: request.headers.get("Idempotency-Key") ?? form.get("idempotencyKey")?.toString(),
        correlationId: request.headers.get("X-Trace-Correlation-Id") ?? crypto.randomUUID(),
      },
    );
    await recordUploadAudit(env.DB, identity.email, result.sourceDocumentVersionId ?? result.intakeId, request, "succeeded", `${result.state}:${result.contentHash.slice(0, 16)}`);
    return Response.json(result, { status: result.idempotentReplay ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof SourceUploadError ? error.status : 500;
    const code = error instanceof SourceUploadError ? error.code : "upload_failed";
    await recordUploadAudit(env.DB, identity.email, null, request, "failed", code);
    return Response.json({ error: error instanceof SourceUploadError ? error.message : "The upload failed." }, { status });
  }
};

interface UploadStatusRow {
  id: string;
  display_filename: string;
  media_type: string;
  media_kind: string;
  content_hash: string;
  byte_length: number;
  outcome_state: string;
  state_reason: string | null;
  created_at: string;
  source_document_id: string | null;
  source_document_version_id: string | null;
  retrieval_state: string | null;
  extraction_state: string | null;
  storage_state: string | null;
}

async function recordUploadAudit(
  db: D1Database | undefined,
  email: string,
  targetId: string | null,
  request: Request,
  outcome: "denied" | "failed" | "succeeded",
  detailCode: string,
): Promise<void> {
  if (!db) return;
  const requestId = request.headers.get("X-Trace-Correlation-Id") ?? crypto.randomUUID();
  await db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', '/api/admin/source-upload', 'source_upload', ?, ?, ?, ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(`${requestId}:${outcome}`, email, targetId, requestId, outcome, detailCode.slice(0, 240)).run().catch(() => undefined);
}
