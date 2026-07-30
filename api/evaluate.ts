import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, getSharePointToken, queryListItems, queryListItemById, queryMasterFormByTitle, queryWebFormVersion, updateListItemFields } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { OSHES_LISTS } from "./_utils/oshesConfig.js";
import {
  buildWorkflowActionEmail,
  getApplicationBaseUrl,
  scheduleOrDeliverWorkflowEmail,
  type WorkflowEmailScheduleConfig,
} from "./_utils/workflowEmail.js";

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

interface ApiRequest {
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function rejectedAtLayerStatus(layerNumber: number): string {
  return `Rejected at Layer ${layerNumber}`;
}

const SYSTEM_FIELDS = new Set([
  "id", "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch",
]);

function isWorkflowField(key: string): boolean {
  return SYSTEM_FIELDS.has(key) || /^L\d+_/.test(key);
}

function isTerminalLayerStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized) || normalized.includes("reject");
}

function isTerminalFormStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  return ["completed", "rejected", "cancelled", "fullyapproved"].includes(normalized);
}

function parseSurveyJson(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed.surveyJson || parsed;
  } catch {
    return null;
  }
}

function parseVersionPayload(raw: unknown): { surveyJson: unknown; meta: Record<string, unknown> } {
  if (typeof raw !== "string" || !raw.trim()) return { surveyJson: null, meta: {} };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      surveyJson: parsed.surveyJson || parsed,
      meta: isRecord(parsed.meta) ? parsed.meta : {},
    };
  } catch {
    return { surveyJson: null, meta: {} };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMediaFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const type = typeof element.type === "string" ? element.type : "";
      const name = typeof element.name === "string" ? element.name : "";
      if (name && ["signaturepad", "imageupload", "file"].includes(type)) names.add(name);
      walk(element.elements);
      walk(element.templateElements);
    }
  };
  if (isRecord(root) && Array.isArray(root.pages)) {
    for (const page of root.pages) {
      if (isRecord(page)) walk(page.elements);
    }
  }
  return names;
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toAbsoluteSharePointUrl(value: string): string {
  if (!value || value.startsWith("http") || value.startsWith("data:")) return value;
  if (!value.startsWith("/")) return value;
  try {
    return `${new URL(SP_SITE_URL).origin}${value}`;
  } catch {
    return value;
  }
}

function extractImageSrcFromHtml(value: string): string {
  return value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const separatorIndex = value.search(/,\s+/);
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex).trim();
}

