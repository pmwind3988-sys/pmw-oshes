/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { COMPANY, companyContactLines, type CompanyProfile } from "../config/company";
import { getSelectedCompany } from "./companySelection";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
import { collectImageSources, imageCaption, isEmbeddableImage, isRecord, isSignatureField, parseMaybeJson } from "./pdfImageSources";
import { chainProgress, isAwaitingLayer } from "./pdfLayerProgress";
import { REFERENCE_NO_FIELD } from "./referenceNumber";
import type { DocumentControlHeader, PdfConfig } from "../types";
// ── Types ─────────────────────────────────────────────────────────────────

export interface PdfFormData {
  surveyJson: {
    title?: string;
    description?: string;
    pages?: { name?: string; elements: Record<string, unknown>[] }[];
  };
  responseData: Record<string, unknown>;
  meta: {
    submittedBy: string;
    submittedAt: string;
    formTitle: string;
    formVersion: string;
    formStatus?: string;
    /** `[PREFIX-]DDMMYY-NNNN`, when the form issues reference numbers. */
    referenceNo?: string;
  };
  /** Layer results: each entry is one layer's data */
  layerResults?: PdfLayerResult[];
  isoStandards?: string;
  logoUrl?: string;
  pdfConfig?: PdfConfig;
  /** Document control header for the specific published profile. */
  documentHeader?: DocumentControlHeader;
  /** Letterhead identity. Defaults to the deployment's configured company. */
  company?: CompanyProfile;
}

export interface PdfLayerResult {
  layerNumber: number;
  type: "approval" | "evaluation";
  status: string;
  email: string;
  signedAt?: string;
  rejection?: string;
  signature?: string;
  /** For evaluation layers: submitted field values */
  evaluationFields?: Record<string, unknown>;
  /** Evaluation SurveyJS elements used to render labels and field-aware values */
  evaluationSurveyElements?: Record<string, unknown>[];
  /** For evaluation layers: confirmer name/email */
  confirmerEmail?: string;
  confirmerName?: string;
}

// ── Colors ────────────────────────────────────────────────────────────────

const C = {
  // Sampled off the mark in `public/logo.png` rather than picked to look near
  // it: the navy rule under the letterhead sits inches from the logo on a
  // printed page, and two blues that are almost the same read as a mistake.
  primary: "#2B2870",
  secondary: "#007DB0",
  border: "#D1D5DB",
  borderLight: "#E5E7EB",
  bg: "#F3F4F6",
  bgAlt: "#FAFBFC",
  text: "#111827",
  muted: "#6B7280",
  white: "#FFFFFF",
  // Status colors
  greenBg: "#D1FAE5",
  greenText: "#065F46",
  greenBorder: "#6EE7B7",
  redBg: "#FEE2E2",
  redText: "#991B1B",
  redBorder: "#FCA5A5",
  blueBg: "#DBEAFE",
  blueText: "#1E40AF",
  blueBorder: "#93C5FD",
  amberBg: "#FEF3C7",
  amberText: "#92400E",
  amberBorder: "#FCD34D",
  grayBg: "#F3F4F6",
  grayText: "#374151",
};

