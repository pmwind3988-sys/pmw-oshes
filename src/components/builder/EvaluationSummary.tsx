/**
 * EvaluationSummary.tsx — Read-only display of evaluation layer results.
 * Shows evaluator name, date, and field values.
 *
 * Every field the layer declares is listed, in the order the layer declares it,
 * whether or not the evaluator filled it — a blank "PTW Valid From" next to a
 * filled "PTW Valid Till" is information, and dropping the row hid it. Values
 * that are really images (signature pads, uploads) render as images rather than
 * as the data URL behind them.
 */
import type { EvaluationLayerResult } from "../../types";
import { editorial, editorialShadow } from "../../theme/editorial";
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, isDisplayDateLike } from "../../utils/displayDateTime";

interface EvaluationSummaryProps {
  result: EvaluationLayerResult;
  layerTitle?: string;
  layerDescription?: string;
  surveyElements?: Record<string, unknown>[];
}

interface EvaluationFieldDefinition {
  name: string;
  title: string;
  type: string;
  inputType?: string;
  choices?: unknown[];
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

const CONTAINER_TYPES = new Set(["panel", "paneldynamic", "page"]);
const DECORATION_TYPES = new Set(["html", "expression", "formula", "image"]);
const MEDIA_TYPES = new Set(["signaturepad", "imageupload", "file"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatFieldName(key: string): string {
  return key
    .replace(/_x0020_/gi, " ")
    .replace(/_x002f_/gi, "/")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || key;
}

function numberFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function fieldLooksCurrencyLike(field: EvaluationFieldDefinition, value: unknown): boolean {
  if (numberFromValue(value) === null) return false;
  if (field.type === "currency" || field.currency || field.currencySymbol) return true;
  if (field.displayFormat?.toLowerCase() === "currency") return true;
  return /\b(cost|amount|price|fee|claim|expense|budget|total|subtotal)\b/.test(`${field.name} ${field.title}`.toLowerCase());
}

function formatCurrency(value: unknown, field: EvaluationFieldDefinition): string {
  const numericValue = numberFromValue(value);
  if (numericValue === null) return formatValue(value, { ...field, type: "text", currency: undefined, currencySymbol: undefined });
  const symbol = field.currencySymbol?.trim() || (field.currency === "MYR" || !field.currency ? "RM" : field.currency);
  const decimals = field.decimalPlaces ?? 2;
  return `${symbol} ${new Intl.NumberFormat(field.locale || "en-MY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numericValue)}`;
}

function choiceLabel(choice: unknown, value: unknown): string | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    return String(choice) === String(value) ? String(choice) : null;
  }
  if (!isRecord(choice)) return null;
  const choiceValue = choice.value ?? choice.itemValue ?? choice.id ?? choice.name;
  if (String(choiceValue) !== String(value)) return null;
  return String(choice.text ?? choice.title ?? choice.label ?? choiceValue);
}

/** Dates are stored as wall-clock text; print them the way the rest of the app does. */
function formatDateLikeValue(value: string, field: EvaluationFieldDefinition): string | null {
  const type = field.type;
  const inputType = field.inputType;
  if (type === "time" || inputType === "time") {
    const time = formatDisplayTime(value);
    return time || null;
  }
  const isDateField = ["date", "datetime", "datetimelocal"].includes(type) || ["date", "datetime-local", "month", "week"].includes(inputType ?? "");
  if (!isDateField && !isDisplayDateLike(value)) return null;
  if (type === "date" || inputType === "date") return formatDisplayDate(value, value);
  return formatDisplayDateTime(value, value);
}

function formatValue(value: unknown, field?: EvaluationFieldDefinition): string {
  if (isEmptyValue(value)) return "—";
  const normalized = normalizeMaybeJson(value);
  if (typeof normalized === "boolean") return normalized ? "Yes" : "No";
  if (Array.isArray(normalized)) return normalized.map((entry) => formatValue(entry, field)).join(", ");
  if (field?.choices?.length) {
    const label = field.choices.map((choice) => choiceLabel(choice, normalized)).find(Boolean);
    if (label) return label;
  }
  if (field && fieldLooksCurrencyLike(field, normalized)) return formatCurrency(normalized, field);
  if (typeof normalized === "string") {
    const dateText = formatDateLikeValue(normalized, field ?? { name: "", title: "", type: "text" });
    if (dateText) return dateText;
  }
  if (typeof normalized === "object") return JSON.stringify(normalized);
  return String(normalized);
}

function toFieldDefinition(element: Record<string, unknown>): EvaluationFieldDefinition {
  const name = typeof element.name === "string" ? element.name : "";
  return {
    name,
    title: typeof element.title === "string" && element.title.trim() ? element.title.trim() : formatFieldName(name),
    type: typeof element.type === "string" ? element.type : "text",
    inputType: typeof element.inputType === "string" ? element.inputType : undefined,
    choices: Array.isArray(element.choices) ? element.choices : undefined,
    rateMin: typeof element.rateMin === "number" ? element.rateMin : undefined,
    rateMax: typeof element.rateMax === "number" ? element.rateMax : undefined,
    minRateDescription: typeof element.minRateDescription === "string" ? element.minRateDescription : undefined,
    maxRateDescription: typeof element.maxRateDescription === "string" ? element.maxRateDescription : undefined,
    currency: typeof element.currency === "string" ? element.currency : undefined,
    currencySymbol: typeof element.currencySymbol === "string" ? element.currencySymbol : undefined,
    locale: typeof element.locale === "string" ? element.locale : undefined,
    decimalPlaces: typeof element.decimalPlaces === "number" ? element.decimalPlaces : undefined,
    displayFormat: typeof element.displayFormat === "string" ? element.displayFormat : undefined,
  };
}

/** Declared fields, flattened in declaration order — containers contribute their children, not themselves. */
function collectFieldDefinitions(elements: Record<string, unknown>[] | undefined): EvaluationFieldDefinition[] {
  const definitions: EvaluationFieldDefinition[] = [];
  const seen = new Set<string>();

  const visit = (element: Record<string, unknown>) => {
    const type = typeof element.type === "string" ? element.type : "";
    const name = typeof element.name === "string" ? element.name : "";
    if (name && !CONTAINER_TYPES.has(type) && !DECORATION_TYPES.has(type) && !seen.has(name)) {
      seen.add(name);
      definitions.push(toFieldDefinition(element));
    }
    for (const key of ["elements", "templateElements", "questions", "pages"]) {
      const children = element[key];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }
  };

  elements?.filter(isRecord).forEach(visit);
  return definitions;
}

/**
 * Every row to show: the layer's declared fields first, then anything the stored
 * answer holds that the current layer config no longer declares.
 */
function collectDisplayRows(
  fields: Record<string, unknown>,
  definitions: EvaluationFieldDefinition[],
): { field: EvaluationFieldDefinition; value: unknown }[] {
  const declared = new Set(definitions.map((definition) => definition.name));
  const rows = definitions.map((field) => ({ field, value: fields[field.name] }));

  for (const [key, value] of Object.entries(fields)) {
    if (declared.has(key) || isEmptyValue(value)) continue;
    rows.push({ field: { name: key, title: formatFieldName(key), type: "text" }, value });
  }

  return rows;
}

function isImageLike(source: string): boolean {
  return /^data:image\//i.test(source) || /\.(png|jpe?g|gif|webp|bmp|svg)([?#].*)?$/i.test(source);
}

function linkFromRecord(record: Record<string, unknown>): string {
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return next.trim();
  }
  return "";
}

