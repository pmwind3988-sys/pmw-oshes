/* Dev-only design harness — see src/devPreview/README.md. Never imported by the app. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Box, CssBaseline, Stack, ThemeProvider } from "@mui/material";
import { buildTheme } from "../theme";
import { CONTRAST_THEMES, DEFAULT_APPEARANCE, applyAppearance, type AppearanceSetting } from "../theme/appearance";
import { PortalProvider } from "../contexts/PortalContext";
import PortalShell from "../components/portal/PortalShell";
import RecordPage from "../components/portal/RecordPage";
import HomeScreen from "../pages/portal/HomeScreen";
import ManageScreen from "../pages/portal/ManageScreen";
import RecordsScreen from "../pages/portal/RecordsScreen";
import AuditScreen from "../pages/portal/AuditScreen";
import SmokingTotalsDashboard from "../components/smoking/SmokingTotalsDashboard";
import SmokingLogScreen from "../pages/portal/SmokingLogScreen";
import SmokingScanPage from "../pages/SmokingScanPage";
import type { PortalScreen } from "../types";
import { DEFAULT_PORTAL_PREFS, type PortalPrefs } from "../utils/portalPrefs";
import { NOW, fixtureContext } from "./fixtures";
import { sampleBreaks } from "./smokingFixtures";
import { installSmokingStub } from "./smokingStub";
import "../index.css";

/** Monday 00:00 Malaysian time of this week, and the Monday after. */
const SMOKING_WEEK = (() => {
  const shifted = new Date(NOW.getTime() + 8 * 3_600_000);
  const monday = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7)) - 8 * 3_600_000;
  return { from: new Date(monday).toISOString(), to: new Date(monday + 7 * 86_400_000).toISOString() };
})();

// The smoking screens call SharePoint and /api/smoking themselves; here those
// calls are answered with fixtures. `?scan=` picks what a poster scan returns.
installSmokingStub(NOW, SMOKING_WEEK.from, new URLSearchParams(location.search).get("scan") ?? "out");

const SCREENS = {
  home: <HomeScreen />,
  subs: <RecordsScreen />,
  // The real Manage screen; its sidebar switches the harness to the other pages.
  manage: <ManageScreen />,
  audit: <AuditScreen />,
  record: <RecordPage />,
  // SettingsScreen is absent: it reads AppearanceContext, which needs a real
  // MSAL session. Nothing here can stand in for that.
  // The smoking log itself reads SharePoint directly; its Totals dashboard is
  // shown on its own, over a sample week.
  smoking: <SmokingLogScreen />,
  "smoking-totals": <SmokingTotalsDashboard breaks={sampleBreaks(SMOKING_WEEK.from, NOW)} from={SMOKING_WEEK.from} to={SMOKING_WEEK.to} now={NOW} groupByDepartment={false} />,
} as const;

type ScreenKey = keyof typeof SCREENS;

/** The portal screen a harness key stands in for, so the shell highlights the right item. */
const portalScreenOf = (key: ScreenKey): PortalScreen => (key === "smoking-totals" ? "smoking" : (key as PortalScreen));

const param = (name: string, fallback: string) => new URLSearchParams(location.search).get(name) ?? fallback;

function Harness() {
  const [screen, setScreen] = useState<ScreenKey>(() => param("screen", "home") as ScreenKey);
  const [contrast, setContrast] = useState(() => param("contrast", "paper"));
  // The record detail is half the portal's design and none of it was reachable
  // here, so the drawer opens against fixtures like everything else. Its actions
  // write through a fixture client that does nothing, which is the point: this
  // harness answers "does it read right", never "did it save".
  const [drawerRef, setDrawerRef] = useState<string | null>(() => new URLSearchParams(location.search).get("record"));

  // Prefs live in state, not localStorage, so the harness never writes the real browser's portal prefs.
  const [prefs, setPrefsState] = useState<PortalPrefs>(DEFAULT_PORTAL_PREFS);
  const setPrefs = (changes: Partial<PortalPrefs>) => setPrefsState((current) => ({ ...current, ...changes }));

  const setting: AppearanceSetting = { ...DEFAULT_APPEARANCE, contrastThemeId: contrast };
  applyAppearance(setting);

  const value = fixtureContext("admin", {
    screen: portalScreenOf(screen),
    focusForm: null,
    prefs,
    setPrefs,
    setScreen: (next) => {
      // "record" is reached through openDrawer, which carries the record it shows.
      if (next !== "record" && next in SCREENS) {
        setDrawerRef(null);
        setScreen(next as ScreenKey);
      }
    },
    drawerRef,
    openDrawer: (reference) => {
      setDrawerRef(reference);
      setScreen("record");
    },
    closeDrawer: () => {
      setDrawerRef(null);
      setScreen("home");
    },
  });

  const chip = (on: boolean) => ({
    px: 1,
    py: 0.4,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: "6px",
    border: "1px solid #b9c2cf",
    background: on ? "#0078D4" : "#fff",
    color: on ? "#fff" : "#222",
  });

  return (
    <ThemeProvider theme={buildTheme(setting)}>
      <CssBaseline />
      <Stack
        direction="row"
        sx={{ gap: 0.5, p: 1, flexWrap: "wrap", alignItems: "center", background: "#dfe5ec" }}
      >
        {(Object.keys(SCREENS) as ScreenKey[]).map((key) => (
          <Box key={key} component="button" data-screen={key} onClick={() => setScreen(key)} sx={chip(screen === key)}>
            {key}
          </Box>
        ))}
        <Box sx={{ width: 16 }} />
        {CONTRAST_THEMES.map((theme) => (
          <Box
            key={theme.id}
            component="button"
            data-contrast={theme.id}
            onClick={() => setContrast(theme.id)}
            sx={chip(contrast === theme.id)}
          >
            {theme.id}
          </Box>
        ))}
      </Stack>
      <MemoryRouter>
        <PortalProvider {...value}>
          <PortalShell>{SCREENS[screen]}</PortalShell>
        </PortalProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

/**
 * `?page=scan` is the smoker's page, as a poster opens it, outside the portal
 * shell. `&scan=signin` shows the sign-in, `profile` the first-time profile,
 * `out` a check-out, `in` a check-in, `flagged` a long one, `already` a double tap.
 */
function ScanHarness() {
  const scan = param("scan", "out");
  try {
    if (scan === "signin") localStorage.removeItem("oshes.smokingPass");
    else localStorage.setItem("oshes.smokingPass", "preview");
    sessionStorage.removeItem("oshes.smokingLastScan");
  } catch {
    // Private window: the page shows the sign-in.
  }
  applyAppearance(DEFAULT_APPEARANCE);
  return (
    <ThemeProvider theme={buildTheme(DEFAULT_APPEARANCE)}>
      <CssBaseline />
      <MemoryRouter initialEntries={[param("home", "") ? "/smoke" : "/smoke?area=AAA111"]}>
        <SmokingScanPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(param("page", "") === "scan" ? <ScanHarness /> : <Harness />);
