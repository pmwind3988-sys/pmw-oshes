function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value?.trim() || fallback;
}

export const OSHES_LISTS = {
  masterForm: env("VITE_SP_MASTER_FORM_LIST", "OSHES Master Form"),
  approvers: env("VITE_SP_APPROVERS_LIST", "OSHES Approvers"),
  versions: env("VITE_SP_FORM_VERSIONS_LIST", "OSHES Web Form Versions"),
  builderLog: env("VITE_SP_FORM_BUILDER_LOG_LIST", "OSHES Form Builder Log"),
  dashboardSettings: env("VITE_SP_DASHBOARD_SETTINGS_LIST", "OSHES Admin Settings"),
} as const;
