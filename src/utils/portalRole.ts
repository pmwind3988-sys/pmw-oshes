import type { CatalogueEntry, PortalRecord, PortalRole, PortalScreen } from "../types";
import { normalizeEmail } from "./portalPeople";

export interface PortalRoleInput {
  userEmail: string;
  isAdmin: boolean;
  isAuditor: boolean;
  catalogue: CatalogueEntry[];
  records: PortalRecord[];
}

/**
 * The role view is derived from group membership plus the submission set — it is
 * never stored on the user. A user who is both an evaluator and an approver
 * resolves to `evaluator` (the superset view); their approval items still appear
 * in the same queue.
 */
export function derivePortalRole({
  userEmail,
  isAdmin,
  isAuditor,
  catalogue,
  records,
}: PortalRoleInput): PortalRole {
  if (isAdmin) return "admin";
  if (isAuditor) return "auditor";

  const email = normalizeEmail(userEmail);
  if (!email) return "submitter";

  let isApprover = false;

  for (const entry of catalogue) {
    for (const layer of entry.layers) {
      if (layer.assignee.type !== "user") continue;
      if (normalizeEmail(layer.assignee.value) !== email) continue;
      if (layer.type === "evaluation") return "evaluator";
      isApprover = true;
    }
  }

  for (const record of records) {
    for (const step of record.chain) {
      if (step.email !== email) continue;
      if (step.type === "evaluation") return "evaluator";
      isApprover = true;
    }
  }

  return isApprover ? "approver" : "submitter";
}

export interface PortalNavItem {
  screen: PortalScreen;
  label: string;
  /** Rendered right-aligned; blank when the item carries no count. */
  count: number | null;
}

export interface PortalNavCounts {
  queue: number;
  allRecords: number;
  visibleRecords: number;
  catalogue: number;
  audit: number;
}

/** Exact sidebar items and order per role. */
export function portalNav(role: PortalRole, counts: PortalNavCounts): PortalNavItem[] {
  switch (role) {
    case "admin":
      return [
        { screen: "today", label: "Today", count: null },
        { screen: "subs", label: "Submissions", count: counts.allRecords },
        { screen: "cat", label: "Form catalogue", count: counts.catalogue },
        { screen: "people", label: "People & roles", count: null },
        { screen: "audit", label: "Audit trail", count: null },
      ];
    case "evaluator":
      return [
        { screen: "today", label: "Today", count: null },
        { screen: "queue", label: "To evaluate", count: counts.queue },
        { screen: "subs", label: "Submissions", count: counts.allRecords },
      ];
    case "approver":
      return [
        { screen: "queue", label: "My approvals", count: counts.queue },
        { screen: "subs", label: "All records", count: counts.allRecords },
      ];
    case "submitter":
      return [
        { screen: "subs", label: "My submissions", count: counts.visibleRecords },
        { screen: "file", label: "File a form", count: null },
      ];
    case "auditor":
      return [
        { screen: "subs", label: "Records", count: counts.allRecords },
        { screen: "audit", label: "Audit trail", count: counts.audit },
      ];
  }
}

/** Landing screen after sign-in. */
export function portalHome(role: PortalRole): PortalScreen {
  if (role === "approver") return "queue";
  if (role === "submitter" || role === "auditor") return "subs";
  return "today";
}

export function roleLabel(role: PortalRole): string {
  const labels: Record<PortalRole, string> = {
    admin: "Administrator",
    evaluator: "Evaluator · Safety Officer",
    approver: "Approver",
    submitter: "Staff / submitter",
    auditor: "Auditor — read only",
  };
  return labels[role];
}

/** Audit accounts never render an action — there are no new write paths for them. */
export function isReadOnlyRole(role: PortalRole): boolean {
  return role === "auditor";
}

export function canExportCsv(role: PortalRole): boolean {
  return role === "admin" || role === "evaluator" || role === "auditor";
}

/** Who may chase an approver: nudge and reassign. */
export function canChase(role: PortalRole): boolean {
  return role === "admin" || role === "evaluator";
}

/** Screens a role is allowed to reach — used to keep deep links honest. */
export function allowedScreens(role: PortalRole): PortalScreen[] {
  const nav = portalNav(role, { queue: 0, allRecords: 0, visibleRecords: 0, catalogue: 0, audit: 0 });
  return nav.map((item) => item.screen);
}