function linkFromRecord(record: Record<string, unknown>): string {
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = record.serverUrl || record.ServerUrl;
  const relativeUrl = record.serverRelativeUrl || record.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function mediaSourcesFromValue(value: unknown): string[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) return normalized.flatMap(mediaSourcesFromValue);
  if (isRecord(normalized)) {
    const link = linkFromRecord(normalized);
    return link ? [link] : [];
  }
  if (typeof normalized !== "string") return [];
  const trimmed = normalized.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("data:image/")) return [trimmed];
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  if (/^(https?:\/\/|\/)/i.test(candidate)) return [toAbsoluteSharePointUrl(candidate)];
  return [];
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(serverRelativeUrl.replace(/'/g, "''")).replace(/%2F/gi, "/");
}

function serverRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const siteUrl = new URL(SP_SITE_URL);
      const mediaUrl = new URL(trimmed);
      if (siteUrl.origin.toLowerCase() !== mediaUrl.origin.toLowerCase()) return "";
      return decodeURIComponent(mediaUrl.pathname);
    }
  } catch {
    return "";
  }
  return trimmed.startsWith("/") ? decodeURIComponent(trimmed.split(/[?#]/)[0] ?? trimmed) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverPath = serverRelativePath(value);
  if (!serverPath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverPath)}')/$value`;
}

async function sourceToDataUrl(token: string, source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const requestUrl = sharePointFileValueUrl(source) || source;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) return source;
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function buildMediaSrcByField(surveyJson: unknown, fields: Record<string, unknown>): Promise<Record<string, string | string[]>> {
  const mediaFields = collectMediaFieldNames(surveyJson);
  if (mediaFields.size === 0) return {};
  let spToken = "";
  const result: Record<string, string | string[]> = {};

  for (const fieldName of mediaFields) {
    const sources = mediaSourcesFromValue(fields[fieldName]);
    if (sources.length === 0) continue;
    const converted: string[] = [];
    for (const source of sources) {
      try {
        if (!spToken) spToken = await getSharePointToken();
        converted.push(await sourceToDataUrl(spToken, source));
      } catch {
        converted.push(source);
      }
    }
    result[fieldName] = converted.length === 1 ? converted[0] : converted;
  }

  return result;
}

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const { token } = req.query as { token?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token query parameter" });
  }

  try {
    const graphToken = await getGraphToken();

    // Find the token in all Master Form items
    const masterItems = await queryListItems(graphToken, OSHES_LISTS.masterForm, { top: 500 });
    let foundToken: Record<string, unknown> | null = null;
    let foundFormTitle = "";
    let foundLayerNumber = 0;
    let layerConfig: { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null = null;

    for (const form of masterItems) {
      const rawLayerConfig = form.fields.LayerConfig as string | undefined;
      if (!rawLayerConfig) continue;
      try {
        const parsed = JSON.parse(rawLayerConfig) as { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] };
        const searchableLayers = [
          ...(parsed.layers ?? []),
          ...((parsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
        ];
        for (const layer of searchableLayers) {
          if (layer.publicToken === token) {
            foundToken = layer;
            foundFormTitle = form.fields.Title as string;
            foundLayerNumber = layer.layerNumber as number;
            layerConfig = parsed;
            break;
          }
        }
      } catch { /* invalid JSON, skip */ }
      if (foundToken) break;
    }

    if (!foundToken) return res.status(404).json({ error: "Token not found" });
    if (foundToken.tokenExpiresAt && new Date(foundToken.tokenExpiresAt as string) < new Date()) {
      return res.status(403).json({ error: "Token has expired" });
    }

    // The caller must provide the response item ID
    const responseItemId = req.query.responseItemId ? Number(req.query.responseItemId) : undefined;
    if (!responseItemId) return res.status(400).json({ error: "Missing responseItemId query parameter" });

    const responseListName = `${foundFormTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(responseItemId));
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });

    // Filter fields based on layer visibility
    const visibleFields: Record<string, unknown> = {};
    const allFields = responseItem.fields || {};
    const selectedBranch = typeof allFields.SelectedBranch === "string" ? allFields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfig?.manualBranches?.length) {
        const branch = layerConfig.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfig?.layers ?? [];
    })();
    const previousLayerSummaries = activeLayers
      .filter((layer) => Number(layer.layerNumber) < foundLayerNumber)
      .map((layer) => ({
        layerNumber: layer.layerNumber,
        type: layer.type,
        title: typeof layer.title === "string" ? layer.title : "",
        description: typeof layer.description === "string" ? layer.description : "",
        surveyElements: Array.isArray(layer.surveyElements) ? layer.surveyElements : [],
      }));

    // Include submission metadata always
    for (const key of ["Title", "SubmittedBy", "SubmittedAt", "FormVersion", "FormID", "Status", "FormStatus", "CurrentLayer", "CurrentApprovalLayer"]) {
      if (allFields[key] !== undefined) visibleFields[key] = allFields[key];
    }

    // Include submitted form fields, but not workflow/system columns.
    for (const [key, value] of Object.entries(allFields)) {
      if (!isWorkflowField(key) && value !== null && value !== undefined) {
        visibleFields[key] = value;
      }
    }

    // Include previous layer results (layers < current layer)
    if (activeLayers.length > 0) {
      for (const layer of activeLayers) {
        const n = layer.layerNumber as number;
        if (n < foundLayerNumber) {
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_SignedAt`] = allFields[`L${n}_SignedAt`];
        } else if (n === foundLayerNumber) {
          // Current layer — include status
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
        }
        // Future layers (n > foundLayerNumber) — HIDDEN
      }

      // Include evaluation data for previous layers only
      const rawEvalData = allFields.EvaluationData as string | undefined;
      if (rawEvalData) {
        try {
          const allEval = JSON.parse(rawEvalData) as Record<string, unknown>;
          const visibleEval: Record<string, unknown> = {};
          for (const layer of activeLayers) {
            const n = layer.layerNumber as number;
            if (n < foundLayerNumber && allEval[String(n)]) {
              visibleEval[String(n)] = allEval[String(n)];
            }
          }
          visibleFields.EvaluationData = JSON.stringify(visibleEval);
        } catch { /* invalid JSON, skip */ }
      }
    }

    let surveyJson: unknown = null;
    let versionMeta: Record<string, unknown> = {};
    const formVersion = String(allFields.FormVersion || "");
    if (formVersion) {
      const versionRow = (await queryWebFormVersion(graphToken, foundFormTitle, formVersion))?.fields;
      const parsedVersion = parseVersionPayload(versionRow?.SurveyJSON);
      surveyJson = parsedVersion.surveyJson || parseSurveyJson(versionRow?.SurveyJSON);
      versionMeta = parsedVersion.meta;
    }
    const mediaSrcByField = await buildMediaSrcByField(surveyJson, visibleFields);

    return res.status(200).json({
      success: true,
      data: {
        formTitle: foundFormTitle,
        layerNumber: foundLayerNumber,
        totalLayers: activeLayers.length || 0,
        layerType: foundToken.type || "approval",
        layerTitle: foundToken.title || "",
        layerDescription: foundToken.description || "",
        layerStatus: allFields[`L${foundLayerNumber}_Status`] || "",
        formStatus: allFields.FormStatus || allFields.Status || "",
        surveyElements: Array.isArray(foundToken.surveyElements) ? foundToken.surveyElements : [],
        previousLayerSummaries,
        confirmationLabel: foundToken.confirmationLabel || "",
        confirmationType: foundToken.confirmationType || "",
        surveyJson,
        logoUrl: typeof versionMeta.logoUrl === "string" ? versionMeta.logoUrl : "",
        mediaSrcByField,
        fields: visibleFields,
      },
    });
  } catch (err) {
    logError("api:evaluate:get", "Failed to load public evaluation data", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, layerNumber, formTitle, responseItemId, fields, action, signature, rejection } = req.body;
  const safeResponseItemId = Number(responseItemId);
  if (!safeResponseItemId) return res.status(400).json({ error: "Invalid responseItemId" });

  // Validate required fields
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing or invalid public token" });
  }
  if (!formTitle || typeof formTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid formTitle" });
  }
  if (!layerNumber || typeof layerNumber !== "number") {
    return res.status(400).json({ error: "Missing or invalid layerNumber" });
  }
  if (typeof action !== "string" || !["approve", "reject", "confirm"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve', 'reject', or 'confirm'" });
  }

  try {
    const graphToken = await getGraphToken();

    // 1. Load Master Form to find the layer config + validate token
    const formConfig = (await queryMasterFormByTitle(graphToken, formTitle))?.fields;
    if (!formConfig) return res.status(404).json({ error: "Form not found" });

    // Parse LayerConfig
    let layerConfigParsed: { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null = null;
    const rawLayerConfig = formConfig.LayerConfig as string | undefined;
    if (rawLayerConfig) {
      try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch { /* invalid JSON, fall through */ }
    }
    if (!layerConfigParsed?.layers) return res.status(400).json({ error: "Form has no layer config" });

    // Find the layer by number
    const searchableLayers = [
      ...(layerConfigParsed.layers ?? []),
      ...((layerConfigParsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
    ];
    const layer = searchableLayers.find((l) => l.layerNumber === layerNumber && l.publicToken === token) as Record<string, unknown> | undefined;
    if (!layer) return res.status(404).json({ error: `Layer ${layerNumber} not found in config` });

    // Validate the token
    if (layer.tokenExpiresAt && new Date(layer.tokenExpiresAt as string) < new Date()) {
      return res.status(403).json({ error: "Token has expired" });
    }

    // 2. Fetch the response item using Graph API
    const responseListName = `${formTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(safeResponseItemId));
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });
    const latestCurrentLayer = Number(responseItem.fields.CurrentLayer || responseItem.fields.CurrentApprovalLayer || 0);
    const latestLayerStatus = responseItem.fields[`L${layerNumber}_Status`];
    if (isTerminalFormStatus(responseItem.fields.FormStatus || responseItem.fields.Status) || isTerminalLayerStatus(latestLayerStatus)) {
      return res.status(409).json({ error: "This layer has already been completed and cannot be submitted again." });
    }
    if (latestCurrentLayer && latestCurrentLayer !== layerNumber) {
      return res.status(409).json({ error: "This evaluation link is no longer active for the current workflow layer." });
    }

    const selectedBranch = typeof responseItem.fields.SelectedBranch === "string" ? responseItem.fields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfigParsed?.manualBranches?.length) {
        const branch = layerConfigParsed.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfigParsed?.layers ?? [];
    })();

    // 3. Build update payload based on action
    const updates: Record<string, unknown> = {};
    let notificationNextLayer: Record<string, unknown> | undefined;
    const now = new Date().toISOString();

    if (action === "approve" || action === "confirm") {
      updates[`L${layerNumber}_Status`] = action === "approve" ? "Approved" : "Confirmed";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (signature) updates[`L${layerNumber}_Signature`] = signature;

      // For evaluation layers: also write to EvaluationData JSON
      if (layer.type === "evaluation" && fields) {
        // Read existing EvaluationData if any
        let evalData: Record<string, unknown> = {};
        if (responseItem.fields.EvaluationData) {
          try { evalData = JSON.parse(responseItem.fields.EvaluationData as string); } catch { /* invalid JSON, start fresh */ }
        }
        evalData[String(layerNumber)] = {
          confirmerEmail: "SYSTEM",
          confirmerName: null,
          confirmedAt: now,
          status: "confirmed",
          fields: fields,
          signatureUrl: signature || null,
        };
        updates.EvaluationData = JSON.stringify(evalData);
      }

      // Advance to next layer or complete
      const sortedLayers = [...activeLayers].sort((a, b) => Number(a.layerNumber) - Number(b.layerNumber));
      const currentIndex = sortedLayers.findIndex((candidate) => candidate.layerNumber === layerNumber);
      const nextLayer = currentIndex >= 0 ? sortedLayers[currentIndex + 1] : sortedLayers.find((candidate) => Number(candidate.layerNumber) > layerNumber);
      notificationNextLayer = nextLayer;
      if (nextLayer) {
        updates.CurrentLayer = nextLayer.layerNumber;
        updates.CurrentApprovalLayer = nextLayer.layerNumber;
        updates.FormStatus = "In Review";
      } else {
        updates.FormStatus = "Completed";
        updates.CurrentLayer = layerNumber;
        updates.CurrentApprovalLayer = layerNumber;
      }
    } else if (action === "reject") {
      updates[`L${layerNumber}_Status`] = "Rejected";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (rejection) updates[`L${layerNumber}_Rejection`] = rejection;
      updates.FormStatus = "Rejected";
      updates.Status = "Rejected";
      updates.CurrentLayer = layerNumber;
      updates.CurrentApprovalLayer = layerNumber;
      for (const futureLayer of activeLayers) {
        const n = Number(futureLayer.layerNumber);
        if (n <= layerNumber) continue;
        updates[`L${n}_Status`] = rejectedAtLayerStatus(layerNumber);
      }
    }

    // 4. Update the response item
    await updateListItemFields(graphToken, responseListName, responseItem.id, updates);

    if (notificationNextLayer) {
      const nextLayerNumber = Number(notificationNextLayer.layerNumber);
      const recipient = String(responseItem.fields[`L${nextLayerNumber}_Email`] || "").trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        const appBaseUrl = getApplicationBaseUrl();
        const formSlug = String(formConfig.Slug || "").trim();
        const publicToken = String(notificationNextLayer.publicToken || "").trim();
        const reviewLink = notificationNextLayer.authMode === "public" && publicToken
          ? `${appBaseUrl}/eval/${encodeURIComponent(publicToken)}?item=${safeResponseItemId}`
          : `${appBaseUrl}/eval/${encodeURIComponent(formSlug)}/${safeResponseItemId}/${nextLayerNumber}`;
        try {
          await scheduleOrDeliverWorkflowEmail(
            graphToken,
            buildWorkflowActionEmail({
              formTitle,
              submittedBy: String(responseItem.fields.SubmittedBy || "Public respondent"),
              responseItemId: safeResponseItemId,
              layer: nextLayerNumber,
              totalLayers: activeLayers.length,
              recipient,
              layerType: notificationNextLayer.type === "evaluation" ? "evaluation" : "approval",
              reviewLink,
            }),
            {
              listTitle: responseListName,
              responseItemId: responseItem.id,
              layer: nextLayerNumber,
            },
            notificationNextLayer.type === "evaluation"
              ? notificationNextLayer.emailSchedule as WorkflowEmailScheduleConfig | undefined
              : undefined,
            {
              layer: nextLayerNumber,
              layerType: notificationNextLayer.type === "evaluation" ? "evaluation" : "approval",
              totalLayers: activeLayers.length,
              reviewLink,
              submittedBy: String(responseItem.fields.SubmittedBy || "Public respondent"),
            },
          );
        } catch (emailError) {
          logWarn("api:evaluate", "Next workflow email delivery failed", {
            formTitle,
            responseItemId: safeResponseItemId,
            layer: nextLayerNumber,
            errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logError("api:evaluate", "Failed to submit public evaluation action", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}
