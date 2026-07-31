/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_DEPARTMENT_NAME?: string;
  readonly VITE_OSHES_ADMIN_GROUP?: string;
  readonly VITE_OSHES_AUDITOR_GROUP?: string;
  readonly VITE_OSHES_SLA_DEFAULT_DAYS?: string;
  /** Mailbox workflow email is sent from. */
  readonly VITE_OSHES_FORM_EMAIL_FROM_ADDRESS?: string;
  readonly VITE_EMAIL_FROM_ADDRESS?: string;
  /**
   * Sentinel mailbox meaning "this layer is handled on paper". A layer resolving to
   * this address is marked manual instead of being assigned an online reviewer.
   * Deliberately separate from the sender mailbox above.
   */
  readonly VITE_OSHES_MANUAL_PAPER_ADDRESS?: string;
  /**
   * Origin of the pmw-hrform deployment that hosts the shared form builder.
   * Blank hides the "Form builder" link entirely.
   */
  readonly VITE_BUILDER_URL?: string;
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
