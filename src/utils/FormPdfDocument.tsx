/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { getSelectedCompany } from "./companySelection";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
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
  };
  /** Layer results: each entry is one layer's data */
  layerResults?: PdfLayerResult[];
  isoStandards?: string;
  logoUrl?: string;
  pdfConfig?: PdfConfig;
  /** Document control header for the specific published profile. */
  documentHeader?: DocumentControlHeader;
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
  primary: "#0078D4",
  secondary: "#6264A7",
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
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 54, fontFamily: "Helvetica", fontSize: 8.5, color: C.text, lineHeight: 1.25 },
  // Header
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14, paddingBottom: 12, borderBottomWidth: 2.5, borderBottomColor: C.primary },
  logoBox: { width: 90, height: 42, marginRight: 18, flexShrink: 0 },
  logo: { width: 90, height: 42, objectFit: "contain" },
  headerRight: { flexGrow: 1, flexShrink: 1, alignItems: "flex-end" },
  docTitle: { fontSize: 15, fontWeight: "heavy", color: C.primary, marginBottom: 3, textAlign: "right", lineHeight: 1.12 },
  docRef: { fontSize: 6.5, color: C.muted, textAlign: "right", lineHeight: 1.2 },
  // Info grid
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  infoCell: { width: "50%", marginBottom: 4, paddingRight: 8 },
  infoLabel: { fontSize: 6, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  infoValue: { fontSize: 8, color: C.text, marginTop: 1, lineHeight: 1.25 },
  // Document control header
  docControl: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.5, borderColor: C.border, marginBottom: 10 },
  docControlCell: { paddingVertical: 3.5, paddingHorizontal: 7, borderRightWidth: 0.5, borderRightColor: C.borderLight, borderBottomWidth: 0.5, borderBottomColor: C.borderLight },
  docControlLabel: { fontSize: 5.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  docControlValue: { fontSize: 7.5, color: C.text, marginTop: 1, fontWeight: "bold" },
  // Company block
  companyBox: { backgroundColor: C.bg, padding: 7, marginBottom: 10 },
  companyLine: { fontSize: 6.5, color: C.muted, marginBottom: 1 },
  // Status badge
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 8, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, borderWidth: 1 },

  // ── Section headings ──
  sectionLabel: { fontSize: 7.5, fontWeight: "heavy", color: C.text, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 1.5, borderBottomColor: C.primary },
  pageSection: { marginBottom: 24 },
  approvalPageSection: { marginBottom: 18 },
  tableBlock: { borderWidth: 0.5, borderColor: C.borderLight, marginTop: 2 },
  subSectionLabel: { fontSize: 7.5, fontWeight: "bold", color: C.primary, marginBottom: 3, marginTop: 6 },

  // ── Layer table ──
  layerRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingVertical: 3.5, alignItems: "flex-start" },
  layerHeader: { backgroundColor: C.primary },
  layerHeaderText: { color: C.white, fontSize: 6, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 3, paddingVertical: 2.5 },
  layerCell: { paddingHorizontal: 3, fontSize: 6.5, color: C.text, lineHeight: 1.25 },
  colNum: { width: "6%" },
  colType: { width: "12%" },
  colStatus: { width: "13%" },
  colEmail: { width: "21%" },
  colTime: { width: "20%" },
  colReason: { width: "28%" },

  // ── Signature block ──
  sigBlock: { flexDirection: "row", alignItems: "center", marginTop: 3, marginBottom: 4, padding: 7, backgroundColor: C.bgAlt, borderWidth: 0.5, borderColor: C.borderLight },
  sigLine: { flex: 1 },
  sigLabel: { fontSize: 5.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  sigName: { fontSize: 8, fontWeight: "bold", color: C.text, marginTop: 1 },
  sigDetail: { fontSize: 5.5, color: C.muted, marginTop: 1 },
  sigImageBox: { width: 92, minHeight: 34, marginLeft: "auto", justifyContent: "center", alignItems: "flex-end" },
  sigImage: { maxWidth: 92, maxHeight: 34, objectFit: "contain" },

  // ── Field rows ──
  fieldRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  fieldRowAlt: { backgroundColor: C.bgAlt },
  fieldLabel: { width: "34%", fontSize: 7, color: C.muted, paddingRight: 6, lineHeight: 1.3 },
  fieldValue: { width: "66%", fontSize: 7, color: C.text, lineHeight: 1.3 },
  imageGrid: { width: "66%", flexDirection: "row", flexWrap: "wrap" },
  imageTile: { width: "45%", minHeight: 64, borderWidth: 0.5, borderColor: C.borderLight, backgroundColor: C.white, padding: 4, marginRight: 6, marginBottom: 5, justifyContent: "center", alignItems: "center" },
  imagePreview: { maxWidth: "100%", maxHeight: 76, objectFit: "contain" },
  measureBox: { width: "66%" },
  measureValue: { fontSize: 7, fontWeight: "bold", color: C.text, marginBottom: 3 },
  measureTrack: { height: 5, backgroundColor: C.borderLight, borderRadius: 2.5, marginBottom: 3 },
  measureFill: { height: 5, backgroundColor: C.primary, borderRadius: 2.5 },
  measureScale: { flexDirection: "row", justifyContent: "space-between" },
  measureScaleText: { fontSize: 5.5, color: C.muted },

  // ── Eval fields sub-table ──
  evalSubRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 6, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  evalSubLabel: { width: "34%", fontSize: 6, color: C.muted, paddingRight: 5, lineHeight: 1.25 },
  evalSubValue: { width: "66%", fontSize: 6, color: C.text, lineHeight: 1.25 },
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

  // ── No data ──
  noData: { fontSize: 7, color: C.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 10 },

  // ── Footer ──
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 0.5, borderTopColor: C.borderLight, fontSize: 6, color: C.muted },

  // ── Matrix table ──
  matrixSection: { marginBottom: 16 },
  matrixTable: { marginBottom: 8, borderWidth: 0.5, borderColor: C.border },
  matrixHeaderRow: { flexDirection: "row", backgroundColor: C.primary },
  matrixHeaderCell: { paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: C.white },
  matrixHeaderText: { fontSize: 6, fontWeight: "heavy", color: C.white, textTransform: "uppercase", letterSpacing: 0.3 },
  matrixDataRow: { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: C.borderLight },
  matrixDataRowAlt: { backgroundColor: C.bgAlt },
  matrixDataCell: { paddingHorizontal: 4, paddingVertical: 2.5, borderRightWidth: 0.3, borderRightColor: C.borderLight },
  matrixDataText: { fontSize: 6.5, color: C.text },
  matrixFieldLabel: { fontSize: 7.5, fontWeight: "bold", color: C.secondary, marginBottom: 3, marginTop: 2 },
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

