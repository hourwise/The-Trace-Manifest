import {
  retrieveRemoteSource,
  SourceRetrievalError,
  type SourceRetrievalAuditEvent,
} from "./source-retrieval";
import { extractHtmlDocument } from "./source-extraction";

const MAX_EXCERPT_LENGTH = 3_500;

export interface ExtractedTriageSource {
  title: string;
  excerpt: string;
  finalUrl: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
}

// Compatibility export for the existing triage API. KC-03 callers should use
// SourceRetrievalError and its stable `code` rather than a triage-only class.
export { SourceRetrievalError as TriageUrlFetchError } from "./source-retrieval";

/**
 * Retrieves a single, editor-requested public HTML page for AI triage.
 * It deliberately does not follow links embedded in the page, use cookies,
 * or persist the retrieved text.
 */
export async function extractTriageUrlSource(
  value: string,
  onAudit?: (event: SourceRetrievalAuditEvent) => void | Promise<void>,
): Promise<ExtractedTriageSource> {
  const retrieved = await retrieveRemoteSource(value, {
    allowedContentTypes: ["text/html", "application/xhtml+xml"],
    maximumBytes: 256 * 1024,
    timeoutMs: 12_000,
    maxRedirects: 3,
    userAgent: "TheTraceManifest/0.1 (editorial URL triage; +https://thetracemanifest.com)",
    acceptHeader: "text/html,application/xhtml+xml;q=0.9",
    onAudit,
  });
  return extractPageData(retrieved.body, retrieved.finalUrl);
}

function extractPageData(html: string, finalUrl: string): ExtractedTriageSource {
  const extracted = extractHtmlDocument(html, { maxTextCharacters: MAX_EXCERPT_LENGTH });
  const pageTitle = extracted.title ?? new URL(finalUrl).hostname;
  const authorDisplayName = extracted.author;
  const authorHandle = extracted.authorHandle;
  const excerpt = [
    extracted.description ? `PAGE DESCRIPTION: ${extracted.description}` : "",
    authorDisplayName ? `PAGE AUTHOR: ${authorDisplayName}` : "",
    authorHandle ? `PAGE AUTHOR HANDLE: ${authorHandle}` : "",
    extracted.text ? `VISIBLE PAGE TEXT: ${extracted.text}` : "",
  ].filter(Boolean).join("\n\n").slice(0, MAX_EXCERPT_LENGTH);

  if (!excerpt) throw new SourceRetrievalError("The public page did not contain usable text or metadata.", 422, "response_empty");
  return {
    title: pageTitle.slice(0, 300) || new URL(finalUrl).hostname,
    excerpt,
    finalUrl,
    authorDisplayName: authorDisplayName ? authorDisplayName.slice(0, 300) || null : null,
    authorHandle: authorHandle ? authorHandle.slice(0, 300) || null : null,
  };
}
