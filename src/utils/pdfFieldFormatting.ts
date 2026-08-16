export interface PdfFieldFormatContext {
  type?: string;
  inputType?: string;
  choices?: unknown[];
  rateValues?: unknown[];
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
}

export interface PdfMeasureContext {
  value: number;
  min: number;
  max: number;
  percent: number;
  valueLabel: string;
  minLabel: string;
  maxLabel: string;
  selectedLabel?: string;
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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateOnly(value: string): { day: number; month: number; year: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, year };
}

function parseTimeOnly(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatTime(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${pad2(hour12)}:${pad2(minute)} ${period}`;
}

export function formatPdfDateTimeValue(value: string, includeTime: boolean): string {
  const trimmed = value.trim();
  if (!includeTime) {
    const dateOnly = parseDateOnly(trimmed);
    if (dateOnly) return `${pad2(dateOnly.day)}/${pad2(dateOnly.month)}/${dateOnly.year}`;
  }

  const timeOnly = parseTimeOnly(trimmed);
  if (timeOnly && includeTime) return formatTime(timeOnly.hour, timeOnly.minute);

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  const dateText = `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  return includeTime ? `${dateText} ${formatTime(parsed.getHours(), parsed.getMinutes())}` : dateText;
}

export function numberFromPdfValue(value: unknown): number | null {
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

function valueWithAffixes(value: number, field: PdfFieldFormatContext): string {
  return `${field.prefix ?? ""}${value}${field.suffix ?? ""}`;
}

export function getPdfMeasureContext(field: PdfFieldFormatContext, value: unknown): PdfMeasureContext | null {
  const numericValue = numberFromPdfValue(value);
  if (numericValue === null) return null;

  const isRating = field.type === "rating";
  const min = isRating ? field.rateMin ?? 1 : field.min ?? 0;
  const max = isRating ? field.rateMax ?? 5 : field.max ?? 100;
  const clamped = Math.min(max, Math.max(min, numericValue));
  const percent = max > min ? ((clamped - min) / (max - min)) * 100 : 100;
  const choiceOptions = field.rateValues?.length ? field.rateValues : field.choices;
  const selectedLabel = choiceOptions?.map((choice) => choiceLabel(choice, numericValue)).find(Boolean);

  return {
    value: numericValue,
    min,
    max,
    percent,
    valueLabel: isRating ? `${numericValue} of ${max}${selectedLabel ? ` - ${selectedLabel}` : ""}` : valueWithAffixes(numericValue, field),
    minLabel: field.minRateDescription || valueWithAffixes(min, field),
    maxLabel: field.maxRateDescription || valueWithAffixes(max, field),
    ...(selectedLabel ? { selectedLabel } : {}),
  };
}

export function formatPdfFieldValue(value: unknown, field: PdfFieldFormatContext = {}): string {
  if (value === null || value === undefined || value === "") return "";
  const normalized = normalizeMaybeJson(value);

  if (typeof normalized === "boolean") return normalized ? "Yes" : "No";
  if (Array.isArray(normalized)) {
    return normalized.map((entry) => formatPdfFieldValue(entry, field)).join(", ");
  }
  const choiceOptions = field.type === "rating" && field.rateValues?.length ? field.rateValues : field.choices;
  if (choiceOptions?.length) {
    const label = choiceOptions.map((choice) => choiceLabel(choice, normalized)).find(Boolean);
    if (label) return label;
  }

  const type = field.type ?? "";
  const inputType = field.inputType ?? "";
  if (typeof normalized === "string") {
    if (inputType === "time") return formatPdfDateTimeValue(normalized, true);
    if (isDateLikeValue(normalized) && (type === "date" || type === "datetime" || inputType === "date" || inputType === "datetime-local")) {
      return formatPdfDateTimeValue(normalized, inputType !== "date" && type !== "date");
    }
  }

  if (isRecord(normalized)) {
    if (normalized.Url) return normalized.Description ? String(normalized.Description) : String(normalized.Url);
    return JSON.stringify(normalized);
  }

  return String(normalized);
}
