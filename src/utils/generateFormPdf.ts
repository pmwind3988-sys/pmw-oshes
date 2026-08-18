/**
 * generateFormPdf.ts — Generates PDF, uploads to SharePoint, stores URL on
 * the response item, and opens in a new tab for viewing.
 */
import { pdf } from "@react-pdf/renderer";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "./FormPdfDocument";
import { uploadFormPdf, deleteFormPdf, spPatch, ensurePdfUrlColumn, readMatrixChildItems } from "./formBuilderSP";
import type { MatrixColumnDef } from "./formBuilderSP";
import { fetchWithAuthRecovery } from "./authRecovery";
import { layerNumberFromValue, layerSequenceFromConfig } from "./layerSequence";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// ── Layer data extraction ──────────────────────────────────────────────────

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

/**
 * What the bytes actually are, ignoring what the server said they are.
 *
 * SharePoint serves files from `/$value` and `download.aspx` as
 * `application/octet-stream` about as often as it serves them with a real image
 * type, so trusting `Content-Type` threw away perfectly good PNGs — which is
 * how a signature became an empty box on the page. The first bytes of a raster
 * do not lie, and they also catch the failure that matters: an expired session
 * answers `200` with a sign-in page, and `<!DOCTYPE` is not an image.
 */
function sniffImageMimeType(bytes: Uint8Array): string {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x42, 0x4d)) return "image/bmp";
  return "";
}

function sniffRiffWebp(bytes: Uint8Array): boolean {
  const ascii = (offset: number, text: string): boolean =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  return ascii(0, "RIFF") && ascii(8, "WEBP");
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}

/** The only two rasters `@react-pdf/renderer` can embed directly. */
const PDF_NATIVE_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Re-encode to PNG through a canvas.
 *
 * GIF, BMP, WEBP and SVG all display in the browser and none of them embed in a
 * PDF, so a site photo saved as a WEBP would silently vanish from the record.
 * The browser already knows how to decode them; this borrows that decoder and
 * hands the PDF the one format it takes. Returns "" outside a DOM, where the
 * caller falls back to a printed placeholder rather than a hole in the page.
 */
async function reencodeImageToPng(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return "";
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decode failed"));
      element.src = dataUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return "";
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

async function responseToPdfImageDataUrl(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return "";

  const sniffed = sniffImageMimeType(bytes)
    || (sniffRiffWebp(bytes) ? "image/webp" : "")
    || (looksLikeSvg(bytes) ? "image/svg+xml" : "");
  // The declared type is only consulted when the bytes are unrecognised, and
  // even then only if it claims to be an image — an HTML sign-in page reaches
  // here as `text/html` and is correctly rejected.
  const mimeType = sniffed || (response.headers.get("content-type") ?? "").split(";")[0]?.trim() || "";
  if (!mimeType.startsWith("image/")) return "";

  const dataUrl = bytesToDataUrl(bytes, mimeType);
  return PDF_NATIVE_IMAGE_TYPES.has(mimeType) ? dataUrl : reencodeImageToPng(dataUrl);
}

/**
 * Resolve an image reference to something the PDF can actually embed.
 *
 * Returns "" when the image cannot be reached or cannot be encoded. It used to
 * return the unreachable URL, which `@react-pdf/renderer` then failed to fetch
 * a second time — and it swallows that failure with a `console.warn` and lays
 * out an empty box. An empty result is honest, and the document draws a labelled
 * placeholder for it instead of an unexplained blank rectangle.
 */
async function imageSourceToDataUrl(token: string, source: string, cache: Map<string, string>): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) {
    const mimeType = trimmed.slice(5).split(";")[0]?.toLowerCase() ?? "";
    return PDF_NATIVE_IMAGE_TYPES.has(mimeType) ? trimmed : reencodeImageToPng(trimmed);
  }

  const absolute = toAbsoluteSharePointUrl(trimmed);
  const cached = cache.get(absolute);
  if (cached !== undefined) return cached;

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
      const dataUrl = await responseToPdfImageDataUrl(response);
      if (!dataUrl) continue;
      cache.set(absolute, dataUrl);
      return dataUrl;
    } catch {
      continue;
    }
  }
  console.warn(`PDF image hydration failed for every candidate URL; the page will print a placeholder for: ${absolute}`);
  cache.set(absolute, "");
  return "";
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

/** The keys a SharePoint URL/Hyperlink value hides its address behind. */
const URL_VALUE_KEYS = new Set([
  "Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl",
]);

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
  for (const key of URL_VALUE_KEYS) {
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

  // Anything still nested gets the same treatment. A photo column inside a
  // dynamic matrix arrives as `{ columns, rows: [{ Photo: "<url>" }] }`, which
  // the URL-key pass above walks straight past — so the picture reached the PDF
  // as an unfetchable link and printed as nothing at all.
  for (const [key, raw] of Object.entries(next)) {
    if (URL_VALUE_KEYS.has(key)) continue;
    if (typeof raw !== "string" && !Array.isArray(raw) && !isRecord(raw)) continue;
    next[key] = await hydrateImageValue(token, raw, cache);
  }

  return next;
}

/**
 * Pull every picture the document needs into the document itself.
 *
 * Signatures, photographs and the letterhead are SharePoint URLs that
 * `@react-pdf/renderer` cannot fetch — it has no credentials — so each one is
 * downloaded here and replaced by a data URI. Exported because the portal's
 * own "Download PDF" renders the same document from the browser and needs the
 * same images in it.
 */
export async function hydratePdfImages(token: string, data: PdfFormData): Promise<void> {
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
    // Losing the rebuilt document because yesterday's copy could not be deleted
    // — it was moved, or removed by hand — is the wrong way round: the upload
    // below is the point of the call, and a stray old file is recoverable.
    try {
      await deleteFormPdf(token, options.replaceExistingPdfUrl);
    } catch (error) {
      console.warn("Could not delete the PDF being replaced; the rebuilt one is uploaded anyway.", error);
    }
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
  sniffImageMimeType,
  sniffRiffWebp,
  looksLikeSvg,
  responseToPdfImageDataUrl,
};
