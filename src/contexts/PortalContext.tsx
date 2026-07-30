import { createContext, useContext } from "react";
import type {
  AuditEntry,
  CatalogueEntry,
  PortalRecord,
  PortalRole,
  PortalScreen,
  SharePointClient,
  SurveyJson,
} from "../types";
import type { PeopleDirectory } from "../utils/portalPeople";

export interface PortalContextValue {
  role: PortalRole;
  userEmail: string;
  userName: string;
  userTitle: string;
  isAdmin: boolean;
  canUseFormBuilder: boolean;
  spClient: SharePointClient;
  directory: PeopleDirectory;

  /** Every record this account may see. */
  records: PortalRecord[];
  /** The subset a submitter sees — their own filings. Same as `records` for other roles. */
  visibleRecords: PortalRecord[];
  /** Items waiting on this account's signature. */
  queue: PortalRecord[];
  catalogue: CatalogueEntry[];
  audit: AuditEntry[];
  /** Published schema per form, so quick-file can map its answers onto real columns. */
  surveyJsonByForm: Record<string, SurveyJson | null>;
  /** Re-read submissions from SharePoint after a filing so the new row appears. */
  refresh: () => void;

  screen: PortalScreen;
  setScreen: (screen: PortalScreen) => void;

  /** Reference of the record whose drawer is open, or null. */
  drawerRef: string | null;
  openDrawer: (reference: string) => void;
  closeDrawer: () => void;

  /** Nudges are idempotent per session — the button becomes "Nudged". */
  nudged: Record<string, boolean>;
  markNudged: (reference: string) => void;

  /** Apply a SharePoint field patch to local state so the queue count drops immediately. */
  applyPatch: (record: PortalRecord, fields: Record<string, unknown>) => void;
  appendAudit: (entry: AuditEntry) => void;
  updateCatalogue: (listTitle: string, changes: Partial<CatalogueEntry>) => void;
  addCatalogueEntry: (entry: CatalogueEntry) => void;

  toast: (message: string) => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onOpenBuilder: () => void;
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
