import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import type { SignInMethod } from "./schema.js";

/**
 * Checks a Google or Microsoft ID token ourselves, so the email written into
 * the smoking log is one the provider vouched for — not one typed into the page.
 */
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export function microsoftJwksUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
}

export interface Jwk extends JsonWebKey {
  kid: string;
  alg?: string;
}

export type JwksFetcher = (url: string) => Promise<Jwk[]>;

export interface VerifiedIdentity {
  email: string;
  name: string;
  method: SignInMethod;
}

export class IdTokenError extends Error {}

function decodePart(part: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new IdTokenError("Malformed token");
  }
}

async function verifyRs256(
  token: string,
  jwksUrl: string,
  fetchJwks: JwksFetcher,
  now: Date,
): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new IdTokenError("Malformed token");
  const [head, body, signature] = parts;

  const header = decodePart(head);
  if (header.alg !== "RS256") throw new IdTokenError("Unexpected signing algorithm");

  const keys = await fetchJwks(jwksUrl);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new IdTokenError("Unknown signing key");

  const verified = createVerify("RSA-SHA256")
    .update(`${head}.${body}`)
    .verify(createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signature, "base64url"));
  if (!verified) throw new IdTokenError("Bad signature");

  const claims = decodePart(body);
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    throw new IdTokenError("Token expired");
  }
  return claims;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function verifyGoogleIdToken(
  token: string,
  opts: { clientId: string; fetchJwks: JwksFetcher; now?: Date },
): Promise<VerifiedIdentity> {
  const claims = await verifyRs256(token, GOOGLE_JWKS_URL, opts.fetchJwks, opts.now ?? new Date());
  if (!GOOGLE_ISSUERS.has(text(claims.iss))) throw new IdTokenError("Not issued by Google");
  if (claims.aud !== opts.clientId) throw new IdTokenError("Issued to another app");
  if (claims.email_verified !== true) throw new IdTokenError("Google has not verified this email");
  const email = text(claims.email).toLowerCase();
  if (!email) throw new IdTokenError("No email in token");
  return { email, name: text(claims.name), method: "google" };
}

export async function verifyMicrosoftIdToken(
  token: string,
  opts: { clientId: string; tenantId: string; fetchJwks: JwksFetcher; now?: Date },
): Promise<VerifiedIdentity> {
  const claims = await verifyRs256(token, microsoftJwksUrl(opts.tenantId), opts.fetchJwks, opts.now ?? new Date());
  if (claims.iss !== `https://login.microsoftonline.com/${opts.tenantId}/v2.0`) {
    throw new IdTokenError("Not a PMW Microsoft account");
  }
  if (claims.aud !== opts.clientId) throw new IdTokenError("Issued to another app");
  const email = (text(claims.email) || text(claims.preferred_username)).toLowerCase();
  if (!email.includes("@")) throw new IdTokenError("No email in token");
  return { email, name: text(claims.name), method: "microsoft" };
}

/** Signing keys rotate rarely; an hour's cache keeps a scan from waiting on Google. */
export function createCachedJwksFetcher(fetchImpl: typeof fetch = fetch, ttlMs = 60 * 60 * 1000): JwksFetcher {
  const cache = new Map<string, { keys: Jwk[]; until: number }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && hit.until > Date.now()) return hit.keys;
    const res = await fetchImpl(url);
    if (!res.ok) throw new IdTokenError(`Could not fetch signing keys (${res.status})`);
    const data = (await res.json()) as { keys?: Jwk[] };
    const keys = data.keys ?? [];
    cache.set(url, { keys, until: Date.now() + ttlMs });
    return keys;
  };
}
