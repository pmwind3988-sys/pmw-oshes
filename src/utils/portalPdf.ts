import { COMPANY } from "../config/company";
import type { LayerStatus, PortalRecord, SharePointClient, SurveyJson } from "../types";
import type { PdfFormData, PdfLayerResult } from "./FormPdfDocument";
import { PDF_LAYER_AWAITING, PDF_LAYER_NOT_REACHED } from "./pdfLayerProgress";
import { layerStatusLabel, normalizeLayerStatus } from "./statusConstants";
import { collectRecordAttachments, type RecordAttachment } from "./fileAttachments";

/** Layer states that carry a decision. Anything else is still ahead of the record. */
const DECIDED_STATUSES: ReadonlySet<LayerStatus> = new Set<LayerStatus>([
  "approved",
  "confirmed",
  "rejected",
  "skipped",
  "cancelled",
]);

/**
 * One row per layer, saying what has actually happened on it.
 *
 * The document is printed from wherever the record has got to, so this is where
 * "how far along is it" is decided. A layer that reached a decision reports that
 * decision; the layer being waited on reports that it is pending; the layers
 * behind it report that they have not started. The old version handed every
 * layer the word "pending" by default and let the document draw a signature well
 * for each — so a permit on layer 1 of 3 printed two blank signature blocks that
 * were indistinguishable from signatures whose images had failed to load.
 */
export function recordLayerResults(record: PortalRecord): PdfLayerResult[] {
  return record.chain.map((step, index) => {
    const layer = record.submission.layers[index];
    const enhanced = record.submission.enhancedLayers?.[index];
    const config = record.layers[index];
    const status = normalizeLayerStatus(layer?.status ?? null);
    // `state` carries what the chain knows and the columns may not: an older
    // filing can have moved past a layer without ever writing its status.
    const decided = DECIDED_STATUSES.has(status) || step.state === "signed";

    const result: PdfLayerResult = {
      layerNumber: step.layerNumber,
      type: step.type,
      status: decided
        ? DECIDED_STATUSES.has(status)
          ? layerStatusLabel(status)
          : layerStatusLabel(step.type === "evaluation" ? "confirmed" : "approved")
        : step.state === "current"
          ? PDF_LAYER_AWAITING
          : PDF_LAYER_NOT_REACHED,
      email: step.email || layer?.email || "",
    };

    // Nothing below this line belongs on a layer nobody has acted on: a date, a
    // reason or a name against an unsigned step is a claim the record cannot
    // support.
    if (!decided) return result;

    const signedAt = (enhanced?.type === "evaluation" ? enhanced.confirmedAt : layer?.signedAt) ?? layer?.signedAt;
    if (signedAt) result.signedAt = signedAt;

    const reason = layer?.rejectionReason ?? (enhanced?.type === "evaluation" ? enhanced.notes : null);
    if (reason) result.rejection = reason;
    // An approval keeps its ink in `L{n}_Signature`; an evaluation confirmed
    // from the review page keeps it in `EvaluationData[n].signatureUrl` and
    // leaves the column empty. Reading only the column printed a signed
    // evaluation as a layer that had signed nothing.
    const ink = layer?.signature || (enhanced?.type === "evaluation" ? enhanced.signatureUrl : null);
    if (ink) result.signature = ink;

    if (step.type === "evaluation") {
      const fields = enhanced?.type === "evaluation" ? enhanced.fields : undefined;
      if (fields && Object.keys(fields).length > 0) result.evaluationFields = fields;
      // The questions the evaluator was asked, so their answers print with
      // their real titles rather than as raw column names.
      //
      // `Array.isArray` rather than trusting the type: the layer configuration is
      // parsed out of a Note column, so an evaluation layer stored without its
      // questions satisfies the compiler and still has no array to measure. It
      // threw here, which took the whole record down — its drawer, its PDF and,
      // once the CSV read the chain this way, its export.
      const elements = config?.type === "evaluation" ? config.surveyElements : undefined;
      if (Array.isArray(elements) && elements.length > 0) {
        result.evaluationSurveyElements = elements;
      }
      if (step.who) result.confirmerName = step.who;
      if (step.email) result.confirmerEmail = step.email;
    }

    return result;
  });
}