// ── Styles ────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 34, paddingBottom: 56, fontFamily: "Helvetica", fontSize: 8.5, color: C.text, lineHeight: 1.25 },

  // ── Letterhead ──
  // Name and address on the left, mark on the right, one heavy rule beneath the
  // pair. The rule is what makes the block read as stationery rather than as a
  // first row of content.
  letterhead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 },
  letterheadLeft: { flexGrow: 1, flexShrink: 1, paddingRight: 14 },
  // Centred across the full measure, above the address and the mark, the way
  // the company's own stationery sets it.
  companyName: { fontSize: 13, fontWeight: "bold", color: C.text, textAlign: "center", marginBottom: 6, letterSpacing: 0.2 },
  companyLine: { fontSize: 8, color: C.text, lineHeight: 1.35 },
  companyContact: { fontSize: 8, color: C.text, lineHeight: 1.35 },
  // No width, only a height and a ceiling. react-pdf measures the raster and
  // derives the width from its own aspect ratio, so one number resizes the mark
  // for any page size or density and it is never stretched to fit a box.
  logoBox: { flexShrink: 0, alignItems: "flex-end", justifyContent: "flex-start" },
  logoFallback: { fontSize: 15, fontWeight: "bold", color: C.primary, letterSpacing: 1 },
  rule: { height: 2, backgroundColor: C.primary, marginBottom: 9 },

  // ── Document band: who/what on the left, the document's own facts on the right ──
  docBand: { flexDirection: "row", alignItems: "flex-start", marginBottom: 11 },
  docBandLeft: { width: "50%", paddingRight: 14 },
  docBandRight: { width: "50%" },
  bandLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  bandHeadline: { fontSize: 11, fontWeight: "bold", color: C.primary, marginBottom: 2 },
  bandLine: { fontSize: 8, color: C.text, lineHeight: 1.35 },
  // The reference is the one thing read back over the phone and filed by hand,
  // so it is set at the size of the quotation number it replaces.
  docTitle: { fontSize: 13, fontWeight: "bold", color: C.text, textAlign: "right", marginBottom: 5, lineHeight: 1.15 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  metaLabel: { fontSize: 8, color: C.muted },
  metaValue: { fontSize: 8, color: C.text, fontWeight: "bold", textAlign: "right" },

  // Status badge
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 8, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, borderWidth: 1 },

  // ── Section headings ──
  sectionLabel: { fontSize: 8, fontWeight: "bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5 },
  pageSection: { marginBottom: 18 },
  approvalPageSection: { marginBottom: 14 },
  tableBlock: { borderWidth: 0.5, borderColor: C.border, marginTop: 2 },
  subSectionLabel: { fontSize: 7.5, fontWeight: "bold", color: C.primary, marginBottom: 3, marginTop: 6 },

  // ── The data table ──
  // One bordered table with a solid navy head, the way the printed quotation
  // sets its line items. A numbered first column is what makes a response
  // referable in a phone call: "item 4 is wrong" beats "the third box down".
  dataTable: { borderWidth: 0.5, borderColor: C.border },
  dataHeadRow: { flexDirection: "row", backgroundColor: C.primary },
  dataHeadText: { color: C.white, fontSize: 7, fontWeight: "bold", paddingHorizontal: 5, paddingVertical: 4 },
  dataGroupRow: { backgroundColor: C.bg, borderTopWidth: 0.5, borderTopColor: C.border, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingHorizontal: 5, paddingVertical: 3 },
  dataGroupText: { fontSize: 7.5, fontWeight: "bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.5 },
  colIndex: { width: "7%" },
  colQuestion: { width: "40%" },
  colAnswer: { width: "53%" },

  // ── Layer table ──
  layerRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingVertical: 3.5, alignItems: "flex-start" },
  layerHeader: { backgroundColor: C.primary },
  layerHeaderText: { color: C.white, fontSize: 6.5, fontWeight: "bold", paddingHorizontal: 4, paddingVertical: 3 },
  layerCell: { paddingHorizontal: 4, fontSize: 7, color: C.text, lineHeight: 1.25 },
  colNum: { width: "6%" },
  colType: { width: "12%" },
  colStatus: { width: "13%" },
  colEmail: { width: "21%" },
  colTime: { width: "20%" },
  colReason: { width: "28%" },

  // ── Layer detail cards ──
  // Every layer gets a card, including the ones that carry no ink. A layer that
  // is simply absent from the page reads as a step that never happened, which
  // is a different claim from "approved, no signature captured".
  layerCard: { borderWidth: 0.5, borderColor: C.border, marginBottom: 8 },
  layerCardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.bg, paddingHorizontal: 7, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.border },
  layerCardTitle: { fontSize: 8, fontWeight: "bold", color: C.primary },
  layerCardStatus: { fontSize: 7.5, fontWeight: "bold" },
  layerCardBody: { flexDirection: "row", padding: 7 },
  layerCardFacts: { flexGrow: 1, flexShrink: 1, paddingRight: 10 },

  // ── Signature block ──
  sigLabel: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  sigName: { fontSize: 8, fontWeight: "bold", color: C.text, marginTop: 1 },
  sigDetail: { fontSize: 6.5, color: C.muted, marginTop: 1.5, lineHeight: 1.3 },
  // A fixed-height well with a rule under it. The ink sits on the rule when
  // there is ink; when there is not, the rule is a place to sign in pen, which
  // is the one thing an empty white rectangle failed to be.
  sigWell: { width: 118, flexShrink: 0 },
  sigInk: { height: 34, justifyContent: "flex-end", alignItems: "center" },
  sigImage: { maxWidth: 116, maxHeight: 34, objectFit: "contain" },
  sigRule: { borderBottomWidth: 0.8, borderBottomColor: C.text, marginTop: 2 },
  sigCaption: { fontSize: 6, color: C.muted, textAlign: "center", marginTop: 2 },
  sigMissing: { fontSize: 6, color: C.muted, fontStyle: "italic", textAlign: "center" },

  // ── Field rows ──
  fieldRow: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 5, borderBottomWidth: 0.4, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  fieldRowAlt: { backgroundColor: C.bgAlt },
  fieldIndex: { width: "7%", fontSize: 7.5, color: C.muted },
  fieldLabel: { width: "40%", fontSize: 7.5, color: C.text, paddingRight: 8, lineHeight: 1.3 },
  fieldValue: { width: "53%", fontSize: 7.5, color: C.text, fontWeight: "bold", lineHeight: 1.3 },
  imageGrid: { width: "53%", flexDirection: "row", flexWrap: "wrap" },
  imageTile: { width: "46%", borderWidth: 0.5, borderColor: C.border, backgroundColor: C.white, padding: 4, marginRight: 6, marginBottom: 5 },
  imageFrame: { height: 76, justifyContent: "center", alignItems: "center" },
  imagePreview: { maxWidth: "100%", maxHeight: 74, objectFit: "contain" },
  imageCaption: { fontSize: 5.5, color: C.muted, marginTop: 3, textAlign: "center" },
  imageMissing: { fontSize: 6, color: C.muted, fontStyle: "italic", textAlign: "center", lineHeight: 1.3 },
  measureBox: { width: "53%" },
  measureValue: { fontSize: 7, fontWeight: "bold", color: C.text, marginBottom: 3 },
  measureTrack: { height: 5, backgroundColor: C.borderLight, borderRadius: 2.5, marginBottom: 3 },
  measureFill: { height: 5, backgroundColor: C.primary, borderRadius: 2.5 },
  measureScale: { flexDirection: "row", justifyContent: "space-between" },
  measureScaleText: { fontSize: 5.5, color: C.muted },

  // ── Eval fields sub-table ──
  evalSubRow: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 7, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  evalSubLabel: { width: "40%", fontSize: 7, color: C.muted, paddingRight: 6, lineHeight: 1.25 },
  evalSubValue: { width: "53%", fontSize: 7, color: C.text, lineHeight: 1.25 },
  paperEvalRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  paperEvalLabel: { width: "30%", fontSize: 10, color: C.text, paddingRight: 10, lineHeight: 1.35 },
  paperFieldBox: { width: "66%" },
  paperLine: { height: 32, borderBottomWidth: 0.9, borderBottomColor: C.border, marginBottom: 8 },
  paperLineText: { fontSize: 9.5, color: C.text, lineHeight: 1.25 },
  paperOptionGroup: { width: "70%", flexDirection: "row", flexWrap: "wrap" },
  paperOption: { flexDirection: "row", alignItems: "center", marginRight: 20, marginBottom: 11 },
  paperOptionBox: { width: 15, height: 15, borderWidth: 1, borderColor: C.text, marginRight: 7, alignItems: "center", justifyContent: "center" },
  paperOptionMark: { fontSize: 10, fontWeight: "bold", lineHeight: 1 },
  paperOptionLabel: { fontSize: 9.5, color: C.text, lineHeight: 1.25 },

  // ── Progress notice ──
  // A ruled strip, not a watermark: it has to survive a photocopy and it has to
  // be read before the signature page, because it is what stops an interim copy
  // being filed as the signed one.
  notice: { borderWidth: 0.8, borderColor: C.amberBorder, backgroundColor: C.amberBg, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 11 },
  noticeLabel: { fontSize: 7.5, fontWeight: "bold", color: C.amberText, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 1.5 },
  noticeText: { fontSize: 7.5, color: C.text, lineHeight: 1.35 },

  // ── Layers still to sign ──
  pendingBlock: { borderWidth: 0.5, borderColor: C.border, borderStyle: "dashed", paddingHorizontal: 7, paddingVertical: 5 },
  pendingHead: { fontSize: 7.5, fontWeight: "bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  pendingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 2 },
  pendingWho: { fontSize: 7.5, color: C.text, flexGrow: 1, flexShrink: 1, paddingRight: 8, lineHeight: 1.3 },
  pendingState: { fontSize: 7, color: C.muted, flexShrink: 0 },

  // ── No data ──
  noData: { fontSize: 7.5, color: C.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 10 },

  // ── Notes ──
  // The quotation's "Conditions of sales" slot. Standing text about the
  // document, set below the content and above the rule, not floated as a
  // centred afterthought.
  notesBlock: { marginTop: 12 },
  notesHeading: { fontSize: 7.5, fontWeight: "bold", color: C.text, marginBottom: 2 },
  notesLine: { fontSize: 7, color: C.text, lineHeight: 1.35 },

  // ── Footer ──
  footer: { position: "absolute", bottom: 24, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 0.5, borderTopColor: C.border, fontSize: 6.5, color: C.muted },

  // ── Matrix table ──
  matrixSection: { marginBottom: 10 },
  matrixTable: { marginBottom: 6, borderWidth: 0.5, borderColor: C.border },
  matrixHeaderRow: { flexDirection: "row", backgroundColor: C.primary },
  matrixHeaderCell: { paddingHorizontal: 4, paddingVertical: 3.5, borderRightWidth: 0.5, borderRightColor: C.white },
  matrixHeaderText: { fontSize: 6.5, fontWeight: "bold", color: C.white },
  matrixDataRow: { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: C.borderLight },
  matrixDataRowAlt: { backgroundColor: C.bgAlt },
  matrixDataCell: { paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.3, borderRightColor: C.borderLight },
  matrixDataText: { fontSize: 7, color: C.text },
  matrixFieldLabel: { fontSize: 7.5, fontWeight: "bold", color: C.text, marginBottom: 3, marginTop: 2 },
  formSection: { marginBottom: 8 },
});

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  const formatted = formatPdfDateTimeValue(d, true);
  return formatted === d ? "N/A" : formatted;
}

