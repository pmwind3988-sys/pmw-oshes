/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { COMPANY, companyContactLines, type CompanyProfile } from "../config/company";
import { getSelectedCompany } from "./companySelection";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
import { collectImageSources, imageCaption, isEmbeddableImage, isRecord, isSignatureField } from "./pdfImageSources";
import { isChoiceField, readTicks, shouldListChoices } from "./pdfChoiceMatching";
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
  // Mark first at the top left, the address following it across to the right
  // margin, one heavy rule beneath the pair. The rule is what makes the block
  // read as stationery rather than as a first row of content.
  letterhead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 },
  letterheadAddress: { flexGrow: 1, flexShrink: 1, paddingLeft: 14, alignItems: "flex-end" },
  // Centred across the full measure, above the mark and the address, the way
  // the company's own stationery sets it.
  companyName: { fontSize: 13, fontWeight: "bold", color: C.text, textAlign: "center", marginBottom: 6, letterSpacing: 0.2 },
  // Set to the right margin: the mark holds the left, so ranging the address
  // right is what makes the two read as one band rather than as a heap in the
  // top corner with half the page empty beside it.
  companyLine: { fontSize: 8, color: C.text, lineHeight: 1.35, textAlign: "right" },
  companyContact: { fontSize: 8, color: C.text, lineHeight: 1.35, textAlign: "right" },
  // No width, only a height and a ceiling. react-pdf measures the raster and
  // derives the width from its own aspect ratio, so one number resizes the mark
  // for any page size or density and it is never stretched to fit a box.
  logoBox: { flexShrink: 0, alignItems: "flex-start", justifyContent: "flex-start" },
  logoFallback: { fontSize: 15, fontWeight: "bold", color: C.primary, letterSpacing: 1 },
  rule: { height: 2, backgroundColor: C.primary, marginBottom: 9 },

  // ── Document band: what the document is on the left, who filed it on the right ──
  // The title and its reference lead, because that is what the page is looked up
  // by: a filed permit is found by its number, not by whose name is on it.
  docBand: { flexDirection: "row", alignItems: "flex-start", marginBottom: 11 },
  docBandLeft: { width: "58%", paddingRight: 16 },
  docBandRight: { width: "42%", alignItems: "flex-end" },
  bandLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3, textAlign: "right" },
  bandHeadline: { fontSize: 11, fontWeight: "bold", color: C.primary, marginBottom: 2, textAlign: "right" },
  bandLine: { fontSize: 8, color: C.text, lineHeight: 1.35, textAlign: "right" },
  // The reference is the one thing read back over the phone and filed by hand,
  // so it is set at the size of the quotation number it replaces.
  docTitle: { fontSize: 13, fontWeight: "bold", color: C.text, marginBottom: 5, lineHeight: 1.15 },
  // Label and value set as two columns, the value starting where the widest
  // label ends. Ranging the value to the right margin instead pushed it a third
  // of the page away from the word it answers, so "Date" and its date were read
  // as two separate things and the eye had to travel to pair them up.
  metaRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 1.5 },
  metaLabel: { fontSize: 8, color: C.muted, width: 74, flexShrink: 0 },
  metaValue: { fontSize: 8, color: C.text, fontWeight: "bold", flexGrow: 1, flexShrink: 1 },

  // Status badge
  badge: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 8, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, borderWidth: 1 },

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
  // The routing address under a signature: present, findable, and visibly not
  // part of the claim the signature makes.
  sigReference: { fontSize: 5, color: C.muted, textAlign: "center", marginTop: 1 },
  sigMissing: { fontSize: 6, color: C.muted, fontStyle: "italic", textAlign: "center" },

  // One layer's evidence, set as a band across its card rather than scattered
  // down the page in whichever row happened to hold each picture.
  visualStrip: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 7, paddingTop: 6, paddingBottom: 2 },
  visualTile: { width: 118, flexShrink: 0, marginRight: 10, marginBottom: 4 },

  // ── Field rows ──
  fieldRow: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 5, borderBottomWidth: 0.4, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  fieldRowAlt: { backgroundColor: C.bgAlt },
  fieldIndex: { width: "7%", fontSize: 7.5, color: C.muted },
  fieldLabel: { width: "40%", fontSize: 7.5, color: C.text, paddingRight: 8, lineHeight: 1.3 },
  fieldValue: { width: "53%", fontSize: 7.5, color: C.text, fontWeight: "bold", lineHeight: 1.3 },
  // A question the form asked and nobody answered. Set apart from a real
  // answer, because "nothing was said" is itself a fact about the record.
  fieldValueMuted: { width: "53%", fontSize: 7.5, color: C.muted, fontStyle: "italic", lineHeight: 1.3 },
  imageGrid: { width: "53%", flexDirection: "row", flexWrap: "wrap" },

  // ── Tick list ──
  // The answer column of a "(TICK)" question, set as the boxes it was on paper.
  // A box drawn as a bordered View with an "X" in it, rather than as a ballot
  // glyph, because Helvetica has no ballot glyph and the missing character
  // prints as a blank — a box that cannot be ticked at all.
  tickBox: { width: "53%" },
  tickGroup: { flexDirection: "row", flexWrap: "wrap" },
  tickOption: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2.5 },
  tickSquare: { width: 7.5, height: 7.5, borderWidth: 0.5, borderColor: C.text, marginRight: 3.5, alignItems: "center", justifyContent: "center" },
  tickMark: { fontSize: 6, fontWeight: "bold", lineHeight: 1 },
  tickLabel: { fontSize: 7, color: C.muted, lineHeight: 1.3 },
  tickLabelOn: { fontSize: 7.5, color: C.text, fontWeight: "bold", lineHeight: 1.3 },
  tickExtra: { fontSize: 7, color: C.text, marginTop: 1.5, lineHeight: 1.3 },
  tickNote: { fontSize: 6.5, color: C.amberText, fontStyle: "italic", marginTop: 2, lineHeight: 1.3 },

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
  evalSubRef: { width: "53%", fontSize: 6.5, color: C.muted, fontStyle: "italic", lineHeight: 1.25 },
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

