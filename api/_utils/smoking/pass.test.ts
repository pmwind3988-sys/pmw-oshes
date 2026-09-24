import { describe, expect, it } from "vitest";
import { PASS_LIFETIME_MS, issuePass, readPass } from "./pass.js";

const SECRET = "test-secret-at-least-32-characters-long";
const now = new Date("2026-09-24T02:00:00Z");

describe("smoking pass", () => {
  it("round-trips the email and sign-in method", () => {
    const pass = issuePass("Ali@Gmail.com", "google", SECRET, now);
    expect(readPass(pass, SECRET, now)).toEqual({ email: "ali@gmail.com", method: "google" });
  });

  it("expires after 90 days", () => {
    const pass = issuePass("ali@gmail.com", "google", SECRET, now);
    expect(readPass(pass, SECRET, new Date(now.getTime() + PASS_LIFETIME_MS - 1))).not.toBeNull();
    expect(readPass(pass, SECRET, new Date(now.getTime() + PASS_LIFETIME_MS + 1))).toBeNull();
  });

  it("rejects a pass signed with another secret", () => {
    const pass = issuePass("ali@gmail.com", "google", "some-other-secret-that-is-also-long", now);
    expect(readPass(pass, SECRET, now)).toBeNull();
  });

  it("rejects a pass whose email was edited", () => {
    const [body, sig] = issuePass("ali@gmail.com", "google", SECRET, now).split(".");
    const forged = Buffer.from(
      Buffer.from(body, "base64url").toString("utf8").replace("ali@", "abu@"),
    ).toString("base64url");
    expect(readPass(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    expect(readPass("", SECRET, now)).toBeNull();
    expect(readPass("abc", SECRET, now)).toBeNull();
    expect(readPass("a.b.c", SECRET, now)).toBeNull();
  });
});
