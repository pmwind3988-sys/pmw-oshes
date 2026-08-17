import { createContext, useContext } from "react";
import type {
  AuditEntry,
  CatalogueEntry,
  PortalAccess,
  PortalRecord,
  PortalRole,
  PortalScreen,
  SharePointClient,
  StatFilter,
  SurveyJson,
} from "../types";
import type { PeopleDirectory } from "../utils/portalPeople";
import type { PortalPrefs } from "../utils/portalPrefs";

export interface PortalContextValue {
  /** Label for this account. Every gate reads `access`, never this. */
  role: PortalRole;
  /** What this account may see and do, resolved once per session. */
  access: PortalAccess;
  userEmail: string;
  userName: string;
  userTitle: string;
  isAdmin: boolean;
  spClient: SharePointClient;
  directory: PeopleDirectory;

  /** Every record this account may see — its own filings only, unless it has oversight. */
  records: PortalRecord[];
  /** Records this account filed itself, whatever else it can see. */
  myRecords: PortalRecord[];
  /** Items waiting on this account's signature. */
  queue: PortalRecord[];
  catalogue: CatalogueEntry[];
  audit: AuditEntry[];
  /** Published schema per form, so quick-file can map its answers onto real columns. */
  surveyJsonByForm: Record<string, SurveyJson | null>;
  /** Re-read submissions from SharePoint after a filing so the new row appears. */
  refresh: () => void;

  screen: PortalScreen;
  /**
   * Go to a screen, optionally scoped to one form type.
   *
   * The scope is an argument rather than separate state a caller has to
   * remember to clear: every navigation states what it is scoped to, so a nav
   * click ("All submissions") cannot inherit the form filter left behind by a
   * form hub door ("All Permit to Work").
   */
  setScreen: (screen: PortalScreen, formScope?: string | null, statusScope?: StatFilter | null) => void;
  /** List title the current screen is scoped to, or null for every form. */
  focusForm: string | null;
  /** Status the records table should open on — what the pressed statistic counted. */
  focusStatus: StatFilter | null;

  /** Per-browser preferences: landing page, table density, whether settled rows show. */
  prefs: PortalPrefs;
  setPrefs: (changes: Partial<PortalPrefs>) => void;

  /** Reference of the record whose drawer is open, or null. */
  drawerRef: string | null;
  openDrawer: (reference: string) => void;
  closeDrawer: () => void;

  /** Nudges are idempotent per session — the button becomes "Nudged". */
  nudged: Record<string, boolean>;
  markNudged: (reference: string) => void;

  /** Apply a SharePoint field patch to local state so the queue count drops immediately. */
  applyPatch: (record: PortalRecord, fields: Record<string, unknown>) => void;
  /**
   * Drop a record that no longer exists in SharePoint. Every count and list is
   * derived from the same submission set, so removing it there is what makes
   * the row, the statistics and the open drawer agree without a reload.
   */
  removeRecord: (record: PortalRecord) => void;
  appendAudit: (entry: AuditEntry) => void;
  updateCatalogue: (listTitle: string, changes: Partial<CatalogueEntry>) => void;

  toast: (message: string) => void;
  /** The only session exit the portal offers — signing back in picks the account. */
  onSignOut: () => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}

interface PortalProviderProps extends PortalContextValue {
  children: React.ReactNode;
}

export function PortalProvider({ children, ...value }: PortalProviderProps) {
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}
