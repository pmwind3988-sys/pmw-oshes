/**
 * portalExport.ts — what the portal's screens hand over when you export them.
 *
 * These used to write the thirteen columns the table on screen happened to draw.
 * That is a defensible export of a *table* and a poor export of a *record*: an
 * incident report with twenty-two answers, three photographs and two signatures
 * left the portal as its reference, its stage and a one-line history, and the
 * only complete copy was its PDF — one file per record, unsortable, and no use
 * to anybody who has to count how often a thing happened.
 *
 * So a records export now carries the whole submission, through the same
 * `formResponseCsv.ts` the admin dashboard and the response viewer already use.
 * Every answer in the order the form asked for it, every layer's decision, times
 * in Malaysian time, numbers as numbers, pictures as the base64 that carries
 * them. What the portal derives and no response list holds — the stage, the age
 * on the layer, whether that is past the SLA — rides along beside the identity
 * block, where a reader can filter on it.
 *
 * The audit trail is a different shape and stays its own file: an append-only
 * list of events, one row each, with its instants converted like everything else.
 */
import type { AuditEntry, PortalRecord } from "../types";
import { csvRow, downloadCsv } from "./csv";
import { submissionToCsvRow } from "./dashboardResponseCsv";
import { IMAGES_WITHOUT_TOKEN, collectExportImageData } from "./exportImageData";
import { buildFormResponseCsv, type ResponseCsvExtra, type ResponseCsvLayer, type ResponseCsvOptions, type ResponseCsvRow } from "./formResponseCsv";
import { recordLayerResults } from "./portalPdf";
import { MALAYSIA_TIME_LABEL, formatMalaysiaDateTime, malaysiaDateStamp } from "./malaysiaTime";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

export interface PortalExportResult {
  rowCount: number;
  /** What could not be carried. The file is written either way. */
  warnings: string[];
}

/** The Malaysian date, so an export filed at nine in the evening is not named after tomorrow. */
function datedName(prefix: string): string {
  return `${prefix}-${malaysiaDateStamp()}.csv`;
}

/**
 * Hours, rounded to a tenth.
 *
 * The label beside it ("2 d 4 h") is what a person reads; this is what a
 * spreadsheet sorts and averages, and it cannot do either with "2 d 4 h".
 */
