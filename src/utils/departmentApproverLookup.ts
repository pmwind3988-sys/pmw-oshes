import type { DepartmentApproverLayerAssignee } from "../types";

export const DEPARTMENT_APPROVER_DEFAULTS = {
  listName: "Department Approver Directory",
  departmentColumn: "Department",
  emailColumn: "ApproverEmail",
  nameColumn: "ApproverName",
  roleColumn: "ApproverRole",
  roleValue: "HOD",
} as const;

export interface DepartmentApproverLookupConfig {
  listName: string;
  departmentColumn: string;
  emailColumn: string;
  nameColumn: string;
  roleColumn: string;
  roleValue: string;
}

function trimmedOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function getDepartmentApproverLookupConfig(
  assignee: Partial<DepartmentApproverLayerAssignee> | undefined,
): DepartmentApproverLookupConfig {
  return {
    listName: trimmedOrDefault(assignee?.listName, DEPARTMENT_APPROVER_DEFAULTS.listName),
    departmentColumn: trimmedOrDefault(assignee?.departmentColumn, DEPARTMENT_APPROVER_DEFAULTS.departmentColumn),
    emailColumn: trimmedOrDefault(assignee?.emailColumn, DEPARTMENT_APPROVER_DEFAULTS.emailColumn),
    nameColumn: trimmedOrDefault(assignee?.nameColumn, DEPARTMENT_APPROVER_DEFAULTS.nameColumn),
    roleColumn: trimmedOrDefault(assignee?.roleColumn, DEPARTMENT_APPROVER_DEFAULTS.roleColumn),
    roleValue: trimmedOrDefault(assignee?.roleValue, DEPARTMENT_APPROVER_DEFAULTS.roleValue),
  };
}

export function createDepartmentApproverAssignee(
  departmentFieldName = "",
  previous?: Partial<DepartmentApproverLayerAssignee>,
): DepartmentApproverLayerAssignee {
  const config = getDepartmentApproverLookupConfig(previous);
  return {
    type: "department-approver",
    value: departmentFieldName,
    listName: config.listName,
    departmentColumn: config.departmentColumn,
    emailColumn: config.emailColumn,
    nameColumn: config.nameColumn,
    roleColumn: config.roleColumn,
    roleValue: config.roleValue,
  };
}
