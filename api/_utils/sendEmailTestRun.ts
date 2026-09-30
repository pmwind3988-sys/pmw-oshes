/**
 * sendEmailTestRun.ts — how `api/send-email.ts` decides whether a mail the
 * browser asked for belongs to a test run.
 *
 * `send-email` is called from the browser, so nothing in the request can be
 * trusted to say "this is a rehearsal" — a client that could say so could also
 * say "this is not". Two sources are consulted, both verified on the server:
 *
 *   1. The response row, when the caller names one (`workflow` or `row`). It is
 *      read back from SharePoint and its `IsTest` / `TestEmail` decide. This is
 *      what keeps a decision made days later — long after the ticket expired —
 *      redirected.
 *   2. A test ticket the caller forwarded, verified against its slug. It can
 *      only turn a send INTO a redirect, never the reverse.
 *
 * A row flagged as a test with no usable address (and no live ticket to fall
 * back on) is `blocked`: nothing is sent. A row that could not be read at all
 * falls back to the ticket, then to an ordinary send — the same behaviour the
 * route had before test runs existed, which is the right answer for the many
 * callers who never touch this feature.
 */
import { testRunDispatchFor, verifyTestTicket, type TestRunDispatch, type TestRunRedirect } from "./testRun.js";

export function ticketRedirect(testTicket: unknown, slug: unknown, now: Date = new Date()): TestRunRedirect | undefined {
  if (typeof slug !== "string" || !slug.trim()) return undefined;
  const payload = verifyTestTicket(testTicket, slug, now);
  return payload ? { testEmail: payload.testEmail } : undefined;
}

/**
 * @param rowFields The row read back from SharePoint; `null` when the caller
 *   named no row or it could not be read.
 */
export function sendEmailTestRunDispatch(
  rowFields: Record<string, unknown> | null,
  testTicket: unknown,
  slug: unknown,
  now: Date = new Date(),
): TestRunDispatch {
  const fromTicket = ticketRedirect(testTicket, slug, now);
  if (rowFields) return testRunDispatchFor(rowFields, fromTicket);
  return fromTicket ? { kind: "redirect", redirect: fromTicket } : { kind: "production" };
}
