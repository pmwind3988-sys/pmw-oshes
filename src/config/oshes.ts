function env(name: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const OSHES_APP = {
  name: env("VITE_APP_NAME", "PMW OSHES Forms"),
  department: env("VITE_DEPARTMENT_NAME", "OSHES"),
  adminGroup: env("VITE_OSHES_ADMIN_GROUP", "_OSHES Forms Owners"),
  formBuilderGroup: env("VITE_OSHES_FORM_BUILDER_GROUP", "_OSHES Form Builder Superusers"),
  /** Read-only group. Members see every record and the audit trail, and never render an action. */
  auditorGroup: env("VITE_OSHES_AUDITOR_GROUP", "_OSHES Auditors"),
} as const;

/**
 * Working days a layer may sit before it counts as overdue, when neither the
 * layer nor its form type sets an SLA. Open question with the team: whether
 * this counts working days or calendar days — the copy says working days.
 */
export const PORTAL_SLA_DEFAULT_DAYS = Number(env("VITE_OSHES_SLA_DEFAULT_DAYS", "3")) || 3;

export const OSHES_LISTS = {
  masterForm: env("VITE_SP_MASTER_FORM_LIST", "OSHES Master Form"),
  approvers: env("VITE_SP_APPROVERS_LIST", "OSHES Approvers"),
  versions: env("VITE_SP_FORM_VERSIONS_LIST", "OSHES Web Form Versions"),
  builderLog: env("VITE_SP_FORM_BUILDER_LOG_LIST", "OSHES Form Builder Log"),
  dashboardSettings: env("VITE_SP_DASHBOARD_SETTINGS_LIST", "OSHES Admin Settings"),
  /** Append-only trail: every signature, nudge, reassignment and cancellation. */
  auditTrail: env("VITE_SP_AUDIT_TRAIL_LIST", "OSHES Audit Trail"),
} as const;
