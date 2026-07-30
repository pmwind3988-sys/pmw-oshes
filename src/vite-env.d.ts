/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_DEPARTMENT_NAME?: string;
  readonly VITE_OSHES_ADMIN_GROUP?: string;
  readonly VITE_OSHES_AUDITOR_GROUP?: string;
  readonly VITE_OSHES_SLA_DEFAULT_DAYS?: string;
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
