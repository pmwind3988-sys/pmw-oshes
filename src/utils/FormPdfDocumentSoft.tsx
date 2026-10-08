/**
 * FormPdfDocumentSoft.tsx — the optional "soft" layout of a printed form.
 *
 * Same data, same rules and same information as FormPdfDocument.tsx (the classic
 * layout, which stays the default). Only the presentation differs: a header band
 * with the title and reference, a summary card for what a supervisor reads first,
 * a journey strip for the approval chain, answers without table bands, sign-off
 * cards per signer, and a footer with page numbers on every page.
 */
import { Document, Page, View, Text, Image, Link, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import { COMPANY, companyContactLines } from "../config/company";
import { getSelectedCompany } from "./companySelection";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";
import { formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
import { collectImageSources, imageCaption, isEmbeddableImage, isRecord, isSignatureField } from "./pdfImageSources";
import { isChoiceField, readTicks, shouldListChoices } from "./pdfChoiceMatching";
import { chainProgress, isAwaitingLayer } from "./pdfLayerProgress";
import { REFERENCE_NO_FIELD } from "./referenceNumber";
import { signOffLabel, signOffName, signOffPosition, signOffVerdictFromStatus } from "./signOff";
import { absoluteAttachmentUrl, attachmentName, attachmentUrls, collectRecordAttachments, isFileQuestionType } from "./fileAttachments";
import type { DocumentControlHeader } from "../types";
import type { ReactNode } from "react";
import type { PdfFormData, PdfLayerResult } from "./FormPdfDocument";

// ── Colours ───────────────────────────────────────────────────────────────

const T = {
  ink: "#161B24",
  muted: "#586174",
  soft: "#F5F7FB",
  chip: "#EDF0F5",
  divider: "#E3E8F0",
  primary: "#1A5FD0",
  green: "#2E9D6A",
  greenInk: "#0E5233",
  greenFill: "#EAF7F0",
  red: "#B3261E",
  redInk: "#8C1D18",
  redFill: "#FCEDEB",
  amber: "#B7791F",
  amberInk: "#7A4F00",
  amberFill: "#FDF6E3",
  neutral: "#8A93A6",
  white: "#FFFFFF",
  info: "#D9E5FB",
  infoInk: "#0B3B8C",
};

// ── Styles ────────────────────────────────────────────────────────────────

const CARD_WIDTH = 169;

const S = StyleSheet.create({
  page: { paddingTop: 44, paddingHorizontal: 34, paddingBottom: 84, fontFamily: "Helvetica", fontSize: 8.5, color: T.ink, lineHeight: 1.3 },

  // Header band
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "flex-start", width: "52%" },
  brandText: { paddingLeft: 10 },
  brandName: { fontSize: 8.5, fontWeight: "bold", color: T.ink, marginBottom: 1.5 },
  brandLine: { fontSize: 7.5, color: T.muted, lineHeight: 1.35 },
  titleBlock: { width: "48%", alignItems: "flex-end" },
  docTitle: { fontSize: 20, fontWeight: "bold", color: T.ink, textAlign: "right", lineHeight: 1.1 },
  pillRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  refPill: { backgroundColor: T.chip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  refText: { fontFamily: "Courier", fontWeight: "bold", fontSize: 8.5, color: T.ink },
  divider: { height: 0.75, backgroundColor: T.divider, marginTop: 12, marginBottom: 12 },

  // Pills
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingLeft: 6, paddingRight: 9 },
  pillText: { fontSize: 7.5, fontWeight: "bold" },
  pillGlyph: { marginRight: 3.5 },
  bang: { width: 9, height: 9, borderRadius: 999, backgroundColor: T.red, alignItems: "center", justifyContent: "center", marginRight: 3.5 },
  bangText: { fontSize: 6.5, fontWeight: "bold", color: T.white, lineHeight: 1 },

  // Running header (pages 2+)
  runWrap: { position: "absolute", top: 16, left: 34, right: 34 },
  runRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 5, borderBottomWidth: 0.6, borderBottomColor: T.divider },
  runTitle: { fontSize: 8, color: T.muted, fontWeight: "bold" },
  // No background: inside the absolutely placed header react-pdf stretches any filled box to the page height.
  runRef: { fontFamily: "Courier", fontWeight: "bold", fontSize: 8, color: T.ink },

  // Footer (every page)
  footer: { position: "absolute", bottom: 22, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 0.6, borderTopColor: T.divider, paddingTop: 5 },
  footerText: { fontSize: 7, color: T.muted, lineHeight: 1.35 },
  footerStrong: { fontWeight: "bold", color: T.ink },
  footerPage: { position: "absolute", top: 812, right: 34, width: 80, fontSize: 7, color: T.muted, textAlign: "right" },

  // Notice
  notice: { backgroundColor: T.amberFill, borderWidth: 0.8, borderColor: T.amber, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  noticeHead: { fontSize: 8, fontWeight: "bold", color: T.amberInk, marginBottom: 1.5 },
  noticeText: { fontSize: 7.5, color: T.ink, lineHeight: 1.35 },

  // Summary card
  summary: { backgroundColor: T.soft, borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  summaryMain: { flexGrow: 1, flexShrink: 1, paddingRight: 12 },
  summaryCells: { flexDirection: "row", flexWrap: "wrap" },
  summaryCell: { marginRight: 22, marginTop: 8, alignItems: "flex-start" },
  summaryLabel: { fontSize: 7, color: T.muted, fontWeight: "bold", marginBottom: 2 },
  summaryValue: { fontSize: 8.5, color: T.ink },
  summaryWindow: { fontSize: 13, fontWeight: "bold", color: T.ink },
  summaryStrong: { fontSize: 8.5, fontWeight: "bold", color: T.ink },
  summaryNote: { fontSize: 7, color: T.muted, marginTop: 1 },
  qrBox: { width: 84, alignItems: "center" },
  qrFrame: { width: 72, height: 72, backgroundColor: T.white, borderRadius: 10, padding: 5, alignItems: "center", justifyContent: "center" },
  qrImage: { width: 62, height: 62 },
  qrCaption: { fontSize: 6.5, color: T.muted, textAlign: "center", marginTop: 4, lineHeight: 1.3 },

  // Section headings
  sectionHead: { fontSize: 11, fontWeight: "bold", color: T.ink, marginBottom: 2 },
  sectionRule: { height: 0.75, backgroundColor: T.divider, marginBottom: 4 },
  section: { marginBottom: 14 },

  // Answers
  answerRow: { flexDirection: "row", paddingVertical: 4, alignItems: "flex-start" },
  question: { width: "34%", fontSize: 8, color: T.muted, paddingRight: 12, lineHeight: 1.35 },
  answer: { width: "66%", flexGrow: 1, flexShrink: 1 },
  answerText: { fontSize: 8.5, color: T.ink, lineHeight: 1.35 },
  answerShort: { fontWeight: "bold" },
  noAnswer: { fontSize: 8, color: T.muted, fontStyle: "italic" },
  pillWrap: { flexDirection: "row", flexWrap: "wrap" },
  choicePill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: T.ink, borderRadius: 999, paddingVertical: 2, paddingLeft: 5, paddingRight: 8, marginRight: 5, marginBottom: 4 },
  choicePillText: { fontSize: 7.5, fontWeight: "bold", color: T.ink },
  notSelected: { fontSize: 7, color: T.muted, marginTop: 1, lineHeight: 1.35 },
  tickExtra: { fontSize: 7.5, color: T.ink, marginTop: 2, lineHeight: 1.35 },
  tickNote: { fontSize: 7, color: T.amberInk, fontStyle: "italic", marginTop: 2, lineHeight: 1.35 },
  // Paper (blank form) tick boxes
  paperOptions: { flexDirection: "row", flexWrap: "wrap" },
  paperOption: { flexDirection: "row", alignItems: "center", marginRight: 14, marginBottom: 6 },
  paperBox: { width: 10, height: 10, borderWidth: 0.8, borderColor: T.ink, borderRadius: 2, marginRight: 5, alignItems: "center", justifyContent: "center" },
  paperMark: { fontSize: 7, fontWeight: "bold", lineHeight: 1 },
  paperLabel: { fontSize: 8, color: T.ink, lineHeight: 1.3 },
  paperLine: { height: 22, borderBottomWidth: 0.8, borderBottomColor: T.neutral, marginBottom: 6 },

  // Mini-list for repeating panels
  miniList: { backgroundColor: T.soft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  miniRow: { paddingVertical: 2, fontSize: 8, color: T.ink, lineHeight: 1.35 },
  miniStrong: { fontWeight: "bold" },

  // Images and wells
  tile: { width: 116, borderWidth: 0.6, borderColor: T.divider, borderRadius: 6, padding: 4, marginRight: 6, marginBottom: 6 },
  tileFrame: { height: 66, alignItems: "center", justifyContent: "center" },
  tileImage: { maxWidth: "100%", maxHeight: 64, objectFit: "contain" },
  tileCaption: { fontSize: 6.5, color: T.muted, textAlign: "center", marginTop: 3 },
  unembedded: { fontSize: 6.5, color: T.muted, fontStyle: "italic", textAlign: "center", lineHeight: 1.3 },
  well: { height: 50, backgroundColor: T.white, borderRadius: 8, borderWidth: 0.6, borderColor: T.divider, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  wellImage: { maxWidth: "100%", maxHeight: 44, objectFit: "contain" },
  wellRule: { borderTopWidth: 0.8, borderTopColor: T.ink, marginTop: 6, paddingTop: 4 },
  wellName: { fontSize: 8.5, fontWeight: "bold", color: T.ink },
  wellDetail: { fontSize: 7, color: T.muted, marginTop: 1, lineHeight: 1.3 },
  wellCaption: { fontSize: 7, color: T.muted, textAlign: "center", marginTop: 3 },
  muted: { fontSize: 8, color: T.muted, fontStyle: "italic" },

  // Measures
  measureValue: { fontSize: 8, fontWeight: "bold", color: T.ink, marginBottom: 3 },
  measureTrack: { height: 5, backgroundColor: T.divider, borderRadius: 3, marginBottom: 3 },
  measureFill: { height: 5, backgroundColor: T.primary, borderRadius: 3 },
  measureScale: { flexDirection: "row", justifyContent: "space-between" },
  measureScaleText: { fontSize: 6.5, color: T.muted },

  // Attachments
  attachmentItem: { marginBottom: 2 },
  attachmentLink: { fontSize: 8, color: T.primary, fontWeight: "bold", textDecoration: "underline", lineHeight: 1.3 },
  attachmentNote: { fontSize: 7, color: T.muted, lineHeight: 1.3 },

  // Journey
  journey: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  journeyStep: { flex: 1, alignItems: "center", position: "relative" },
  journeyLineLeft: { position: "absolute", top: 9, left: 0, width: "50%", height: 2 },
  journeyLineRight: { position: "absolute", top: 9, left: "50%", width: "50%", height: 2 },
  node: { width: 20, height: 20, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  nodeWaiting: { width: 20, height: 20, borderRadius: 999, borderWidth: 1.2, borderColor: T.neutral, backgroundColor: T.white },
  stepLabel: { fontSize: 8, fontWeight: "bold", color: T.ink, marginTop: 5, textAlign: "center" },
  stepWho: { fontSize: 7, color: T.muted, marginTop: 1, textAlign: "center", lineHeight: 1.3, paddingHorizontal: 2 },
  stepWhen: { fontSize: 7, color: T.muted, marginTop: 1, textAlign: "center" },

  // Sign-off
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: { width: CARD_WIDTH, backgroundColor: T.soft, borderRadius: 12, padding: 10, marginBottom: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardRole: { fontSize: 7.5, fontWeight: "bold", color: T.muted, width: "58%", lineHeight: 1.3 },
  cardSub: { fontSize: 7, color: T.muted, marginBottom: 6 },
  cardEvalHead: { fontSize: 7, fontWeight: "bold", color: T.muted, marginTop: 8, marginBottom: 3 },
  evalCard: { backgroundColor: T.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 8 },
  evalRow: { paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: T.divider },
  evalLabel: { fontSize: 7, color: T.muted, marginBottom: 2, lineHeight: 1.3 },
  evalRowPaper: { paddingVertical: 5 },
  pending: { borderWidth: 0.8, borderColor: T.divider, borderStyle: "dashed", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10 },
  pendingHead: { fontSize: 8, fontWeight: "bold", color: T.muted, marginBottom: 3 },
  pendingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 2 },
  pendingWho: { fontSize: 7.5, color: T.ink, flexGrow: 1, flexShrink: 1, paddingRight: 8, lineHeight: 1.3 },
  pendingState: { fontSize: 7.5, color: T.muted, flexShrink: 0 },

  // Control notes at the end
  controlRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  controlCell: { flexDirection: "row", marginRight: 16, marginBottom: 2 },
  controlLabel: { fontSize: 7, color: T.muted, marginRight: 4 },
  controlValue: { fontSize: 7, color: T.ink, fontWeight: "bold" },
  standards: { fontSize: 7, color: T.muted, lineHeight: 1.35, marginTop: 6 },
  noData: { fontSize: 8, color: T.muted, fontStyle: "italic", paddingVertical: 8 },
});

// ── Dates ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const TIME_ONLY = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "7 Oct 2026, 16:20" — day first, month in words, 24-hour clock. */
function humanDateTime(value: string, includeTime: boolean): string {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let hour = 0;
  let minute = 0;
  let hasTime = includeTime;
  const dateOnly = trimmed.match(DATE_ONLY);
  const local = trimmed.match(DATE_TIME);
  if (dateOnly) {
    year = Number(dateOnly[1]); month = Number(dateOnly[2]); day = Number(dateOnly[3]);
    hasTime = false;
  } else if (local) {
    year = Number(local[1]); month = Number(local[2]); day = Number(local[3]);
    hour = Number(local[4]); minute = Number(local[5]);
  } else {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return value;
    year = parsed.getFullYear(); month = parsed.getMonth() + 1; day = parsed.getDate();
    hour = parsed.getHours(); minute = parsed.getMinutes();
  }
  if (month < 1 || month > 12) return value;
  const date = `${day} ${MONTHS[month - 1]} ${year}`;
  return hasTime ? `${date}, ${pad2(hour)}:${pad2(minute)}` : date;
}

function humanTime(value: string): string {
  const match = value.trim().match(TIME_ONLY);
  return match ? `${match[1]}:${match[2]}` : value;
}

function fmtDate(value: string | undefined | null): string {
  if (!value) return "—";
  const formatted = humanDateTime(value, true);
  return formatted === value ? "N/A" : formatted;
}

function isDateLikeField(value: string, field: Partial<FormSubmissionField>): boolean {
  const type = field.type ?? "";
  const inputType = field.inputType ?? "";
  const dateish = type === "date" || type === "datetime" || inputType === "date" || inputType === "datetime" || inputType === "datetime-local";
  return dateish && /^\d{4}-\d{2}-\d{2}/.test(value.trim());
}

function fmtVal(value: unknown, field: Partial<FormSubmissionField> = {}): string {
  if (typeof value === "string" && isDateLikeField(value, field)) {
    const includeTime = field.inputType !== "date" && field.type !== "date";
    return humanDateTime(value, includeTime);
  }
  if (typeof value === "string" && field.inputType === "time") return humanTime(value);
  return formatPdfFieldValue(value, field);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isEmptyPdfValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fallbackPdfLabel(key: string): string {
  const decoded = key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return decoded
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

/** Columns that are how the record is filed, not what it says (see FormPdfDocument). */
const BOOKKEEPING_COLUMNS = new Set([
  "Id", "ID", "GUID", "Title", "ContentType", "ContentTypeId", "Attachments", "AuthorId", "EditorId",
  "Author", "Editor", "Created", "Modified", "FileSystemObjectType", "ServerRedirectedEmbedUri",
  "ServerRedirectedEmbedUrl", "ComplianceAssetId", "PermMask", "OData__UIVersionString", "OData__ColorTag",
  "PdfUrl", "RawJSON", "Status", "FormStatus", "CurrentLayer", "CurrentApprovalLayer", "EvaluationData",
  "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule", "PublishKey", "FormID", "FormId",
  "FormVersion", "SubmittedBy", "SubmittedAt", "Submitted_x0020_By", "SelectedBranch", "Selected_x0020_Branch",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
]);

function isBookkeepingColumn(key: string): boolean {
  return BOOKKEEPING_COLUMNS.has(key)
    || key === REFERENCE_NO_FIELD
    || key.startsWith("odata.")
    || key.startsWith("OData__")
    || /^L\d+_/.test(key);
}

function docControlCells(header: DocumentControlHeader | undefined, formVersion: string): { label: string; value: string }[] {
  if (!header) return [];
  const pairs: { label: string; value: string }[] = [
    { label: "Document no.", value: (header.documentNumber ?? "").trim() },
    { label: "Issue no.", value: (header.issueNumber ?? "").trim() },
    { label: "Effective date", value: humanDateTime((header.effectiveDate ?? "").trim(), false) },
    { label: "Revision no.", value: (header.revisionNumber ?? "").trim() || formVersion },
    { label: "Revision date", value: humanDateTime((header.revisionDate ?? "").trim(), false) },
  ];
  return pairs.filter((pair) => pair.value && pair.value !== "—" && pair.value !== "");
}

type Tone = "done" | "rejected" | "neutral" | "high" | "medium" | "low";

/** The word and tone a status prints with. The word is always in text, never colour alone. */
function statusInfo(status?: string): { label: string; tone: Tone } {
  const raw = (status || "").trim();
  const s = raw.toLowerCase();
  if (s.includes("reject")) return { label: "Rejected", tone: "rejected" };
  if (s.includes("approved") || s.includes("completed")) return { label: "Approved", tone: "done" };
  if (s.includes("confirm")) return { label: "Confirmed", tone: "done" };
  if (s.startsWith("manual ")) return { label: sentenceCase(raw), tone: "done" };
  if (s.includes("submit")) return { label: "Submitted", tone: "neutral" };
  return { label: raw ? sentenceCase(raw) : "Submitted", tone: "neutral" };
}

function sentenceCase(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function isBlankField(field: FormSubmissionField): boolean {
  return isEmptyPdfValue(field.value);
}

function isLongTextField(field: FormSubmissionField): boolean {
  const type = field.type.toLowerCase();
  const inputType = field.inputType?.toLowerCase() ?? "";
  return type === "comment" || type === "richedit" || type === "html" || inputType === "comment" || (field.rows ?? 0) > 1;
}

function lineCountForField(field: FormSubmissionField): number {
  if (isLongTextField(field)) return Math.max(4, Math.min(10, Math.trunc(field.rows ?? 5)));
  return 2;
}

/**
 * The note under a tick list whose entries could not be matched to a box. Kept
 * from the classic layout: a silently untouched list would be a false record.
 */
function unresolvedTickNote(unresolved: number): string {
  return `${unresolved} ${unresolved === 1 ? "tick was" : "ticks were"} stored against this item with no label the record could match.`;
}

function shouldRenderMeasure(field: FormSubmissionField): boolean {
  if (field.type === "rating") return true;
  if (field.inputType !== "number") return false;
  return typeof field.min === "number" && typeof field.max === "number" && field.max > field.min;
}

const NON_INPUT_EVALUATION_TYPES = new Set([
  "html", "image", "spacer", "divider", "pagebreak", "alert", "countdown", "datatable", "chartdisplay",
]);

function evaluationChildElements(element: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  for (const key of ["elements", "templateElements", "questions"]) {
    const value = element[key];
    if (Array.isArray(value)) children.push(...value.filter(isRecord));
  }
  const columns = element.columns;
  if (Array.isArray(columns)) {
    for (const column of columns) {
      if (isRecord(column) && Array.isArray(column.elements)) children.push(...column.elements.filter(isRecord));
    }
  }
  return children;
}

function emptyEvaluationFields(elements: Record<string, unknown>[]): FormSubmissionField[] {
  const fields: FormSubmissionField[] = [];
  const visit = (element: Record<string, unknown>): void => {
    const type = textValue(element.type).toLowerCase();
    const key = textValue(element.name);
    const children = evaluationChildElements(element);
    if (type === "panel" || type === "paneldynamic" || (!key && children.length > 0)) {
      for (const child of children) visit(child);
      return;
    }
    if (!key || NON_INPUT_EVALUATION_TYPES.has(type)) return;
    fields.push({
      key,
      label: textValue(element.title) || fallbackPdfLabel(key),
      type: textValue(element.type),
      inputType: textValue(element.inputType) || undefined,
      choices: Array.isArray(element.choices) ? element.choices : undefined,
      rateValues: Array.isArray(element.rateValues) ? element.rateValues : undefined,
      rateMin: numberValue(element.rateMin),
      rateMax: numberValue(element.rateMax),
      minRateDescription: textValue(element.minRateDescription) || undefined,
      maxRateDescription: textValue(element.maxRateDescription) || undefined,
      rows: numberValue(element.rows),
      labelTrue: textValue(element.labelTrue) || undefined,
      labelFalse: textValue(element.labelFalse) || undefined,
      value: "",
      kind: "field",
    });
  };
  for (const element of elements) visit(element);
  return fields;
}

function evaluationFieldsForLayer(layer: PdfLayerResult, includeEmpty: boolean): FormSubmissionField[] {
  const fields = layer.evaluationFields;
  const elements = layer.evaluationSurveyElements ?? [];
  if ((!fields || Object.keys(fields).length === 0) && includeEmpty) return emptyEvaluationFields(elements);
  if (!fields || Object.keys(fields).length === 0) return [];
  if (elements.length > 0) {
    return buildFormSubmissionSections({ pages: [{ name: "Evaluation", elements }] }, fields, {
      fallbackSectionTitle: "Evaluation",
      formatFallbackLabel: fallbackPdfLabel,
      includeUnansweredFields: true,
    }).flatMap((section) => section.fields);
  }
  return Object.entries(fields).map(([key, value]) => ({
    key,
    label: fallbackPdfLabel(key),
    type: "",
    value,
    kind: "field",
  }));
}

/** Validity window read off any start and end question holding a date. */
function findValidity(fields: FormSubmissionField[]): { start?: string; end?: string } {
  const found: { start?: string; end?: string } = {};
  for (const field of fields) {
    if (field.kind !== "field" || typeof field.value !== "string") continue;
    const value = field.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) continue;
    const named = `${field.key} ${field.label}`;
    if (!found.start && /start/i.test(named)) found.start = humanDateTime(value, true);
    else if (!found.end && /(end|expir|until|finish)/i.test(named)) found.end = humanDateTime(value, true);
  }
  return found;
}

/** "8 Oct 2026, 08:00 to 17:00" when both ends fall on one day, else both in full. */
function formatWindow(start?: string, end?: string): string {
  if (start && end) {
    const [startDay, startTime] = start.split(", ");
    const [endDay, endTime] = end.split(", ");
    if (startTime && endTime && startDay === endDay) return `${startDay}, ${startTime} to ${endTime}`;
    return `${start} to ${end}`;
  }
  return start ? `From ${start}` : `Until ${end ?? ""}`;
}

/** Risk level read off any risk or severity question. */
function findRisk(fields: FormSubmissionField[]): { text: string; tone: Tone } | null {
  for (const field of fields) {
    if (field.kind !== "field") continue;
    if (!/risk|severity/i.test(`${field.key} ${field.label}`)) continue;
    const text = fmtVal(field.value, field).trim();
    if (!text || text === "—") continue;
    if (/high|critical|severe/i.test(text)) return { text, tone: "high" };
    if (/medium|moderate/i.test(text)) return { text, tone: "medium" };
    if (/low|minor/i.test(text)) return { text, tone: "low" };
    return { text, tone: "neutral" };
  }
  return null;
}

// ── Glyphs and pills ──────────────────────────────────────────────────────

/** Drawn as vector paths: the built-in Helvetica has no tick or cross character. */
function CheckGlyph({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 3 }}>
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function CrossGlyph({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 3 }}>
      <Path d="M6 6L18 18M18 6L6 18" stroke={color} strokeWidth={3.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  if (tone === "high") {
    return (
      <View style={[S.pill, { borderColor: T.red, backgroundColor: T.redFill, paddingLeft: 3 }]}>
        <View style={S.bang}><Text style={S.bangText}>!</Text></View>
        <Text style={[S.pillText, { color: T.redInk }]}>{label}</Text>
      </View>
    );
  }
  const look = tone === "done"
    ? { border: T.green, ink: T.greenInk, fill: T.greenFill }
    : tone === "rejected" ? { border: T.red, ink: T.redInk, fill: T.redFill }
    : tone === "medium" ? { border: T.amber, ink: T.amberInk, fill: T.amberFill }
    : { border: T.neutral, ink: T.ink, fill: T.white };
  return (
    <View style={[S.pill, { borderColor: look.border, backgroundColor: look.fill }]}>
      {tone === "done" ? <CheckGlyph color={look.ink} /> : null}
      {tone === "rejected" ? <CrossGlyph color={look.ink} /> : null}
      <Text style={[S.pillText, { color: look.ink }]}>{label}</Text>
    </View>
  );
}

function RefPill({ reference }: { reference: string }) {
  return (
    <View style={S.refPill}>
      <Text style={S.refText}>{reference}</Text>
    </View>
  );
}

// ── Answers ───────────────────────────────────────────────────────────────

function renderImageTiles(sources: string[]) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {sources.map((src, index) => {
        const caption = imageCaption(src);
        return (
          <View key={`${src}-${index}`} style={S.tile} wrap={false}>
            <View style={S.tileFrame}>
              {isEmbeddableImage(src)
                ? <Image style={S.tileImage} src={src} />
                : <Text style={S.unembedded}>{"Image stored with the record\n(not embedded)"}</Text>}
            </View>
            {caption ? <Text style={S.tileCaption}>{caption}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** A signature's ink on its rule, captioned by who signed and when. */
function InkWell({ signature, caption, detail }: { signature?: string; caption: string; detail?: string }) {
  const ink = (signature ?? "").trim();
  return (
    <View style={{ width: 150 }} wrap={false}>
      <View style={S.well}>
        {ink && isEmbeddableImage(ink)
          ? <Image style={S.wellImage} src={ink} />
          : ink
            ? <Text style={S.unembedded}>Signed, image unavailable</Text>
            : <Text style={S.muted}>Not signed</Text>}
      </View>
      <Text style={S.wellCaption}>{caption}{detail ? ` · ${detail}` : ""}</Text>
    </View>
  );
}

function renderAttachmentLinks(value: unknown, positions?: Map<string, number>, total = 0) {
  const urls = attachmentUrls(value);
  if (urls.length === 0) return null;
  return (
    <View>
      {urls.map((url, index) => {
        const position = positions?.get(url);
        return (
          <View key={`${url}-${index}`} style={S.attachmentItem}>
            <Link src={absoluteAttachmentUrl(url)} style={S.attachmentLink}>{attachmentName(url)}</Link>
            {position
              ? <Text style={S.attachmentNote}>Attachment {position} of {total}, added after the last page of this record</Text>
              : null}
          </View>
        );
      })}
    </View>
  );
}

function renderMeasure(field: FormSubmissionField) {
  const measure = getPdfMeasureContext(field, field.value);
  if (!measure) return null;
  return (
    <View style={{ width: "100%" }}>
      <Text style={S.measureValue}>{measure.valueLabel}</Text>
      <View style={S.measureTrack}>
        <View style={[S.measureFill, { width: `${measure.percent}%` }]} />
      </View>
      <View style={S.measureScale}>
        <Text style={S.measureScaleText}>{measure.minLabel}</Text>
        <Text style={S.measureScaleText}>{measure.maxLabel}</Text>
      </View>
    </View>
  );
}

/** Chosen options as outlined pills; the rest as one muted line. */
function ChoiceAnswer({ field }: { field: FormSubmissionField }) {
  const { options, extras, unresolved } = readTicks(field);
  const chosen = options.filter((option) => option.ticked);
  const rest = options.filter((option) => !option.ticked);
  return (
    <View>
      {chosen.length > 0 ? (
        <View style={S.pillWrap}>
          {chosen.map((option, index) => (
            <View key={`${field.key}-${index}-${option.value}`} style={S.choicePill}>
              <CheckGlyph color={T.ink} />
              <Text style={S.choicePillText}>{option.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rest.length > 0 ? <Text style={S.notSelected}>Not selected: {rest.map((option) => option.label).join(", ")}</Text> : null}
      {extras.length > 0 ? <Text style={S.tickExtra}>Also: {extras.join(", ")}</Text> : null}
      {unresolved > 0 ? <Text style={S.tickNote}>{unresolvedTickNote(unresolved)}</Text> : null}
    </View>
  );
}

/** The blank form for a hand-filled record: boxes, or a line to write on. */
function PaperAnswer({ field }: { field: FormSubmissionField }) {
  if (isChoiceField(field)) {
    const { options, extras, unresolved } = readTicks(field);
    if (options.length > 0) {
      return (
        <View>
          <View style={S.paperOptions}>
            {options.map((option, index) => (
              <View key={`${field.key}-${index}-${option.value}`} style={S.paperOption}>
                <View style={S.paperBox}>{option.ticked ? <Text style={S.paperMark}>X</Text> : null}</View>
                <Text style={S.paperLabel}>{option.label}</Text>
              </View>
            ))}
          </View>
          {extras.length > 0 ? <Text style={S.tickExtra}>Also: {extras.join(", ")}</Text> : null}
          {unresolved > 0 ? <Text style={S.tickNote}>{unresolvedTickNote(unresolved)}</Text> : null}
        </View>
      );
    }
  }
  return (
    <View>
      {Array.from({ length: lineCountForField(field) }).map((_, index) => (
        <View key={`${field.key}-line-${index}`} style={S.paperLine} />
      ))}
    </View>
  );
}

interface AnswerContext {
  /** Who signed and when, printed under any ink in this answer. */
  signatureCaption: string;
  attachmentPositions?: Map<string, number>;
  attachmentTotal?: number;
}

/** One answer, whatever its kind. The same rules serve the form and the evaluations. */
function Answer({ field, ctx }: { field: FormSubmissionField; ctx: AnswerContext }) {
  const blank = isBlankField(field);
  if (isFileQuestionType(field.type)) {
    const links = renderAttachmentLinks(field.value, ctx.attachmentPositions, ctx.attachmentTotal);
    if (links) return links;
  }
  const sources = collectImageSources(field.value);
  if (isSignatureField(field)) {
    return blank
      ? <Text style={S.muted}>Not signed</Text>
      : <InkWell signature={sources[0]} caption={ctx.signatureCaption} />;
  }
  if (sources.length > 0) return renderImageTiles(sources);
  if (shouldListChoices(field)) return <ChoiceAnswer field={field} />;
  if (shouldRenderMeasure(field)) {
    const measure = renderMeasure(field);
    if (measure) return measure;
  }
  if (blank) return <Text style={S.noAnswer}>No answer recorded</Text>;
  const text = fmtVal(field.value, field) || "—";
  return <Text style={[S.answerText, text.length <= 20 ? S.answerShort : {}]}>{text}</Text>;
}

function renderMatrixField(field: FormSubmissionField) {
  const rows = field.matrixRows ?? [];
  const columns: NonNullable<FormSubmissionField["matrixColumns"]> = field.matrixColumns?.length
    ? field.matrixColumns
    : Object.keys(rows[0] ?? {}).map((key) => ({ name: key, title: key }));
  if (rows.length === 0 || columns.length === 0) return null;
  return (
    <View style={S.answerRow} wrap={false}>
      <Text style={S.question}>{field.label}</Text>
      <View style={[S.answer]}>
        <View style={S.miniList}>
          {rows.map((row, rowIndex) => {
            const values = columns
              .map((column) => fmtVal(row[column.name], { type: column.cellType, inputType: column.cellType, choices: column.choices }))
              .filter((value) => value.trim() !== "");
            if (values.length === 0) return null;
            const [first, ...rest] = values;
            return (
              <Text key={`${field.key}-${rowIndex}`} style={S.miniRow}>
                <Text style={S.miniStrong}>{first}</Text>
                {rest.length > 0 ? ` · ${rest.join(" · ")}` : ""}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ── Journey strip ─────────────────────────────────────────────────────────

interface JourneyStep {
  label: string;
  who: string;
  when: string;
  state: "done" | "rejected" | "waiting";
}

function journeySteps(meta: PdfFormData["meta"], layers: PdfLayerResult[], showSubmissionDate: boolean): JourneyStep[] {
  const steps: JourneyStep[] = [{
    label: "Filed",
    who: meta.submittedBy || "",
    when: showSubmissionDate ? fmtDate(meta.submittedAt) : "",
    state: "done",
  }];
  for (const layer of layers) {
    if (isAwaitingLayer(layer)) {
      steps.push({ label: "Waiting", who: layer.confirmerName || layer.email || "", when: "", state: "waiting" });
      continue;
    }
    const status = statusInfo(layer.status);
    const manual = layer.status.trim().toLowerCase().startsWith("manual ");
    steps.push({
      label: status.tone === "rejected" ? "Rejected" : layer.type === "evaluation" ? "Evaluated" : "Approved",
      who: manual ? "" : (layer.signerName || layer.confirmerName || layer.email || ""),
      when: manual ? "" : fmtDate(layer.signedAt),
      state: status.tone === "rejected" ? "rejected" : "done",
    });
  }
  return steps;
}

function Journey({ steps }: { steps: JourneyStep[] }) {
  const lineColour = (from: JourneyStep, to: JourneyStep) => (to.state === "waiting" || from.state === "rejected" ? T.neutral : T.green);
  return (
    <View style={S.journey} wrap={false}>
      {steps.map((step, index) => {
        const before = index > 0 ? steps[index - 1] : undefined;
        const after = steps[index + 1];
        return (
          <View key={`step-${index}`} style={S.journeyStep}>
            {before ? <View style={[S.journeyLineLeft, { backgroundColor: lineColour(before, step) }]} /> : null}
            {after ? <View style={[S.journeyLineRight, { backgroundColor: lineColour(step, after) }]} /> : null}
            {step.state === "waiting"
              ? <View style={S.nodeWaiting} />
              : (
                <View style={[S.node, { backgroundColor: step.state === "rejected" ? T.red : T.green }]}>
                  {step.state === "rejected"
                    ? <CrossGlyph color={T.white} size={8} />
                    : <CheckGlyph color={T.white} size={9} />}
                </View>
              )}
            <Text style={S.stepLabel}>{step.label}</Text>
            {step.who ? <Text style={S.stepWho}>{step.who}</Text> : null}
            {step.when ? <Text style={S.stepWhen}>{step.when}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

// ── Sign-off cards ────────────────────────────────────────────────────────

function SignCard({ role, pill, index, children }: { role: string; pill: ReactNode; index: number; children: ReactNode }) {
  return (
    <View style={[S.card, index % 3 !== 2 ? { marginRight: 9 } : {}]} wrap={false}>
      <View style={S.cardHead}>
        <Text style={S.cardRole}>{role}</Text>
        {pill}
      </View>
      {children}
    </View>
  );
}

function LayerCard({ layer, index, showSignature, showEvaluationDetails, includeEmptyEvaluationFields }: {
  layer: PdfLayerResult;
  index: number;
  showSignature: boolean;
  showEvaluationDetails: boolean;
  includeEmptyEvaluationFields: boolean;
}) {
  const status = statusInfo(layer.status);
  const evaluationFields = showEvaluationDetails && layer.type === "evaluation"
    ? evaluationFieldsForLayer(layer, includeEmptyEvaluationFields)
    : [];
  const email = (layer.confirmerEmail || layer.email || "").trim();
  // Signed like a paper form, as the classic layout does: "Approved By / name /
  // post". Only a personal decision is signed (see utils/signOff.ts); pending,
  // paper and cascaded layers keep the plain "Actioned by" line.
  const verdict = includeEmptyEvaluationFields ? null : signOffVerdictFromStatus(layer.rawStatus ?? layer.status);
  const person = verdict
    ? signOffName(layer.signerName || layer.confirmerName, email)
    : (layer.confirmerName || "").trim();
  const position = verdict ? signOffPosition(layer.signerPosition, layer.layerTitle) : "";
  const ink = includeEmptyEvaluationFields ? "" : (layer.signature || "").trim();
  // A rule to sign in pen is only drawn on the blank form. A layer that captured
  // no ink gets no signature block: an empty rule would read as ink that failed.
  const drawWell = showSignature && (ink !== "" || includeEmptyEvaluationFields);
  const caption = `${person || (layer.type === "evaluation" ? "Evaluator" : "Approver")} · ${fmtDate(layer.signedAt)}`;
  const role = `Layer ${layer.layerNumber} · ${layer.type === "evaluation" ? "Evaluation" : "Approval"}`;

  return (
    <SignCard role={role} index={index} pill={<Pill label={status.label} tone={status.tone} />}>
      {drawWell ? (
        <View style={S.well}>
          {ink && isEmbeddableImage(ink)
            ? <Image style={S.wellImage} src={ink} />
            : ink
              ? <Text style={S.unembedded}>Signed, image unavailable</Text>
              : null}
        </View>
      ) : null}
      <View style={drawWell ? S.wellRule : { marginTop: 2 }}>
        <Text style={[S.cardSub, verdict === "rejected" ? { color: T.red } : {}]}>{verdict ? signOffLabel(verdict) : "Actioned by"}</Text>
        <Text style={S.wellName}>{person || email || "—"}</Text>
        {position ? <Text style={S.wellDetail}>{position}</Text> : null}
        <Text style={S.wellDetail}>
          {fmtDate(layer.signedAt)}{person && email ? ` · ${email}` : ""}
        </Text>
        {layer.rejection ? <Text style={S.wellDetail}>Reason: {layer.rejection}</Text> : null}
      </View>

      {evaluationFields.length > 0 ? (
        <View style={S.evalCard}>
          <Text style={S.cardEvalHead}>Evaluation responses</Text>
          {evaluationFields.map((field, fieldIndex) => (
            includeEmptyEvaluationFields
              ? (
                <View key={`${field.key}-${fieldIndex}`} style={[S.evalRow, S.evalRowPaper]} wrap={false}>
                  <Text style={S.evalLabel}>{field.label}</Text>
                  <PaperAnswer field={field} />
                </View>
              )
              : (
                <View key={`${field.key}-${fieldIndex}`} style={S.evalRow} wrap={false}>
                  <Text style={S.evalLabel}>{field.label}</Text>
                  <Answer field={field} ctx={{ signatureCaption: caption }} />
                </View>
              )
          ))}
        </View>
      ) : null}
    </SignCard>
  );
}

// ── Running header and footer ─────────────────────────────────────────────

function RunningHeader({ title, reference }: { title: string; reference: string }) {
  return (
    <View fixed style={S.runWrap} render={({ pageNumber }) => (
      pageNumber > 1
        ? (
          <View style={S.runRow}>
            <Text style={S.runTitle}>{title}</Text>
            {reference ? (
              <Text style={S.runRef}>{reference}</Text>
            ) : null}
          </View>
        )
        : null
    )} />
  );
}

// ── Main document ─────────────────────────────────────────────────────────

export default function FormPdfDocumentSoft({ surveyJson, responseData, meta, layerResults, isoStandards, logoUrl, pdfConfig, documentHeader, company, attachmentsAppended, qrDataUrl }: PdfFormData) {
  const formSections = buildFormSubmissionSections(surveyJson, responseData, {
    fallbackSectionTitle: "Main Page",
    includeUnansweredFields: true,
    formatFallbackLabel: fallbackPdfLabel,
    shouldIncludeField: (key) => !isBookkeepingColumn(key),
  });
  const allFields = formSections.flatMap((section) => section.fields);
  const appended = attachmentsAppended ? collectRecordAttachments(surveyJson, responseData) : [];
  const attachmentPositions = new Map(appended.map((attachment, index) => [attachment.url, index + 1] as const));
  const layoutConfig = pdfConfig?.enabled === false ? undefined : pdfConfig;
  const title = layoutConfig?.title?.trim() || surveyJson?.title || meta.formTitle;
  const referenceNo = (meta.referenceNo || String(responseData?.[REFERENCE_NO_FIELD] ?? "")).trim();
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const comfortable = layoutConfig?.density === "comfortable";
  const showStatusBadge = layoutConfig?.showStatusBadge !== false;
  const showApproverChain = layoutConfig?.showApproverChain !== false;
  const showSignatures = layoutConfig?.showSignatures !== false;
  const showEvaluationDetails = layoutConfig?.showEvaluationDetails !== false;
  const showSubmissionDate = layoutConfig?.showSubmissionDate !== false;
  const includeEmptyEvaluationFields = layoutConfig?.includeEmptyEvaluationFields === true;
  const progress = chainProgress(layerResults, meta.formStatus);
  const detailLayers = includeEmptyEvaluationFields
    ? layerResults ?? []
    : (layerResults ?? []).filter((layer) => !isAwaitingLayer(layer));
  const status = statusInfo(meta.formStatus);
  const validity = findValidity(allFields);
  const risk = findRisk(allFields);
  const control = docControlCells(documentHeader, meta.formVersion);

  const profile = company ?? COMPANY;
  const letterheadName = profile.name || selectedCompany;
  const contactLines = companyContactLines(profile);
  const effectiveLogoUrl = layoutConfig?.headerLogoUrl?.trim() || logoUrl || profile.logoUrl;
  const logoHeight = comfortable ? 42 : 34;

  const signatureFields = allFields.filter((field) => field.kind === "field" && isSignatureField(field));
  const requesterSigned = showSignatures && signatureFields.length > 0;
  const hasSignOff = requesterSigned
    || ((showSignatures || showEvaluationDetails) && (layerResults?.length ?? 0) > 0)
    || Boolean(progress && !includeEmptyEvaluationFields);
  const submittedBy = meta.submittedBy || "—";

  // Answers that are signatures are drawn in the sign-off cards when the record
  // shows signatures; otherwise they stay in the answers so nothing is lost.
  const answerSections = formSections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => !(requesterSigned && field.kind === "field" && isSignatureField(field))),
    }))
    .filter((section) => section.fields.length > 0);
  const answerCount = answerSections.reduce((sum, section) => sum + section.fields.length, 0);

  const journey = showApproverChain && layerResults && layerResults.length > 0
    ? journeySteps(meta, layerResults, showSubmissionDate)
    : null;

  const runningHeaderTitle = title;
  const footerRef = referenceNo;
  const footerVersion = meta.formVersion ? `v${meta.formVersion}` : "";
  const generated = fmtDate(new Date().toISOString());
  const footerSecond = [layoutConfig?.footerText?.trim(), `Generated ${generated}`].filter(Boolean).join(" · ");

  return (
    <Document title={title} author={letterheadName || undefined}>
      <Page size="A4" style={[S.page, comfortable ? { fontSize: 9, lineHeight: 1.35 } : {}]}>
        <RunningHeader title={runningHeaderTitle} reference={referenceNo} />

        {/* ═══ HEADER BAND ═══ */}
        <View style={S.header}>
          <View style={S.brand}>
            {effectiveLogoUrl
              ? <Image style={{ height: logoHeight, maxWidth: 110 }} src={effectiveLogoUrl} />
              : <Text style={{ fontSize: 12, fontWeight: "bold", color: T.primary }}>{letterheadName || "LOGO"}</Text>}
            <View style={S.brandText}>
              {letterheadName ? <Text style={S.brandName}>{letterheadName}</Text> : null}
              {profile.addressLines.map((line) => (
                <Text key={line} style={S.brandLine}>{line}</Text>
              ))}
              {contactLines.map((line) => (
                <Text key={line} style={S.brandLine}>{line}</Text>
              ))}
            </View>
          </View>
          <View style={S.titleBlock}>
            <Text style={S.docTitle}>{title}</Text>
            <View style={S.pillRow}>
              {referenceNo ? <RefPill reference={referenceNo} /> : null}
              {showStatusBadge ? <Pill label={status.label} tone={status.tone} /> : null}
            </View>
          </View>
        </View>
        <View style={S.divider} />

        {progress && (
          <View style={S.notice} wrap={false}>
            <Text style={S.noticeHead}>{progress.headline}</Text>
            <Text style={S.noticeText}>{progress.note}</Text>
          </View>
        )}

        {/* ═══ SUMMARY CARD ═══ */}
        <View style={S.summary} wrap={false}>
          <View style={S.summaryMain}>
            <View style={S.summaryCells}>
              {validity.start || validity.end ? (
                <View style={[S.summaryCell, { marginRight: 26 }]}>
                  <Text style={S.summaryLabel}>Valid</Text>
                  <Text style={S.summaryWindow}>{formatWindow(validity.start, validity.end)}</Text>
                </View>
              ) : null}
              {risk ? (
                <View style={S.summaryCell}>
                  <Text style={S.summaryLabel}>Risk</Text>
                  <Pill label={risk.text} tone={risk.tone} />
                </View>
              ) : null}
              <View style={S.summaryCell}>
                <Text style={S.summaryLabel}>Filed by</Text>
                <Text style={S.summaryStrong}>{submittedBy}</Text>
                {showSubmissionDate ? <Text style={S.summaryNote}>{fmtDate(meta.submittedAt)}</Text> : null}
              </View>
              {showStatusBadge ? (
                <View style={S.summaryCell}>
                  <Text style={S.summaryLabel}>Status</Text>
                  <Pill label={status.label} tone={status.tone} />
                </View>
              ) : null}
            </View>
          </View>
          {qrDataUrl ? (
            <View style={S.qrBox}>
              <View style={S.qrFrame}>
                <Image style={S.qrImage} src={qrDataUrl} />
              </View>
              <Text style={S.qrCaption}>Scan to check it's still valid</Text>
            </View>
          ) : null}
        </View>

        {/* ═══ JOURNEY ═══ */}
        {journey ? <Journey steps={journey} /> : null}

        {/* ═══ ANSWERS ═══ */}
        {answerCount === 0 ? (
          <Text style={S.noData}>No form fields available.</Text>
        ) : answerSections.map((section) => (
          <View key={section.id} style={S.section}>
            <Text style={S.sectionHead}>{section.title}</Text>
            <View style={S.sectionRule} />
            {section.fields.map((field) => {
              if (field.kind === "matrix") {
                const matrix = renderMatrixField(field);
                return matrix ? <View key={field.key}>{matrix}</View> : null;
              }
              return (
                <View key={field.key} style={S.answerRow} wrap={false}>
                  <Text style={S.question}>{field.label}</Text>
                  <View style={S.answer}>
                    <Answer
                      field={field}
                      ctx={{
                        signatureCaption: `${submittedBy} · ${fmtDate(meta.submittedAt)}`,
                        attachmentPositions,
                        attachmentTotal: appended.length,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* ═══ SIGN-OFF ═══ */}
        {hasSignOff ? (
          <View style={S.section} break>
            <Text style={S.sectionHead}>Sign-off</Text>
            <View style={S.sectionRule} />
            <View style={S.grid}>
              {requesterSigned
                ? signatureFields.map((field, index) => {
                  const signed = !isBlankField(field);
                  const ink = collectImageSources(field.value)[0];
                  const pillTone: Tone = signed ? "done" : "neutral";
                  return (
                    <SignCard
                      key={`requester-${field.key}`}
                      role={field.label}
                      index={index}
                      pill={<Pill label={signed ? "Signed" : "Not signed"} tone={pillTone} />}
                    >
                      <View style={S.well}>
                        {signed && ink && isEmbeddableImage(ink)
                          ? <Image style={S.wellImage} src={ink} />
                          : signed
                            ? <Text style={S.unembedded}>Signed, image unavailable</Text>
                            : <Text style={S.muted}>Not signed</Text>}
                      </View>
                      <View style={S.wellRule}>
                        <Text style={S.wellName}>{submittedBy}</Text>
                        <Text style={S.wellDetail}>{fmtDate(meta.submittedAt)}</Text>
                      </View>
                    </SignCard>
                  );
                })
                : null}
              {(showSignatures || showEvaluationDetails) && layerResults && layerResults.length > 0
                ? detailLayers.map((layer, index) => (
                  <LayerCard
                    key={`layer-${index}`}
                    layer={layer}
                    index={index + (requesterSigned ? signatureFields.length : 0)}
                    showSignature={showSignatures}
                    showEvaluationDetails={showEvaluationDetails}
                    includeEmptyEvaluationFields={includeEmptyEvaluationFields}
                  />
                ))
                : null}
            </View>
            {progress && !includeEmptyEvaluationFields ? (
              <View style={S.pending} wrap={false}>
                <Text style={S.pendingHead}>Not signed</Text>
                {progress.awaiting.map((layer, index) => (
                  <View key={`awaiting-${index}`} style={S.pendingRow}>
                    <Text style={S.pendingWho}>
                      Layer {layer.layerNumber} · {layer.type === "evaluation" ? "Evaluation" : "Approval"}
                      {layer.email ? ` · ${layer.email}` : ""}
                    </Text>
                    <Text style={S.pendingState}>{statusInfo(layer.status).label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ═══ DOCUMENT CONTROL AND STANDARDS ═══ */}
        {control.length > 0 ? (
          <View wrap={false}>
            <Text style={S.sectionHead}>Document control</Text>
            <View style={S.controlRow}>
              {control.map((cell) => (
                <View key={cell.label} style={S.controlCell}>
                  <Text style={S.controlLabel}>{cell.label}</Text>
                  <Text style={S.controlValue}>{cell.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {isoStandards ? <Text style={S.standards}>Standards: {isoStandards}</Text> : null}

        {/* ═══ FOOTER ON EVERY PAGE ═══ */}
        <View style={S.footer} fixed>
          <View>
            <Text style={S.footerText}>
              {footerRef ? <Text style={S.footerStrong}>{footerRef}</Text> : null}
              {footerRef ? " · " : ""}
              {title}{footerVersion ? ` ${footerVersion}` : ""} · Printed copies are uncontrolled
            </Text>
            <Text style={S.footerText}>{footerSecond}</Text>
          </View>
        </View>
        {/* A page number has to sit directly on the page, measured from the top
            of the A4 sheet: react-pdf places a bottom-anchored render text far
            below the page, and inside the footer row it gets no room at all. */}
        <Text style={S.footerPage} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