function fmtVal(v: unknown, field: Partial<FormSubmissionField> = {}): string {
  return formatPdfFieldValue(v, field);
}

function isEmptyPdfValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function fallbackPdfLabel(key: string): string {
  const decoded = key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return decoded
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

function docControlCells(
  header: DocumentControlHeader | undefined,
  formVersion: string,
): { label: string; value: string }[] {
  if (!header) return [];
  const pairs: { label: string; value: string }[] = [
    { label: "Document No.", value: (header.documentNumber ?? "").trim() },
    { label: "Issue No.", value: (header.issueNumber ?? "").trim() },
    { label: "Effective Date", value: formatPdfDateTimeValue((header.effectiveDate ?? "").trim(), false) },
    { label: "Revision No.", value: (header.revisionNumber ?? "").trim() || formVersion },
    { label: "Revision Date", value: formatPdfDateTimeValue((header.revisionDate ?? "").trim(), false) },
  ];
  return pairs.filter((pair) => pair.value && pair.value !== "—");
}

function badgeStyle(status?: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("reject")) return { bg: C.redBg, text: C.redText, border: C.redBorder, label: "REJECTED" };
  if (s.includes("approved") || s.includes("completed")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "APPROVED" };
  if (s.includes("confirm")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "CONFIRMED" };
  if (s.includes("submit")) return { bg: C.blueBg, text: C.blueText, border: C.blueBorder, label: "SUBMITTED" };
  return { bg: C.grayBg, text: C.grayText, border: C.borderLight, label: (status || "SUBMITTED").toUpperCase() };
}

