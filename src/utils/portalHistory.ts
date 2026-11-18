import type { FiledScope, ManageView, PortalScreen, StatFilter, SubsScope } from "../types";

/** The screen and scopes a record page was opened from. */
export interface ReturnPoint {
  screen: PortalScreen | null;
  formScope: string | null;
  statusScope: StatFilter | null;
  subsScope: SubsScope | null;
  filedScope: FiledScope | null;
}

/**
 * Everything that decides which portal page is showing.
 *
 * The portal lives at one address, so each page change is written into the
 * browser's history as one of these. Pressing Back or Forward hands it back
 * and the portal reopens that page, instead of the browser leaving the site.
 */
export interface PortalNav {
  screen: PortalScreen | null;
  focusForm: string | null;
  focusStatus: StatFilter | null;
  focusSubsScope: SubsScope | null;
  focusFiled: FiledScope | null;
  /** Where the record page was opened from, so leaving it returns there. */
  returnTo: ReturnPoint | null;
  /** Null until a record is opened from the portal; then the record key it shows, or null when none. */
  drawerChoice: { ref: string | null } | null;
  manageView: ManageView;
  search: { query: string; at: number };
}

const HISTORY_KEY = "portalNav";

/** The history entry's state for a portal page. */
export function historyStateFor(nav: PortalNav): Record<string, PortalNav> {
  return { [HISTORY_KEY]: nav };
}

/**
 * The portal page a history entry recorded, or null when it recorded none —
 * an entry made before this portal opened, or by another page of the site.
 */
export function navFromHistoryState(state: unknown): PortalNav | null {
  if (!state || typeof state !== "object") return null;
  const nav = (state as Record<string, unknown>)[HISTORY_KEY];
  if (!nav || typeof nav !== "object") return null;
  const candidate = nav as Partial<PortalNav>;
  if (!candidate.search || typeof candidate.search.query !== "string") return null;
  if (candidate.manageView !== "overview" && candidate.manageView !== "tests") return null;
  return candidate as PortalNav;
}

/** Whether two portal pages are the same page, so no new history entry is needed. */
export function sameNav(a: PortalNav, b: PortalNav): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
