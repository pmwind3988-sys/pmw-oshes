function env(name: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const OSHES_APP = {
  name: env("VITE_APP_NAME", "PMW OSHES Forms"),
  department: env("VITE_DEPARTMENT_NAME", "OSHES"),
  adminGroup: env("VITE_OSHES_ADMIN_GROUP", "_OSHES Forms Owners"),
  /** Read-only group. Members see every record and the audit trail, and never render an action. */
  auditorGroup: env("VITE_OSHES_AUDITOR_GROUP", "_OSHES Auditors"),
} as const;

/**
 * Working days a layer may sit before it counts as overdue, when neither the
 * layer nor its form type sets an SLA. Open question with the team: whether
 * this counts working days or calendar days — the copy says working days.
 */
export const PORTAL_SLA_DEFAULT_DAYS = Number(env("VITE_OSHES_SLA_DEFAULT_DAYS", "3")) || 3;

/**
 * Deep link to the pmw-hrform form builder, pointed at the OSHES site.
 *
 * Forms are authored in one place for both products. Rather than embed that
 * builder here — which would mean reintroducing the code this app deliberately
 * removed, and re-authenticating inside an iframe against partitioned browser
 * storage — the portal links out to it. Same tenant and same Entra app, so the
 * hand-off is a silent SSO with no second sign-in.
 *
 * Returns null when unconfigured, and the link is not rendered at all.
 */
export function builderUrl(): string | null {
  const base = (import.meta.env.VITE_BUILDER_URL || "").trim().replace(/\/$/, "");
  if (!base) return null;
  // ?site=oshes is what puts the builder in OSHES mode. Without it the operator
  // would land on HR's forms, which is the one outcome worth engineering against.
  return `${base}/admin/builder?site=oshes`;
}

/**
 * List names are deliberately NOT prefixed and NOT configurable.
 *
 * OSHES lives on its own SharePoint site, so the site boundary already separates
 * it from HR. Keeping the names identical to pmw-hrform means the shared form
 * builder writes the same schema to either site with no per-site list mapping.
 */
export const OSHES_LISTS = {
  masterForm: "Master Form",
  approvers: "Approvers",
  versions: "Web Form Versions",
  builderLog: "Form Builder Log",
  dashboardSettings: "AdminPanelSettings",
  /** Append-only trail: every signature, nudge, reassignment and cancellation. */
  auditTrail: "Audit Trail",
} as const;
