/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_DEPARTMENT_NAME?: string;
  readonly VITE_OSHES_ADMIN_GROUP?: string;
  readonly VITE_OSHES_FORM_BUILDER_GROUP?: string;
  readonly VITE_SP_MASTER_FORM_LIST?: string;
  readonly VITE_SP_APPROVERS_LIST?: string;
  readonly VITE_SP_FORM_VERSIONS_LIST?: string;
  readonly VITE_SP_FORM_BUILDER_LOG_LIST?: string;
  readonly VITE_SP_DASHBOARD_SETTINGS_LIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_AZURE_TENANT_ID: string;
  readonly VITE_SP_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
