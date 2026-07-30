/**
 * EvaluationSummary.tsx — Read-only display of evaluation layer results.
 * Shows evaluator name, date, and field values.
 */
import type { EvaluationLayerResult } from "../../types";

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

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
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

function formatValue(value: unknown, field?: EvaluationFieldDefinition): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry, field)).join(", ");
  if (field && fieldLooksCurrencyLike(field, value)) return formatCurrency(value, field);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectFieldDefinitions(elements: Record<string, unknown>[] | undefined): Map<string, EvaluationFieldDefinition> {
  const definitions = new Map<string, EvaluationFieldDefinition>();
  const visit = (element: Record<string, unknown>) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (name) {
      definitions.set(name, {
        name,
        title: typeof element.title === "string" && element.title.trim() ? element.title.trim() : formatFieldName(name),
        type: typeof element.type === "string" ? element.type : "text",
        rateMin: typeof element.rateMin === "number" ? element.rateMin : undefined,
        rateMax: typeof element.rateMax === "number" ? element.rateMax : undefined,
        minRateDescription: typeof element.minRateDescription === "string" ? element.minRateDescription : undefined,
        maxRateDescription: typeof element.maxRateDescription === "string" ? element.maxRateDescription : undefined,
        currency: typeof element.currency === "string" ? element.currency : undefined,
        currencySymbol: typeof element.currencySymbol === "string" ? element.currencySymbol : undefined,
        locale: typeof element.locale === "string" ? element.locale : undefined,
        decimalPlaces: typeof element.decimalPlaces === "number" ? element.decimalPlaces : undefined,
        displayFormat: typeof element.displayFormat === "string" ? element.displayFormat : undefined,
      });
    }
    for (const key of ["elements", "templateElements", "questions"]) {
      const children = element[key];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }
  };
  elements?.filter(isRecord).forEach(visit);
  return definitions;
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
      <div style={{ height: 7, borderRadius: 999, background: "#E5E7EB", overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "linear-gradient(90deg, #F7C948, #6264A7)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, color: "#6B7280" }}>
        <span>{field.minRateDescription || min}</span>
        <span>{field.maxRateDescription || max}</span>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#F8F7FF",
  boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(26, 31, 43, 0.06)",
  borderRadius: 12,
  padding: "16px 18px",
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#1E1B4B",
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #F0EEF8",
};

export default function EvaluationSummary({ result, layerTitle, layerDescription, surveyElements }: EvaluationSummaryProps) {
  if (!result || result.status !== "confirmed") {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
          {layerTitle ? `${layerTitle}: ` : ""}Not yet evaluated
        </div>
      </div>
    );
  }

  const fieldEntries = Object.entries(result.fields || {});
  const fieldDefinitions = collectFieldDefinitions(surveyElements);

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>
          {layerTitle || `Evaluation Layer ${result.layerNumber}`}
        </div>
        {layerDescription && (
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{layerDescription}</div>
        )}
      </div>

      {/* Evaluator info */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #E5E3F0" }}>
        <div>
          <div style={labelStyle}>Evaluator</div>
          <div style={valueStyle}>{result.email || "Unknown"}</div>
        </div>
        <div>
          <div style={labelStyle}>Date</div>
          <div style={valueStyle}>
            {result.confirmedAt
              ? formatDateTime(result.confirmedAt)
              : "—"}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Status</div>
          <div style={{ ...valueStyle, color: "#059669" }}>Confirmed</div>
        </div>
      </div>

      {/* Evaluation fields */}
      {fieldEntries.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Evaluation Details</div>
          {fieldEntries.map(([key, value]) => {
            const field: EvaluationFieldDefinition = fieldDefinitions.get(key) ?? { name: key, title: formatFieldName(key), type: "text" };
            return (
              <div key={key} style={fieldRowStyle}>
                <div style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>{field.title}</div>
                <div style={{ fontSize: 13, color: "#1E1B4B", fontWeight: 500, flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {field.type === "rating" ? <RatingDisplay field={field} value={value} /> : formatValue(value, field)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {result.notes && (
        <div style={{ marginTop: 12, padding: 10, background: "#FFF8E7", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#92400E", marginBottom: 4 }}>Notes</div>
          <div style={{ color: "#78350F" }}>{result.notes}</div>
        </div>
      )}
    </div>
  );
}