function isSharePointImageCandidate(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:\/\/|\/)/i.test(trimmed) && /(\/sites\/|\/teams\/|\/Signature%20Images\/|\/Signature Images\/|\/Form%20PDFs\/|\/Lists\/)/i.test(trimmed);
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

function collectImageSources(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(collectImageSources);

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseMaybeJson(trimmed);
    if (parsed !== null) return collectImageSources(parsed);
    const htmlSrc = extractImageSrcFromHtml(trimmed);
    const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
    return isImageSource(candidate) || isSharePointImageCandidate(candidate) ? [candidate] : [];
  }

  if (!isRecord(value)) return [];

  const directKeys = ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"];
  for (const key of directKeys) {
    const next = value[key];
    if (typeof next === "string") {
      const candidate = splitSharePointUrlFieldValue(next);
      if (isImageSource(candidate) || isSharePointImageCandidate(candidate)) return [candidate];
    }
  }

  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const url = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    return isImageSource(url) || isSharePointImageCandidate(url) ? [url] : [];
  }

  return [];
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
  const remarks = isManualPaper ? "" : layer.rejection || rejectedAtLayer || (layer.type === "evaluation" ? "Confirmed" : "");
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
      {sources.map((src, index) => (
        <View key={`${src}-${index}`} style={S.imageTile} wrap={false}>
          <Image style={S.imagePreview} src={src} />
        </View>
      ))}
    </View>
  );
}

