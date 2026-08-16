/**
 * approvalDirectorySchema.ts — the shape of the `Approval Directory` list.
 *
 * One row per person. The column that matters is `ApproverEmail`: it answers
 * "who approves this person", and that single answer is what lets a form say
 * "the submitter's approver" instead of naming anybody. A clerk, their HOD and
 * the CFO all route differently from the same layer configuration, because the
 * answer is per person rather than per department.
 *
 * `Position` doubles as the role for role-holder layers — "the HOD of Safety"
 * is the row with that Department and that Position — so one list answers both
 * routing questions.
 *
 * This is separate from the older `Department Approver Directory`, which maps
 * department to approver and keeps serving `department-approver` layers
 * unchanged. Nothing here touches those.
 *
 * `api/_utils/approvalDirectorySchema.ts` is the server-side copy of this file;
 * api/ cannot import from src/. Keep the two in step.
 */

export const APPROVAL_DIRECTORY_LIST = "Approval Directory";

export const APPROVAL_DIRECTORY_COLUMNS = {
  /** The person this row is about. Unique; the lookup key. */
  personEmail: "PersonEmail",
  personName: "PersonName",
  department: "Department",
  /** Job title, and the role matched by role-holder layers (e.g. "HOD"). */
  position: "Position",
  /** Identifier from whichever system HR actually keys off. Free text. */
  employeeId: "EmployeeId",
  /** Who approves this person. Empty means top of the line. */
  approverEmail: "ApproverEmail",
  /** Leavers are switched off, never deleted, so old submissions stay readable. */
  isActive: "IsActive",
} as const;

export interface ApprovalDirectoryRow {
  id?: number;
  personEmail: string;
  personName: string;
  department: string;
  position: string;
  employeeId: string;
  approverEmail: string;
  isActive: boolean;
}

/** Case- and whitespace-insensitive key for comparing addresses. */
export function directoryEmailKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Which real SharePoint column backs each logical field; null when absent. */
export type DirectoryColumnMap = Record<keyof typeof APPROVAL_DIRECTORY_COLUMNS, string | null>;

/** Without these two the list cannot answer "who approves this person". */
export const REQUIRED_DIRECTORY_FIELDS = ["personEmail", "approverEmail"] as const;

/**
 * Reduces a column name to what it actually means, so the seven names we look
 * for match however SharePoint or the admin spelled them.
 *
 * A column created as "Approver Email" gets the internal name
 * `Approver_x0020_Email`; someone else types `approver_email`. All three mean
 * the same column, and none of them is `ApproverEmail`. Dropping spacing and
 * case is safe for names this specific — there is no pair among them that
 * collapsing could confuse.
 */
function normalizeColumnName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_x0020_/g, "")
    .replace(/[\s_-]/g, "");
}

/**
 * Matches the columns the list actually has against the ones we look for.
 *
 * Necessary because a SharePoint column's internal name rarely equals what
 * somebody typed: "Employee ID" becomes `Employee_x0020_ID`, casing drifts, and
 * a renamed column keeps its original internal name forever. Querying a name
 * that does not exist fails the *whole* request, so one wrong column would
 * otherwise make a perfectly good directory look empty.
 *
 * Pass every alias SharePoint knows for each column — title, internal name,
 * static name — and the first that matches wins.
 */
export function mapDirectoryColumns(
  available: Array<{ key: string; aliases: string[] }>,
): DirectoryColumnMap {
  const byName = new Map<string, string>();
  for (const column of available) {
    for (const alias of column.aliases) {
      if (alias) byName.set(normalizeColumnName(alias), column.key);
    }
  }

  const resolve = (expected: string): string | null => byName.get(normalizeColumnName(expected)) ?? null;

  return {
    personEmail: resolve(APPROVAL_DIRECTORY_COLUMNS.personEmail),
    personName: resolve(APPROVAL_DIRECTORY_COLUMNS.personName),
    department: resolve(APPROVAL_DIRECTORY_COLUMNS.department),
    position: resolve(APPROVAL_DIRECTORY_COLUMNS.position),
    employeeId: resolve(APPROVAL_DIRECTORY_COLUMNS.employeeId),
    approverEmail: resolve(APPROVAL_DIRECTORY_COLUMNS.approverEmail),
    isActive: resolve(APPROVAL_DIRECTORY_COLUMNS.isActive),
  };
}

/** The expected names of any columns the list is missing, for the admin to add. */
export function missingDirectoryColumns(map: DirectoryColumnMap): string[] {
  return (Object.keys(APPROVAL_DIRECTORY_COLUMNS) as Array<keyof typeof APPROVAL_DIRECTORY_COLUMNS>)
    .filter((field) => !map[field])
    .map((field) => APPROVAL_DIRECTORY_COLUMNS[field]);
}

/** True when the list has enough columns to answer a routing question at all. */
export function directoryIsUsable(map: DirectoryColumnMap): boolean {
  return REQUIRED_DIRECTORY_FIELDS.every((field) => !!map[field]);
}

/**
 * Reads one SharePoint item into a row. Tolerates missing columns so a
 * half-provisioned list degrades to blanks rather than throwing.
 */
export function toApprovalDirectoryRow(
  fields: Record<string, unknown>,
  map?: DirectoryColumnMap,
): ApprovalDirectoryRow {
  const text = (field: keyof typeof APPROVAL_DIRECTORY_COLUMNS): string => {
    const key = map ? map[field] : APPROVAL_DIRECTORY_COLUMNS[field];
    if (!key) return "";
    const value = fields[key];
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  };

  const activeKey = map ? map.isActive : APPROVAL_DIRECTORY_COLUMNS.isActive;
  const active = activeKey ? fields[activeKey] : undefined;

  return {
    personEmail: text("personEmail"),
    personName: text("personName"),
    department: text("department"),
    position: text("position"),
    employeeId: text("employeeId"),
    approverEmail: text("approverEmail"),
    // A blank cell, or no such column at all, must not read as "left the
    // company" — an absent IsActive means everybody is active.
    isActive: active === undefined || active === null || active === "" ? true : Boolean(active),
  };
}