function extractImageSrcFromHtml(value: string): string {
  return value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
}

/** The sources behind a value, whether it arrived as a data URL, a link, or an <img> blob. */
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
  const candidate = extractImageSrcFromHtml(trimmed) || trimmed;
  const firstUrl = candidate.search(/,\s+/) === -1 ? candidate : candidate.slice(0, candidate.search(/,\s+/)).trim();
  if (/^(data:image\/|https?:\/\/|\/)/i.test(firstUrl)) return [firstUrl];
  return [];
}

function mediaSourcesForField(field: EvaluationFieldDefinition, value: unknown): string[] {
  if (isEmptyValue(value)) return [];
  const sources = mediaSourcesFromValue(value);
  if (sources.length === 0) return [];
  if (MEDIA_TYPES.has(field.type)) return sources;
  return sources.some(isImageLike) ? sources : [];
}

function filenameFromUrl(source: string): string {
  if (source.startsWith("data:image/")) return "Captured image";
  const last = (source.split(/[?#]/)[0] ?? source).split("/").filter(Boolean).pop();
  if (!last) return "Open file";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function MediaValue({ sources }: { sources: string[] }) {
  return (
    <div className="eval-summary-media" style={{ display: "grid", gap: 8, justifyItems: "end" }}>
      {sources.map((source, index) => (
        isImageLike(source) ? (
          <div
            key={`${source}-${index}`}
            style={{
              border: `1px solid ${editorial.border}`,
              borderRadius: 10,
              background: "#fff",
              padding: 8,
              maxWidth: 280,
              width: "100%",
            }}
          >
            <img
              src={source}
              alt={filenameFromUrl(source)}
              style={{ display: "block", width: "100%", maxHeight: 160, objectFit: "contain" }}
            />
          </div>
        ) : (
          <a
            key={`${source}-${index}`}
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: editorial.pmwBlueDark, fontWeight: 600, overflowWrap: "anywhere" }}
          >
            {filenameFromUrl(source)}
          </a>
        )
      ))}
    </div>
  );
}

function RatingDisplay({ field, value }: { field: EvaluationFieldDefinition; value: unknown }) {
  const rating = numberFromValue(value);
  if (rating === null) return <span>{formatValue(value, field)}</span>;
  const min = field.rateMin ?? 1;
  const max = field.rateMax ?? 5;
  const percent = max > min ? ((Math.min(max, Math.max(min, rating)) - min) / (max - min)) * 100 : 100;

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 150 }}>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rating} / {max}</div>
      <div style={{ height: 7, borderRadius: 999, background: editorial.border, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: `linear-gradient(90deg, ${editorial.sky}, ${editorial.pmwBlue})` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, color: editorial.muted }}>
        <span>{field.minRateDescription || min}</span>
        <span>{field.maxRateDescription || max}</span>
      </div>
    </div>
  );
}

