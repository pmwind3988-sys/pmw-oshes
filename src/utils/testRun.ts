/**
 * testRun.ts — the browser's copy of the test-run flag reader.
 *
 * `api/_utils/testRun.ts` is the server-side original — signs and verifies the
 * test ticket, redirects outbound mail, and defines the `IsTest` / `TestEmail`
 * columns a test run writes. `src/` cannot import from `api/`, so this file
 * re-implements only the one piece the browser needs: reading whether a
 * response row is a rehearsal. Keep `isTestRow` here in step with its twin.
 */

export const TEST_FLAG_FIELD = "IsTest";
export const TEST_EMAIL_FIELD = "TestEmail";

/**
 * Tolerant reading of the `IsTest` column: `true`, `"true"` and `"TRUE"` all
 * mean the row is a rehearsal. Anything else — including a missing field, which
 * is how every submission created before this column existed reads — means an
 * ordinary production submission. That is the safe direction to fail: a row
 * never mistakenly disappears from a production listing.
 */
export function isTestRow(fields: Record<string, unknown> | undefined): boolean {
  const flag = fields?.[TEST_FLAG_FIELD];
  return flag === true || String(flag ?? "").trim().toLowerCase() === "true";
}
