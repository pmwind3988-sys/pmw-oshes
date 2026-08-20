function env(name: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const OSHES_APP = {
  name: env("VITE_APP_NAME", "PMW OSHES Forms"),
  department: env("VITE_DEPARTMENT_NAME", "OSHES"),
  /**
   * SharePoint group whose members administer this deployment.
   *
   * There is deliberately no default. A guessed group name denies access in
   * exactly the same way a genuine non-membership does, so shipping one turns a
   * missing variable into an unexplained permissions failure. Blank instead
   * means nobody resolves as an admin, which is the same outcome but arrives
   * with the warning below. Submitters are unaffected either way.
   */
  adminGroup: env("VITE_OSHES_ADMIN_GROUP", ""),
  /** Read-only group. Members see every record and the audit trail, and never render an action. */
  auditorGroup: env("VITE_OSHES_AUDITOR_GROUP", ""),
  /**
   * SharePoint group allowed to author forms in the shared builder.
   *
   * Separate from `adminGroup` because the two grants are genuinely different:
   * administering this deployment is a read/act permission on OSHES records,
   * while authoring writes schema that both products render. Left blank, admins
   * are treated as authors — which is the smaller deployment's usual shape and
   * is no wider than the builder's own group check on the far side.
   */
  formBuilderGroup: env("VITE_OSHES_FORM_BUILDER_GROUP", ""),
} as const;

if (!OSHES_APP.adminGroup) {
  console.warn(
    "VITE_OSHES_ADMIN_GROUP is not set — no account will resolve as an OSHES admin. " +
      "It is compared as a literal string against the SharePoint group Title; " +
      "list the real names with <site-url>/_api/web/sitegroups?$select=Title",
  );
}

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
 *
 * @param formTitle Opens that form for editing rather than the form library.
 */
export function builderUrl(formTitle?: string): string | null {
  const base = (import.meta.env.VITE_BUILDER_URL || "").trim().replace(/\/$/, "");
  if (!base) return null;
  const path = formTitle
    ? `/admin/builder/${encodeURIComponent(formTitle)}`
    : "/admin/builder";
  // ?site=oshes is what puts the builder in OSHES mode. Without it the operator
  // would land on HR's forms, which is the one outcome worth engineering against.
  return `${base}${path}?site=oshes`;
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
