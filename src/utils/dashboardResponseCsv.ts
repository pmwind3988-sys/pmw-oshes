/**
 * dashboardResponseCsv.ts — the dashboard's submissions, in the shared export shape.
 *
 * The dashboard already holds everything a full export needs: each submission
 * carries the schema it was answered against and its per-layer results, both
 * derived when the lists were read. So this only translates, and hands the
 * translation to `formResponseCsv.ts` — the alternative was a second opinion
 * about how a date, a number or a signature belongs in a spreadsheet, one screen
 * disagreeing with the other about the same submission.
 */
import type { ApprovalLayer, ApprovalLayerResult, EvaluationLayerResult, LayerStatus, Submission } from "../types";
import { buildFormResponseCsv, type ResponseCsvLayer, type ResponseCsvOptions, type ResponseCsvRow } from "./formResponseCsv";
import { IMAGES_WITHOUT_TOKEN, collectExportImageData } from "./exportImageData";
import { layerNumberFromValue, layerSequenceFromConfig } from "./layerSequence";
import { layerStatusLabel } from "./statusConstants";
import { getSelectedCompany } from "./companySelection";
import { responseAnswerFields } from "./responseSystemFields";

/** What the layer configuration adds to a result: a name, and the questions asked. */
interface LayerNaming {
  label: string;
  schema?: Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function namingByLayer(submission: Submission): Map<number, LayerNaming> {
  const naming = new Map<number, LayerNaming>();
  for (const layer of layerSequenceFromConfig(submission.layerConfig, submission.selectedBranch)) {
    const number = layerNumberFromValue(layer.layerNumber);
    if (number === null) continue;
    naming.set(number, {
      label: text(layer.title) || text(layer.roleLabel),
      schema: Array.isArray(layer.surveyElements) ? layer.surveyElements.filter(isRecord) : undefined,
    });
  }
  return naming;
}

/**
 * `LayerStatus` is stored canonical and lowercase — `in_progress` — because that
 * is what the workflow compares against. A spreadsheet is read, so it gets the
 * label the badge on screen shows.
 */
function statusText(status: LayerStatus | string | null | undefined): string {
  if (!status) return "";
  return layerStatusLabel(status as LayerStatus);
}

function fromEnhancedLayer(
  layer: ApprovalLayerResult | EvaluationLayerResult,
  naming: Map<number, LayerNaming>,
): ResponseCsvLayer {
  const named = naming.get(layer.layerNumber);
  if (layer.type === "evaluation") {
    return {
      layerNumber: layer.layerNumber,
      type: "evaluation",
      label: named?.label,
      status: statusText(layer.status),
      actedBy: layer.email ?? "",
      decidedAt: layer.confirmedAt ?? "",
      remarks: layer.notes ?? "",
      evaluationFields: layer.fields,
      evaluationSchema: named?.schema,
    };
  }
  return {
    layerNumber: layer.layerNumber,
    type: "approval",
    label: named?.label,
    status: statusText(layer.status),
    actedBy: layer.email ?? "",
    decidedAt: layer.signedAt ?? "",
    remarks: layer.rejectionReason ?? "",
    signature: layer.signature ?? "",
  };
}

/**
 * The trail on one submission.
 *
 * `enhancedLayers` is the typed reading and is preferred. `layers` is the older
 * positional one, kept as the fallback because a submission read before a form
 * had its layer configuration still has decisions worth exporting — its layer
 * numbers come from position, which is what that shape means.
 */
function layersFromSubmission(submission: Submission): ResponseCsvLayer[] {
  const naming = namingByLayer(submission);

  const enhanced = (submission.enhancedLayers ?? []).filter(
    (layer): layer is ApprovalLayerResult | EvaluationLayerResult => Boolean(layer),
  );
  if (enhanced.length > 0) return enhanced.map((layer) => fromEnhancedLayer(layer, naming));

  return (submission.layers ?? [])
    .filter((layer): layer is ApprovalLayer => Boolean(layer))
    .map((layer, index) => ({
      layerNumber: index + 1,
      type: "approval",
      label: naming.get(index + 1)?.label,
      status: statusText(layer.status),
      actedBy: layer.email ?? "",
      decidedAt: layer.signedAt ?? "",
      remarks: layer.rejectionReason ?? "",
      signature: layer.signature ?? "",
    }));
}

export function submissionToCsvRow(submission: Submission, category = ""): ResponseCsvRow {
  const data = submission.submissionData;

  return {
    record: {
      id: submission.submissionId,
      reference: submission.referenceNo,
      form: submission.listTitle,
      category,
      version: submission.formVersion,
      company: getSelectedCompany(submission.submissionData, submission.surveyJson),
      submittedBy: submission.submitterName || submission.createdByName || submission.submittedByEmail,
      submitterEmail: submission.submittedByEmail || submission.createdByEmail,
      submittedAt: submission.submittedAt,
      updatedAt: submission.modifiedAt,
      // The list's own `Status` and the workflow's `FormStatus` disagree on
      // purpose — "Approved Layer 1" against "In Review" — so each is reported
      // under its own heading rather than one standing in for the other.
      status: text(data.Status),
      formStatus: submission.formStatus ?? "",
      currentLayer: submission.currentLayer,
      totalLayers: submission.totalLayers,
      branch: submission.selectedBranch,
      pdpaConsent: data.PDPAConsent,
      pdpaNoticeVersion: text(data.PDPANoticeVersion),
      pdpaConsentAt: data.PDPAConsentAt,
      retentionUntil: data.RetentionUntil,
      pdfUrl: text(data.PdfUrl ?? submission.pdfUrl),
    },
    // The bookkeeping columns are reported by the blocks above and by the layer
    // columns. Leaving them in the answers repeats every one of them as though it
    // were a question — `RawJSON` included, which is the whole submission again
    // in one cell.
    answers: responseAnswerFields(data),
    surveyJson: submission.surveyJson,
    layers: layersFromSubmission(submission),
  };
}

function csvRows(submissions: Submission[], listMetaMap: Record<string, { category?: string }>): ResponseCsvRow[] {
  return submissions.map((submission) => submissionToCsvRow(submission, listMetaMap[submission.listTitle]?.category ?? ""));
}

/**
 * The rows on screen, as one CSV. Several forms can be in it at once, so the
 * questions of every form in the selection get a column and a submission of one
 * form leaves the other forms' columns blank.
 *
 * Pure, and so pictures stay links. `buildDashboardSubmissionExport` is the one
 * the screen calls.
 */
export function buildDashboardSubmissionCsv(
  submissions: Submission[],
  listMetaMap: Record<string, { category?: string }> = {},
  options: ResponseCsvOptions = {},
): string {
  return buildFormResponseCsv(csvRows(submissions, listMetaMap), options);
}

export interface DashboardSubmissionExport {
  csv: string;
  rowCount: number;
  /** What could not be carried into the file. It is still written. */
  warnings: string[];
}

/**
 * The same file with its pictures in it.
 *
 * Signatures and photographs are SharePoint links, which open for the admin who
 * exported and for nobody they mail the file to — so each is fetched and carried
 * as base64, exactly as the PDF carries it. Needs a token; without one the caller
 * can still use `buildDashboardSubmissionCsv` and get links.
 */
export async function buildDashboardSubmissionExport(
  submissions: Submission[],
  listMetaMap: Record<string, { category?: string }> = {},
  options: { siteUrl?: string; token?: string } = {},
): Promise<DashboardSubmissionExport> {
  const rows = csvRows(submissions, listMetaMap);
  const { imageData, warnings } = options.token
    ? await collectExportImageData(options.token, rows)
    : { imageData: undefined, warnings: [IMAGES_WITHOUT_TOKEN] };

  return {
    csv: buildFormResponseCsv(rows, { siteUrl: options.siteUrl, imageData }),
    rowCount: rows.length,
    warnings,
  };
}
