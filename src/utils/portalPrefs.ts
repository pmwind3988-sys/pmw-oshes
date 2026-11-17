import type { PortalScreen } from "../types";

/** Every page a preference may name as its landing page. */
const PORTAL_SCREENS: readonly PortalScreen[] = ["home", "subs", "manage", "people", "audit", "smoking", "settings"];

/**
 * Per-browser portal preferences.
 *
 * Deliberately local, not SharePoint: none of this is a permission or a record,
 * and writing a list item on every toggle would make a preference cost a round
 * trip. Losing them on a new machine is the correct failure — the portal simply
 * lands on Home.
 */
export interface PortalPrefs {
  /** Page to land on after sign-in. "home" unless the account chose otherwise. */
  startScreen: PortalScreen;
  /** Tables drop their second line and tighten their rows. */
  compactTables: boolean;
  /** Records tables default to open items rather than everything. */
  hideSettled: boolean;
  /** Submissions opens as a list or as a board. */
  subsView: SubsView;
  /** Rows per page in the submissions list. */
  pageSize: number;
}

export type SubsView = "list" | "board";

/** The page sizes the submissions pager offers. */
export const PAGE_SIZES = [25, 50, 100] as const;

export const DEFAULT_PORTAL_PREFS: PortalPrefs = {
  startScreen: "home",
  compactTables: false,
  hideSettled: false,
  subsView: "list",
  pageSize: 25,
};

const STORAGE_KEY = "pmw_oshes_portal_prefs";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads a stored preferences value. A landing page that is no longer a screen
 * (a page since removed from the portal) falls back to Home, as does anything
 * unreadable.
 */
export function parsePortalPrefs(raw: string | null): PortalPrefs {
  if (!raw) return DEFAULT_PORTAL_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<PortalPrefs>;
    const startScreen =
      typeof parsed.startScreen === "string" && (PORTAL_SCREENS as readonly string[]).includes(parsed.startScreen)
        ? (parsed.startScreen as PortalScreen)
        : DEFAULT_PORTAL_PREFS.startScreen;
    return {
      startScreen,
      compactTables: parsed.compactTables === true,
      hideSettled: parsed.hideSettled === true,
      subsView: parsed.subsView === "board" ? "board" : "list",
      pageSize: (PAGE_SIZES as readonly number[]).includes(parsed.pageSize as number)
        ? (parsed.pageSize as number)
        : DEFAULT_PORTAL_PREFS.pageSize,
    };
  } catch {
    return DEFAULT_PORTAL_PREFS;
  }
}

export function readPortalPrefs(): PortalPrefs {
  try {
    return parsePortalPrefs(storage()?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_PORTAL_PREFS;
  }
}

export function writePortalPrefs(prefs: PortalPrefs): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // A browser that refuses storage still gets a working session, just not a
    // remembered one.
  }
}
