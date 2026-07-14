import type { OperatorRole } from "./access-auth";

export const INTERNAL_SIGNATURE_VERSION = "v1";

export interface InternalRequestIdentity {
  operator: string;
  role: OperatorRole;
  timestamp: string;
  nonce: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalRequest(
  method: string,
  pathAndQuery: string,
  bodyHash: string,
  identity: InternalRequestIdentity,
): string {
  return [
    INTERNAL_SIGNATURE_VERSION,
    method.toUpperCase(),
    pathAndQuery,
    identity.timestamp,
    identity.nonce,
    identity.operator.toLowerCase(),
    identity.role,
    bodyHash,
  ].join("\n");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signInternalRequest(
  secret: string,
  method: string,
  pathAndQuery: string,
  body: string,
  identity: InternalRequestIdentity,
): Promise<string> {
  return hmac(secret, canonicalRequest(method, pathAndQuery, await sha256(body), identity));
}

export async function verifyInternalRequestSignature(
  secret: string,
  method: string,
  pathAndQuery: string,
  body: string,
  identity: InternalRequestIdentity,
  suppliedSignature: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(suppliedSignature)) return false;
  const expected = await signInternalRequest(secret, method, pathAndQuery, body, identity);
  const left = new TextEncoder().encode(expected);
  const right = new TextEncoder().encode(suppliedSignature);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
