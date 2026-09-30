/**
 * testRun.ts — turning a form's real workflow into a rehearsal.
 *
 * A test run is a genuine submission down the genuine pipeline: layer routing,
 * the Approval Directory lookup and distribution-list expansion all still
 * happen, and their answers are written to the usual `L{n}_Email` columns so
 * the tester can see who the form *would* have gone to. Only the moment of
 * dispatch is overridden: every mail the run generates goes to the one test
 * address on the signed ticket instead.
 *
 * Test mode is never read from a request body. A public test opens an anonymous
 * page, so the only thing that may switch it on is a ticket signed with
 * `API_SECRET_KEY` by an authenticated form builder (see
 * `formBuilderAccess.ts`). Anything wrong with a ticket — absent, malformed,
 * edited, expired, minted for another form — yields `null`, and the caller
 * treats the submission as ordinary production traffic.
 *
 * Ported from pmw-hrform (`api/_utils/testRun.ts`). `testRunDispatchFor` is an
 * OSHES addition: it folds the "redirect / production / refuse" decision that
 * HR repeats at each send site into one function, so no send site can forget
 * the refuse case.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Long enough to fill in a form at leisure, short enough that a leak dies. */
export const TEST_TICKET_TTL_MS = 4 * 60 * 60 * 1000;

export interface TestTicketPayload {
  slug: string;
  testEmail: string;
  issuedBy: string;
  /** Epoch ms. */
  expiresAt: number;
}

function signingKey(): string {
  const key = process.env.API_SECRET_KEY || "";
  if (!key) throw new Error("API_SECRET_KEY is required to sign a test ticket.");
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function mintTestTicket(
  payload: Omit<TestTicketPayload, "expiresAt">,
  now: Date = new Date(),
): string {
  const testEmail = payload.testEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(testEmail)) {
    throw new Error("A test run needs a valid email address to redirect to.");
  }
  const body = Buffer.from(
    JSON.stringify({
      slug: payload.slug.trim(),
      testEmail,
      issuedBy: payload.issuedBy.trim().toLowerCase(),
      expiresAt: now.getTime() + TEST_TICKET_TTL_MS,
    } satisfies TestTicketPayload),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTestTicket(
  raw: unknown,
  slug: string,
  now: Date = new Date(),
): TestTicketPayload | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const [body, signature, extra] = raw.split(".");
  if (!body || !signature || extra !== undefined) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TestTicketPayload;
    if (typeof parsed?.slug !== "string" || !slug.trim() || parsed.slug !== slug.trim()) return null;
    if (typeof parsed.testEmail !== "string" || !EMAIL_RE.test(parsed.testEmail)) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now.getTime()) return null;
    if (typeof parsed.issuedBy !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export const TEST_SUBJECT_PREFIX = "[TEST] ";

export interface TestRunRedirect {
  testEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Rewrites one outbound message for a test run.
 *
 * The production addresses are not merely dropped — they are printed in the
 * banner. Seeing "would have gone to safety-hod@…" is the single most useful
 * thing a test run tells a builder, and it is the part a redirect would
 * otherwise destroy.
 */
export function redirectTestMessage<T extends { to: string | string[]; subject: string; body: string }>(
  message: T,
  redirect: TestRunRedirect,
): T {
  const intended = (Array.isArray(message.to) ? message.to : [message.to]).filter((entry) => entry.trim());
  const banner =
    `<div style="border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;padding:12px;margin:0 0 16px;border-radius:6px;font-family:sans-serif">` +
    `<strong>TEST RUN — this is not a real submission.</strong><br>` +
    `In production this email would have gone to: ${intended.map((entry) => escapeHtml(entry)).join(", ") || "nobody"}.` +
    `</div>`;

  return {
    ...message,
    to: redirect.testEmail,
    subject: message.subject.startsWith(TEST_SUBJECT_PREFIX)
      ? message.subject
      : `${TEST_SUBJECT_PREFIX}${message.subject}`,
    body: `${banner}${message.body}`,
  };
}

export const TEST_FLAG_FIELD = "IsTest";
export const TEST_EMAIL_FIELD = "TestEmail";

export function testRunFieldsFor(payload: TestTicketPayload): Record<string, string> {
  return { [TEST_FLAG_FIELD]: "true", [TEST_EMAIL_FIELD]: payload.testEmail };
}

export function isTestRow(fields: Record<string, unknown> | null | undefined): boolean {
  const flag = fields?.[TEST_FLAG_FIELD];
  return flag === true || String(flag ?? "").trim().toLowerCase() === "true";
}

/**
 * The redirect a stored row carries, or `undefined`.
 *
 * **`undefined` means two different things**: the row is not a test run, or it
 * is one but its `TestEmail` is unusable. Conflating them mails a real approver
 * from a rehearsal. Use `testRunDispatchFor` (or `isTestRow` first) whenever
 * the difference matters — which is every time a mail is about to leave.
 */
export function readTestRunRedirect(
  fields: Record<string, unknown> | null | undefined,
): TestRunRedirect | undefined {
  if (!isTestRow(fields)) return undefined;
  const testEmail = String(fields?.[TEST_EMAIL_FIELD] ?? "").trim().toLowerCase();
  return EMAIL_RE.test(testEmail) ? { testEmail } : undefined;
}

export type TestRunDispatch =
  | { kind: "production" }
  | { kind: "redirect"; redirect: TestRunRedirect }
  /** A test row with no usable address: send nothing at all. */
  | { kind: "blocked" };

/**
 * What an outbound mail about this row may do.
 *
 * The row is the source of truth: a ticket expires in four hours, a run can sit
 * at a later layer for weeks, so the redirect is recovered from `IsTest` /
 * `TestEmail` on the stored row. `fallback` is a redirect the caller already
 * verified some other way (a live ticket) — it can only ever turn a send INTO a
 * redirect, never the other way round, because redirecting is the safe
 * direction to be wrong in.
 *
 * A row flagged as a test whose address is unusable is `blocked`: falling back
 * to the real assignee would mail a real approver from a run the builder
 * believes is a rehearsal, which is the one outcome this feature exists to
 * prevent.
 */
export function testRunDispatchFor(
  fields: Record<string, unknown> | null | undefined,
  fallback?: TestRunRedirect,
): TestRunDispatch {
  const redirect = readTestRunRedirect(fields) ?? fallback;
  if (redirect) return { kind: "redirect", redirect };
  if (isTestRow(fields)) return { kind: "blocked" };
  return { kind: "production" };
}
