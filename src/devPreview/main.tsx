/* Dev-only design harness — see src/devPreview/README.md. Never imported by the app. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Box, CssBaseline, Stack, ThemeProvider } from "@mui/material";
import { buildTheme } from "../theme";
import { CONTRAST_THEMES, DEFAULT_APPEARANCE, applyAppearance, type AppearanceSetting } from "../theme/appearance";
import { PortalProvider } from "../contexts/PortalContext";
import PortalShell from "../components/portal/PortalShell";
import HomeScreen from "../pages/portal/HomeScreen";
import TodayScreen from "../pages/portal/TodayScreen";
import QueueScreen from "../pages/portal/QueueScreen";
import RecordsScreen from "../pages/portal/RecordsScreen";
import FormHubScreen from "../pages/portal/FormHubScreen";
import CatalogueScreen from "../pages/portal/CatalogueScreen";
import PeopleScreen from "../pages/portal/PeopleScreen";
import AuditScreen from "../pages/portal/AuditScreen";
import FileFormScreen from "../pages/portal/FileFormScreen";
import { fixtureContext } from "./fixtures";
import "../index.css";

const SCREENS = {
  home: <HomeScreen />,
  today: <TodayScreen />,
  queue: <QueueScreen />,
  records: <RecordsScreen scope="all" />,
  mine: <RecordsScreen scope="mine" />,
  form: <FormHubScreen />,
  catalogue: <CatalogueScreen />,
  people: <PeopleScreen />,
  audit: <AuditScreen />,
  // SettingsScreen is absent: it reads AppearanceContext, which needs a real
  // MSAL session. Nothing here can stand in for that.
  file: <FileFormScreen />,
} as const;

type ScreenKey = keyof typeof SCREENS;

const param = (name: string, fallback: string) => new URLSearchParams(location.search).get(name) ?? fallback;

function Harness() {
  const [screen, setScreen] = useState<ScreenKey>(() => param("screen", "home") as ScreenKey);
  const [contrast, setContrast] = useState(() => param("contrast", "paper"));

  const setting: AppearanceSetting = { ...DEFAULT_APPEARANCE, contrastThemeId: contrast };
  applyAppearance(setting);

  const value = fixtureContext("admin", {
    screen: screen === "form" ? "form" : "home",
    focusForm: screen === "form" ? "Permit To Work" : null,
    setScreen: (next) => {
      if (next in SCREENS) setScreen(next as ScreenKey);
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

createRoot(document.getElementById("root")!).render(<Harness />);
