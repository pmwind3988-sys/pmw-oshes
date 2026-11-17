import type { PortalRecord, PortalStatus } from "../types";
import { TINTS } from "../theme/simple";
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

/**
 * The lozenge colours per tone: the background is a fixed accent tint, and the
 * text is the ink that reads on it. Every status lozenge in the portal takes
 * these, so a tone looks the same on Your work, Submissions and the board.
 */
export const toneColors: Record<StatusTone, { bg: string; fg: string }> = {
  waiting: { bg: TINTS.amber, fg: "#7A4A00" },
  progress: { bg: TINTS.blue, fg: "#174AA6" },
  done: { bg: TINTS.green, fg: "#0F5C38" },
  returned: { bg: TINTS.red, fg: "#9B231B" },
  neutral: { bg: TINTS.grey, fg: "#5B6577" },
};

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

/**
 * The tabs an account may see. Needs you appears only where the account has
 * something to act on: `showNeeds` is `subsScopes(access).includes("needs")`.
 */
export function visibleWorkTabs(showNeeds: boolean): WorkTab[] {
  return showNeeds ? ["needs", "mine", "viewed"] : ["mine", "viewed"];
}

/** The tab that opens first: Needs you when something is waiting, otherwise Filed by you. */
export function defaultWorkTab(queueLength: number, showNeeds: boolean): WorkTab {
  return showNeeds && queueLength > 0 ? "needs" : "mine";
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

/** "Good morning" before 12:00, "Good afternoon" until 18:00, then "Good evening". Local time. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The muted line under the page title. The second sentence is dropped when nothing is waiting. */
export function workGreeting(firstName: string | null, waiting: number, now: Date = new Date()): string {
  const greeting = greetingFor(now);
  const salutation = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
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
