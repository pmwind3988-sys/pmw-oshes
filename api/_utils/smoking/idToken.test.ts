import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_JWKS_URL,
  IdTokenError,
  microsoftJwksUrl,
  verifyGoogleIdToken,
  verifyMicrosoftIdToken,
  type Jwk,
} from "./idToken.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid: "k1", alg: "RS256" };
const now = new Date("2026-09-24T02:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);

function jwt(payload: Record<string, unknown>, kid = "k1"): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT", kid });
  const body = enc(payload);
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey).toString("base64url");
  return `${head}.${body}.${signature}`;
}

const fetchedUrls: string[] = [];
const fetchJwks = async (url: string) => {
  fetchedUrls.push(url);
  return [jwk];
};

const google = (overrides: Record<string, unknown> = {}) => jwt({
  iss: "https://accounts.google.com", aud: "g-client", exp: nowSec + 600, iat: nowSec,
  email: "Ali@Gmail.com", email_verified: true, name: "Ali Bin Abu", ...overrides,
});

describe("verifyGoogleIdToken", () => {
  const opts = { clientId: "g-client", fetchJwks, now };

  it("accepts a genuine token and lower-cases the email", async () => {
    await expect(verifyGoogleIdToken(google(), opts)).resolves.toEqual({
      email: "ali@gmail.com", name: "Ali Bin Abu", method: "google",
    });
    expect(fetchedUrls).toContain(GOOGLE_JWKS_URL);
  });

  it("rejects another app's token", async () => {
    await expect(verifyGoogleIdToken(google({ aud: "someone-else" }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an expired token", async () => {
    await expect(verifyGoogleIdToken(google({ exp: nowSec - 1 }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an unverified email", async () => {
    await expect(verifyGoogleIdToken(google({ email_verified: false }), opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects a tampered token", async () => {
    const [h, , s] = google().split(".");
    const forgedBody = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com", aud: "g-client", exp: nowSec + 600, email: "boss@pmw-group.com", email_verified: true,
    })).toString("base64url");
    await expect(verifyGoogleIdToken(`${h}.${forgedBody}.${s}`, opts)).rejects.toThrow(IdTokenError);
  });

  it("rejects an unknown signing key", async () => {
    await expect(verifyGoogleIdToken(jwt({ aud: "g-client" }, "other-kid"), opts)).rejects.toThrow(IdTokenError);
  });
});

describe("verifyMicrosoftIdToken", () => {
  const opts = { clientId: "ms-client", tenantId: "tenant-1", fetchJwks, now };
  const ms = (overrides: Record<string, unknown> = {}) => jwt({
    iss: "https://login.microsoftonline.com/tenant-1/v2.0", aud: "ms-client", exp: nowSec + 600,
    preferred_username: "Siti@PMW-Group.com", name: "Siti", tid: "tenant-1", ...overrides,
  });

  it("accepts a PMW tenant token", async () => {
    await expect(verifyMicrosoftIdToken(ms(), opts)).resolves.toEqual({
      email: "siti@pmw-group.com", name: "Siti", method: "microsoft",
    });
    expect(fetchedUrls).toContain(microsoftJwksUrl("tenant-1"));
  });

  it("rejects a token from another organisation", async () => {
    await expect(verifyMicrosoftIdToken(ms({ iss: "https://login.microsoftonline.com/other/v2.0" }), opts))
      .rejects.toThrow(IdTokenError);
  });
});
