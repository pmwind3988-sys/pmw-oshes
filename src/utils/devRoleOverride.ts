import type { PortalRole } from "../types";

const KEY = "pmw-oshes-dev-role";

const ROLES: PortalRole[] = ["admin", "evaluator", "approver", "submitter", "auditor"];

/**
 * Dev-only role switcher. In production the role is derived from group
 * membership and the submission set; this exists so the five role views can be
 * driven locally without five real accounts. Compiled out of production builds
 * by the `import.meta.env.DEV` guard at every call site.
 */
export function isDevRoleSwitchEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

export function readDevRole(): PortalRole | null {
  if (!isDevRoleSwitchEnabled()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return ROLES.includes(raw as PortalRole) ? (raw as PortalRole) : null;
  } catch {
    return null;
  }
}

export function writeDevRole(role: PortalRole | null): void {
  if (!isDevRoleSwitchEnabled()) return;
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {
    // Nothing to recover from — the derived role still applies.
  }
}

export const DEV_ROLE_OPTIONS: { role: PortalRole; label: string; description: string }[] = [
  { role: "admin", label: "Administrator", description: "Everything, plus the catalogue and roles" },
  { role: "evaluator", label: "Evaluator · Safety Officer", description: "Full dashboard, all records, can chase" },
  { role: "approver", label: "Approver", description: "Only what is on their layer" },
  { role: "submitter", label: "Staff / submitter", description: "Only the forms they filed" },
  { role: "auditor", label: "Auditor — read only", description: "All records and the trail · no actions" },
];
