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
import { useState } from "react";
import type { EvaluationLayerResult } from "../../types";
import { editorial, editorialShadow } from "../../theme/editorial";
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, isDisplayDateLike } from "../../utils/displayDateTime";
import {
  collectDisplayRows,
  collectFieldDefinitions,
  isEmptyValue,
  isRecord,
  type EvaluationFieldDefinition,
} from "./evaluationSummaryRows";

interface EvaluationSummaryProps {
  result: EvaluationLayerResult;
  layerTitle?: string;
  layerDescription?: string;
  surveyElements?: Record<string, unknown>[];
}

const MEDIA_TYPES = new Set(["signaturepad", "imageupload", "file"]);

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

function MediaLink({ source }: { source: string }) {
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: editorial.pmwBlueDark, fontWeight: 600, overflowWrap: "anywhere" }}
    >
      {filenameFromUrl(source)}
    </a>
  );
}

/**
 * An image that steps aside when it cannot load. A source the reader is not
 * authorised for — a SharePoint URL opened from a public link — otherwise leaves
 * a broken-image glyph in a bordered box, which reads as "the signature is
 * corrupt" rather than "open this to see it".
 */
function MediaImage({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaLink source={source} />;

  return (
    <div
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
        onError={() => setFailed(true)}
        style={{ display: "block", width: "100%", maxHeight: 160, objectFit: "contain" }}
      />
    </div>
  );
}

function MediaValue({ sources }: { sources: string[] }) {
  return (
    <div className="eval-summary-media" style={{ display: "grid", gap: 8, justifyItems: "end" }}>
      {sources.map((source, index) => (
        isImageLike(source)
          ? <MediaImage key={`${source}-${index}`} source={source} />
          : <MediaLink key={`${source}-${index}`} source={source} />
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
          {displayRows.map(({ field, value, sharedNameWith }, index) => (
            <div key={`${field.name}-${index}`} className="eval-summary-row" style={fieldRowStyle}>
              <div style={{ fontSize: 12, color: editorial.muted, overflowWrap: "anywhere" }}>
                {field.title}
                {sharedNameWith && (
                  <div style={{ fontSize: 10, color: editorial.warning, marginTop: 2, fontWeight: 600 }}>
                    Shares the field name “{field.name}” with {sharedNameWith}, so both questions read the one stored answer.
                  </div>
                )}
              </div>
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
