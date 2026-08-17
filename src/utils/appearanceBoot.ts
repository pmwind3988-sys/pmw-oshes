/* ---------------------------------------------------------------------------
   Painting the look before React exists.

   The chosen appearance lives in SharePoint, which puts it one authenticated
   round trip away — and a round trip lands after first paint. With no cache,
   every load of a Midnight dashboard would open white and then invert once the
   fetch returned. That flash reads as a bug, and on the dark themes it is a
   face-full of white in a dark room.

   So the last known record is mirrored into localStorage and applied
   synchronously from `main.tsx`, before `createRoot`. The server copy stays
   authoritative: when the fetch lands, `AppearanceProvider` applies it and
   re-caches, correcting the guess if an administrator has changed it since.
   The cache is only ever a prediction of what the server will say, never a
   second source of truth — which is why nothing writes to it except the code
   that has just heard from the server.

   Lives in `utils/` rather than `theme/` on purpose: it reaches for
   `localStorage` and for the wallpaper catalogue, and `theme/appearance.ts` and
   `theme/editorial.ts` are kept free of app imports so they can be copied into
   pmw-hrform unchanged.
--------------------------------------------------------------------------- */

import { applyAppearance } from "../theme/appearance";
import {
  applyDashboardBackground,
  DEFAULT_DASHBOARD_APPEARANCE,
  normalizeDashboardAppearance,
  type DashboardAppearanceSetting,
} from "./dashboardBackgrounds";

const CACHE_KEY = "pmw_oshes_appearance";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Private windows and locked-down SharePoint embeds refuse storage. The app
    // still themes correctly; it just pays the flash on every load.
    return null;
  }
}

export function readCachedAppearance(): DashboardAppearanceSetting {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_APPEARANCE;
    return normalizeDashboardAppearance(JSON.parse(raw));
  } catch {
    return DEFAULT_DASHBOARD_APPEARANCE;
  }
}

export function cacheAppearance(setting: DashboardAppearanceSetting): void {
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify(normalizeDashboardAppearance(setting)));
  } catch {
    /* see storage() */
  }
}

/** Apply the cached prediction. Called once, from main.tsx, before first render. */
export function bootAppearance(): DashboardAppearanceSetting {
  const setting = readCachedAppearance();
  applyAppearance(setting);
  applyDashboardBackground(setting);
  return setting;
}
