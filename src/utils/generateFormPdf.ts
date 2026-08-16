/**
 * generateFormPdf.ts — Generates PDF, uploads to SharePoint, stores URL on
 * the response item, and opens in a new tab for viewing.
 */
import { pdf } from "@react-pdf/renderer";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "./FormPdfDocument";
import { uploadFormPdf, deleteFormPdf, spPatch, ensurePdfUrlColumn, readMatrixChildItems } from "./formBuilderSP";
import type { MatrixColumnDef } from "./formBuilderSP";
import { fetchWithAuthRecovery } from "./authRecovery";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// ── Layer data extraction ──────────────────────────────────────────────────

function parseLayerConfig(layerConfig: unknown): Record<string, unknown> | null {
  if (typeof layerConfig === "string" && layerConfig.trim()) {
    try {
      const parsed = JSON.parse(layerConfig) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(layerConfig) ? layerConfig : null;
}

function layerNumberFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function branchMatches(branch: Record<string, unknown>, selectedBranch: string): boolean {
  const selected = selectedBranch.trim().toLowerCase();
  if (!selected) return false;
  return [branch.name, branch.label].some((value) => typeof value === "string" && value.trim().toLowerCase() === selected);
}

function layerSequenceFromConfig(layerConfig: unknown, selectedBranchRaw: unknown): Record<string, unknown>[] {
  const parsed = parseLayerConfig(layerConfig);
  if (!parsed) return [];

  const selectedBranch = typeof selectedBranchRaw === "string" ? selectedBranchRaw : "";
  const manualBranches = Array.isArray(parsed.manualBranches) ? parsed.manualBranches.filter(isRecord) : [];
  const selectedManualBranch = manualBranches.find((branch) => branchMatches(branch, selectedBranch));
  if (selectedManualBranch && Array.isArray(selectedManualBranch.layers)) {
    return selectedManualBranch.layers.filter(isRecord);
  }

  const layers = Array.isArray(parsed.layers) ? parsed.layers.filter(isRecord) : [];
  const byLayerNumber = new Map<number, Record<string, unknown>>();
  for (const layer of layers) {
    const layerNumber = layerNumberFromValue(layer.layerNumber);
    if (layerNumber !== null) byLayerNumber.set(layerNumber, layer);
  }
  for (const branch of manualBranches) {
    if (!Array.isArray(branch.layers)) continue;
    for (const layer of branch.layers.filter(isRecord)) {
      const layerNumber = layerNumberFromValue(layer.layerNumber);
      if (layerNumber !== null && !byLayerNumber.has(layerNumber)) byLayerNumber.set(layerNumber, layer);
    }
  }

  return [...byLayerNumber.values()].sort((a, b) => (layerNumberFromValue(a.layerNumber) ?? 0) - (layerNumberFromValue(b.layerNumber) ?? 0));
}

function evaluationElementsByLayer(layerConfig: unknown, selectedBranch: unknown): Map<number, Record<string, unknown>[]> {
  const result = new Map<number, Record<string, unknown>[]>();
  for (const layer of layerSequenceFromConfig(layerConfig, selectedBranch)) {
    if (layer.type !== "evaluation") continue;
    const layerNumber = layerNumberFromValue(layer.layerNumber);
    if (layerNumber === null || !Array.isArray(layer.surveyElements)) continue;
    result.set(layerNumber, layer.surveyElements.filter(isRecord));
  }
  return result;
}

/**
 * Build layer results array from the raw response item fields.
 * Reads L{n}_Status, L{n}_Email, L{n}_SignedAt, L{n}_Rejection, L{n}_Signature
 * and EvaluationData to produce PdfLayerResult[].
 */
export function buildPdfLayerResults(
  rawResponse: Record<string, unknown>,
  maxLayerCount = 10,
  layerConfig?: unknown,
): PdfLayerResult[] {
  const results: PdfLayerResult[] = [];
  const evalElementsByLayer = evaluationElementsByLayer(layerConfig, rawResponse.SelectedBranch);

  // Parse EvaluationData JSON if present
  let evalData: Record<number, Record<string, unknown>> = {};
  const rawEval = rawResponse.EvaluationData as string | undefined;
  if (rawEval) {
    try { evalData = JSON.parse(rawEval) as Record<number, Record<string, unknown>>; } catch { /* ignore */ }
  }

  for (let n = 1; n <= maxLayerCount; n++) {
    const status = rawResponse[`L${n}_Status`] as string | undefined;
    if (!status) continue; // No more layers

    // Determine type — evaluation layers have entries in EvaluationData
    const evaluationSurveyElements = evalElementsByLayer.get(n);
    const isEval = !!evalData[n] || !!evaluationSurveyElements;

    const entry: PdfLayerResult = {
      layerNumber: n,
      type: isEval ? "evaluation" : "approval",
      status,
      // On a layer shared by several people, the primary L{n}_Email is not
      // necessarily who decided — the record should name the person who did.
      email: (rawResponse[`L${n}_ActedBy`] as string) || (rawResponse[`L${n}_Email`] as string) || "",
      signedAt: (rawResponse[`L${n}_SignedAt`] as string) || undefined,
      rejection: (rawResponse[`L${n}_Rejection`] as string) || undefined,
      signature: (rawResponse[`L${n}_Signature`] as string) || undefined,
    };

    // For evaluation layers, extract evaluation fields
    if (isEval && evalData[n]) {
      const ed = evalData[n] as Record<string, unknown>;
      entry.evaluationFields = ed.fields as Record<string, unknown> || {};
      entry.evaluationSurveyElements = evaluationSurveyElements;
      entry.confirmerEmail = ed.confirmerEmail as string || "";
      entry.confirmerName = ed.confirmerName as string || "";
    } else if (isEval) {
      entry.evaluationSurveyElements = evaluationSurveyElements;
    }

    results.push(entry);
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Find all dynamicmatrix/tableinput fields with their column definitions in the survey JSON. */
function findMatrixFields(surveyJson: PdfFormData["surveyJson"]): { name: string; columns: MatrixColumnDef[] }[] {
  const result: { name: string; columns: MatrixColumnDef[] }[] = [];
  const pages = surveyJson?.pages ?? [];
  const childKeys = ["elements", "templateElements", "questions"] as const;

  const asElementArray = (value: unknown): Record<string, unknown>[] => {
    return Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
      : [];
  };

  const walkElements = (els: Record<string, unknown>[]) => {
    for (const el of els) {
      const t = el.type as string | undefined;
      if (t === "dynamicmatrix" || t === "matrixdynamic" || t === "tableinput") {
        const name = el.name as string | undefined;
        const cols = (el.columns as MatrixColumnDef[]) || [];
        if (name && cols.length > 0) result.push({ name, columns: cols });
      }

      for (const childKey of childKeys) {
        const children = asElementArray(el[childKey]);
        if (children.length > 0) walkElements(children);
      }

      if (t !== "dynamicmatrix" && t !== "matrixdynamic" && t !== "tableinput") {
        for (const column of asElementArray(el.columns)) {
          const columnElements = asElementArray(column.elements);
          if (columnElements.length > 0) walkElements(columnElements);
        }
      }
    }
  };
  for (const page of pages) {
    if (page.elements) walkElements(page.elements);
  }
  return result;
}

/**
 * Sanitize a field name for use in a SharePoint child list name.
 * Mirrors the sanitization in ensureMatrixChildList.
 */
function sanitizeMatrixFieldName(fieldName: string): string {
  return fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isImageSource(value: string): boolean {
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(trimmed);
}

function isSharePointSource(value: string, siteUrl = SP_SITE_URL): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return false;
  if (/^\/(sites|teams)\//i.test(trimmed)) return true;
  try {
    const site = new URL(siteUrl);
    const candidate = new URL(trimmed, site.origin);
    return candidate.origin.toLowerCase() === site.origin.toLowerCase();
  } catch {
    return false;
  }
}

function extractImageSrcFromHtml(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i);
  return match?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/,\s+/);
  if (separatorIndex === -1) return trimmed;
  return trimmed.slice(0, separatorIndex).trim();
}

function toAbsoluteSharePointUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  if (!/^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(url)) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(escapeODataString(serverRelativeUrl)).replace(/%2F/gi, "/");
}

function sharePointServerRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  const cleanValue = splitSharePointUrlFieldValue(trimmed).split(/[?#]/)[0] ?? trimmed;
  const isSharePointRelativePath = /^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(cleanValue);

  try {
    if (/^https?:\/\//i.test(cleanValue)) {
      const siteUrl = new URL(SP_SITE_URL);
      const imageUrl = new URL(cleanValue);
      if (siteUrl.origin.toLowerCase() !== imageUrl.origin.toLowerCase()) return "";
      if (!/^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(imageUrl.pathname)) return "";
      return decodeURIComponent(imageUrl.pathname);
    }
  } catch {
    return "";
  }

  return isSharePointRelativePath ? decodeURIComponent(cleanValue) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverRelativePath = sharePointServerRelativePath(value);
  if (!serverRelativePath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverRelativePath)}')/$value`;
}

/**
 * Some SharePoint Online tenants don't honor bearer-token auth on the
 * getFileByServerRelativePath `/$value` endpoint (it can 401 or redirect to
 * an HTML sign-in page while returning 200). `_layouts/15/download.aspx` is
 * a second, independently-authed download route that reliably accepts the
 * same bearer token, so we fall back to it before giving up.
 */
function sharePointDownloadAspxUrl(value: string): string {
  const serverRelativePath = sharePointServerRelativePath(value);
  if (!serverRelativePath) return "";
  return `${SP_SITE_URL}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(serverRelativePath)}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

async function imageSourceToDataUrl(token: string, source: string, cache: Map<string, string>): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed || trimmed.startsWith("data:image/")) return trimmed;
  const absolute = toAbsoluteSharePointUrl(trimmed);
  const cached = cache.get(absolute);
  if (cached) return cached;

  const authHeaders = { Authorization: `Bearer ${token}`, Accept: "*/*" };
  const candidateUrls = [
    sharePointFileValueUrl(absolute),
    sharePointDownloadAspxUrl(absolute),
  ].filter((url): url is string => !!url);
  candidateUrls.push(absolute);

  for (const requestUrl of candidateUrls) {
    try {
      const response = await fetchWithAuthRecovery(requestUrl, {
        headers: requestUrl !== absolute || isSharePointSource(absolute) ? authHeaders : undefined,
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) continue;
      const dataUrl = await blobToDataUrl(blob);
      cache.set(absolute, dataUrl);
      return dataUrl;
    } catch {
      continue;
    }
  }
  console.warn(`PDF image hydration failed for all candidate URLs; embedding unresolved source: ${absolute}`);
  return absolute;
}

function imageSourceFromString(value: string, siteUrl = SP_SITE_URL): string {
  const trimmed = value.trim();
  const parsed = parseMaybeJson(trimmed);
  if (parsed !== null) {
    if (typeof parsed === "string") return imageSourceFromString(parsed, siteUrl);
    if (isRecord(parsed)) {
      for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
        const nested = parsed[key];
        if (typeof nested === "string") {
          const source = imageSourceFromString(nested, siteUrl);
          if (source) return source;
        }
      }
    }
    return "";
  }
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  return isImageSource(candidate) || isSharePointSource(candidate, siteUrl) ? candidate : "";
}

async function hydrateImageValue(token: string, value: unknown, cache: Map<string, string>): Promise<unknown> {
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value);
    if (parsed !== null) return hydrateImageValue(token, parsed, cache);
    const source = imageSourceFromString(value);
    return source ? imageSourceToDataUrl(token, source, cache) : value;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => hydrateImageValue(token, entry, cache)));
  }

  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = { ...value };
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const raw = next[key];
    if (typeof raw === "string") {
      const source = imageSourceFromString(raw);
      if (source) next[key] = await imageSourceToDataUrl(token, source, cache);
    }
  }

  const serverUrl = next.serverUrl || next.ServerUrl;
  const relativeUrl = next.serverRelativeUrl || next.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const combined = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    if (isImageSource(combined) || isSharePointSource(combined)) {
      next.url = await imageSourceToDataUrl(token, combined, cache);
    }
  }

  return next;
}

async function hydratePdfImages(token: string, data: PdfFormData): Promise<void> {
  const cache = new Map<string, string>();
  const entries = await Promise.all(
    Object.entries(data.responseData).map(async ([key, value]) => [key, await hydrateImageValue(token, value, cache)] as const),
  );
  data.responseData = Object.fromEntries(entries);

  if (data.layerResults) {
    for (const layer of data.layerResults) {
      if (layer.signature) {
        const hydratedSignature = await hydrateImageValue(token, layer.signature, cache);
        layer.signature = typeof hydratedSignature === "string" ? hydratedSignature : layer.signature;
      }
      if (layer.evaluationFields) {
        const hydratedFields = await Promise.all(
          Object.entries(layer.evaluationFields).map(async ([key, value]) => [key, await hydrateImageValue(token, value, cache)] as const),
        );
        layer.evaluationFields = Object.fromEntries(hydratedFields);
      }
    }
  }

  if (data.logoUrl && (isImageSource(data.logoUrl) || isSharePointSource(data.logoUrl))) {
    data.logoUrl = await imageSourceToDataUrl(token, data.logoUrl, cache);
  }
  if (data.pdfConfig?.headerLogoUrl) {
    data.pdfConfig = {
      ...data.pdfConfig,
      headerLogoUrl: await imageSourceToDataUrl(token, data.pdfConfig.headerLogoUrl, cache),
    };
  }
}

// ── PDF generation + storage ───────────────────────────────────────────────

export async function generateAndStorePdf(
  token: string,
  listTitle: string,
  responseItemId: number,
  data: PdfFormData,
  options: { replaceExistingPdfUrl?: string; onGeneratedBlob?: (blob: Blob) => void | Promise<void> } = {},
): Promise<string> {
  // ── Inject matrix child rows ──────────────────────────────────────────
  // For dynamicmatrix/tableinput fields, read child list rows and attach
  // them to responseData so the PDF document can render proper tables.
  const matrixFields = findMatrixFields(data.surveyJson);
  for (const mf of matrixFields) {
    const rowIdsKey = `${mf.name}_RowIds`;
    const rowIdsRaw = data.responseData[rowIdsKey];
    if (!rowIdsRaw) continue;

    // RowIds is stored as a JSON string of child item IDs
    let hasRowIds = false;
    if (typeof rowIdsRaw === "string") {
      try {
        const parsed = JSON.parse(rowIdsRaw) as unknown;
        hasRowIds = Array.isArray(parsed) && parsed.length > 0;
      } catch { /* not valid JSON — skip */ }
    } else if (Array.isArray(rowIdsRaw)) {
      hasRowIds = rowIdsRaw.length > 0;
    }
    if (!hasRowIds) continue;

    try {
      const safeName = sanitizeMatrixFieldName(mf.name);
      const childListName = `${data.meta.formTitle} Matrix ${safeName}`;
      const childRows = await readMatrixChildItems(token, childListName, responseItemId);
      if (childRows.length > 0) {
        data.responseData[`${mf.name}_childRows`] = { columns: mf.columns, rows: childRows };
      }
    } catch {
      // Silently skip if child list read fails (list may not exist yet)
    }
  }

  await hydratePdfImages(token, data);

  const blob = await Promise.race([
    pdf(FormPdfDocument(data)).toBlob(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF generation timed out")), 60_000)
    ),
  ]);
  await options.onGeneratedBlob?.(blob);

  if (options.replaceExistingPdfUrl) {
    await deleteFormPdf(token, options.replaceExistingPdfUrl);
  }

  // Upload to SharePoint Form PDFs library
  const pdfUrl = await uploadFormPdf(token, listTitle, responseItemId, blob);

  // Store PDF URL on the response item
  try {
    await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
      PdfUrl: pdfUrl,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // If the PdfUrl column doesn't exist yet, add it and retry
    if (msg.includes('PdfUrl') && (msg.includes('does not exist') || msg.includes('not found'))) {
      await ensurePdfUrlColumn(token, listTitle);
      // SharePoint needs a moment after adding a column before it can be written
      await new Promise(r => setTimeout(r, 2000));
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
        PdfUrl: pdfUrl,
      });
    } else {
      throw e;
    }
  }

  return pdfUrl;
}

export const __test__ = {
  imageSourceFromString,
  sharePointServerRelativePath,
};
