import type { DiscoveredList, ListMetaEntry, LoadedConfig, SharePointClient, LayerConfig, SurveyJson } from "../types";
import { OSHES_APP, OSHES_LISTS } from "../config/oshes";

const ADMIN_GROUP = OSHES_APP.adminGroup;
const AUDITOR_GROUP = OSHES_APP.auditorGroup;

const EXCLUDE_ALWAYS = [
  "Style Library",
  "Site Assets",
  OSHES_LISTS.approvers,
  OSHES_LISTS.masterForm,
  "Submission Log",
  "Approval Log",
  "Site Pages",
  "Form Templates",
  "Preservation Hold Library",
  "Pages",
  "Images",
  "Form Documents",
  "Form Config",
] as const;

export const SP_STATIC = {
  adminGroup: ADMIN_GROUP,
  auditorGroup: AUDITOR_GROUP,
  statusColumn: null,
  excludeAlways: [...EXCLUDE_ALWAYS],
} as const;

const META_PALETTES = [
  { color: "#1a73e8", pale: "#e8f0fe" },
  { color: "#34a853", pale: "#e6f4ea" },
  { color: "#fbbc04", pale: "#fef7e0" },
  { color: "#ea4335", pale: "#fce8e6" },
  { color: "#9c27b0", pale: "#f3e5f5" },
  { color: "#ff6d00", pale: "#fff3e0" },
  { color: "#00897b", pale: "#e0f2f1" },
  { color: "#5c6bc0", pale: "#e8eaf6" },
] as const;

const ICON_POOL = [
  "Description",
  "Assignment",
  "FactCheck",
  "HowToReg",
  "Verified",
  "Approval",
  "TaskAlt",
  "CheckCircle",
  "Gavel",
  "Policy",
  "Security",
  OSHES_LISTS.dashboardSettings,
  OSHES_LISTS.versions,
  OSHES_LISTS.builderLog,
  "WorkOutline",
  "BusinessCenter",
  "Engineering",
  "Build",
  "Construction",
  "Handyman",
  "HomeRepairService",
  "Plumbing",
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateMeta(listTitle: string): ListMetaEntry {
  const hash = hashString(listTitle);
  const paletteIndex = hash % META_PALETTES.length;
  const iconIndex = (hash >> 8) % ICON_POOL.length;

  const palette = META_PALETTES[paletteIndex];
  const icon = ICON_POOL[iconIndex];

  return {
    icon,
    color: palette.color,
    pale: palette.pale,
    category: "General",
  };
}

export async function loadConfig(
  spClient: SharePointClient
): Promise<LoadedConfig> {
  const layerConfig: Record<string, number> = {};
  const formIdMap: Record<string, string> = {};
  const listMetaMap: Record<string, ListMetaEntry> = {};
  const allowedTitles = new Set<string>();
  const layerConfigs: Record<string, LayerConfig | null> = {};
  const surveyJsonByFormVersion: Record<string, Record<string, SurveyJson | null>> = {};

  try {
    const configItems = await spClient.queryList(OSHES_LISTS.masterForm, {
      select: ["Title", "FormID", "CurrentVersion", "NumberOfApprovalLayer", "ConditionField", "ApprovalRules", "LayerConfig", "IsPublished"],
    });

    for (const item of configItems) {
      const title = String(item.Title || "");
      const formId = String(item.FormID || "");
      const totalLayers = Number(item.NumberOfApprovalLayer) || 1;

      if (!title) continue;

      // Skip draft forms — only published forms appear in dashboards
      if (item.IsPublished === false) continue;

      allowedTitles.add(title);
      layerConfig[title] = totalLayers;
      formIdMap[title] = formId;
      listMetaMap[title] = generateMeta(title);

      // Parse LayerConfig JSON if present
      let parsedLayerConfig: LayerConfig | null = null;
      const rawLayerConfig = item.LayerConfig;
      if (rawLayerConfig && typeof rawLayerConfig === 'string' && rawLayerConfig.trim()) {
        try {
          parsedLayerConfig = JSON.parse(rawLayerConfig) as LayerConfig;
        } catch {
          // Invalid JSON — ignore, will fall back to legacy conversion
        }
      }

      // If no valid LayerConfig, try legacy conversion from NumberOfApprovalLayer + ApprovalRules
      if (!parsedLayerConfig && totalLayers > 0) {
        parsedLayerConfig = legacyToLayerConfig(
          totalLayers,
          typeof item.ApprovalRules === 'string' ? item.ApprovalRules : null,
          typeof item.ConditionField === 'string' ? item.ConditionField : null,
        );
      }

      layerConfigs[title] = parsedLayerConfig;
    }
  } catch {
    // Master Form list may not exist yet
  }

  try {
    const versionItems = await spClient.queryList(OSHES_LISTS.versions, {
      select: ["FormTitle", "FormVersion", "SurveyJSON"],
      top: 5000,
    });

    for (const item of versionItems) {
      const formTitle = String(item.FormTitle || "");
      const formVersion = String(item.FormVersion || "");
      const rawSurveyJson = item.SurveyJSON;
      if (!formTitle || !formVersion || typeof rawSurveyJson !== "string" || !rawSurveyJson.trim()) continue;

      let parsedSurveyJson: SurveyJson | null = null;
      try {
        const parsed = JSON.parse(rawSurveyJson) as { surveyJson?: unknown; pages?: unknown };
        const candidate = parsed.surveyJson ?? parsed;
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && Array.isArray((candidate as { pages?: unknown }).pages)) {
          parsedSurveyJson = candidate as SurveyJson;
        }
      } catch {
        parsedSurveyJson = null;
      }

      if (!surveyJsonByFormVersion[formTitle]) surveyJsonByFormVersion[formTitle] = {};
      surveyJsonByFormVersion[formTitle][formVersion] = parsedSurveyJson;
    }
  } catch {
    // Web Form Versions list may not exist yet
  }

  return {
    layerConfig,
    formIdMap,
    listMetaMap,
    allowedTitles,
    layerConfigs,
    surveyJsonByFormVersion,
  };
}

