/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { getSelectedCompany } from "./companySelection";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
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
    return isImageSource(candidate) ? [candidate] : [];
  }

  if (!isRecord(value)) return [];

  const directKeys = ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"];
  for (const key of directKeys) {
    const next = value[key];
    if (typeof next === "string" && isImageSource(next)) return [next];
  }

  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const url = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    return isImageSource(url) ? [url] : [];
  }

  return [];
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
  const rejectedAtLayer = layer.status.toLowerCase().includes("rejected at layer") ? layer.status : "";
  const remarks = layer.rejection || rejectedAtLayer || (layer.type === "evaluation" ? "Confirmed" : "");
  return (
    <View style={S.layerRow} wrap={false}>
      <Text style={[S.layerCell, S.colNum]}>{layer.layerNumber}</Text>
      <Text style={[S.layerCell, S.colType]}>{layer.type === "evaluation" ? "Eval" : "Approval"}</Text>
      <Text style={[S.layerCell, S.colStatus, { color: badge.text }]}>{badge.label}</Text>
      <Text style={[S.layerCell, S.colEmail]}>{layer.email || "—"}</Text>
      <Text style={[S.layerCell, S.colTime]}>{fmtDate(layer.signedAt)}</Text>
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

function evaluationFieldsForLayer(layer: PdfLayerResult): FormSubmissionField[] {
  const fields = layer.evaluationFields;
  if (!fields || Object.keys(fields).length === 0) return [];
  const elements = layer.evaluationSurveyElements ?? [];
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

export default function FormPdfDocument({ surveyJson, responseData, meta, layerResults, isoStandards, logoUrl }: PdfFormData) {
  const formSections = buildFormSubmissionSections(surveyJson, responseData, {
    fallbackSectionTitle: "Submitted answers",
    includeAdditionalFields: false,
  });
  const title = surveyJson?.title || meta.formTitle;
  const badge = badgeStyle(meta.formStatus);
  const selectedCompany = getSelectedCompany(responseData, surveyJson);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ═══ HEADER ═══ */}
        <View style={S.header}>
          <View style={S.logoBox}>
            {logoUrl ? <Image style={S.logo} src={logoUrl} /> : <Text style={{ fontSize: 14, fontWeight: "bold", color: C.primary }}>LOGO</Text>}
          </View>
          <View style={S.headerRight}>
            <Text style={S.docTitle}>{title}</Text>
            <Text style={S.docRef}>Document Ref: {meta.formTitle} / v{meta.formVersion}</Text>
          </View>
        </View>

        {/* ═══ STATUS BADGE ═══ */}
        <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={{ color: badge.text }}>{badge.label}</Text>
        </View>

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
          <Text style={S.sectionLabel}>FORM DATA</Text>
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

        {/* ═══ MATRIX TABLES (dynamicmatrix child rows) ═══ */}
        {import.meta.env.VITE_ENABLE_LEGACY_MATRIX_PDF === "true" && (() => {
          // Gather all _childRows entries in responseData
          const matrixEntries: { fieldName: string; columns: { name: string; title: string }[]; rows: Record<string, unknown>[] }[] = [];
          for (const key of Object.keys(responseData)) {
            if (!key.endsWith("_childRows")) continue;
            const fieldName = key.slice(0, -"_childRows".length);
            const data = responseData[key] as { columns?: { name: string; title: string }[]; rows?: Record<string, unknown>[] };
            const rawColumns = data.columns;
            const rawRows = data.rows;
            const columns: { name: string; title: string }[] = rawColumns ?? [];
            const rows: Record<string, unknown>[] = rawRows ?? [];
            if (rows.length > 0) {
              matrixEntries.push({ fieldName, columns, rows });
            }
          }
          if (matrixEntries.length === 0) return null;

          return (
            <View style={{ marginBottom: 24 }}>
              <Text style={S.sectionLabel}>TABLE DATA</Text>
              {matrixEntries.map((entry, mIdx) => {
                const cols = entry.columns;
                // Calculate column widths proportional to count (min 10%)
                const colPct = `${Math.max(10, Math.floor(100 / cols.length))}%`;
                return (
                  <View key={mIdx} style={S.matrixSection} wrap={false}>
                    <Text style={S.matrixFieldLabel}>{entry.fieldName}</Text>
                    <View style={S.matrixTable}>
                      {/* Header */}
                      <View style={S.matrixHeaderRow}>
                        {cols.map((col, cIdx) => (
                          <View key={cIdx} style={[S.matrixHeaderCell, { width: colPct }, cIdx === cols.length - 1 ? { borderRightWidth: 0 } : {}]}>
                            <Text style={S.matrixHeaderText}>{col.title || col.name}</Text>
                          </View>
                        ))}
                      </View>
                      {/* Data rows */}
                      {entry.rows.map((row, rIdx) => (
                        <View key={rIdx} style={[S.matrixDataRow, rIdx % 2 === 1 ? S.matrixDataRowAlt : {}]}>
                          {cols.map((col, cIdx) => {
                            const val = row[col.name];
                            const display = Array.isArray(val) ? val.join(", ") : (val === null || val === undefined ? "—" : String(val));
                            return (
                              <View key={cIdx} style={[S.matrixDataCell, { width: colPct }, cIdx === cols.length - 1 ? { borderRightWidth: 0 } : {}]}>
                                <Text style={S.matrixDataText}>{display}</Text>
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* ═══ LAYER APPROVAL TABLE ═══ */}
        {layerResults && layerResults.length > 0 && (
          <View break style={S.approvalPageSection}>
            <Text style={S.sectionLabel}>APPROVAL / EVALUATION CHAIN</Text>
            <View style={S.tableBlock} wrap={false}>
              <View style={[S.layerRow, S.layerHeader]} wrap={false}>
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
        {layerResults && layerResults.filter(l => l.signature).length > 0 && (
          <View style={S.approvalPageSection}>
            <Text style={S.sectionLabel}>SIGNATURES</Text>
            {layerResults.filter(l => l.signature).map((layer, i) => {
              const badge = badgeStyle(layer.status);
              return (
                <View key={i} style={S.sigBlock} wrap={false}>
                  <View style={S.sigLine}>
                    <Text style={S.sigLabel}>Layer {layer.layerNumber} - {layer.type === "evaluation" ? "Evaluation" : "Approval"}</Text>
                    <Text style={S.sigName}>{layer.email || "—"} - <Text style={{ color: badge.text }}>{badge.label}</Text></Text>
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
        {layerResults && layerResults.filter(l => l.type === "evaluation" && l.evaluationFields && Object.keys(l.evaluationFields).length > 0).length > 0 && (
          <View style={S.approvalPageSection}>
            <Text style={S.sectionLabel}>EVALUATION DETAILS</Text>
            {layerResults.filter(l => l.type === "evaluation").map((layer, i) => {
              const fields = evaluationFieldsForLayer(layer);
              if (fields.length === 0) return null;
              return (
                <View key={i} style={{ marginBottom: 6 }} wrap={false}>
                  <Text style={S.subSectionLabel}>Layer {layer.layerNumber} - {layer.confirmerName || layer.confirmerEmail || "Evaluator"}</Text>
                  {fields.map((field, fi) => {
                    const imageSources = collectImageSources(field.value);
                    const measureValue = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
                    return (
                      <View key={fi} style={S.evalSubRow} wrap={false}>
                        <Text style={S.evalSubLabel}>{field.label}</Text>
                        {imageSources.length > 0 ? renderImageSources(imageSources) : measureValue || <Text style={S.evalSubValue}>{fmtVal(field.value, field)}</Text>}
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
          <Text>Generated {fmtDate(new Date().toISOString())}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
