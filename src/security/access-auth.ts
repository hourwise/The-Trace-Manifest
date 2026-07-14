export type OperatorRole = "reader" | "publisher";

export interface AccessEnvironment {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  TRACE_ADMIN_READERS?: string;
  TRACE_ADMIN_PUBLISHERS?: string;
}

export interface OperatorIdentity {
  email: string;
  role: OperatorRole;
  subject: string;
  expiresAt: number;
}

interface AccessClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
}

interface JwtHeader { alg?: string; kid?: string }
interface AccessJwks { keys?: JsonWebKey[] }

let cachedKeys: { issuer: string; expiresAt: number; keys: Map<string, CryptoKey> } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

function configuredIssuer(teamDomain: string | undefined): string | null {
  if (!teamDomain) return null;
  const hostname = teamDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.cloudflareaccess\.com$/.test(hostname)) return null;
  return `https://${hostname}`;
}

function configuredMembers(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
}

function audienceMatches(claim: string | string[] | undefined, expected: string): boolean {
  return Array.isArray(claim) ? claim.includes(expected) : claim === expected;
}

async function loadKeys(issuer: string): Promise<Map<string, CryptoKey>> {
  if (cachedKeys?.issuer === issuer && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("Access signing keys are unavailable.");

  const jwks = await response.json() as AccessJwks;
  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    keys.set(jwk.kid, await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    ));
  }
  if (keys.size === 0) throw new Error("Access signing keys are invalid.");
  cachedKeys = { issuer, keys, expiresAt: Date.now() + 5 * 60_000 };
  return keys;
}

export async function authenticateAccessRequest(
  request: Request,
  env: AccessEnvironment,
): Promise<OperatorIdentity | null> {
  const issuer = configuredIssuer(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = env.CF_ACCESS_AUD?.trim();
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!issuer || !audience || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = parseJsonPart<JwtHeader>(parts[0]);
  const claims = parseJsonPart<AccessClaims>(parts[1]);
  if (!header?.kid || header.alg !== "RS256" || !claims) return null;
  try {
    const key = (await loadKeys(issuer)).get(header.kid);
    if (!key || !await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )) return null;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== issuer
    || !audienceMatches(claims.aud, audience)
    || typeof claims.exp !== "number"
    || claims.exp <= now
    || (typeof claims.nbf === "number" && claims.nbf > now + 30)
    || typeof claims.email !== "string"
    || typeof claims.sub !== "string"
  ) return null;

  const email = claims.email.trim().toLowerCase();
  const role: OperatorRole | null = configuredMembers(env.TRACE_ADMIN_PUBLISHERS).has(email)
    ? "publisher"
    : configuredMembers(env.TRACE_ADMIN_READERS).has(email) ? "reader" : null;
  return role ? { email, role, subject: claims.sub, expiresAt: claims.exp } : null;
}
