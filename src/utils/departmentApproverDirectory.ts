/**
 * departmentApproverDirectory.ts — CRUD for the Department Approver Directory
 * SharePoint list, scoped to a single publish profile's approver role.
 *
 * A "Department HOD" layer resolves its approver at runtime by matching the
 * submitted department against this list, filtered by the layer's role value
 * (see api/_utils/departmentApproverLookup.ts). The builder edits the same
 * rows here so admins never have to leave the profile to fix a routing gap.
 */
import type { DepartmentApproverLayerAssignee } from "../types";
import {
  SP_FIELD_KIND,
  ensureColumns,
  ensureSpList,
  getSharePointColumnKeyResolver,
  listExists,
  spDelete,
  spGet,
  spPatch,
  spPost,
} from "./formBuilderSP";
import { getDepartmentApproverLookupConfig, type DepartmentApproverLookupConfig } from "./departmentApproverLookup";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DepartmentApproverEntry {
  id: number;
  department: string;
  approverName: string;
  approverEmail: string;
  role: string;
}

export interface DepartmentApproverEntryInput {
  department: string;
  approverName: string;
  approverEmail: string;
}

export interface DepartmentApproverDirectory {
  /** The SharePoint list named by the layer exists and is readable. */
  exists: boolean;
  /** Configured columns that are not present on the list yet. */
  missingColumns: string[];
  /** Rows carrying this profile's approver role, sorted by department. */
  entries: DepartmentApproverEntry[];
  /** Rows in the same list that belong to a different approver role. */
  otherRoleCount: number;
}

interface ResolvedColumns {
  department: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
}

function listUrl(listName: string): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')`;
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "value", "text", "label", "displayName", "name"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

/** Case- and whitespace-insensitive key used to compare departments and roles. */
export function directoryKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns the entry that already owns `department` for this role, ignoring the
 * row currently being edited. The runtime lookup fails outright when a
 * department has two approvers for the same role, so the builder blocks it.
 */
export function findDepartmentConflict(
  entries: DepartmentApproverEntry[],
  department: string,
  editingId?: number,
): DepartmentApproverEntry | undefined {
  const key = directoryKey(department);
  if (!key) return undefined;
  return entries.find(entry => entry.id !== editingId && directoryKey(entry.department) === key);
}

/**
 * Validates one directory row. Returns a message naming the problem and the
 * fix, or null when the row is safe to save.
 */
export function validateDepartmentApproverEntry(
  input: DepartmentApproverEntryInput,
  entries: DepartmentApproverEntry[],
  roleLabel: string,
  editingId?: number,
): string | null {
  const department = input.department.trim();
  const email = input.approverEmail.trim();
  if (!department) return "Enter the department exactly as it appears in the form's answer.";
  if (!email) return "Enter the approver's email address.";
  if (!EMAIL_RE.test(email)) return `"${email}" is not a valid email address.`;
  const conflict = findDepartmentConflict(entries, department, editingId);
  if (conflict) {
    return `${roleLabel || "An approver"} for "${conflict.department}" already exists. Edit that entry instead of adding a second one.`;
  }
  return null;
}

async function resolveDirectoryColumns(
  token: string,
  config: DepartmentApproverLookupConfig,
): Promise<ResolvedColumns> {
  const keyOf = await getSharePointColumnKeyResolver(token, config.listName);
  return {
    department: keyOf(config.departmentColumn),
    name: keyOf(config.nameColumn),
    email: keyOf(config.emailColumn),
    role: keyOf(config.roleColumn),
  };
}

function missingColumnNames(config: DepartmentApproverLookupConfig, columns: ResolvedColumns): string[] {
  const missing: string[] = [];
  if (!columns.department) missing.push(config.departmentColumn);
  if (!columns.name) missing.push(config.nameColumn);
  if (!columns.email) missing.push(config.emailColumn);
  if (!columns.role) missing.push(config.roleColumn);
  return missing;
}

/**
 * Reads the directory rows for one layer's approver role. Never throws for a
 * missing list or missing columns — those come back as flags so the panel can
 * offer to provision them.
 */
