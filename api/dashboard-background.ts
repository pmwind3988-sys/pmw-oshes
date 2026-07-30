import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  createListItem,
  getGraphToken,
  queryListItems,
  updateListItemFields,
} from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { ensureAdminPanelSettingsList } from "./_utils/provisioning.js";
import { OSHES_LISTS } from "./_utils/oshesConfig.js";

interface ApiRequest {
  body: unknown;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

interface DashboardBackgroundSetting {
  backgroundId: string;
  customImageUrl: string;
  customImageSource: string;
  imageOpacity: number;
  updatedBy?: string;
  updatedAt?: string;
}

interface SharePointUser {
  Email?: string;
  LoginName?: string;
}

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
const ADMIN_GROUP = "_HR_ Forms Owners";
const SETTINGS_LIST = OSHES_LISTS.dashboardSettings;
const SETTING_TITLE = "dashboard-background";
const DEFAULT_SETTING: DashboardBackgroundSetting = {
  backgroundId: "clarity",
  customImageUrl: "",
  customImageSource: "",
  imageOpacity: 0.22,
};
const ALLOWED_BACKGROUND_IDS = new Set([
  "clarity",
  "paper-grid",
  "workspace",
  "studio",
  "city-glass",
  "horizon",
  "courtyard",
  "prism",
  "custom",
]);

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName)?.[1];
  if (Array.isArray(entry)) return entry[0] || "";
  return entry || "";
}

function getBearerToken(headers: Record<string, string | string[] | undefined>): string {
  const authorization = getHeader(headers, "authorization");
  if (!authorization.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice(7).trim();
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

function normalizeImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeImageSource(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 1000);
}

function normalizeImageOpacity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTING.imageOpacity;
  return Math.min(1, Math.max(0, parsed));
}

function normalizeSetting(fields: Record<string, unknown> | undefined): DashboardBackgroundSetting {
  const rawBackgroundId = String(fields?.BackgroundId || "");
  const backgroundId = ALLOWED_BACKGROUND_IDS.has(rawBackgroundId)
    ? rawBackgroundId
    : DEFAULT_SETTING.backgroundId;
  const customImageUrl = backgroundId === "custom"
    ? normalizeImageUrl(fields?.CustomImageUrl)
    : "";
  const customImageSource = backgroundId === "custom"
    ? normalizeImageSource(fields?.CustomImageSource)
    : "";

  if (backgroundId === "custom" && !customImageUrl) {
    return DEFAULT_SETTING;
  }

  return {
    backgroundId,
    customImageUrl,
    customImageSource,
    imageOpacity: normalizeImageOpacity(fields?.ImageOpacity),
    updatedBy: fields?.UpdatedBy ? String(fields.UpdatedBy) : undefined,
    updatedAt: fields?.UpdatedAt ? String(fields.UpdatedAt) : undefined,
  };
}

function validateRequestedSetting(body: Record<string, unknown>): DashboardBackgroundSetting | { error: string } {
  const backgroundId = String(body.backgroundId || "");
  if (!ALLOWED_BACKGROUND_IDS.has(backgroundId)) {
    return { error: "Invalid background selection." };
  }

  if (backgroundId !== "custom") {
    return {
      backgroundId,
      customImageUrl: "",
      customImageSource: "",
      imageOpacity: normalizeImageOpacity(body.imageOpacity),
    };
  }

  const customImageUrl = normalizeImageUrl(body.customImageUrl);
  if (!customImageUrl) {
    return { error: "Custom background must be a valid http or https image URL." };
  }
  const customImageSource = normalizeImageSource(body.customImageSource);
  if (!customImageSource) {
    return { error: "Custom background source is required." };
  }

  return {
    backgroundId,
    customImageUrl,
    customImageSource,
    imageOpacity: normalizeImageOpacity(body.imageOpacity),
  };
}

async function delegatedSharePointGet<T>(accessToken: string, path: string): Promise<T> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured");
  const response = await fetch(`${SP_SITE_URL}${path}`, {
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SharePoint GET ${response.status}`);
  }

  return await response.json() as T;
}

async function verifyAdmin(accessToken: string): Promise<string | null> {
  try {
    const currentUser = await delegatedSharePointGet<SharePointUser>(
      accessToken,
      "/_api/web/currentuser?$select=Email,LoginName",
    );
    const members = await delegatedSharePointGet<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(ADMIN_GROUP)}')/users?$select=LoginName,Email`,
    );
    const currentEmail = String(currentUser.Email || "").toLowerCase();
    const currentLogin = String(currentUser.LoginName || "").toLowerCase();

    const isAdmin = (members.value || []).some((member) => {
      const email = String(member.Email || "").toLowerCase();
      const login = String(member.LoginName || "").toLowerCase();
      const loginEmail = login.split("|").pop() || "";
      return (
        (currentEmail && email === currentEmail) ||
        (currentEmail && loginEmail === currentEmail) ||
        (currentLogin && login === currentLogin)
      );
    });

    return isAdmin ? (currentEmail || currentLogin || "admin") : null;
  } catch (error) {
    logWarn("api:dashboard-background", "Failed to verify admin group membership", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function ensureSettingsList(token: string): Promise<void> {
  await ensureAdminPanelSettingsList(token, SETTINGS_LIST);
}

async function readSetting(token: string): Promise<DashboardBackgroundSetting> {
  try {
    const items = await queryListItems(token, SETTINGS_LIST, { top: 50 });
    const settingItem = items.find((item) => String(item.fields.Title || "") === SETTING_TITLE);
    return normalizeSetting(settingItem?.fields);
  } catch (error) {
    logWarn("api:dashboard-background", "Using default dashboard background", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_SETTING;
  }
}

async function upsertSetting(
  token: string,
  setting: DashboardBackgroundSetting,
  updatedBy: string,
): Promise<DashboardBackgroundSetting> {
  await ensureSettingsList(token);
  const updatedAt = new Date().toISOString();
  const fields = {
    Title: SETTING_TITLE,
    BackgroundId: setting.backgroundId,
    CustomImageUrl: setting.customImageUrl,
    CustomImageSource: setting.customImageSource,
    ImageOpacity: setting.imageOpacity,
    UpdatedBy: updatedBy,
    UpdatedAt: updatedAt,
  };

  const items = await queryListItems(token, SETTINGS_LIST, { top: 50 });
  const existing = items.find((item) => String(item.fields.Title || "") === SETTING_TITLE);
  if (existing) {
    await updateListItemFields(token, SETTINGS_LIST, existing.id, fields);
  } else {
    await createListItem(token, SETTINGS_LIST, fields);
  }

  return {
    ...setting,
    updatedBy,
    updatedAt,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

  try {
    const token = await getGraphToken();

    if (req.method === "GET") {
      const setting = await readSetting(token);
      return res.status(200).json({ setting } as unknown as Record<string, unknown>);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const bearerToken = getBearerToken(req.headers);
    if (!bearerToken) {
      return res.status(401).json({ error: "Missing signed-in user token." });
    }

    const updatedBy = await verifyAdmin(bearerToken);
    if (!updatedBy) {
      return res.status(403).json({ error: "Only admins can change the dashboard background." });
    }

    const requestedSetting = validateRequestedSetting(bodyRecord(req.body));
    if ("error" in requestedSetting) {
      return res.status(400).json({ error: requestedSetting.error });
    }

    const savedSetting = await upsertSetting(token, requestedSetting, updatedBy);
    return res.status(200).json({ setting: savedSetting } as unknown as Record<string, unknown>);
  } catch (error) {
    logError("api:dashboard-background", "Dashboard background request failed", error);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