/** The document as the portal knows it, before any image has been fetched. */
export function recordPdfData(record: PortalRecord, surveyJson: SurveyJson | null): PdfFormData {
  return {
    surveyJson: surveyJson ?? record.submission.surveyJson ?? { pages: [] },
    // A copy, because the generator writes into it: matrix child rows are
    // injected and every image is swapped for the data it resolved to. Handing
    // it the record's own answers would leave both behind in the drawer.
    responseData: { ...record.submission.submissionData },
    meta: {
      submittedBy: record.submitter,
      submittedAt: record.submission.submittedAt ?? "",
      formTitle: record.formName,
      formVersion: record.submission.formVersion,
      formStatus: record.status,
      ...(record.reference ? { referenceNo: record.reference } : {}),
    },
    layerResults: recordLayerResults(record),
    // The drawer's copy is the same document as the stored one, so it carries
    // the same letterhead rather than a bare, unbranded variant.
    logoUrl: COMPANY.logoUrl,
    company: COMPANY,
  };
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * "Download PDF" from the drawer: the form as submitted, with the approval
 * trail as far as it has got. Rendered client-side from the record already in
 * memory rather than replacing the stored copy — this button is a read.
 *
 * Signatures and photographs live in SharePoint libraries, and a PDF cannot
 * fetch them for itself, so they are pulled in first where a token can be had.
 * Without one the page still prints — with a labelled placeholder where each
 * picture would have been, which is the honest version of the same page.
 */
export async function downloadRecordPdf(
  record: PortalRecord,
  surveyJson: SurveyJson | null,
  spClient?: SharePointClient,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { default: FormPdfDocument } = await import("./FormPdfDocument");
  const { createElement } = await import("react");

  const data = recordPdfData(record, surveyJson);

  if (spClient) {
    try {
      const token = await spClient.acquireToken();
      const { hydratePdfImages } = await import("./generateFormPdf");
      await hydratePdfImages(token, data);
    } catch {
      // Every image resolves to a placeholder the document knows how to draw.
    }
  }

  const pdfDocument = createElement(FormPdfDocument, data) as Parameters<typeof pdf>[0];
  saveBlob(await pdf(pdfDocument).toBlob(), `${record.reference}.pdf`);
}

/** The files attached to a record, in the order they would be appended. */
export function recordAttachments(record: PortalRecord, surveyJson: SurveyJson | null): RecordAttachment[] {
  const data = recordPdfData(record, surveyJson);
  return collectRecordAttachments(data.surveyJson, data.responseData);
}

/** What the "with attachments" download managed, for the message that follows it. */
export interface AttachmentDownloadSummary {
  total: number;
  included: number;
  notIncluded: { name: string; reason: string }[];
}

/**
 * "Download PDF with attachments": the same document as {@link downloadRecordPdf},
 * followed by every attached file — each PDF's pages, then each picture on a page
 * of its own — in the order they were attached.
 *
 * A read, like the plain download: nothing stored changes. The files are
 * fetched with the reader's own credentials, so what one cannot open appears as
 * a page naming the file and linking to it rather than failing the download.
 */
export async function downloadRecordPdfWithAttachments(
  record: PortalRecord,
  surveyJson: SurveyJson | null,
  spClient: SharePointClient,
): Promise<AttachmentDownloadSummary> {
  const { pdf } = await import("@react-pdf/renderer");
  const { default: FormPdfDocument } = await import("./FormPdfDocument");
  const { createElement } = await import("react");
  const { hydratePdfImages } = await import("./generateFormPdf");

  const token = await spClient.acquireToken();
  const data: PdfFormData = { ...recordPdfData(record, surveyJson), attachmentsAppended: true };
  const attachments = collectRecordAttachments(data.surveyJson, data.responseData);
  try {
    await hydratePdfImages(token, data);
  } catch {
    // Every image resolves to a placeholder the document knows how to draw.
  }

  const pdfDocument = createElement(FormPdfDocument, data) as Parameters<typeof pdf>[0];
  const base = await (await pdf(pdfDocument).toBlob()).arrayBuffer();
  return appendAndSave(token, base, attachments, `${record.reference} with attachments.pdf`);
}

/** Append the attachments to a finished PDF and hand the reader the result. */
async function appendAndSave(
  token: string,
  base: ArrayBuffer | Uint8Array,
  attachments: RecordAttachment[],
  fileName: string,
): Promise<AttachmentDownloadSummary> {
  const { appendAttachmentsToPdf } = await import("./pdfAttachmentMerge");
  const { fetchSharePointFileBytes, responseToImageDataUrl } = await import("./sharepointImageData");
  const { absoluteAttachmentUrl } = await import("./fileAttachments");

  const merged = await appendAttachmentsToPdf(base, attachments, (attachment) => fetchSharePointFileBytes(token, attachment.url), {
    toAbsoluteUrl: absoluteAttachmentUrl,
    // WEBP, GIF and BMP go through the browser's own decoder and come out PNG.
    imageToPng: async (bytes) => {
      const dataUrl = await responseToImageDataUrl(new Response(bytes as BlobPart));
      if (!dataUrl) return null;
      const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    },
  });

  saveBlob(new Blob([merged.bytes as BlobPart], { type: "application/pdf" }), fileName);
  return { total: attachments.length, included: merged.included, notIncluded: merged.notIncluded };
}

/**
 * "With attachments" beside a stored copy's "View PDF": that same stored file,
 * followed by the record's attachments. The stored copy itself is not changed —
 * it stays the record with links, small enough to open and to email.
 */
export async function downloadStoredPdfWithAttachments(
  token: string,
  pdfUrl: string,
  surveyJson: unknown,
  responseData: Record<string, unknown>,
  fileName: string,
): Promise<AttachmentDownloadSummary> {
  const { fetchSharePointFileBytes } = await import("./sharepointImageData");
  const base = await fetchSharePointFileBytes(token, pdfUrl);
  if (!base) throw new Error("The stored PDF could not be opened. Try re-generating it first.");
  const attachments = collectRecordAttachments(surveyJson, responseData);
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, "_").trim() || "record";
  return appendAndSave(token, base, attachments, `${safeName} with attachments.pdf`);
}

