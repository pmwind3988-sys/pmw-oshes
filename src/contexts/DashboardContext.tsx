import { createContext, useContext } from "react";
import type { Submission, DiscoveredList, ListMetaEntry, HardDeleteSubmissionResult } from "../types";

export interface DashboardContextValue {
  userEmail: string;
  isAdmin: boolean;
  canUseFormBuilder: boolean;
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  listMetaMap: Record<string, ListMetaEntry>;
  missingConfigs: string[];
  hasFilters: boolean;
  detailItem: Submission | null;
  setDetailItem: (item: Submission | null) => void;
  search: string;
  setSearch: (s: string) => void;
  listFilter: string;
  setListFilter: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  submitterFilter: string;
  setSubmitterFilter: (s: string) => void;
  sortedSubmissions: Submission[];
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onOpenBuilder: () => void;
  onEditForm: (listTitle: string) => void;
  onHardDeleteSubmission: (item: Submission) => Promise<HardDeleteSubmissionResult>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}

interface DashboardProviderProps extends DashboardContextValue {
  children: React.ReactNode;
}

export function DashboardProvider({ children, ...value }: DashboardProviderProps) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
