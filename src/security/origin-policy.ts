export interface OriginPolicyEnvironment {
  TRACE_ENVIRONMENT?: string;
  TRACE_ALLOWED_ORIGINS?: string;
}

const PRODUCTION_ORIGIN = "https://thetracemanifest.com";
const DEVELOPMENT_ORIGINS = ["http://localhost:4321", "http://127.0.0.1:4321"];

function normaliseOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(env: OriginPolicyEnvironment = {}): ReadonlySet<string> {
  if (env.TRACE_ENVIRONMENT === "production") return new Set([PRODUCTION_ORIGIN]);
  const configured = (env.TRACE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normaliseOrigin)
    .filter((origin): origin is string => origin !== null);
  const origins = new Set<string>(configured.length > 0 ? configured : [PRODUCTION_ORIGIN]);
  if (env.TRACE_ENVIRONMENT === "development") DEVELOPMENT_ORIGINS.forEach((origin) => origins.add(origin));
  return origins;
}

export function isAllowedOrigin(origin: string | null, env: OriginPolicyEnvironment = {}): boolean {
  if (!origin) return false;
  const normalised = normaliseOrigin(origin);
  return normalised !== null && allowedOrigins(env).has(normalised);
}

export function sameOriginRequest(request: Request, env: OriginPolicyEnvironment = {}): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && isAllowedOrigin(origin, env) && origin === new URL(request.url).origin);
}

export function corsHeaders(
  request: Request,
  env: OriginPolicyEnvironment = {},
  methods = "GET, POST, OPTIONS",
): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin!;
  return headers;
}