export default function FormPdfDocument({ surveyJson, responseData, meta, layerResults, isoStandards, logoUrl, pdfConfig, documentHeader }: PdfFormData) {
  const formSections = buildFormSubmissionSections(surveyJson, responseData, {
    fallbackSectionTitle: "Main Page",
    includeAdditionalFields: false,
  });
  const layoutConfig = pdfConfig?.enabled === false ? undefined : pdfConfig;
  const title = layoutConfig?.title?.trim() || surveyJson?.title || meta.formTitle;
  const badge = badgeStyle(meta.formStatus);
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const primary = layoutConfig?.primaryColor?.trim() || C.primary;
  const secondary = layoutConfig?.secondaryColor?.trim() || C.secondary;
  const comfortable = layoutConfig?.density === "comfortable";
  const showStatusBadge = layoutConfig?.showStatusBadge !== false;
  const showApproverChain = layoutConfig?.showApproverChain !== false;
  const showSignatures = layoutConfig?.showSignatures !== false;
  const showEvaluationDetails = layoutConfig?.showEvaluationDetails !== false;
  const includeEmptyEvaluationFields = layoutConfig?.includeEmptyEvaluationFields === true;
  const effectiveLogoUrl = layoutConfig?.headerLogoUrl?.trim() || logoUrl;

  return (
    <Document>
      <Page size="A4" style={[S.page, comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        {/* ═══ HEADER ═══ */}
        <View style={[S.header, { borderBottomColor: primary }]}>
          <View style={S.logoBox}>
            {effectiveLogoUrl ? <Image style={S.logo} src={effectiveLogoUrl} /> : <Text style={{ fontSize: 14, fontWeight: "bold", color: primary }}>LOGO</Text>}
          </View>
          <View style={S.headerRight}>
            <Text style={[S.docTitle, { color: primary }]}>{title}</Text>
            <Text style={S.docRef}>Document Ref: {meta.formTitle} / v{meta.formVersion}</Text>
          </View>
        </View>

        {/* ═══ DOCUMENT CONTROL HEADER ═══ */}
        {docControlCells(documentHeader, meta.formVersion).length > 0 && (
          <View style={S.docControl}>
            {docControlCells(documentHeader, meta.formVersion).map((cell) => (
              <View key={cell.label} style={S.docControlCell}>
                <Text style={S.docControlLabel}>{cell.label}</Text>
                <Text style={S.docControlValue}>{cell.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ STATUS BADGE ═══ */}
        {showStatusBadge && <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={{ color: badge.text }}>{badge.label}</Text>
        </View>}

        {/* ═══ INFO GRID ═══ */}
        <View style={S.infoGrid}>
          <View style={S.infoCell}><Text style={S.infoLabel}>Submitted By</Text><Text style={S.infoValue}>{meta.submittedBy || "—"}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Date Submitted</Text><Text style={S.infoValue}>{fmtDate(meta.submittedAt)}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Form</Text><Text style={S.infoValue}>{meta.formTitle}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Version</Text><Text style={S.infoValue}>v{meta.formVersion}</Text></View>
          {selectedCompany && (
            <View style={S.infoCell}><Text style={S.infoLabel}>Company</Text><Text style={S.infoValue}>{selectedCompany}</Text></View>
          )}
        </View>

        {/* ═══ FORM FIELDS ═══ */}
        <View style={S.pageSection}>
          <Text style={[S.sectionLabel, { borderBottomColor: primary }]}>FORM DATA</Text>
          {formSections.length === 0 ? (
            <Text style={S.noData}>No form fields available.</Text>
          ) : (
            formSections.map((section) => (
              <View key={section.id} style={S.formSection}>
                <Text style={S.subSectionLabel}>{section.title}</Text>
                {section.fields.map((field, fieldIndex) => {
                  if (field.kind === "matrix") {
                    return <View key={field.key} wrap={false}>{renderMatrixField(field)}</View>;
                  }
                  const imageSources = collectImageSources(field.value);
                  const measureValue = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
                  return (
                    <View key={field.key} style={[S.fieldRow, fieldIndex % 2 === 1 ? S.fieldRowAlt : {}]} wrap={false}>
                      <Text style={S.fieldLabel}>{field.label}</Text>
                      {imageSources.length > 0 ? renderImageSources(imageSources) : measureValue || <Text style={S.fieldValue}>{fmtVal(field.value, field)}</Text>}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>


        {/* ═══ LAYER APPROVAL TABLE ═══ */}
        {showApproverChain && layerResults && layerResults.length > 0 && (
          <View break style={S.approvalPageSection}>
            <Text style={[S.sectionLabel, { borderBottomColor: primary }]}>APPROVAL / EVALUATION CHAIN</Text>
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

        {/* ═══ SIGNATURE BLOCKS (only shown when at least one layer has a signature) ═══ */}
        {showSignatures && layerResults && layerResults.filter(l => l.signature).length > 0 && (
          <View style={S.approvalPageSection}>
            <Text style={[S.sectionLabel, { borderBottomColor: primary }]}>SIGNATURES</Text>
            {layerResults.filter(l => l.signature).map((layer, i) => {
              const badge = badgeStyle(layer.status);
              return (
                <View key={i} style={S.sigBlock} wrap={false}>
                  <View style={S.sigLine}>
                    <Text style={S.sigLabel}>Layer {layer.layerNumber} - {layer.type === "evaluation" ? "Evaluation" : "Approval"}</Text>
                    <Text style={S.sigName}>{layer.email || ""} - <Text style={{ color: badge.text }}>{badge.label}</Text></Text>
                    <Text style={S.sigDetail}>{fmtDate(layer.signedAt)}{layer.rejection ? ` - Reason: ${layer.rejection}` : ""}</Text>
                  </View>
                  <View style={S.sigImageBox}>
                    <Image style={S.sigImage} src={layer.signature} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ EVALUATION FIELDS (per layer) ═══ */}
        {showEvaluationDetails && layerResults && layerResults.filter(l => l.type === "evaluation" && ((l.evaluationFields && Object.keys(l.evaluationFields).length > 0) || (includeEmptyEvaluationFields && l.evaluationSurveyElements?.length))).length > 0 && (
          <View style={S.approvalPageSection}>
            <Text style={[S.sectionLabel, { borderBottomColor: primary }]}>EVALUATION DETAILS</Text>
            {layerResults.filter(l => l.type === "evaluation").map((layer, i) => {
              const fields = evaluationFieldsForLayer(layer, includeEmptyEvaluationFields);
              if (fields.length === 0) return null;
              return (
                <View key={i} style={{ marginBottom: includeEmptyEvaluationFields ? 12 : 6 }} wrap={false}>
                  <Text style={[S.subSectionLabel, { color: secondary }]}>Layer {layer.layerNumber} - {layer.confirmerName || layer.confirmerEmail || "Evaluator"}</Text>
                  {fields.map((field, fi) => {
                    const imageSources = collectImageSources(field.value);
                    const measureValue = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
                    return (
                      <View key={fi} style={includeEmptyEvaluationFields ? S.paperEvalRow : S.evalSubRow} wrap={false}>
                        <Text style={includeEmptyEvaluationFields ? S.paperEvalLabel : S.evalSubLabel}>{field.label}</Text>
                        {includeEmptyEvaluationFields
                          ? renderPaperFieldValue(field)
                          : imageSources.length > 0 ? renderImageSources(imageSources) : measureValue || <Text style={S.evalSubValue}>{fmtVal(field.value, field)}</Text>}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ ISO STANDARDS ═══ */}
        {isoStandards && (
          <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
            <Text style={{ fontSize: 5.5, color: C.muted, textAlign: "center" }}>{isoStandards}</Text>
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