/** What to tell the reader once a "with attachments" download is saved. */
export function attachmentDownloadMessage(summary: AttachmentDownloadSummary): string {
  if (summary.notIncluded.length === 0) {
    return `Downloaded with ${summary.included} ${summary.included === 1 ? "attachment" : "attachments"} added after the record.`;
  }
  const missed = summary.notIncluded.map((file) => `${file.name} ${file.reason}`).join("; ");
  return `Downloaded. ${summary.notIncluded.length} of ${summary.total} could not be added and got a page with a link instead: ${missed}.`;
}

/**
 * Rebuild the stored PDF from what the record says today, and hand the reader
 * the new file.
 *
 * The stored copy is written once at submit time and again at each approval, so
 * it goes stale the moment anything else changes — a reassignment, a withdrawal,
 * a photo that failed to embed the first time. This deletes that file, uploads
 * the rebuilt one in its place and repoints the item's `PdfUrl` at it, so the
 * record has one PDF rather than a pile of them. Returns the new URL, which the
 * caller should patch into the record: the regeneration after this one has to
 * replace the file this one wrote.
 */
export async function regenerateRecordPdf(
  record: PortalRecord,
  surveyJson: SurveyJson | null,
  spClient: SharePointClient,
): Promise<string> {
  const itemId = Number(record.itemId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new Error("This record has no SharePoint item behind it to store a PDF against.");
  }

  const token = await spClient.acquireToken();
  const { generateAndStorePdf } = await import("./generateFormPdf");

  return generateAndStorePdf(token, record.listTitle, itemId, recordPdfData(record, surveyJson), {
    ...(record.submission.pdfUrl ? { replaceExistingPdfUrl: record.submission.pdfUrl } : {}),
    onGeneratedBlob: (blob) => saveBlob(blob, `${record.reference}.pdf`),
  });
}
