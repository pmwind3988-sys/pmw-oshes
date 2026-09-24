import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignInMethod } from "./schema.js";

/**
 * The phone's proof of who scanned, so a scan need not go back to Google or
 * Microsoft. It carries a purpose string so it can never be mistaken for any
 * other token this app signs.
 */
const PURPOSE = "oshes-smoking-pass";
export const PASS_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

interface PassBody {
  p: string;
  e: string;
  m: SignInMethod;
  x: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function issuePass(email: string, method: SignInMethod, secret: string, now: Date = new Date()): string {
  const body: PassBody = { p: PURPOSE, e: email.trim().toLowerCase(), m: method, x: now.getTime() + PASS_LIFETIME_MS };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readPass(
  token: string,
  secret: string,
  now: Date = new Date(),
): { email: string; method: SignInMethod } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = Buffer.from(sign(encoded, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PassBody;
    if (body.p !== PURPOSE || typeof body.e !== "string" || !body.e) return null;
    if (body.m !== "google" && body.m !== "microsoft") return null;
    if (typeof body.x !== "number" || body.x < now.getTime()) return null;
    return { email: body.e, method: body.m };
  } catch {
    return null;
  }
}
