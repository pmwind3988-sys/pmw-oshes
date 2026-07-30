import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchWithAuthRecovery } from "../../utils/authRecovery";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

const C = {
  border: "#E5E7EB",
  cardBg: "#FFFFFF",
  softBg: "#F9FAFB",
  textPrimary: "#111827",
  textSecond: "#4B5563",
  textMuted: "#6B7280",
  purple: "#0078D4",
  purplePale: "#E6F2FB",
  red: "#DC2626",
} as const;

interface PreviewField {
  name: string;
  title: string;
  type: string;
  inputType?: string;
  choices?: unknown[];
  columns?: unknown[];
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  currency?: string;
  currencySymbol?: string;
  locale?: string;
  decimalPlaces?: number;
  displayFormat?: string;
}

interface PreviewSection {
  title: string;
  fields: PreviewField[];
}

interface ReadOnlySubmissionPreviewProps {
  surveyJson: unknown;
  data: Record<string, unknown> | null;
  accessToken?: string | null;
  mediaSrcByField?: Record<string, string | string[]>;
  fallbackData?: Record<string, unknown>;
  compact?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_x0020_/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

function fieldTitle(element: Record<string, unknown>): string {
  const title = element.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = element.name;
  return typeof name === "string" ? formatFieldLabel(name) : "Untitled field";
}

function sectionTitle(element: Record<string, unknown>, fallback: string): string {
  const title = element.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const name = element.name;
  return typeof name === "string" && name.trim() ? formatFieldLabel(name) : fallback;
}

function getSurveyRoot(surveyJson: unknown): Record<string, unknown> | null {
  if (!isRecord(surveyJson)) return null;
  if (isRecord(surveyJson.surveyJson)) return surveyJson.surveyJson;
  return surveyJson;
}

function collectPreviewSections(surveyJson: unknown, data: Record<string, unknown> | null): PreviewSection[] {
  const root = getSurveyRoot(surveyJson);
  const pages = root && Array.isArray(root.pages) ? root.pages : [];
  const sections: PreviewSection[] = [];
  const dataKeys = new Set(Object.keys(data ?? {}));

  const collectFields = (elements: unknown, target: PreviewField[]) => {
    if (!Array.isArray(elements)) return;
    for (const raw of elements) {
      if (!isRecord(raw)) continue;
      const type = typeof raw.type === "string" ? raw.type : "";
      if (type === "panel") {
        const panelFields: PreviewField[] = [];
        collectFields(raw.elements, panelFields);
        if (panelFields.length > 0) {
          sections.push({ title: sectionTitle(raw, "Section"), fields: panelFields });
        }
        continue;
      }
      if (type === "html" || type === "expression" || type === "formula") continue;
      const name = typeof raw.name === "string" ? raw.name : "";
      if (!name || !dataKeys.has(name)) continue;
      target.push({
        name,
        title: fieldTitle(raw),
        type,
        inputType: typeof raw.inputType === "string" ? raw.inputType : undefined,
        choices: Array.isArray(raw.choices) ? raw.choices : undefined,
        columns: Array.isArray(raw.columns) ? raw.columns : undefined,
        rateMin: typeof raw.rateMin === "number" ? raw.rateMin : undefined,
        rateMax: typeof raw.rateMax === "number" ? raw.rateMax : undefined,
        minRateDescription: typeof raw.minRateDescription === "string" ? raw.minRateDescription : undefined,
        maxRateDescription: typeof raw.maxRateDescription === "string" ? raw.maxRateDescription : undefined,
        currency: typeof raw.currency === "string" ? raw.currency : undefined,
        currencySymbol: typeof raw.currencySymbol === "string" ? raw.currencySymbol : undefined,
        locale: typeof raw.locale === "string" ? raw.locale : undefined,
        decimalPlaces: typeof raw.decimalPlaces === "number" ? raw.decimalPlaces : undefined,
        displayFormat: typeof raw.displayFormat === "string" ? raw.displayFormat : undefined,
      });
    }
  };

  for (const page of pages) {
    if (!isRecord(page)) continue;
    const fields: PreviewField[] = [];
    collectFields(page.elements, fields);
    if (fields.length > 0) {
      sections.push({ title: sectionTitle(page, "Submitted Form"), fields });
    }
  }

  return sections;
}

function choiceLabel(choice: unknown, value: unknown): string | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    return String(choice) === String(value) ? String(choice) : null;
  }
  if (!isRecord(choice)) return null;
  const choiceValue = choice.value ?? choice.itemValue ?? choice.id ?? choice.name;
  if (String(choiceValue) !== String(value)) return null;
  const text = choice.text ?? choice.title ?? choice.label ?? choiceValue;
  return String(text);
}

function numberFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDateLikeValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/i.test(value.trim());
}

function formatDateTimeValue(value: string, field: PreviewField): string {
  const trimmed = value.trim();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return value;
  if (field.type === "date" || field.inputType === "date" || !trimmed.includes("T")) {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
}

function fieldLooksCurrencyLike(field: PreviewField, value: unknown): boolean {
  const numericValue = numberFromValue(value);
  if (numericValue === null) return false;
  if (field.type === "currency" || field.currency || field.currencySymbol) return true;
  if (field.displayFormat?.toLowerCase() === "currency") return true;
  const label = `${field.name} ${field.title}`.toLowerCase();
  return /\b(cost|amount|price|fee|claim|expense|budget|total|subtotal)\b/.test(label);
}

function formatCurrencyValue(value: unknown, field: PreviewField): string {
  const numericValue = numberFromValue(value);
  if (numericValue === null) return formatScalarValue(value, { ...field, type: "text", currency: undefined, currencySymbol: undefined });
  const symbol = field.currencySymbol?.trim() || (field.currency === "MYR" || !field.currency ? "RM" : field.currency);
  const decimals = field.decimalPlaces ?? 2;
  const formatted = new Intl.NumberFormat(field.locale || "en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericValue);
  return `${symbol} ${formatted}`;
}

function formatScalarValue(value: unknown, field: PreviewField): string {
  if (value === null || value === undefined || value === "") return "No response";
  const normalized = normalizeMaybeJson(value);
  if (typeof normalized === "boolean") return normalized ? "Yes" : "No";
  if (Array.isArray(normalized)) {
    return normalized.map((entry) => formatScalarValue(entry, field)).join(", ");
  }
  if (field.choices?.length) {
    const label = field.choices.map((choice) => choiceLabel(choice, normalized)).find(Boolean);
    if (label) return label;
  }
  if (fieldLooksCurrencyLike(field, normalized)) return formatCurrencyValue(normalized, field);
  if (isDateLikeValue(normalized) && (field.type === "date" || field.type === "datetime" || field.inputType === "date" || field.inputType === "datetime-local")) {
    return formatDateTimeValue(normalized, field);
  }
  if (typeof normalized === "object") return JSON.stringify(normalized);
  return String(normalized);
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(serverRelativeUrl.replace(/'/g, "''")).replace(/%2F/gi, "/");
}

function serverRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const siteUrl = new URL(SP_SITE_URL);
      const mediaUrl = new URL(trimmed);
      if (siteUrl.origin.toLowerCase() !== mediaUrl.origin.toLowerCase()) return "";
      return decodeURIComponent(mediaUrl.pathname);
    }
  } catch {
    return "";
  }
  return trimmed.startsWith("/") ? decodeURIComponent(trimmed.split(/[?#]/)[0] ?? trimmed) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverPath = serverRelativePath(value);
  if (!serverPath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverPath)}')/$value`;
}

function toAbsoluteSharePointUrl(value: string): string {
  if (!value || value.startsWith("http") || value.startsWith("data:")) return value;
  if (!value.startsWith("/")) return value;
  try {
    return `${new URL(SP_SITE_URL).origin}${value}`;
  } catch {
    return value;
  }
}

function extractImageSrcFromHtml(value: string): string {
  return value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const separatorIndex = value.search(/,\s+/);
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex).trim();
}

function linkFromRecord(record: Record<string, unknown>): string {
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = record.serverUrl || record.ServerUrl;
  const relativeUrl = record.serverRelativeUrl || record.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function mediaSourcesFromValue(value: unknown): string[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) return normalized.flatMap(mediaSourcesFromValue);
  if (isRecord(normalized)) {
    const link = linkFromRecord(normalized);
    return link ? [link] : [];
  }
  if (typeof normalized !== "string") return [];
  const trimmed = normalized.trim();
  if (!trimmed) return [];
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  if (/^(data:image\/|https?:\/\/|\/)/i.test(candidate)) return [toAbsoluteSharePointUrl(candidate)];
  return [];
}

function isImageLike(source: string): boolean {
  return /^data:image\//i.test(source) || /\.(png|jpe?g|gif|webp|bmp|svg)([?#].*)?$/i.test(source);
}

function filenameFromUrl(source: string): string {
  if (source.startsWith("data:image/")) return "Signature image";
  const last = (source.split(/[?#]/)[0] ?? source).split("/").filter(Boolean).pop();
  if (!last) return "Open file";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

async function blobToObjectUrl(blob: Blob): Promise<string> {
  return URL.createObjectURL(blob);
}

function useAuthenticatedMediaSource(source: string, accessToken?: string | null): { src: string; loading: boolean } {
  const [src, setSrc] = useState(source);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const fileValueUrl = source ? sharePointFileValueUrl(source) : "";
    setSrc(source);
    setLoading(false);

    if (!source || source.startsWith("data:image/") || !fileValueUrl || !accessToken) {
      return () => undefined;
    }

    setLoading(true);
    void fetchWithAuthRecovery(fileValueUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`);
        const blob = await response.blob();
        objectUrl = await blobToObjectUrl(blob);
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(source);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, source]);

  return { src, loading };
}

function mediaSourcesForField(field: PreviewField, value: unknown, mediaSrcByField?: Record<string, string | string[]>): string[] {
  const override = mediaSrcByField?.[field.name];
  if (typeof override === "string") return [override];
  if (Array.isArray(override)) return override;
  if (["signaturepad", "imageupload", "file"].includes(field.type)) return mediaSourcesFromValue(value);
  const sources = mediaSourcesFromValue(value);
  return sources.some(isImageLike) ? sources : [];
}

function MediaValue({ source, accessToken }: { source: string; accessToken?: string | null }) {
  const { src, loading } = useAuthenticatedMediaSource(source, accessToken);

  if (isImageLike(src)) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", padding: 10, overflow: "hidden" }}>
          <img
            src={src}
            alt={filenameFromUrl(source)}
            style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "contain", outline: "1px solid rgba(0, 0, 0, 0.1)", borderRadius: 6 }}
          />
        </div>
        {loading && <span style={{ color: C.textMuted, fontSize: 12 }}>Loading secure image...</span>}
      </div>
    );
  }

  return (
    <a href={toAbsoluteSharePointUrl(source)} target="_blank" rel="noopener noreferrer" style={{ color: C.purple, fontWeight: 600 }}>
      {filenameFromUrl(source)}
    </a>
  );
}

function matrixRows(value: unknown): Record<string, unknown>[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) return normalized.filter(isRecord);
  if (isRecord(normalized) && Array.isArray(normalized.rows)) return normalized.rows.filter(isRecord);
  return [];
}

function matrixColumns(field: PreviewField, rows: Record<string, unknown>[]): Array<{ name: string; title: string }> {
  if (Array.isArray(field.columns) && field.columns.length > 0) {
    return field.columns
      .filter(isRecord)
      .map((column) => ({
        name: String(column.name || column.valueName || column.title || ""),
        title: String(column.title || column.name || column.valueName || "Column"),
      }))
      .filter((column) => column.name);
  }
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return [...keys].map((key) => ({ name: key, title: formatFieldLabel(key) }));
}

function MatrixValue({ field, value }: { field: PreviewField; value: unknown }) {
  const rows = matrixRows(value);
  if (rows.length === 0) return <span style={{ color: C.textMuted }}>No rows</span>;
  const columns = matrixColumns(field, rows);
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.softBg }}>
            {columns.map((column) => (
              <th key={column.name} style={{ padding: "8px 10px", textAlign: "left", color: C.textSecond, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.name} style={{ padding: "8px 10px", color: C.textPrimary, borderTop: index === 0 ? "none" : `1px solid ${C.border}` }}>
                  {formatScalarValue(row[column.name], field)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RatingValue({ field, value }: { field: PreviewField; value: unknown }) {
  const rating = numberFromValue(value);
  if (rating === null) return <span style={{ color: C.textMuted }}>No rating</span>;
  const min = field.rateMin ?? 1;
  const max = field.rateMax ?? 5;
  const clamped = Math.min(max, Math.max(min, rating));
  const percent = max > min ? ((clamped - min) / (max - min)) * 100 : 100;

  return (
    <div style={{ display: "grid", gap: 7, maxWidth: 340 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 800 }}>{rating}</span>
        <span style={{ color: C.textMuted, fontSize: 12 }}>of {max}</span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #F7C948, #0078D4)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.textMuted, fontSize: 11, gap: 12, textWrap: "pretty" }}>
        <span>{field.minRateDescription || String(min)}</span>
        <span>{field.maxRateDescription || String(max)}</span>
      </div>
    </div>
  );
}

const fieldRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(150px, 0.38fr) minmax(0, 1fr)",
  gap: 14,
  padding: "11px 0",
  borderTop: `1px solid ${C.border}`,
  alignItems: "start",
};

function FieldValue({ field, value, accessToken, mediaSrcByField }: { field: PreviewField; value: unknown; accessToken?: string | null; mediaSrcByField?: Record<string, string | string[]> }) {
  const mediaSources = mediaSourcesForField(field, value, mediaSrcByField);
  if (mediaSources.length > 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {mediaSources.map((source, index) => (
          <MediaValue key={`${source}-${index}`} source={source} accessToken={accessToken} />
        ))}
      </div>
    );
  }
  if (["dynamicmatrix", "matrixdynamic", "tableinput"].includes(field.type)) {
    return <MatrixValue field={field} value={value} />;
  }
  if (field.type === "rating") {
    return <RatingValue field={field} value={value} />;
  }
  return <div style={{ color: C.textPrimary, overflowWrap: "anywhere", whiteSpace: field.inputType === "textarea" ? "pre-wrap" : "normal" }}>{formatScalarValue(value, field)}</div>;
}

function fallbackSections(fallbackData: Record<string, unknown> | undefined): PreviewSection[] {
  const entries = Object.entries(fallbackData ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return [];
  return [{
    title: "Submitted Fields",
    fields: entries.map(([key]) => ({ name: key, title: formatFieldLabel(key), type: "text" })),
  }];
}

export default function ReadOnlySubmissionPreview({ surveyJson, data, accessToken, mediaSrcByField, fallbackData, compact = false }: ReadOnlySubmissionPreviewProps) {
  const sections = collectPreviewSections(surveyJson, data);
  const displaySections = sections.length > 0 ? sections : fallbackSections(fallbackData ?? data ?? undefined);

  if (displaySections.length === 0) {
    return <div style={{ color: C.textMuted, fontSize: 13 }}>No submitted field data is available.</div>;
  }

  return (
    <div style={{ display: "grid", gap: compact ? 14 : 18 }}>
      {displaySections.map((section, sectionIndex) => (
        <section
          key={`${section.title}-${sectionIndex}`}
          style={{
            background: compact ? C.cardBg : C.softBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: compact ? 12 : 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, marginBottom: 6 }}>
            {section.title}
          </div>
          <div>
            {section.fields.map((field) => (
              <div key={field.name} style={fieldRowStyle}>
                <div style={{ color: C.textSecond, fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
                  {field.title}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, minWidth: 0 }}>
                  <FieldValue field={field} value={data?.[field.name]} accessToken={accessToken} mediaSrcByField={mediaSrcByField} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