/**
 * Columns that are how the record is filed, not what it says.
 *
 * Printing every stored column is what makes the document complete; printing
 * SharePoint's own plumbing alongside it is what would make it unreadable. The
 * list is deliberately about bookkeeping only - anything an author could have
 * asked on a form stays.
 */
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
    // `L1_Status`, `L2_Signature`, … - the approval chain, printed as its own table.
    || /^L\d+_/.test(key);
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

/** A blank answer, for a question the record shows but nobody filled in. */
function isBlankField(field: FormSubmissionField): boolean {
  return isEmptyPdfValue(field.value) || (Array.isArray(field.value) && field.value.length === 0);
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

/** Which options an answer ticked, plus anything it said that no option covers. */
/**
 * The note under a tick list whose entries could not be matched to a box.
 *
 * A record that silently prints an untouched list for a question somebody
 * ticked is a false statement about a permit, so the count is printed instead
 * — small, beneath the boxes, as a reference mark rather than an alarm.
 */
function unresolvedTickNote(unresolved: number): string {
  return `${unresolved} ${unresolved === 1 ? "tick was" : "ticks were"} stored against this item with no label the record could match.`;
}

/** The full-size boxes, for the blank form somebody fills in by hand. */
function renderTickboxOptions(field: FormSubmissionField) {
  const { options, extras, unresolved } = readTicks(field);
  if (options.length === 0) return renderPaperLines(field);
  return (
    <View style={S.paperFieldBox}>
      <View style={S.paperOptionGroup}>
        {options.map((option, index) => (
          <View key={`${field.key}-${index}-${option.value}`} style={S.paperOption}>
            <View style={S.paperOptionBox}>
              {option.ticked ? <Text style={S.paperOptionMark}>X</Text> : null}
            </View>
            <Text style={S.paperOptionLabel}>{option.label}</Text>
          </View>
        ))}
      </View>
      {extras.length > 0 ? <Text style={S.paperOptionLabel}>Also: {extras.join(", ")}</Text> : null}
      {unresolved > 0 ? <Text style={S.tickNote}>{unresolvedTickNote(unresolved)}</Text> : null}
    </View>
  );
}

/** The compact tick list, for one row of the data table. */
function renderChoiceList(field: FormSubmissionField) {
  const { options, extras, unresolved } = readTicks(field);
  return (
    <View style={S.tickBox}>
      <View style={S.tickGroup}>
        {options.map((option, index) => (
          <View key={`${field.key}-${index}-${option.value}`} style={S.tickOption}>
            <View style={S.tickSquare}>
              {option.ticked ? <Text style={S.tickMark}>X</Text> : null}
            </View>
            <Text style={option.ticked ? S.tickLabelOn : S.tickLabel}>{option.label}</Text>
          </View>
        ))}
      </View>
      {extras.length > 0 ? <Text style={S.tickExtra}>Also: {extras.join(", ")}</Text> : null}
      {unresolved > 0 ? <Text style={S.tickNote}>{unresolvedTickNote(unresolved)}</Text> : null}
    </View>
  );
}

function renderPaperFieldValue(field: FormSubmissionField) {
  if (isChoiceField(field)) return renderTickboxOptions(field);
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
      // The evaluator's own questions are held to the same standard as the
      // form's: one that was put to them and left blank is part of what the
      // layer says, and dropping it shortens the evaluation on the page.
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
 * A signature well: the ink, the rule it sits on, and what it belongs to.
 *
 * The rule is drawn whether or not there is ink, because the well is only ever
 * placed where a signature belongs - against ink that could not be fetched, or
 * on a blank form printed for somebody to sign by hand. A layer that captured
 * no signature is given no well at all.
 *
 * The caption names the person or the question, never the routing address: an
 * email under a signature is bookkeeping about how the form was delivered, not
 * a claim about who signed. It is still printed - beneath the caption, at
 * reference size - because the record has to say where the request went.
 */
function SignatureWell({ signature, caption, reference }: { signature?: string; caption: string; reference?: string }) {
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
      {reference ? <Text style={S.sigReference}>{reference}</Text> : null}
    </View>
  );
}

/** One picture a layer holds, ready to be set beside the others it holds. */
interface LayerVisual {
  id: string;
  kind: "signature" | "image";
  caption: string;
  /** The routing detail behind it, set small under the caption. */
  reference?: string;
  /** The evaluation answer it came from, when it came from one. */
  fieldKey?: string;
  sources: string[];
}

/**
 * Every signature and picture belonging to one layer, gathered in one place.
 *
 * A layer's ink used to mean exactly one thing: whatever sat in its
 * `L{n}_Signature` column. Everything else the layer collected - a second
 * signature asked for inside the evaluation, a photograph of the isolated
 * valve, a scan of the paper permit - was left to whichever table row happened
 * to hold it, so the pictures that show the layer acted were scattered down the
 * page away from the layer that took them. They are one layer's evidence, so
 * they are set together under that layer.
 */
function layerVisuals(layer: PdfLayerResult, evaluationFields: FormSubmissionField[]): LayerVisual[] {
  const visuals: LayerVisual[] = [];
  const person = (layer.confirmerName || "").trim();
  const email = (layer.confirmerEmail || layer.email || "").trim();

  const ink = (layer.signature || "").trim();
  if (ink) {
    visuals.push({
      id: `layer-${layer.layerNumber}-signature`,
      kind: "signature",
      caption: person || (layer.type === "evaluation" ? "Evaluator" : "Approver"),
      ...(email ? { reference: email } : {}),
      sources: [ink],
    });
  }

  for (const field of evaluationFields) {
    const sources = collectImageSources(field.value);
    if (sources.length === 0) continue;
    visuals.push({
      id: `layer-${layer.layerNumber}-${field.key}`,
      kind: isSignatureField(field) ? "signature" : "image",
      caption: field.label,
      fieldKey: field.key,
      sources,
    });
  }

  return visuals;
}

/** How an answer already drawn in the layer's strip is referred to in its row. */
function shownAboveNote(visual: LayerVisual): string {
  if (visual.kind === "signature") return "Signed — shown under Signatures & attachments";
  const count = visual.sources.length;
  return `${count} ${count === 1 ? "picture" : "pictures"} — shown under Signatures & attachments`;
}

/**
 * The layer's evidence, set as one band.
 *
 * Every picture gets its own tile. A "+2 more" against a thumbnail is the same
 * omission this whole block exists to undo: the two that were not drawn are
 * exactly the two nobody can check.
 */
function renderLayerVisuals(visuals: LayerVisual[]) {
  return (
    <View style={S.visualStrip}>
      {visuals.flatMap((visual) => (
        visual.kind === "signature"
          ? [(
            <SignatureWell
              key={visual.id}
              signature={visual.sources[0]}
              caption={visual.caption}
              {...(visual.reference ? { reference: visual.reference } : {})}
            />
          )]
          : visual.sources.map((source, index) => (
            <View key={`${visual.id}-${index}`} style={S.visualTile} wrap={false}>
              <View style={S.imageFrame}>
                {isEmbeddableImage(source)
                  ? <Image style={S.imagePreview} src={source} />
                  : <Text style={S.imageMissing}>Image stored with the record{"\n"}(not embedded)</Text>}
              </View>
              <Text style={S.sigCaption}>
                {visual.caption}{visual.sources.length > 1 ? ` (${index + 1} of ${visual.sources.length})` : ""}
              </Text>
              {imageCaption(source) ? <Text style={S.sigReference}>{imageCaption(source)}</Text> : null}
            </View>
          ))
      ))}
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
  const ticks = shouldListChoices(field) ? renderChoiceList(field) : null;
  const blank = isBlankField(field);

  return (
    <View style={[S.fieldRow, striped ? S.fieldRowAlt : {}]} wrap={false}>
      <Text style={S.fieldIndex}>{index}</Text>
      <Text style={S.fieldLabel}>{field.label}</Text>
      {isSignatureField(field)
        // An empty well is indistinguishable from ink that failed to load, so a
        // signature nobody gave is said in words rather than drawn as a rule.
        ? blank
          ? <Text style={S.fieldValueMuted}>Not signed</Text>
          : <View style={S.imageGrid}><SignatureWell signature={imageSources[0]} caption={field.label} /></View>
        : imageSources.length > 0
          ? renderImageSources(imageSources)
          : ticks || measure || (
            blank
              ? <Text style={S.fieldValueMuted}>No answer recorded</Text>
              : <Text style={S.fieldValue}>{fmtVal(field.value, field) || "—"}</Text>
          )}
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
  const person = (layer.confirmerName || "").trim();
  const email = (layer.confirmerEmail || layer.email || "").trim();
  const actionedBy = person || email || "—";
  const visuals = includeEmptyEvaluationFields || !showSignature ? [] : layerVisuals(layer, evaluationFields);
  const visualByFieldKey = new Map(
    visuals.filter((visual) => visual.fieldKey).map((visual) => [visual.fieldKey as string, visual] as const),
  );
  // A layer that captured no signature gets no signature block. An empty rule
  // under somebody's name is a place to sign, and on a record of a decision
  // already taken it reads as ink that failed to load rather than as ink that
  // was never asked for. Since a picture that could not be fetched now keeps its
  // address, no visuals means no signature was ever captured, and the card says
  // that by staying quiet - who acted and when is already above.
  //
  // The blank-form mode is the exception, because a rule to sign in pen is the
  // whole point of printing an unsigned form for somebody to fill in by hand.
  const drawEmptyWell = showSignature && visuals.length === 0 && includeEmptyEvaluationFields;

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
          <Text style={S.sigName}>{actionedBy}</Text>
          <Text style={S.sigDetail}>{fmtDate(layer.signedAt)}</Text>
          {/* The routing address, kept as a reference mark rather than as the
              name on the decision. */}
          {person && email ? <Text style={S.sigDetail}>{email}</Text> : null}
          {layer.rejection ? <Text style={S.sigDetail}>Reason: {layer.rejection}</Text> : null}
        </View>
        {drawEmptyWell
          ? <SignatureWell caption={person || "Signature"} {...(email ? { reference: email } : {})} />
          : null}
      </View>

      {visuals.length > 0 && (
        <View>
          <View style={S.dataGroupRow}>
            <Text style={S.dataGroupText}>Signatures &amp; attachments</Text>
          </View>
          {renderLayerVisuals(visuals)}
        </View>
      )}

      {evaluationFields.length > 0 && (
        <View>
          <View style={S.dataGroupRow}>
            <Text style={S.dataGroupText}>Evaluation responses</Text>
          </View>
          {evaluationFields.map((field, index) => {
            const measure = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
            const ticks = shouldListChoices(field) ? renderChoiceList(field) : null;
            const drawnAbove = visualByFieldKey.get(field.key);
            return (
              <View key={`${field.key}-${index}`} style={includeEmptyEvaluationFields ? S.paperEvalRow : S.evalSubRow} wrap={false}>
                <Text style={includeEmptyEvaluationFields ? S.paperEvalLabel : S.evalSubLabel}>{field.label}</Text>
                {includeEmptyEvaluationFields
                  ? renderPaperFieldValue(field)
                  : drawnAbove
                    ? <Text style={S.evalSubRef}>{shownAboveNote(drawnAbove)}</Text>
                    : ticks || measure || <Text style={S.evalSubValue}>{fmtVal(field.value, field) || "—"}</Text>}
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
    // The document is the record of the form, so it carries the whole form: the
    // questions nobody answered as well as the ones somebody did. A record that
    // silently drops the blanks reads as a shorter form than the one that was
    // actually signed.
    includeUnansweredFields: true,
    formatFallbackLabel: fallbackPdfLabel,
    shouldIncludeField: (key) => !isBookkeepingColumn(key),
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
          <View style={S.logoBox}>
            {effectiveLogoUrl
              ? <Image style={{ height: logoHeight, maxWidth: 170 }} src={effectiveLogoUrl} />
              : <Text style={[S.logoFallback, { color: primary }]}>{letterheadName || "LOGO"}</Text>}
          </View>
          <View style={S.letterheadAddress}>
            {profile.addressLines.map((line) => (
              <Text key={line} style={S.companyLine}>{line}</Text>
            ))}
            {contactLines.map((line) => (
              <Text key={line} style={S.companyContact}>{line}</Text>
            ))}
          </View>
        </View>
        <View style={[S.rule, { backgroundColor: primary }]} />

        {/* ═══ DOCUMENT BAND ═══ */}
        <View style={S.docBand}>
          <View style={S.docBandLeft}>
            <Text style={S.docTitle}>{title}{referenceNo ? ` No. ${referenceNo}` : ""}</Text>
            {metaRows.map((row) => (
              <View key={row.label} style={S.metaRow}>
                <Text style={S.metaLabel}>{row.label} :</Text>
                <Text style={S.metaValue}>{row.value || "-"}</Text>
              </View>
            ))}
          </View>
          <View style={S.docBandRight}>
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
