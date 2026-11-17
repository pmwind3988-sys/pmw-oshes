import type { PortalRecord } from "../types";
import { parseDate } from "./portalTime";
import { statusTone, type StatusTone } from "./portalWork";

/**
 * The rules behind the Submissions board: which column a record sits in, and
 * which settled records are old enough to leave it. Pure, so the columns can be
 * checked without rendering.
 */

/** Done records stay on the board for this many days after they settle. */
export const BOARD_DONE_DAYS = 14;

export type BoardColumnId = "you" | "progress" | "returned" | "done";

export interface BoardColumn {
  id: BoardColumnId;
  title: string;
  items: PortalRecord[];
}

const DAY_MS = 86_400_000;

/** The fixed accents a form's square may take. */
const FORM_TINTS = ["#FFF1CC", "#FFE4E0", "#ECE6FF", "#DDF5E6", "#E3EEFF"];

/** A stable tint per form type, so every row and card for one form carries the same square. */
export function formTint(listTitle: string): string {
  let hash = 0;
  for (const char of listTitle) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FORM_TINTS[hash % FORM_TINTS.length];
}

/** "Hafiz Mustafa" becomes "HM"; a single word takes its first two letters. */
export function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "?";
}

/** The record's tone: a record on this account's layer reads as waiting for you, whatever its status word. */
export function recordTone(record: PortalRecord, userEmail: string): StatusTone {
  return isOnYourLayer(record, userEmail) ? "waiting" : statusTone(record.status);
}

/**
 * Whether a record is waiting on this account's signature. Compared without
 * case, because the address on a layer is typed by a person.
 */
export function isOnYourLayer(record: PortalRecord, email: string): boolean {
  if (!email || !record.hasWorkflow || record.done || record.returned) return false;
  return record.currentAssigneeEmail.trim().toLowerCase() === email.trim().toLowerCase();
}

/**
 * When a record last moved: the latest signed layer, or the filing date when
 * nothing has been signed. This is the "Settled" date for Done records and the
 * "Updated" column in the list.
 */
export function lastMovedAt(record: PortalRecord): Date | null {
  let latest: Date | null = null;
  for (const layer of record.submission.layers) {
    const signed = parseDate(layer && "signedAt" in layer ? layer.signedAt : null);
    if (signed && (!latest || signed > latest)) latest = signed;
  }
  return latest ?? record.filedAt;
}

/** A settled record is Done on the board only while it is inside the window. */
function isRecentlyDone(record: PortalRecord, now: Date): boolean {
  if (!record.done || record.returned) return false;
  const moved = lastMovedAt(record);
  return moved !== null && now.getTime() - moved.getTime() <= BOARD_DONE_DAYS * DAY_MS;
}

/**
 * The four columns, in order. Each record lands in exactly one: on your layer,
 * returned, done inside the window, or still moving. Settled records older than
 * the window appear in no column; `doneBeyondWindow` counts them.
 */
export function boardColumns(records: PortalRecord[], userEmail: string, now: Date = new Date()): BoardColumn[] {
  const columns: BoardColumn[] = [
    { id: "you", title: "Waiting for you", items: [] },
    { id: "progress", title: "In approval", items: [] },
    { id: "returned", title: "Returned", items: [] },
    { id: "done", title: "Done", items: [] },
  ];
  const byId = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<BoardColumnId, BoardColumn>;

  for (const record of records) {
    if (isOnYourLayer(record, userEmail)) byId.you.items.push(record);
    else if (record.returned) byId.returned.items.push(record);
    else if (record.done) {
      if (isRecentlyDone(record, now)) byId.done.items.push(record);
    } else byId.progress.items.push(record);
  }
  return columns;
}

/** How many settled records are older than the board's window, for the "Show N more in the list" link. */
export function doneBeyondWindow(records: PortalRecord[], now: Date = new Date()): number {
  return records.filter((record) => record.done && !record.returned && !isRecentlyDone(record, now)).length;
}
