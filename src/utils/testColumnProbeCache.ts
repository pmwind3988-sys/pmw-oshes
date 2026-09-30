/**
 * testColumnProbeCache.ts — remembers which lists are known not to have the
 * lazily-provisioned `IsTest` column.
 *
 * `IsTest` only exists on a response list once someone has minted a test
 * ticket for that form, so probing for it on a list that has never been
 * rehearsed — every form on day one — 400s every time. Both the approval
 * dashboard and the response viewer run this probe on every load; without a
 * shared cache that guaranteed-failing request fires forever for any form
 * nobody has touched this feature on. A list where the column *is* present is
 * never cached here: its `IsTest` values change row to row, so those requests
 * keep happening as normal — only the failing case is worth memoising.
 */

const knownMissing = new Map<string, boolean>();

export function isTestColumnKnownMissing(listName: string): boolean {
  return knownMissing.get(listName) === true;
}

export function setTestColumnKnownMissing(listName: string, missing: boolean): void {
  knownMissing.set(listName, missing);
}

/**
 * Reads `IsTest` for a list's rows in a request of its own and returns the
 * ids of the test rows. A list that never ran a test answers 400 — every row
 * then reads as real, and the miss is remembered so it is not asked again.
 *
 * @param fetchIds Performs the GET for `$select=Id,IsTest` and returns its rows.
 */
export async function readTestRowIds(
  listName: string,
  fetchIds: () => Promise<{ Id: number; IsTest?: unknown }[]>,
): Promise<Set<number>> {
  const ids = new Set<number>();
  if (isTestColumnKnownMissing(listName)) return ids;
  try {
    const rows = await fetchIds();
    setTestColumnKnownMissing(listName, false);
    for (const row of rows) {
      const flag = row.IsTest;
      if (flag === true || String(flag ?? "").trim().toLowerCase() === "true") ids.add(row.Id);
    }
  } catch {
    setTestColumnKnownMissing(listName, true);
  }
  return ids;
}
