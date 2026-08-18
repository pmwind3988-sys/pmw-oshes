/**
 * List names for the server-side routes.
 *
 * Must stay identical to `OSHE_LISTS` in `src/config/oshe.ts` — the two halves
 * of this app read the same lists on the same site, and the shared form builder
 * writes that schema to either site with no per-site mapping. The names are not
 * prefixed and not configurable: the site boundary already separates OSHE from
 * HR, so a prefix would buy nothing and a per-deployment override would only
 * create a way for the server to look somewhere the browser does not.
 *
 * This file previously defaulted to "OSHE "-prefixed names behind env vars that
 * were never set anywhere. Nothing on the site carries those names, so every
 * route that touched a list failed with a 500 once it got past authentication.
 */
export const OSHE_LISTS = {
  masterForm: "Master Form",
  approvers: "Approvers",
  versions: "Web Form Versions",
  builderLog: "Form Builder Log",
  dashboardSettings: "AdminPanelSettings",
} as const;
