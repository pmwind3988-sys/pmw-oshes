import { queryListItems } from "./graphClient.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEPARTMENT_APPROVER_DEFAULTS = {
  listName: "Department Approver Directory",
  departmentColumn: "Department",
  emailColumn: "ApproverEmail",
  nameColumn: "ApproverName",
  roleColumn: "ApproverRole",
  roleValue: "HOD",
} as const;

interface DepartmentApproverAssignee {
  type: "department-approver";
  value: string;
  listName?: string;
  departmentColumn?: string;
  emailColumn?: string;
  nameColumn?: string;
  roleColumn?: string;
  roleValue?: string;
}

export interface DepartmentApproverLookupResult {
  email: string;
  name: string;
}

function trimmedOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
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

function escapeGraphODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function resolveDepartmentApproverFromList(
  token: string,
  assignee: DepartmentApproverAssignee,
  submittedData: Record<string, unknown>,
  layerLabel: string,
): Promise<DepartmentApproverLookupResult> {
  const departmentField = assignee.value.trim();
  const department = valueToText(submittedData[departmentField]);
  if (!departmentField) {
    throw new Error(`${layerLabel} needs a department field before the workflow can start.`);
  }
  if (!department) {
    throw new Error(`${layerLabel} needs a department value before the workflow can start.`);
  }

  const listName = trimmedOrDefault(assignee.listName, DEPARTMENT_APPROVER_DEFAULTS.listName);
  const departmentColumn = trimmedOrDefault(assignee.departmentColumn, DEPARTMENT_APPROVER_DEFAULTS.departmentColumn);
  const emailColumn = trimmedOrDefault(assignee.emailColumn, DEPARTMENT_APPROVER_DEFAULTS.emailColumn);
  const nameColumn = trimmedOrDefault(assignee.nameColumn, DEPARTMENT_APPROVER_DEFAULTS.nameColumn);
  const roleColumn = trimmedOrDefault(assignee.roleColumn, DEPARTMENT_APPROVER_DEFAULTS.roleColumn);
  const roleValue = trimmedOrDefault(assignee.roleValue, DEPARTMENT_APPROVER_DEFAULTS.roleValue);

  const filters = [`fields/${departmentColumn} eq '${escapeGraphODataString(department)}'`];
  if (roleColumn && roleValue) {
    filters.push(`fields/${roleColumn} eq '${escapeGraphODataString(roleValue)}'`);
  }

  const matches = await queryListItems(token, listName, {
    filter: filters.join(" and "),
    top: 2,
    preferNonIndexed: true,
  });

  if (matches.length === 0) {
    throw new Error(`${layerLabel} could not find ${roleValue || "an approver"} for department "${department}".`);
  }
  if (matches.length > 1) {
    throw new Error(`${layerLabel} found more than one ${roleValue || "approver"} for department "${department}". Keep the directory exact and unique.`);
  }

  const fields = matches[0].fields;
  const email = valueToText(fields[emailColumn]);
  if (!EMAIL_RE.test(email)) {
    throw new Error(`${layerLabel} found an invalid approver email for department "${department}".`);
  }

  return {
    email,
    name: valueToText(fields[nameColumn]),
  };
}
