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
  colorThemeId: string;
  contrastThemeId: string;
  fontThemeId: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface SharePointUser {
  Email?: string;
  LoginName?: string;
}

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

/**
 * The commit this function was built from, stamped onto every line it logs.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment. Without it there is no
 * way to tell a log line produced by the running build from one produced by a
 * build three deploys ago — the console shows both, the text is all that
 * distinguishes them, and reasoning about which is which from message wording
 * alone wastes an enormous amount of time. A log line that names its own commit
 * ends that argument in one glance.
 */
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local";

/**
 * The SharePoint group whose members may change the appearance.
 *
 * Read from the same variable the browser reads (`src/config/oshes.ts`), and
 * deliberately with no fallback. This was hardcoded to "_HR_ Forms Owners" —
 * the pmw-hrform group — which does not exist on the OSHES site, so
 * `getByName` returned 404, every membership check failed closed, and the save
 * came back 403 for genuine administrators. A guessed name denies access in
 * exactly the same way a genuine non-membership does, which is what made it
 * cost an afternoon to spot; blank at least announces itself below.
 *
 * The client and the server MUST agree here. If they disagree the picker
 * enables its Save button for someone the API will refuse.
 */
const ADMIN_GROUP = (process.env.VITE_OSHES_ADMIN_GROUP || process.env.OSHES_ADMIN_GROUP || "").trim();
const SETTINGS_LIST = OSHES_LISTS.dashboardSettings;
const SETTING_TITLE = "dashboard-background";
const DEFAULT_SETTING: DashboardBackgroundSetting = {
  backgroundId: "theme",
  customImageUrl: "",
  customImageSource: "",
  imageOpacity: 0.22,
  colorThemeId: "pmw",
  contrastThemeId: "paper",
  fontThemeId: "inter",
};
const ALLOWED_BACKGROUND_IDS = new Set([
  "theme",
  "clarity",
  "paper-grid",
  "aurora",
  "workspace",
  "studio",
  "city-glass",
  "horizon",
  "courtyard",
  "prism",
  "custom",
]);

/**
 * Kept in step with `src/theme/appearance.ts` by hand, because the API bundle
 * cannot import from `src/`. The client validates too, so a mismatch here is
 * not a security hole — but an id the server rejects is one the picker can
 * offer and never save, so adding a theme means editing both lists.
 */
const ALLOWED_COLOR_THEMES = new Set(["pmw", "indigo", "teal", "violet", "magenta", "graphite"]);
const ALLOWED_CONTRAST_THEMES = new Set(["paper", "mono", "azure", "sepia", "midnight", "noir"]);
const ALLOWED_FONT_THEMES = new Set(["inter", "system", "editorial", "grotesk", "plex"]);

function pickId(value: unknown, allowed: Set<string>, fallback: string): string {
  const id = typeof value === "string" ? value : "";
  return allowed.has(id) ? id : fallback;
}

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

  // The theme is read even when the background falls back, so an unreachable
  // custom image costs the wallpaper and not the whole look.
  const themes = {
    colorThemeId: pickId(fields?.ColorTheme, ALLOWED_COLOR_THEMES, DEFAULT_SETTING.colorThemeId),
    contrastThemeId: pickId(fields?.ContrastTheme, ALLOWED_CONTRAST_THEMES, DEFAULT_SETTING.contrastThemeId),
    fontThemeId: pickId(fields?.FontTheme, ALLOWED_FONT_THEMES, DEFAULT_SETTING.fontThemeId),
  };

  if (backgroundId === "custom" && !customImageUrl) {
    return { ...DEFAULT_SETTING, ...themes };
  }

  return {
    backgroundId,
    customImageUrl,
    customImageSource,
    imageOpacity: normalizeImageOpacity(fields?.ImageOpacity),
    ...themes,
    updatedBy: fields?.UpdatedBy ? String(fields.UpdatedBy) : undefined,
    updatedAt: fields?.UpdatedAt ? String(fields.UpdatedAt) : undefined,
  };
}

