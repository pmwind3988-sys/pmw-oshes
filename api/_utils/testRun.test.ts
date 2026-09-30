import { beforeEach, describe, expect, it } from "vitest";

import { mintTestTicket, verifyTestTicket, TEST_TICKET_TTL_MS, redirectTestMessage, TEST_SUBJECT_PREFIX } from "./testRun.js";
import { isTestRow, readTestRunRedirect, testRunDispatchFor, testRunFieldsFor } from "./testRun.js";

const NOW = new Date("2026-08-26T09:00:00Z");

function ticket(overrides: Partial<{ slug: string; testEmail: string; issuedBy: string }> = {}) {
  return mintTestTicket(
    { slug: "leave-application", testEmail: "tester@pmw-group.com", issuedBy: "hr@pmw-group.com", ...overrides },
    NOW,
  );
}

describe("test ticket", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("round-trips the run's details", () => {
    const payload = verifyTestTicket(ticket(), "leave-application", NOW);
    expect(payload).toMatchObject({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
    });
  });

  it("refuses a ticket minted for a different form", () => {
    expect(verifyTestTicket(ticket(), "expense-claim", NOW)).toBeNull();
  });

  it("refuses a ticket whose payload was edited", () => {
    const [body, signature] = ticket().split(".");
    const tampered = Buffer.from(
      JSON.stringify({ slug: "leave-application", testEmail: "attacker@example.com", issuedBy: "x", expiresAt: 9e15 }),
    ).toString("base64url");
    expect(body).not.toBe(tampered);
    expect(verifyTestTicket(`${tampered}.${signature}`, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket signed with a different secret", () => {
    const minted = ticket();
    process.env.API_SECRET_KEY = "a-different-secret";
    expect(verifyTestTicket(minted, "leave-application", NOW)).toBeNull();
  });

  it("refuses a ticket once it has expired", () => {
    const later = new Date(NOW.getTime() + TEST_TICKET_TTL_MS + 1000);
    expect(verifyTestTicket(ticket(), "leave-application", later)).toBeNull();
  });

  it("treats junk as no ticket at all rather than throwing", () => {
    expect(verifyTestTicket(undefined, "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket("not-a-ticket", "leave-application", NOW)).toBeNull();
    expect(verifyTestTicket({ slug: "leave-application" }, "leave-application", NOW)).toBeNull();
  });

  it("refuses to mint without an address to redirect to", () => {
    expect(() => mintTestTicket({ slug: "x", testEmail: "not-an-email", issuedBy: "hr@pmw-group.com" }, NOW)).toThrow();
  });
});

describe("test-run redirect", () => {
  const redirect = { testEmail: "tester@pmw-group.com" };

  it("sends a message addressed to one person to the test address instead", () => {
    const out = redirectTestMessage(
      { to: "hod-finance@pmw-group.com", subject: "Approval needed", body: "<p>Hi</p>" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("collapses a fan-out to the single test address", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hr-inbox@pmw-group.com"], subject: "s", body: "b" },
      redirect,
    );
    expect(out.to).toBe("tester@pmw-group.com");
  });

  it("marks the subject so a test mail is never mistaken for a real one", () => {
    const out = redirectTestMessage({ to: "a@b.com", subject: "Approval needed", body: "b" }, redirect);
    expect(out.subject).toBe(`${TEST_SUBJECT_PREFIX}Approval needed`);
  });

  it("does not double-prefix a subject that is already marked", () => {
    const once = redirectTestMessage({ to: "a@b.com", subject: "s", body: "b" }, redirect);
    const twice = redirectTestMessage(once, redirect);
    expect(twice.subject).toBe(`${TEST_SUBJECT_PREFIX}s`);
  });

  it("names in the body who the mail was diverted from", () => {
    const out = redirectTestMessage(
      { to: ["siti@pmw-group.com", "hod@pmw-group.com"], subject: "s", body: "<p>Body</p>" },
      redirect,
    );
    expect(out.body).toContain("siti@pmw-group.com");
    expect(out.body).toContain("hod@pmw-group.com");
    expect(out.body).toContain("Body");
  });

  it("escapes the diverted addresses rather than trusting them as markup", () => {
    const out = redirectTestMessage(
      { to: '<img src=x onerror=alert(1)>@b.com', subject: "s", body: "b" },
      redirect,
    );
    expect(out.body).not.toContain("<img");
    expect(out.body).toContain("&lt;img");
  });

  it("leaves every other property of the message alone", () => {
    const out = redirectTestMessage(
      { to: "a@b.com", subject: "s", body: "b", attachments: [{ name: "form.pdf" }] },
      redirect,
    );
    expect(out.attachments).toEqual([{ name: "form.pdf" }]);
  });
});

describe("reading a test run back off its row", () => {
  it("stamps the flag and the address the run redirects to", () => {
    expect(testRunFieldsFor({
      slug: "leave-application",
      testEmail: "tester@pmw-group.com",
      issuedBy: "hr@pmw-group.com",
      expiresAt: 0,
    })).toEqual({ IsTest: "true", TestEmail: "tester@pmw-group.com" });
  });

  it("recovers the redirect from a stored row long after the ticket expired", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "tester@pmw-group.com" }))
      .toEqual({ testEmail: "tester@pmw-group.com" });
  });

  it("treats an ordinary submission as no redirect at all", () => {
    expect(readTestRunRedirect({})).toBeUndefined();
    expect(readTestRunRedirect(undefined)).toBeUndefined();
    expect(isTestRow({})).toBe(false);
  });

  it("refuses to redirect a flagged row with no usable address, rather than guessing", () => {
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true", TestEmail: "not-an-email" })).toBeUndefined();
    expect(readTestRunRedirect({ IsTest: "true" })).toBeUndefined();
  });

  it("still knows such a row is a test one, so it stays out of production views", () => {
    expect(isTestRow({ IsTest: "true" })).toBe(true);
    expect(isTestRow({ IsTest: "TRUE" })).toBe(true);
    expect(isTestRow({ IsTest: true })).toBe(true);
  });
});

describe("what an outbound mail about a row may do", () => {
  const redirect = { testEmail: "tester@pmw-group.com" };

  it("sends production mail as it always did", () => {
    expect(testRunDispatchFor({})).toEqual({ kind: "production" });
    expect(testRunDispatchFor(undefined)).toEqual({ kind: "production" });
    expect(testRunDispatchFor(null)).toEqual({ kind: "production" });
  });

  it("redirects a flagged row to the address stored on it", () => {
    expect(testRunDispatchFor({ IsTest: "true", TestEmail: "Tester@PMW-group.com" }))
      .toEqual({ kind: "redirect", redirect });
  });

  it("sends nothing at all for a flagged row whose address is unusable", () => {
    expect(testRunDispatchFor({ IsTest: "true", TestEmail: "" })).toEqual({ kind: "blocked" });
    expect(testRunDispatchFor({ IsTest: "true", TestEmail: "not-an-email" })).toEqual({ kind: "blocked" });
    expect(testRunDispatchFor({ IsTest: true })).toEqual({ kind: "blocked" });
  });

  it("lets a verified ticket turn a send into a redirect, never the reverse", () => {
    expect(testRunDispatchFor({}, redirect)).toEqual({ kind: "redirect", redirect });
    expect(testRunDispatchFor({ IsTest: "true", TestEmail: "" }, redirect)).toEqual({ kind: "redirect", redirect });
    expect(testRunDispatchFor({ IsTest: "true", TestEmail: "row@pmw-group.com" }, redirect))
      .toEqual({ kind: "redirect", redirect: { testEmail: "row@pmw-group.com" } });
  });
});

describe("ticket shape", () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = "secret-for-tests";
  });

  it("refuses a ticket with anything appended after the signature", () => {
    expect(verifyTestTicket(`${ticket()}.extra`, "leave-application", NOW)).toBeNull();
  });

  it("refuses to verify against an empty slug", () => {
    const minted = mintTestTicket({ slug: "", testEmail: "tester@pmw-group.com", issuedBy: "a@b.com" }, NOW);
    expect(verifyTestTicket(minted, "", NOW)).toBeNull();
  });

  it("cannot be minted without the signing secret", () => {
    delete process.env.API_SECRET_KEY;
    expect(() => ticket()).toThrow(/API_SECRET_KEY/);
    expect(verifyTestTicket("abc.def", "leave-application", NOW)).toBeNull();
  });
});