// ── Layer row component ───────────────────────────────────────────────────

function LayerRow({ layer }: { layer: PdfLayerResult; isLast: boolean }) {
  const badge = badgeStyle(layer.status);
  const isManualPaper = layer.status.trim().toLowerCase().startsWith("manual ");
  const rejectedAtLayer = layer.status.toLowerCase().includes("rejected at layer") ? layer.status : "";
  // An evaluation layer used to print "Confirmed" in its remarks whatever its
  // status said, so a layer nobody had opened yet was reported as confirmed.
  const remarks = isManualPaper || isAwaitingLayer(layer)
    ? ""
    : layer.rejection || rejectedAtLayer || (layer.type === "evaluation" ? "Confirmed" : "");
  return (
    <View style={S.layerRow} wrap={false}>
      <Text style={[S.layerCell, S.colNum]}>{layer.layerNumber}</Text>
      <Text style={[S.layerCell, S.colType]}>{layer.type === "evaluation" ? "Eval" : "Approval"}</Text>
      <Text style={[S.layerCell, S.colStatus, { color: badge.text }]}>{badge.label}</Text>
      <Text style={[S.layerCell, S.colEmail]}>{isManualPaper ? "" : layer.email || ""}</Text>
      <Text style={[S.layerCell, S.colTime]}>{isManualPaper ? "" : fmtDate(layer.signedAt)}</Text>
      <Text style={[S.layerCell, S.colReason]}>{remarks}</Text>
    </View>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────

function renderMatrixField(field: FormSubmissionField) {
  const rows = field.matrixRows ?? [];
  const columns: NonNullable<FormSubmissionField["matrixColumns"]> = field.matrixColumns?.length
    ? field.matrixColumns
    : Object.keys(rows[0] ?? {}).map((key) => ({ name: key, title: key }));
  if (rows.length === 0 || columns.length === 0) return null;

  const colPct = `${Math.max(10, Math.floor(100 / columns.length))}%`;
  return (
    <View style={S.matrixSection} wrap={false}>
      <Text style={S.matrixFieldLabel}>{field.label}</Text>
      <View style={S.matrixTable}>
        <View style={S.matrixHeaderRow}>
          {columns.map((column, index) => (
            <View key={column.name} style={[S.matrixHeaderCell, { width: colPct }, index === columns.length - 1 ? { borderRightWidth: 0 } : {}]}>
              <Text style={S.matrixHeaderText}>{column.title || column.name}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={`${field.key}-${rowIndex}`} style={[S.matrixDataRow, rowIndex % 2 === 1 ? S.matrixDataRowAlt : {}]}>
            {columns.map((column, columnIndex) => (
              <View key={`${field.key}-${rowIndex}-${column.name}`} style={[S.matrixDataCell, { width: colPct }, columnIndex === columns.length - 1 ? { borderRightWidth: 0 } : {}]}>
                <Text style={S.matrixDataText}>{fmtVal(row[column.name], { type: column.cellType, inputType: column.cellType, choices: column.choices })}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function shouldRenderMeasure(field: FormSubmissionField): boolean {
  if (field.type === "rating") return true;
  if (field.inputType !== "number") return false;
  return typeof field.min === "number" && typeof field.max === "number" && field.max > field.min;
}

function renderMeasureValue(field: FormSubmissionField) {
  const measure = getPdfMeasureContext(field, field.value);
  if (!measure) return null;
  return (
    <View style={S.measureBox}>
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

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function choiceOption(choice: unknown): { value: string; label: string } | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    const value = String(choice);
    return { value, label: value };
  }
  if (!isRecord(choice)) return null;
  const rawValue = choice.value ?? choice.itemValue ?? choice.id ?? choice.name;
  const value = optionText(rawValue);
  if (!value) return null;
  const label = optionText(choice.text) || optionText(choice.title) || optionText(choice.label) || value;
  return { value, label };
}

function normalizedSelectedValues(value: unknown): Set<string> {
  if (isEmptyPdfValue(value)) return new Set();
  const parsed = typeof value === "string" ? parseMaybeJson(value) ?? value : value;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return new Set(values.map((entry) => String(entry)));
}

function choiceOptionsForField(field: FormSubmissionField): { value: string; label: string }[] {
  const type = field.type.toLowerCase();
  if (type === "boolean" || type === "consent") {
    return [
      { value: "true", label: field.labelTrue || "Yes" },
      { value: "false", label: field.labelFalse || "No" },
    ];
  }
  return (field.choices ?? []).map(choiceOption).filter((option): option is { value: string; label: string } => option !== null);
}

function shouldRenderTickboxes(field: FormSubmissionField): boolean {
  const type = field.type.toLowerCase();
  return ["boolean", "consent", "dropdown", "radiogroup", "checkbox", "tagbox", "buttongroup"].includes(type)
    || ((field.choices?.length ?? 0) > 0 && ["", "text"].includes(type));
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

function renderPaperLines(field: FormSubmissionField) {
  const lines = Array.from({ length: lineCountForField(field) });
  return (
    <View style={S.paperFieldBox}>
      {lines.map((_, index) => (
        <View key={`${field.key}-line-${index}`} style={S.paperLine} />
      ))}
    </View>
  );
}

function renderTickboxOptions(field: FormSubmissionField) {
  const options = choiceOptionsForField(field);
  if (options.length === 0) return renderPaperLines(field);
  const selected = normalizedSelectedValues(field.value);
  if (field.type.toLowerCase() === "boolean" || field.type.toLowerCase() === "consent") {
    const boolValue = typeof field.value === "boolean" ? String(field.value) : String(field.value).toLowerCase();
    if (boolValue === "yes") selected.add("true");
    if (boolValue === "no") selected.add("false");
  }
  return (
    <View style={S.paperOptionGroup}>
      {options.map((option) => (
        <View key={`${field.key}-${option.value}`} style={S.paperOption}>
          <View style={S.paperOptionBox}>
            {selected.has(option.value) ? <Text style={S.paperOptionMark}>X</Text> : null}
          </View>
          <Text style={S.paperOptionLabel}>{option.label}</Text>
        </View>
      ))}
    </View>
  );
}

function renderPaperFieldValue(field: FormSubmissionField) {
  if (shouldRenderTickboxes(field)) return renderTickboxOptions(field);
  return renderPaperLines(field);
}

const NON_INPUT_EVALUATION_TYPES = new Set([
  "html",
  "image",
  "spacer",
  "divider",
  "pagebreak",
  "alert",
  "countdown",
  "datatable",
  "chartdisplay",
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
      if (isRecord(column) && Array.isArray(column.elements)) {
        children.push(...column.elements.filter(isRecord));
      }
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
      includeAdditionalFields: true,
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

function renderImageSources(sources: string[]) {
  if (sources.length === 0) return null;
  return (
    <View style={S.imageGrid}>
      {sources.map((src, index) => {
        const caption = imageCaption(src);
        return (
          <View key={`${src}-${index}`} style={S.imageTile} wrap={false}>
            <View style={S.imageFrame}>
              {isEmbeddableImage(src)
                ? <Image style={S.imagePreview} src={src} />
                : <Text style={S.imageMissing}>Image stored with the record{"\n"}(not embedded)</Text>}
            </View>
            {caption ? <Text style={S.imageCaption}>{caption}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A signature well: the ink, the rule it sits on, and who it belongs to.
 *
 * The rule is drawn whether or not there is ink. An approver who signed on
 * paper, or whose stored image could not be fetched, leaves a line to sign
 * rather than a blank the reader has to interpret.
 */
function SignatureWell({ signature, caption }: { signature?: string; caption: string }) {
  const ink = (signature ?? "").trim();
  return (
    <View style={S.sigWell} wrap={false}>
      <View style={S.sigInk}>
        {ink && isEmbeddableImage(ink)
          ? <Image style={S.sigImage} src={ink} />
          : ink
            ? <Text style={S.sigMissing}>Signed — image unavailable</Text>
            : null}
      </View>
      <View style={S.sigRule} />
      <Text style={S.sigCaption}>{caption}</Text>
    </View>
  );
}


/**
 * One question and its answer, as a numbered row of the data table.
 *
 * `index` is the running number across the whole table rather than within a
 * section, so "item 12" identifies one row of one document.
 */
function FieldRow({ field, index, striped }: { field: FormSubmissionField; index: number; striped: boolean }) {
  const imageSources = collectImageSources(field.value);
  const measure = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;

  return (
    <View style={[S.fieldRow, striped ? S.fieldRowAlt : {}]} wrap={false}>
      <Text style={S.fieldIndex}>{index}</Text>
      <Text style={S.fieldLabel}>{field.label}</Text>
      {isSignatureField(field)
        ? <View style={S.imageGrid}><SignatureWell signature={imageSources[0]} caption={field.label} /></View>
        : imageSources.length > 0
          ? renderImageSources(imageSources)
          : measure || <Text style={S.fieldValue}>{fmtVal(field.value, field) || "—"}</Text>}
    </View>
  );
}

/**
 * One layer's own page-block: what it decided, who decided it, and the ink.
 *
 * Every layer that reached a decision gets one, approval and evaluation alike.
 * The previous document only drew a block for layers that carried a signature
 * image, so a paper approval or an unfetchable signature removed the whole
 * layer from the record rather than removing only its picture.
 */
function LayerDetailCard({
  layer,
  showSignature,
  showEvaluationDetails,
  includeEmptyEvaluationFields,
  primary,
}: {
  layer: PdfLayerResult;
  showSignature: boolean;
  showEvaluationDetails: boolean;
  includeEmptyEvaluationFields: boolean;
  primary: string;
}) {
  const badge = badgeStyle(layer.status);
  const evaluationFields = showEvaluationDetails && layer.type === "evaluation"
    ? evaluationFieldsForLayer(layer, includeEmptyEvaluationFields)
    : [];
  const who = layer.confirmerName || layer.confirmerEmail || layer.email || "";

  return (
    <View style={S.layerCard} wrap={false}>
      <View style={S.layerCardHead}>
        <Text style={[S.layerCardTitle, { color: primary }]}>
          Layer {layer.layerNumber} · {layer.type === "evaluation" ? "Evaluation" : "Approval"}
        </Text>
        <Text style={[S.layerCardStatus, { color: badge.text }]}>{badge.label}</Text>
      </View>

      <View style={S.layerCardBody}>
        <View style={S.layerCardFacts}>
          <Text style={S.sigLabel}>Actioned by</Text>
          <Text style={S.sigName}>{who || "—"}</Text>
          <Text style={S.sigDetail}>{fmtDate(layer.signedAt)}</Text>
          {layer.rejection ? <Text style={S.sigDetail}>Reason: {layer.rejection}</Text> : null}
        </View>
        {showSignature ? <SignatureWell signature={layer.signature} caption={who || "Signature"} /> : null}
      </View>

      {evaluationFields.length > 0 && (
        <View>
          <View style={S.dataGroupRow}>
            <Text style={S.dataGroupText}>Evaluation responses</Text>
          </View>
          {evaluationFields.map((field, index) => {
            const imageSources = collectImageSources(field.value);
            const measure = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
            return (
              <View key={`${field.key}-${index}`} style={includeEmptyEvaluationFields ? S.paperEvalRow : S.evalSubRow} wrap={false}>
                <Text style={includeEmptyEvaluationFields ? S.paperEvalLabel : S.evalSubLabel}>{field.label}</Text>
                {includeEmptyEvaluationFields
                  ? renderPaperFieldValue(field)
                  : isSignatureField(field)
                    ? <View style={S.imageGrid}><SignatureWell signature={imageSources[0]} caption={field.label} /></View>
                    : imageSources.length > 0
                      ? renderImageSources(imageSources)
                      : measure || <Text style={S.evalSubValue}>{fmtVal(field.value, field) || "—"}</Text>}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function FormPdfDocument({ surveyJson, responseData, meta, layerResults, isoStandards, logoUrl, pdfConfig, documentHeader, company }: PdfFormData) {
  const formSections = buildFormSubmissionSections(surveyJson, responseData, {
    fallbackSectionTitle: "Main Page",
    includeAdditionalFields: false,
  });
  const layoutConfig = pdfConfig?.enabled === false ? undefined : pdfConfig;
  const title = layoutConfig?.title?.trim() || surveyJson?.title || meta.formTitle;
  const badge = badgeStyle(meta.formStatus);
  // Falls back to the stored column so any caller that hands over the raw list
  // item gets the reference printed without having to lift it into meta itself.
  const referenceNo = (meta.referenceNo || String(responseData?.[REFERENCE_NO_FIELD] ?? "")).trim();
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const primary = layoutConfig?.primaryColor?.trim() || C.primary;
  const comfortable = layoutConfig?.density === "comfortable";
  const showStatusBadge = layoutConfig?.showStatusBadge !== false;
  const showApproverChain = layoutConfig?.showApproverChain !== false;
  const showSignatures = layoutConfig?.showSignatures !== false;
  const showEvaluationDetails = layoutConfig?.showEvaluationDetails !== false;
  const includeEmptyEvaluationFields = layoutConfig?.includeEmptyEvaluationFields === true;
  const progress = chainProgress(layerResults, meta.formStatus);
  // A layer detail card is a record of a decision, so only a layer that reached
  // one gets one. The exception is the blank-form mode, whose whole purpose is
  // printing an unsigned evaluation for someone to fill in by hand.
  const detailLayers = includeEmptyEvaluationFields
    ? layerResults ?? []
    : (layerResults ?? []).filter((layer) => !isAwaitingLayer(layer));

  const profile = company ?? COMPANY;
  const letterheadName = profile.name || selectedCompany;
  const contactLines = companyContactLines(profile);
  const effectiveLogoUrl = layoutConfig?.headerLogoUrl?.trim() || logoUrl || profile.logoUrl;
  // The mark is given a height and a width ceiling, never a width. react-pdf
  // measures the raster and derives the other dimension from its own ratio, so
  // this single number rescales the logo for a denser layout or a different
  // paper size without ever squashing it.
  const logoHeight = comfortable ? 46 : 40;

  const controlCells = docControlCells(documentHeader, meta.formVersion);
  const metaRows: { label: string; value: string }[] = [
    { label: "Date", value: fmtDate(meta.submittedAt) },
    { label: "Form", value: meta.formTitle },
    { label: "Version", value: `v${meta.formVersion}` },
    ...controlCells.map((cell) => ({ label: cell.label, value: cell.value })),
  ];

  // The table numbers items continuously across sections, so the counter lives
  // outside the section loop.
  let itemNumber = 0;

  return (
    <Document title={title} author={letterheadName || undefined}>
      <Page size="A4" style={[S.page, comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        {/* ═══ LETTERHEAD ═══ */}
        {letterheadName ? <Text style={S.companyName}>{letterheadName}</Text> : null}
        <View style={S.letterhead}>
          <View style={S.letterheadLeft}>
            {profile.addressLines.map((line) => (
              <Text key={line} style={S.companyLine}>{line}</Text>
            ))}
            {contactLines.map((line) => (
              <Text key={line} style={S.companyContact}>{line}</Text>
            ))}
          </View>
          <View style={S.logoBox}>
            {effectiveLogoUrl
              ? <Image style={{ height: logoHeight, maxWidth: 170 }} src={effectiveLogoUrl} />
              : <Text style={[S.logoFallback, { color: primary }]}>{letterheadName || "LOGO"}</Text>}
          </View>
        </View>
        <View style={[S.rule, { backgroundColor: primary }]} />

        {/* ═══ DOCUMENT BAND ═══ */}
        <View style={S.docBand}>
          <View style={S.docBandLeft}>
            <Text style={S.bandLabel}>Submitted By</Text>
            <Text style={S.bandHeadline}>{meta.submittedBy || "—"}</Text>
            {selectedCompany && letterheadName !== selectedCompany
              ? <Text style={S.bandLine}>Company: {selectedCompany}</Text>
              : null}
            {showStatusBadge && (
              <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border, marginTop: 5, marginBottom: 0 }]}>
                <Text style={{ color: badge.text }}>{badge.label}</Text>
              </View>
            )}
          </View>
          <View style={S.docBandRight}>
            <Text style={S.docTitle}>{title}{referenceNo ? ` No. ${referenceNo}` : ""}</Text>
            {metaRows.map((row) => (
              <View key={row.label} style={S.metaRow}>
                <Text style={S.metaLabel}>{row.label} :</Text>
                <Text style={S.metaValue}>{row.value || "-"}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ═══ PROGRESS NOTICE ═══ */}
        {progress && (
          <View style={S.notice} wrap={false}>
            <Text style={S.noticeLabel}>{progress.headline}</Text>
            <Text style={S.noticeText}>{progress.note}</Text>
          </View>
        )}

        {/* ═══ FORM DATA ═══ */}
        <View style={S.pageSection}>
          <View style={S.dataTable}>
            <View style={[S.dataHeadRow, { backgroundColor: primary }]} wrap={false}>
              <Text style={[S.dataHeadText, S.colIndex]}>No.</Text>
              <Text style={[S.dataHeadText, S.colQuestion]}>Item Description</Text>
              <Text style={[S.dataHeadText, S.colAnswer]}>Response</Text>
            </View>
            {formSections.length === 0 ? (
              <Text style={S.noData}>No form fields available.</Text>
            ) : (
              formSections.map((section) => (
                <View key={section.id}>
                  <View style={S.dataGroupRow} wrap={false}>
                    <Text style={[S.dataGroupText, { color: primary }]}>{section.title}</Text>
                  </View>
                  {section.fields.map((field) => {
                    if (field.kind === "matrix") {
                      return <View key={field.key} style={{ paddingHorizontal: 5, paddingTop: 5 }} wrap={false}>{renderMatrixField(field)}</View>;
                    }
                    itemNumber += 1;
                    return <FieldRow key={field.key} field={field} index={itemNumber} striped={itemNumber % 2 === 0} />;
                  })}
                </View>
              ))
            )}
          </View>
        </View>

        {/* ═══ LAYER APPROVAL TABLE ═══ */}
        {showApproverChain && layerResults && layerResults.length > 0 && (
          <View break style={S.approvalPageSection}>
            <Text style={[S.sectionLabel, { color: primary }]}>Approval / Evaluation Chain</Text>
            <View style={S.tableBlock} wrap={false}>
              <View style={[S.layerRow, S.layerHeader, { backgroundColor: primary }]} wrap={false}>
                <Text style={[S.layerHeaderText, S.colNum]}>#</Text>
                <Text style={[S.layerHeaderText, S.colType]}>Type</Text>
                <Text style={[S.layerHeaderText, S.colStatus]}>Status</Text>
                <Text style={[S.layerHeaderText, S.colEmail]}>Assignee</Text>
                <Text style={[S.layerHeaderText, S.colTime]}>Date/Time</Text>
                <Text style={[S.layerHeaderText, S.colReason]}>Remarks</Text>
              </View>
              {layerResults.map((layer, i) => (
                <LayerRow key={i} layer={layer} isLast={i === layerResults.length - 1} />
              ))}
            </View>
          </View>
        )}

        {/* ═══ PER-LAYER DETAIL: ink, decision, and evaluation answers ═══ */}
        {(showSignatures || showEvaluationDetails) && layerResults && layerResults.length > 0 && (
          <View style={S.approvalPageSection}>
            <Text style={[S.sectionLabel, { color: primary }]}>Layer Details &amp; Signatures</Text>
            {detailLayers.map((layer, i) => (
              <LayerDetailCard
                key={i}
                layer={layer}
                showSignature={showSignatures}
                showEvaluationDetails={showEvaluationDetails}
                includeEmptyEvaluationFields={includeEmptyEvaluationFields}
                primary={primary}
              />
            ))}
            {/* Named, but not drawn as a signature block: an empty well under a
                name is indistinguishable from a signature that failed to load. */}
            {progress && !includeEmptyEvaluationFields && (
              <View style={S.pendingBlock} wrap={false}>
                <Text style={S.pendingHead}>Not signed</Text>
                {progress.awaiting.map((layer, i) => (
                  <View key={`awaiting-${i}`} style={S.pendingRow}>
                    <Text style={S.pendingWho}>
                      Layer {layer.layerNumber} · {layer.type === "evaluation" ? "Evaluation" : "Approval"}
                      {layer.email ? ` · ${layer.email}` : ""}
                    </Text>
                    <Text style={S.pendingState}>{badgeStyle(layer.status).label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ═══ NOTES ═══ */}
        {isoStandards && (
          <View style={S.notesBlock} wrap={false}>
            <Text style={S.notesHeading}>Standards:</Text>
            <Text style={S.notesLine}>{isoStandards}</Text>
          </View>
        )}

        {/* ═══ FOOTER ═══ */}
        <View style={S.footer} fixed>
          <Text>{layoutConfig?.footerText?.trim() || `Generated ${fmtDate(new Date().toISOString())}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
