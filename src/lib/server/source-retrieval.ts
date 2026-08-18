// Shared KC-03 retrieval boundary. Callers choose an explicit content policy and
// must decide whether/how to persist the returned material after admission.

export type SourceRetrievalErrorCode =
  | "url_ineligible"
  | "redirect_rejected"
  | "source_unavailable"
  | "paywall_detected"
  | "policy_restricted"
  | "response_unavailable"
  | "response_status_rejected"
  | "content_type_rejected"
  | "response_too_large"
  | "response_empty"
  | "response_timeout"
  | "content_invalid";

export type SourceRetrievalAuditEvent = {
  phase: "admitted" | "redirected" | "retrieved" | "rejected" | "failed";
  code: SourceRetrievalErrorCode | "retrieved";
  redirectCount: number;
  responseStatus?: number;
  contentType?: string;
  byteLength?: number;
};

export class SourceRetrievalError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 503,
    readonly code: SourceRetrievalErrorCode,
    readonly responseStatus?: number,
  ) {
    super(message);
    this.name = "SourceRetrievalError";
  }
}

export interface RetrievedRemoteSource {
  initialUrl: string;
  finalUrl: string;
  contentType: string;
  byteLength: number;
  body: string;
  /** Exact response bytes. In byte mode text is not decoded. */
  bodyBytes: Uint8Array;
  redirectCount: number;
  responseStatus: number;
  /** SHA-256 of the exact bytes read from the response body. */
  transportHash: string;
}

export interface SourceRetrievalOptions {
  allowedContentTypes: readonly string[];
  maximumBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  userAgent: string;
  acceptHeader?: string;
  /** Byte mode is used for governed binary capture; it never decodes the body. */
  responseMode?: "text" | "bytes";
  onAudit?: (event: SourceRetrievalAuditEvent) => void | Promise<void>;
  fetcher?: typeof fetch;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

async function emitAudit(options: SourceRetrievalOptions, event: SourceRetrievalAuditEvent): Promise<void> {
  if (options.onAudit) await options.onAudit(event);
}

function remoteUrl(value: string): URL | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    if (!hostname || !hostname.includes(".") || hostname.includes(":") || isIpv4) return null;
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".home")
      || hostname.endsWith(".lan")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

async function cancelResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function readNextChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new SourceRetrievalError("The URL retrieval timed out.", 503, "response_timeout")),
      timeoutMs,
    );
    reader.read().then(
      (result) => { clearTimeout(timeout); resolve(result); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
  deadline: number,
): Promise<{ bodyBytes: Uint8Array; byteLength: number; transportHash: string }> {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await cancelResponse(response);
    throw new SourceRetrievalError("The response exceeds the configured retrieval limit.", 422, "response_too_large");
  }
  if (!response.body) throw new SourceRetrievalError("The URL returned an empty response.", 422, "response_empty");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new SourceRetrievalError("The URL retrieval timed out.", 503, "response_timeout");
      const next = await readNextChunk(reader, remainingMs);
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > maximumBytes) {
        throw new SourceRetrievalError("The response exceeds the configured retrieval limit.", 422, "response_too_large");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof SourceRetrievalError) throw error;
    throw new SourceRetrievalError("The URL could not be retrieved.", 503, "response_unavailable");
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new SourceRetrievalError("The URL returned an empty response.", 422, "response_empty");
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bodyBytes: bytes, byteLength: totalBytes, transportHash: await sha256Bytes(bytes) };
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Retrieves a single public URL without credentials, link traversal, automatic
 * redirects, or persistence. Each redirect target is admitted again before use.
 */
export async function retrieveRemoteSource(
  value: string,
  options: SourceRetrievalOptions,
): Promise<RetrievedRemoteSource> {
  const initialUrl = remoteUrl(value);
  if (!initialUrl) {
    await emitAudit(options, { phase: "rejected", code: "url_ineligible", redirectCount: 0 });
    throw new SourceRetrievalError("The submitted URL is not eligible for remote retrieval.", 400, "url_ineligible");
  }
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const deadline = Date.now() + options.timeoutMs;
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let currentUrl = initialUrl;
    await emitAudit(options, { phase: "admitted", code: "retrieved", redirectCount: 0 });
    for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount++) {
      let response: Response;
      try {
        response = await fetcher(currentUrl.href, {
          headers: { Accept: options.acceptHeader ?? options.allowedContentTypes.join(","), "User-Agent": options.userAgent },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        await emitAudit(options, { phase: "failed", code: controller.signal.aborted ? "response_timeout" : "response_unavailable", redirectCount });
        throw new SourceRetrievalError(
          controller.signal.aborted ? "The URL retrieval timed out." : "The URL could not be retrieved.",
          503,
          controller.signal.aborted ? "response_timeout" : "response_unavailable",
        );
      }

      if (redirectStatuses.has(response.status)) {
        const location = response.headers.get("Location");
        await cancelResponse(response);
        if (!location || redirectCount === options.maxRedirects) {
          await emitAudit(options, { phase: "rejected", code: "redirect_rejected", redirectCount, responseStatus: response.status });
          throw new SourceRetrievalError("The URL redirect could not be safely followed.", 422, "redirect_rejected");
        }
        let nextUrl: URL | null = null;
        try {
          nextUrl = remoteUrl(new URL(location, currentUrl).href);
        } catch {
          nextUrl = null;
        }
        if (!nextUrl) {
          await emitAudit(options, { phase: "rejected", code: "redirect_rejected", redirectCount, responseStatus: response.status });
          throw new SourceRetrievalError("The URL redirect is not eligible for remote retrieval.", 422, "redirect_rejected");
        }
        currentUrl = nextUrl;
        await emitAudit(options, { phase: "redirected", code: "retrieved", redirectCount: redirectCount + 1, responseStatus: response.status });
        continue;
      }

      if (!response.ok) {
        await cancelResponse(response);
        const code: SourceRetrievalErrorCode = response.status === 404 || response.status === 410
          ? "source_unavailable"
          : response.status === 402
            ? "paywall_detected"
            : response.status === 451
              ? "policy_restricted"
              : response.status >= 500
                ? "response_unavailable"
                : "response_status_rejected";
        await emitAudit(options, { phase: "rejected", code, redirectCount, responseStatus: response.status });
        throw new SourceRetrievalError("The URL did not return an eligible public response.", response.status >= 500 ? 503 : 422, code, response.status);
      }
      const contentType = (response.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!options.allowedContentTypes.includes(contentType)) {
        await cancelResponse(response);
        await emitAudit(options, { phase: "rejected", code: "content_type_rejected", redirectCount, responseStatus: response.status, contentType });
        throw new SourceRetrievalError("The URL did not return an allowed content type.", 422, "content_type_rejected");
      }

      const content = await readBoundedBytes(response, options.maximumBytes, deadline);
      await emitAudit(options, {
        phase: "retrieved", code: "retrieved", redirectCount, responseStatus: response.status,
        contentType, byteLength: content.byteLength,
      });
      return {
        initialUrl: initialUrl.href,
        finalUrl: currentUrl.href,
        contentType,
        redirectCount,
        responseStatus: response.status,
        body: options.responseMode === "bytes" ? "" : new TextDecoder().decode(content.bodyBytes),
        ...content,
      };
    }
  } finally {
    clearTimeout(timeout);
  }
  throw new SourceRetrievalError("The URL redirect could not be safely followed.", 422, "redirect_rejected");
}