function hours(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * What the portal knows about a record that its response list does not.
 *
 * All of it derived when the submissions were read, and all of it the reason
 * somebody exports this screen rather than the admin dashboard: they are looking
 * at what is late, and with whom.
 */
function portalColumns(record: PortalRecord): ResponseCsvExtra[] {
  return [
    { key: "code", header: "Form Code", value: record.code },
    { key: "subject", header: "Subject", value: record.subject },
    { key: "location", header: "Location", value: record.location },
    { key: "source", header: "Source", value: record.source },
    { key: "severity", header: "Severity", value: record.severity },
    { key: "photos", header: "Photos", value: record.photos, numeric: true },
    { key: "stage", header: "Stage", value: record.stage },
    { key: "portalStatus", header: "Portal Status", value: record.status },
    { key: "currentRole", header: "Current Layer Role", value: record.currentRole },
    { key: "currentAssignee", header: "Awaiting", value: record.currentAssignee },
    { key: "currentAssigneeEmail", header: "Awaiting Email", value: record.currentAssigneeEmail },
    { key: "ageOnLayerLabel", header: "Age On Layer", value: record.ageOnLayerLabel },
    { key: "hoursOnLayer", header: "Hours On Layer", value: hours(record.hoursOnLayer), numeric: true },
    { key: "hoursSinceFiled", header: "Hours Since Filed", value: hours(record.hoursSinceFiled), numeric: true },
    // Blank rather than zero on a form that declared no SLA: a column of noughts
    // reads as a target of nought rather than as a form with no target. Same for
    // "Past SLA" — "No" would claim a deadline was met that never existed.
    { key: "slaDays", header: "SLA (days)", value: record.hasSla ? record.slaDays : "", numeric: true },
    { key: "overdue", header: "Past SLA", value: record.hasSla ? (record.overdue ? "Yes" : "No") : "" },
    { key: "hoursOverdue", header: "Hours Past SLA", value: record.hasSla && record.overdue ? hours(record.hoursOverdue) : "", numeric: true },
    { key: "waitNote", header: "Wait", value: record.waitNote },
  ];
}

/**
 * The chain of one record, layer by layer, including the ones still ahead of it.
 *
 * `recordLayerResults` is what the record's PDF is drawn from, so this is the
 * same reading of the same chain: a layer that reached a decision reports the
 * decision, its date and its ink, and a layer nobody has acted on reports only
 * that — under its own name, in its own columns, rather than by being absent.
 * The dashboard's translation maps the stored decision rows alone, so a permit
 * waiting on its second approver exported as though it had one layer.
 */
function portalLayers(record: PortalRecord): ResponseCsvLayer[] {
  return recordLayerResults(record).map((layer, index) => ({
    layerNumber: layer.layerNumber,
    type: layer.type,
    label: record.chain[index]?.roleLabel ?? "",
    status: layer.status,
    // Only where somebody actually acted. A name against an unsigned layer is a
    // claim the record cannot support — the same rule the printed page follows.
    actedBy: layer.signedAt ? layer.confirmerEmail || layer.email : "",
    decidedAt: layer.signedAt ?? "",
    remarks: layer.rejection ?? "",
    signature: layer.signature ?? "",
    evaluationFields: layer.evaluationFields,
    evaluationSchema: layer.evaluationSurveyElements,
  }));
}

/**
 * The rows behind a records export.
 *
 * `submissionToCsvRow` is the dashboard's translation of a submission, reused
 * rather than reimplemented: the portal and the dashboard show the same
 * submissions, and an export of one that disagreed with an export of the other
 * about the same record would be worse than either. Only the chain is read the
 * portal's way, because the portal knows layers the response columns do not.
 */
export function recordsToCsvRows(records: PortalRecord[]): ResponseCsvRow[] {
  return records.map((record) => {
    const row = submissionToCsvRow(record.submission, record.submission.meta?.category ?? "");
    const layers = portalLayers(record);
    return {
      ...row,
      extra: portalColumns(record),
      layers: layers.length > 0 ? layers : row.layers,
    };
  });
}

/** The records CSV itself. Pure, so what it writes can be asserted. */
export function buildPortalRecordsCsv(records: PortalRecord[], options: ResponseCsvOptions = {}): string {
  return buildFormResponseCsv(recordsToCsvRows(records), options);
}

/**
 * The audit trail as CSV.
 *
 * `at` is the stored instant and `whenLabel` is what the screen drew from it in
 * the reader's own zone. The file gets the instant converted to Malaysian time,
 * because a trail row is read months later by somebody who was not there and has
 * no way to know which clock it was written on.
 */
export function buildAuditCsv(entries: AuditEntry[]): string {
  const lines = [csvRow([`When (${MALAYSIA_TIME_LABEL})`, "Reference", "Who", "Event"])];
  for (const entry of entries) {
    lines.push(csvRow([formatMalaysiaDateTime(entry.at), entry.reference, entry.who, entry.event]));
  }
  return lines.join("\r\n");
}

/**
 * The rows you are looking at, in full, as a downloaded file.
 *
 * Callers pass the already-filtered rows, so what lands in the file is what was
 * on screen. `token` is what lets the pictures travel as pictures; without one
 * they travel as links, and the result says so rather than leaving the reader to
 * find out when they click one.
 */
export async function exportRecordsCsv(
  records: PortalRecord[],
  options: { token?: string } = {},
): Promise<PortalExportResult> {
  const rows = recordsToCsvRows(records);
  const { imageData, warnings } = options.token
    ? await collectExportImageData(options.token, rows)
    : { imageData: undefined, warnings: [IMAGES_WITHOUT_TOKEN] };

  downloadCsv(buildFormResponseCsv(rows, { siteUrl: SP_SITE_URL, imageData }), datedName("pmw-oshes-records"));
  return { rowCount: records.length, warnings };
}

export function exportAuditCsv(entries: AuditEntry[]): PortalExportResult {
  downloadCsv(buildAuditCsv(entries), datedName("pmw-oshes-audit-trail"));
  return { rowCount: entries.length, warnings: [] };
}
