/**
 * generateFormPdf.ts — Generates PDF, uploads to SharePoint, stores URL on
 * the response item, and opens in a new tab for viewing.
 */
import { pdf } from "@react-pdf/renderer";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "./FormPdfDocument";
import { uploadFormPdf, deleteFormPdf, spPatch, ensurePdfUrlColumn, readMatrixChildItems } from "./formBuilderSP";
import type { MatrixColumnDef } from "./formBuilderSP";
import {
  hydrateImageValue,
  imageSourceFromString,
  imageSourceToDataUrl,
  isImageSource,
  isSharePointSource,
  looksLikeSvg,
  responseToImageDataUrl,
  sharePointServerRelativePath,
  sniffImageMimeType,
  sniffRiffWebp,
} from "./sharepointImageData";
import { isRecord } from "./pdfImageSources";
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

/** The ink an evaluation layer stored inside its own JSON entry. */
function evaluationSignatureUrl(entry: Record<string, unknown> | undefined): string {
  const url = entry?.signatureUrl;
  return typeof url === "string" ? url.trim() : "";
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
      // An evaluation confirmed from the review page writes its ink to
      // `EvaluationData[n].signatureUrl` and leaves `L{n}_Signature` empty, so
      // reading only the column printed a signed evaluation as unsigned.
      signature: (rawResponse[`L${n}_Signature`] as string)
        || evaluationSignatureUrl(evalData[n])
        || undefined,
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
  hydrateImageValue,
  isSharePointSource,
  imageSourceFromString,
  sharePointServerRelativePath,
  sniffImageMimeType,
  sniffRiffWebp,
  looksLikeSvg,
  responseToImageDataUrl,
};
