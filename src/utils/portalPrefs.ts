import type { PortalScreen } from "../types";

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
}

export const DEFAULT_PORTAL_PREFS: PortalPrefs = {
  startScreen: "home",
  compactTables: false,
  hideSettled: false,
};

const STORAGE_KEY = "pmw_oshes_portal_prefs";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPortalPrefs(): PortalPrefs {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PORTAL_PREFS;
    const parsed = JSON.parse(raw) as Partial<PortalPrefs>;
    return {
      startScreen: typeof parsed.startScreen === "string" ? (parsed.startScreen as PortalScreen) : DEFAULT_PORTAL_PREFS.startScreen,
      compactTables: parsed.compactTables === true,
      hideSettled: parsed.hideSettled === true,
    };
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
