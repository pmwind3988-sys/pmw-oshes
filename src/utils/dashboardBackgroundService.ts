import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { normalizeDashboardAppearance, type DashboardAppearanceSetting } from "./dashboardBackgrounds";
import { acquireAccessTokenSilentOrRedirect } from "./authRecovery";
import { ensureDashboardBackgroundSettingsList } from "./formBuilderSP";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface DashboardAppearanceResponse {
  setting: unknown;
  /**
   * Set when the save succeeded but something the admin chose did not stick —
   * today, a settings list with no theme columns on a deployment that may not
   * create them. A 200 with a caveat rather than an error, because the part
   * that could be written was.
   */
  warning?: string;
}

export interface SavedAppearance {
  setting: DashboardAppearanceSetting;
  warning: string;
}

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    ...extra,
  };
}

function sharePointScope(): string {
  const spSiteUrl = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  try {
    return `${new URL(spSiteUrl).origin}/AllSites.Manage`;
  } catch {
    return "https://graph.microsoft.com/.default";
  }
}

async function acquireSharePointToken(
  instance: IPublicClientApplication,
  accounts: AccountInfo[],
): Promise<string> {
  if (accounts.length === 0) {
    throw new Error("No signed-in account found.");
  }

  return acquireAccessTokenSilentOrRedirect(instance, {
    scopes: [sharePointScope()],
    account: accounts[0],
  });
}

export async function fetchDashboardAppearance(): Promise<DashboardAppearanceSetting> {
  const response = await fetch("/api/dashboard-background", {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load the dashboard appearance: ${response.status}`);
  }

  const data = (await response.json()) as DashboardAppearanceResponse;
  // Normalized here rather than trusted: a site provisioned before the theme
  // columns existed returns a record with no theme ids at all, and the whole
  // app reads these values as colours.
  return normalizeDashboardAppearance(data.setting);
}

export async function saveDashboardAppearance(
  instance: IPublicClientApplication,
  accounts: AccountInfo[],
  setting: DashboardAppearanceSetting,
): Promise<SavedAppearance> {
  const token = await acquireSharePointToken(instance, accounts);
  const postSetting = () =>
    fetch("/api/dashboard-background", {
      method: "POST",
      headers: apiHeaders({ Authorization: `Bearer ${token}` }),
      body: JSON.stringify(setting),
    });

  let response = await postSetting();
  if (!response.ok && response.status >= 500) {
    await ensureDashboardBackgroundSettingsList(token);
    response = await postSetting();
  }

  if (!response.ok) {
    let message = `Failed to save the dashboard appearance: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep generic message */
    }
    throw new Error(message);
  }

  const data = (await response.json()) as DashboardAppearanceResponse;
  // The returned record is what the list actually holds, which is not always
  // what was sent — see the theme-column fallback in api/dashboard-background.
  return {
    setting: normalizeDashboardAppearance(data.setting),
    warning: typeof data.warning === "string" ? data.warning : "",
  };
}