function FieldValue({ field, value }: { field: EvaluationFieldDefinition; value: unknown }) {
  const mediaSources = mediaSourcesForField(field, value);
  if (mediaSources.length > 0) return <MediaValue sources={mediaSources} />;
  if (field.type === "rating") return <RatingDisplay field={field} value={value} />;
  return <span>{formatValue(value, field)}</span>;
}

const cardStyle: React.CSSProperties = {
  background: editorial.blueSoft,
  border: `1px solid ${editorial.border}`,
  boxShadow: editorialShadow,
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: editorial.muted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: editorial.ink,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
};

// A two-column grid rather than a flex row: the value column is allowed to
// shrink (`minmax(0, …)`), which is what stops a long value — a signature data
// URL, a pasted note — from pushing the card past the page.
const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 0.42fr) minmax(0, 1fr)",
  gap: 14,
  padding: "8px 0",
  borderBottom: `1px solid ${editorial.border}`,
  alignItems: "start",
};

// On a phone the label column would squeeze a signature down to a smear, so the
// row stacks and the value takes the full width.
const RESPONSIVE_CSS = `
  @media (max-width: 560px) {
    .eval-summary-row { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; }
    .eval-summary-row .eval-summary-value { text-align: left !important; }
    .eval-summary-row .eval-summary-media { justify-items: start !important; }
  }
`;

export default function EvaluationSummary({ result, layerTitle, layerDescription, surveyElements }: EvaluationSummaryProps) {
  if (!result || result.status !== "confirmed") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: editorial.softMuted, fontStyle: "italic" }}>
          {layerTitle ? `${layerTitle}: ` : ""}Not yet evaluated
        </div>
      </div>
    );
  }

  const displayRows = collectDisplayRows(result.fields || {}, collectFieldDefinitions(surveyElements));

  return (
    <div style={{ ...cardStyle, minWidth: 0 }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: editorial.pmwBlueDark }}>
          {layerTitle || `Evaluation Layer ${result.layerNumber}`}
        </div>
        {layerDescription && (
          <div style={{ fontSize: 11, color: editorial.muted, marginTop: 2 }}>{layerDescription}</div>
        )}
      </div>

      {/* Evaluator info */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${editorial.border}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>Evaluator</div>
          <div style={valueStyle}>{result.email || "Unknown"}</div>
        </div>
        <div>
          <div style={labelStyle}>Date</div>
          <div style={valueStyle}>{formatDisplayDateTime(result.confirmedAt)}</div>
        </div>
        <div>
          <div style={labelStyle}>Status</div>
          <div style={{ ...valueStyle, color: editorial.success }}>Confirmed</div>
        </div>
      </div>

      {/* Evaluation fields */}
      {displayRows.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Evaluation Details</div>
          {displayRows.map(({ field, value }) => (
            <div key={field.name} className="eval-summary-row" style={fieldRowStyle}>
              <div style={{ fontSize: 12, color: editorial.muted, overflowWrap: "anywhere" }}>{field.title}</div>
              <div className="eval-summary-value" style={{ ...valueStyle, minWidth: 0, textAlign: "right", justifySelf: "stretch" }}>
                <FieldValue field={field} value={value} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {result.notes && (
        <div style={{ marginTop: 12, padding: 10, background: editorial.yellowSoft, borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 800, color: editorial.warning, marginBottom: 4 }}>Notes</div>
          <div style={{ color: editorial.ink, overflowWrap: "anywhere" }}>{result.notes}</div>
        </div>
      )}
    </div>
  );
}
