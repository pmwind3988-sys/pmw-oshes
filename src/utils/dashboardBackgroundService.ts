import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import type { DashboardBackgroundSetting } from "./dashboardBackgrounds";
import { acquireAccessTokenSilentOrRedirect } from "./authRecovery";
import { ensureDashboardBackgroundSettingsList } from "./formBuilderSP";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface DashboardBackgroundResponse {
  setting: DashboardBackgroundSetting;
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

export async function fetchDashboardBackground(): Promise<DashboardBackgroundSetting> {
  const response = await fetch("/api/dashboard-background", {
    headers: apiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load dashboard background: ${response.status}`);
  }

  const data = (await response.json()) as DashboardBackgroundResponse;
  return data.setting;
}

export async function saveDashboardBackground(
  instance: IPublicClientApplication,
  accounts: AccountInfo[],
  setting: DashboardBackgroundSetting,
): Promise<DashboardBackgroundSetting> {
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
    let message = `Failed to save dashboard background: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep generic message */
    }
    throw new Error(message);
  }

  const data = (await response.json()) as DashboardBackgroundResponse;
  return data.setting;
}
