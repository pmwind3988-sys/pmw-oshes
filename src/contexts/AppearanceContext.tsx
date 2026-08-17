import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMsal } from "@azure/msal-react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { buildTheme } from "../theme";
import { applyAppearance, resolveAppearance, type ResolvedAppearance } from "../theme/appearance";
import { cacheAppearance, readCachedAppearance } from "../utils/appearanceBoot";
import {
  applyDashboardBackground,
  DASHBOARD_BACKGROUNDS,
  type DashboardAppearanceSetting,
} from "../utils/dashboardBackgrounds";
import {
  fetchDashboardAppearance,
  saveDashboardAppearance,
} from "../utils/dashboardBackgroundService";

/* ---------------------------------------------------------------------------
   Who owns the look, and when it is applied.

   The setting is organisation-wide and lives in SharePoint, so there are three
   moments to get right:

     boot      main.tsx applies the localStorage mirror before React renders, so
               a Midnight dashboard opens dark rather than flashing white.
     fetch     this provider reads the server copy and applies it. If it differs
               from the cached guess the page corrects itself once, early.
     poll      every 60s, silently — an administrator changing the theme reaches
               every open tab within a minute without anyone reloading.

   The MUI theme is rebuilt from the same resolved appearance the CSS variables
   were written from, and this provider is where the two are kept in step. That
   is why it renders the ThemeProvider itself rather than handing a theme back
   to App: there is then no way to mount a subtree with one and not the other.
--------------------------------------------------------------------------- */

interface AppearanceContextValue {
  setting: DashboardAppearanceSetting;
  resolved: ResolvedAppearance;
  backgrounds: typeof DASHBOARD_BACKGROUNDS;
  loading: boolean;
  saving: boolean;
  error: string;
  /** Paint a candidate without persisting it — how the picker previews live. */
  preview: (setting: DashboardAppearanceSetting | null) => void;
  save: (setting: DashboardAppearanceSetting) => Promise<DashboardAppearanceSetting>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function applyEverything(setting: DashboardAppearanceSetting): void {
  applyAppearance(setting);
  applyDashboardBackground(setting);
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  // Seeded from the same cache main.tsx already painted with, so the first
  // render agrees with the pixels that are on screen.
  const [setting, setSetting] = useState<DashboardAppearanceSetting>(readCachedAppearance);
  const [previewSetting, setPreviewSetting] = useState<DashboardAppearanceSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A live preview must not be stomped by the 60s poll landing mid-decision.
  // The poll runs inside an interval whose closure was created once, so it
  // cannot read the current state directly — a ref is the bridge, synced after
  // commit rather than written during render.
  const previewing = useRef(false);
  useEffect(() => {
    previewing.current = previewSetting !== null;
  }, [previewSetting]);

  useEffect(() => {
    let cancelled = false;

    async function refresh(silent: boolean): Promise<void> {
      try {
        const next = await fetchDashboardAppearance();
        if (cancelled) return;
        setSetting(next);
        cacheAppearance(next);
        if (!previewing.current) applyEverything(next);
        setError("");
      } catch (err) {
        if (cancelled || silent) return;
        // The cached guess is already on screen and is very likely right, so a
        // failed read leaves it alone rather than snapping the page back to the
        // default theme. Only the message is surfaced.
        setError(errorMessage(err));
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    void refresh(false);
    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const preview = useCallback((candidate: DashboardAppearanceSetting | null) => {
    setPreviewSetting(candidate);
    applyEverything(candidate ?? setting);
  }, [setting]);

  const save = useCallback(async (next: DashboardAppearanceSetting): Promise<DashboardAppearanceSetting> => {
    setSaving(true);
    try {
      const saved = await saveDashboardAppearance(instance, accounts, next);
      setSetting(saved);
      setPreviewSetting(null);
      cacheAppearance(saved);
      applyEverything(saved);
      setError("");
      return saved;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }, [instance, accounts]);

  const active = previewSetting ?? setting;
  const resolved = useMemo(() => resolveAppearance(active), [active]);
  const theme = useMemo(() => buildTheme(resolved), [resolved]);

  const value = useMemo<AppearanceContextValue>(() => ({
    setting: active,
    resolved,
    backgrounds: DASHBOARD_BACKGROUNDS,
    loading,
    saving,
    error,
    preview,
    save,
  }), [active, resolved, loading, saving, error, preview, save]);

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}
