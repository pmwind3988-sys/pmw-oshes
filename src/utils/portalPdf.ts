import { COMPANY } from "../config/company";
import type { LayerStatus, PortalRecord, SharePointClient, SurveyJson } from "../types";
import type { PdfFormData, PdfLayerResult } from "./FormPdfDocument";
import { PDF_LAYER_AWAITING, PDF_LAYER_NOT_REACHED } from "./pdfLayerProgress";
import { layerStatusLabel, normalizeLayerStatus } from "./statusConstants";

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
    if (layer?.signature) result.signature = layer.signature;

    if (step.type === "evaluation") {
      const fields = enhanced?.type === "evaluation" ? enhanced.fields : undefined;
      if (fields && Object.keys(fields).length > 0) result.evaluationFields = fields;
      // The questions the evaluator was asked, so their answers print with
      // their real titles rather than as raw column names.
      if (config?.type === "evaluation" && config.surveyElements.length > 0) {
        result.evaluationSurveyElements = config.surveyElements;
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