export async function loadDepartmentApproverDirectory(
  token: string,
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
): Promise<DepartmentApproverDirectory> {
  const config = getDepartmentApproverLookupConfig(assignee);
  if (!await listExists(token, config.listName)) {
    return {
      exists: false,
      missingColumns: [config.departmentColumn, config.nameColumn, config.emailColumn, config.roleColumn],
      entries: [],
      otherRoleCount: 0,
    };
  }

  const columns = await resolveDirectoryColumns(token, config);
  const missingColumns = missingColumnNames(config, columns);
  const selectKeys = ["Id", columns.department, columns.name, columns.email, columns.role]
    .filter((key): key is string => !!key);
  const data = await spGet(
    token,
    `${listUrl(config.listName)}/items?$select=${[...new Set(selectKeys)].join(",")}&$top=2000`,
  ) as { value?: Record<string, unknown>[] };

  const rows = (data.value || []).map(row => ({
    id: Number(row.Id),
    department: columns.department ? valueToText(row[columns.department]) : "",
    approverName: columns.name ? valueToText(row[columns.name]) : "",
    approverEmail: columns.email ? valueToText(row[columns.email]) : "",
    role: columns.role ? valueToText(row[columns.role]) : "",
  }));

  const roleKey = directoryKey(config.roleValue);
  const entries = roleKey ? rows.filter(row => directoryKey(row.role) === roleKey) : rows;
  entries.sort((a, b) =>
    a.department.localeCompare(b.department) || a.approverName.localeCompare(b.approverName));

  return { exists: true, missingColumns, entries, otherRoleCount: rows.length - entries.length };
}

/**
 * Creates the directory list and any missing columns named by the layer, so a
 * profile can be wired up before SharePoint has been prepared by hand.
 */
export async function ensureDepartmentApproverDirectory(
  token: string,
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
): Promise<void> {
  const config = getDepartmentApproverLookupConfig(assignee);
  await ensureSpList(token, config.listName, {
    description: "Approver directory for department-based approval layers",
  });
  await ensureColumns(token, config.listName, [
    { n: config.departmentColumn, k: SP_FIELD_KIND.text },
    { n: config.nameColumn, k: SP_FIELD_KIND.text },
    { n: config.emailColumn, k: SP_FIELD_KIND.text },
    { n: config.roleColumn, k: SP_FIELD_KIND.text },
  ]);
}

async function buildEntryBody(
  token: string,
  config: DepartmentApproverLookupConfig,
  input: DepartmentApproverEntryInput,
  isNew: boolean,
): Promise<Record<string, unknown>> {
  const columns = await resolveDirectoryColumns(token, config);
  const missing = missingColumnNames(config, columns);
  if (!columns.department || !columns.email) {
    throw new Error(`"${config.listName}" is missing the ${missing.join(", ")} column(s). Add the columns first.`);
  }

  const body: Record<string, unknown> = {
    [columns.department]: input.department.trim(),
    [columns.email]: input.approverEmail.trim(),
  };
  if (columns.name) body[columns.name] = input.approverName.trim();
  // Rows created here always carry the profile's own approver role, so the
  // runtime lookup keeps finding them.
  if (columns.role && config.roleValue.trim()) body[columns.role] = config.roleValue.trim();
  // A generic SharePoint list requires Title; mirror the department into it on
  // create only, so hand-maintained titles survive later edits.
  if (isNew && !("Title" in body)) body.Title = input.department.trim();
  return body;
}

export async function createDepartmentApproverEntry(
  token: string,
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
  input: DepartmentApproverEntryInput,
): Promise<void> {
  const config = getDepartmentApproverLookupConfig(assignee);
  const body = await buildEntryBody(token, config, input, true);
  await spPost(token, `${listUrl(config.listName)}/items`, body);
}

export async function updateDepartmentApproverEntry(
  token: string,
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
  id: number,
  input: DepartmentApproverEntryInput,
): Promise<void> {
  const config = getDepartmentApproverLookupConfig(assignee);
  const body = await buildEntryBody(token, config, input, false);
  await spPatch(token, `${listUrl(config.listName)}/items(${id})`, body);
}

export async function deleteDepartmentApproverEntry(
  token: string,
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
  id: number,
): Promise<void> {
  const config = getDepartmentApproverLookupConfig(assignee);
  await spDelete(token, `${listUrl(config.listName)}/items(${id})`);
}