// SharePoint BaseTemplate values for system lists to always exclude (both user & admin)
// Source: https://learn.microsoft.com/sharepoint/dev/sp-add-ins/working-with-lists-and-list-items-with-rest
const SYSTEM_BASE_TEMPLATES = new Set([
  109,  // PictureLibrary
  111,  // WebTemplateCatalog (Web Part Gallery / List Template Catalog)
  112,  // UserInfo (User Information List)
  113,  // WebPartCatalog
  114,  // ListTemplateCatalog
  116,  // MasterPageCatalog
  119,  // WebPageLibrary (Site Pages / Wiki Page Library)
  130,  // DataConnectionLibrary
  140,  // WorkflowHistory
  212,  // WorkflowProcess
  300,  // SharePointServerPublishing (Publishing Infrastructure)
  850,  // Pages (Publishing)
]);

export function filterVisibleLists(
  discoveredLists: DiscoveredList[],
  _isAdmin: boolean,
  allowedTitles: Set<string>
): DiscoveredList[] {
  return discoveredLists.filter((list) => {
    const title = list.title;

    // Always exclude lists marked Hidden in SharePoint (both user & admin)
    if (list.hidden) {
      return false;
    }

    // Always exclude system BaseTemplate types (both user & admin)
    if (SYSTEM_BASE_TEMPLATES.has(list.baseTemplate)) {
      return false;
    }

    // Always exclude by SharePoint's own system flags (both user & admin)
    if (list.isCatalog || list.isSiteAssetsLibrary || list.isApplicationList || list.isSystemList || list.noCrawl) {
      return false;
    }

    // Always exclude by name as a fallback (both user & admin)
    if ((EXCLUDE_ALWAYS as readonly string[]).includes(title)) {
      return false;
    }

    // Only show lists that have a matching entry in Master Form (form-builder created)
    return allowedTitles.has(title);
  });
}

export function getMissingConfigs(
  visibleLists: { title: string }[],
  layerConfig: Record<string, number>
): string[] {
  return visibleLists
    .map((list) => list.title)
    .filter((title) => !(title in layerConfig));
}

// ── Legacy Migration Helper ─────────────────────────────────────────────────

/**
 * Converts legacy approval config (NumberOfApprovalLayer + ApprovalRules)
 * to the new LayerConfig format.
 *
 * Each legacy approval layer becomes an approval layer with "365" auth
 * and "signature" confirmation. The assignee uses "field-reference" type
 * pointing to the old L{n}_Email column concept.
 *
 * If approvalRules exists, ConditionalRouting entries are created.
 */
export function legacyToLayerConfig(
  numLayers: number,
  approvalRulesStr?: string | null,
  conditionField?: string | null,
): LayerConfig {
  const layers: LayerConfig["layers"] = [];

  for (let i = 1; i <= numLayers; i++) {
    layers.push({
      layerNumber: i,
      type: "approval",
      authMode: "365",
      assignee: { type: "field-reference", value: `L${i}_Email` },
      confirmationType: "signature",
      allowRejectionReason: true,
      title: `Layer ${i}`,
    });
  }

  const result: LayerConfig = {
    version: "1.0",
    layers,
  };

  // Parse conditional routing if ApprovalRules is present
  if (approvalRulesStr && approvalRulesStr.trim()) {
    try {
      const rules = JSON.parse(approvalRulesStr);
      if (Array.isArray(rules) && rules.length > 0 && conditionField) {
        result.routing = rules.map((rule: { when?: string; skipLayers?: number[] }) => ({
          conditionField: conditionField,
          rules: [{ when: rule.when ?? "", skipLayers: rule.skipLayers ?? [] }],
        }));
      }
    } catch {
      // Invalid ApprovalRules JSON — skip routing
    }
  }

  return result;
}