function validateRequestedSetting(body: Record<string, unknown>): DashboardBackgroundSetting | { error: string } {
  const backgroundId = String(body.backgroundId || "");
  if (!ALLOWED_BACKGROUND_IDS.has(backgroundId)) {
    return { error: "Invalid background selection." };
  }

  // An unknown theme id is corrected to the default rather than rejected: it
  // means this deployment is older than the client that sent it, and refusing
  // the whole save would also discard the background choice that came with it.
  const themes = {
    colorThemeId: pickId(body.colorThemeId, ALLOWED_COLOR_THEMES, DEFAULT_SETTING.colorThemeId),
    contrastThemeId: pickId(body.contrastThemeId, ALLOWED_CONTRAST_THEMES, DEFAULT_SETTING.contrastThemeId),
    fontThemeId: pickId(body.fontThemeId, ALLOWED_FONT_THEMES, DEFAULT_SETTING.fontThemeId),
  };

  if (backgroundId !== "custom") {
    return {
      backgroundId,
      customImageUrl: "",
      customImageSource: "",
      imageOpacity: normalizeImageOpacity(body.imageOpacity),
      ...themes,
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
    ...themes,
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

/**
 * Resolve the caller to an administrator, or to null.
 *
 * Every failure here denies, which is correct — but it means an operator
 * misconfiguration and a genuine non-member produce the identical 403, so the
 * log is the only place the difference can show. The cases are separated
 * below and each says what to change, because "Failed to verify admin group
 * membership: SharePoint GET 404" is true, unactionable, and was the entire
 * diagnostic surface the last time this broke.
 */
async function verifyAdmin(accessToken: string): Promise<string | null> {
  if (!ADMIN_GROUP) {
    logWarn("api:dashboard-background", "No admin group configured — refusing every appearance save", {
      build: BUILD,
      fix: "Set VITE_OSHES_ADMIN_GROUP to the SharePoint group title, matching the browser's value.",
    });
    return null;
  }

  let currentUser: SharePointUser;
  try {
    currentUser = await delegatedSharePointGet<SharePointUser>(
      accessToken,
      "/_api/web/currentuser?$select=Email,LoginName",
    );
  } catch (error) {
    // The site itself, or the delegated token. Not about the group.
    logWarn("api:dashboard-background", "Could not read the signed-in SharePoint user", {
      build: BUILD,
      site: SP_SITE_URL,
      errorMessage: error instanceof Error ? error.message : String(error),
      fix: "Check VITE_SP_SITE_URL and that the user's token carries AllSites.Manage for that site.",
    });
    return null;
  }

  let members: { value?: SharePointUser[] };
  try {
    members = await delegatedSharePointGet<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(ADMIN_GROUP)}')/users?$select=LoginName,Email`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // getByName 404s when no group carries that exact Title. It is a name
    // mismatch far more often than a permissions problem, and the name is
    // compared literally — spacing and case included.
    const missingGroup = message.includes("404");
    logWarn("api:dashboard-background", missingGroup
      ? "Admin group not found on this site — no account can be verified"
      : "Could not read admin group membership", {
      build: BUILD,
      adminGroup: ADMIN_GROUP,
      site: SP_SITE_URL,
      errorMessage: message,
      fix: missingGroup
        ? `No SharePoint group is titled "${ADMIN_GROUP}". List the real titles with <site-url>/_api/web/sitegroups?$select=Title and set VITE_OSHES_ADMIN_GROUP to match, in the browser and the server alike.`
        : "Check that the signed-in user may read site groups.",
    });
    return null;
  }

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

  if (!isAdmin) {
    // The ordinary, correct denial: configuration is fine, this account simply
    // is not a member. Logged distinctly so it is never mistaken for the above.
    logWarn("api:dashboard-background", "Account is not in the admin group", {
      build: BUILD,
      adminGroup: ADMIN_GROUP,
      memberCount: (members.value || []).length,
    });
    return null;
  }

  return currentEmail || currentLogin || "admin";
}

/**
 * Make sure the settings list has the columns this route writes.
 *
 * Deliberately not fatal. On a site provisioned before the appearance work the
 * list already exists and only ColorTheme/ContrastTheme/FontTheme are new, so a
 * schema call that fails — most often because the system app may read the list
 * but not alter it — should not sink a save whose columns may well be there
 * already. If they genuinely are missing, the write below fails with a Graph
 * error that names them, which is the more precise complaint anyway.
 */
async function ensureSettingsList(token: string): Promise<void> {
  try {
    await ensureAdminPanelSettingsList(token, SETTINGS_LIST);
  } catch (error) {
    logWarn("api:dashboard-background", "Could not ensure the settings list schema — writing anyway", {
      build: BUILD,
      list: SETTINGS_LIST,
      errorMessage: error instanceof Error ? error.message : String(error),
      fix: `If the write below also fails, add text columns ColorTheme, ContrastTheme and FontTheme to the "${SETTINGS_LIST}" list by hand.`,
    });
  }
}

async function readSetting(token: string): Promise<DashboardBackgroundSetting> {
  try {
    const items = await queryListItems(token, SETTINGS_LIST, { top: 50 });
    const settingItem = items.find((item) => String(item.fields.Title || "") === SETTING_TITLE);
    return normalizeSetting(settingItem?.fields);
  } catch (error) {
    logWarn("api:dashboard-background", "Using default dashboard background", {
      build: BUILD,
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
    ColorTheme: setting.colorThemeId,
    ContrastTheme: setting.contrastThemeId,
    FontTheme: setting.fontThemeId,
    UpdatedBy: updatedBy,
    UpdatedAt: updatedAt,
  };

  const items = await queryListItems(token, SETTINGS_LIST, { top: 50 });
  const existing = items.find((item) => String(item.fields.Title || "") === SETTING_TITLE);

  try {
    if (existing) {
      await updateListItemFields(token, SETTINGS_LIST, existing.id, fields);
    } else {
      await createListItem(token, SETTINGS_LIST, fields);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Graph answers 400 for a field the list has no column for. Since the three
    // theme columns are the only recent additions, that is overwhelmingly what
    // a 400 here means — and "Graph PATCH fields 400: invalidRequest" on its own
    // does not say so.
    const likelyMissingColumns = message.includes("400");
    logWarn("api:dashboard-background", likelyMissingColumns
      ? "The settings list is missing the appearance columns"
      : "Could not write the appearance record", {
      build: BUILD,
      list: SETTINGS_LIST,
      itemId: existing ? existing.id : "(new item)",
      errorMessage: message,
      fix: likelyMissingColumns
        ? `Add single-line text columns named ColorTheme, ContrastTheme and FontTheme to the "${SETTINGS_LIST}" list, or grant the system app permission to alter it so they can be created automatically.`
        : "Check that the system app may write to this list.",
    });
    throw error;
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
  // On every response, including the failures. Answers "which build served
  // this?" from the Network tab, without a dashboard visit and without having
  // to infer it from the wording of a log line.
  res.setHeader("X-Build", BUILD);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });

  // Which step we reached, so a 500 names the stage that failed. Without it the
  // only trace of an unhandled error is "Dashboard background request failed",
  // which is compatible with the app credentials, the site, the list schema and
  // the write all being the culprit.
  let stage = "acquiring the system Graph token";

  try {
    const token = await getGraphToken();

    if (req.method === "GET") {
      stage = "reading the appearance record";
      const setting = await readSetting(token);
      // `adminGroup` is echoed so a GET answers, in one request, both which
      // build is live and which group it will check a save against — the two
      // facts this route has been unable to state about itself.
      return res.status(200).json({
        setting,
        build: BUILD,
        adminGroup: ADMIN_GROUP || null,
      } as unknown as Record<string, unknown>);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const bearerToken = getBearerToken(req.headers);
    if (!bearerToken) {
      return res.status(401).json({ error: "Missing signed-in user token." });
    }

    stage = "verifying admin group membership";
    const updatedBy = await verifyAdmin(bearerToken);
    if (!updatedBy) {
      // Naming the group leaks nothing — VITE_ variables are compiled into the
      // browser bundle, so the client already knows it — and it turns the most
      // common cause of this 403, a group title that does not match the site,
      // into something the reader can act on without opening the server log.
      return res.status(403).json({
        error: ADMIN_GROUP
          ? `Only members of the "${ADMIN_GROUP}" SharePoint group can change the appearance.`
          : "No admin group is configured for this deployment, so the appearance cannot be changed. Set VITE_OSHES_ADMIN_GROUP.",
      });
    }

    const requestedSetting = validateRequestedSetting(bodyRecord(req.body));
    if ("error" in requestedSetting) {
      return res.status(400).json({ error: requestedSetting.error });
    }

    stage = "writing the appearance record";
    const savedSetting = await upsertSetting(token, requestedSetting, updatedBy);
    return res.status(200).json({ setting: savedSetting } as unknown as Record<string, unknown>);
  } catch (error) {
    logError("api:dashboard-background", `Appearance request failed while ${stage}`, error);
    return res.status(500).json({
      // This route is admin-only, and the person who hit it is the person who
      // can fix it. Naming the stage costs nothing and turns a dead end into a
      // starting point; the underlying error stays in the log.
      error: `The appearance could not be saved — the server failed while ${stage}. Check the function log for details.`,
    });
  }
}
