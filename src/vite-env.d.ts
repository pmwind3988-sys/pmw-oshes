/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_DEPARTMENT_NAME?: string;
  /**
   * Letterhead printed at the top of every generated PDF. See `src/config/company.ts`
   * — each is omitted from the page when unset rather than defaulted to a guess.
   */
  readonly VITE_COMPANY_NAME?: string;
  /** One line; `|` starts the next line of the address block. */
  readonly VITE_COMPANY_ADDRESS?: string;
  readonly VITE_COMPANY_PHONE?: string;
  readonly VITE_COMPANY_FAX?: string;
  readonly VITE_COMPANY_SST_NO?: string;
  /** Full-resolution mark. The PDF header scales it from its own aspect ratio. */
  readonly VITE_COMPANY_LOGO_URL?: string;
  readonly VITE_OSHES_ADMIN_GROUP?: string;
  readonly VITE_OSHES_AUDITOR_GROUP?: string;
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
  /**
   * Origin this deployment is reachable at. Every link that goes out in an email
   * is built from it — see `src/config/appBaseUrl.ts`. Unset falls back to the
   * current origin, which is only the right answer on production itself.
   */
  readonly VITE_APP_BASE_URL?: string;
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
