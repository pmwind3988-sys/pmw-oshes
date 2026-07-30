import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  applyDashboardBackground,
  DASHBOARD_BACKGROUNDS,
  DEFAULT_DASHBOARD_BACKGROUND_SETTING,
  type DashboardBackgroundSetting,
} from "../utils/dashboardBackgrounds";
import {
  fetchDashboardBackground,
  saveDashboardBackground,
} from "../utils/dashboardBackgroundService";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function useDashboardBackground(isAdmin: boolean) {
  const { instance, accounts } = useMsal();
  const [setting, setSetting] = useState<DashboardBackgroundSetting>(DEFAULT_DASHBOARD_BACKGROUND_SETTING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function refresh(silent: boolean): Promise<void> {
      if (!silent) setLoading(true);
      try {
        const nextSetting = await fetchDashboardBackground();
        if (cancelled) return;
        setSetting(nextSetting);
        applyDashboardBackground(nextSetting);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (!silent) {
          applyDashboardBackground(DEFAULT_DASHBOARD_BACKGROUND_SETTING);
          setError(errorMessage(err));
        }
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

  async function save(nextSetting: DashboardBackgroundSetting): Promise<DashboardBackgroundSetting> {
    if (!isAdmin) {
      throw new Error("Only admins can change the dashboard background.");
    }

    setSaving(true);
    try {
      const savedSetting = await saveDashboardBackground(instance, accounts, nextSetting);
      setSetting(savedSetting);
      applyDashboardBackground(savedSetting);
      setError("");
      return savedSetting;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return {
    backgrounds: DASHBOARD_BACKGROUNDS,
    error,
    loading,
    save,
    saving,
    setting,
  };
}
