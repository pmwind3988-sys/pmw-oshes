import type { PortalRecord, PortalStatus } from "../types";
import { recordKey } from "./portalRecords";

/**
 * The rules behind the Your work page: which tab opens, what each row's status
 * lozenge says, what an empty tab tells you, and the recently-viewed list. They
 * live here, not in the component, so they can be checked without rendering.
 */

/** A tab on the Your work card. "needs" is what is waiting on this account. */
export type WorkTab = "needs" | "mine" | "viewed";

/** The lozenge colour family for a row. */
export type StatusTone = "waiting" | "progress" | "done" | "returned" | "neutral";

/** Rows a tab shows before its "See all" link takes over. */
export const WORK_ROW_LIMIT = 8;

/** Records the Viewed recently list remembers, newest first. */
export const RECENT_LIMIT = 8;

/** Which lozenge tone a record's status carries. */
export function statusTone(status: PortalStatus): StatusTone {
  switch (status) {
    case "Past SLA":
      return "waiting";
    case "In approval":
      return "progress";
    case "Approved":
      return "done";
    case "Returned":
    case "Rejected":
      return "returned";
    case "Recorded":
    case "Cancelled":
      return "neutral";
  }
}

/** The tabs an account may see. Read-only accounts have nothing to act on, so no Needs you. */
export function visibleWorkTabs(readOnly: boolean): WorkTab[] {
  return readOnly ? ["mine", "viewed"] : ["needs", "mine", "viewed"];
}

/** The tab that opens first: Needs you when something is waiting, otherwise Filed by you. */
export function defaultWorkTab(queueLength: number, readOnly: boolean): WorkTab {
  return !readOnly && queueLength > 0 ? "needs" : "mine";
}

/** What an empty tab says. */
export function emptyWorkCopy(tab: WorkTab): { title: string; body: string } {
  switch (tab) {
    case "needs":
      return { title: "You're all caught up", body: "Nothing is waiting for your signature." };
    case "mine":
      return { title: "Nothing here yet", body: "Forms you file will show up here." };
    case "viewed":
      return { title: "Nothing viewed yet", body: "Records you open in this session will show up here." };
  }
}

/** "No sign-off", "1 sign-off", "3 sign-offs". */
export function signOffLabel(count: number): string {
  if (count === 0) return "No sign-off";
  return `${count} sign-off${count === 1 ? "" : "s"}`;
}

/** The muted line under the page title. The second sentence is dropped when nothing is waiting. */
export function workGreeting(firstName: string | null, waiting: number): string {
  const salutation = firstName ? `Good morning, ${firstName}.` : "Good morning.";
  if (waiting === 0) return salutation;
  return `${salutation} ${waiting} ${waiting === 1 ? "form is" : "forms are"} waiting for your signature.`;
}

/** Puts a record reference at the front of the list, without repeating it, and keeps the newest `limit`. */
export function pushRecentRef(refs: string[], ref: string, limit: number = RECENT_LIMIT): string[] {
  return [ref, ...refs.filter((item) => item !== ref)].slice(0, limit);
}

/** The records behind the remembered references, in the same order, skipping any that no longer exist. */
export function recentlyViewed(
  records: PortalRecord[],
  refs: string[],
  limit: number = RECENT_LIMIT,
): PortalRecord[] {
  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  const found: PortalRecord[] = [];
  for (const ref of refs) {
    const record = byKey.get(ref);
    if (record) found.push(record);
    if (found.length === limit) break;
  }
  return found;
}
