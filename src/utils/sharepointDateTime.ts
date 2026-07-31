const MALAYSIA_UTC_OFFSET_MINUTES = 8 * 60;

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const LOCAL_ISO_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2}))?(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
const EXPLICIT_TIMEZONE_RE = /(?:z|[+-]\d{2}:?\d{2})$/i;

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value !== "object" || Array.isArray(value)) return "";

  const record = value as Record<string, unknown>;
  for (const key of ["value", "Value", "text", "Text"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return next.trim();
  }
  return "";
}

function isValidLocalParts(parts: LocalDateTimeParts): boolean {
  const local = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ));
  return (
    local.getUTCFullYear() === parts.year &&
    local.getUTCMonth() === parts.month - 1 &&
    local.getUTCDate() === parts.day &&
    local.getUTCHours() === parts.hour &&
    local.getUTCMinutes() === parts.minute &&
    local.getUTCSeconds() === parts.second
  );
}

function parseLocalIsoDateTime(value: string): LocalDateTimeParts | null {
  const match = value.match(LOCAL_ISO_DATE_TIME_RE);
  if (!match) return null;

  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
    millisecond: Number((match[7] ?? "0").padEnd(3, "0").slice(0, 3)),
  };
  return isValidLocalParts(parts) ? parts : null;
}

function partsFromParsedLocalDate(date: Date): LocalDateTimeParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
  };
}

function malaysiaLocalPartsToUtcIso(parts: LocalDateTimeParts): string {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return new Date(localAsUtc - MALAYSIA_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

export function toSharePointMalaysiaDateTime(value: unknown): string | undefined {
  const text = valueToText(value);
  if (!text) return undefined;

  if (EXPLICIT_TIMEZONE_RE.test(text)) {
    const time = Date.parse(text);
    return Number.isNaN(time) ? undefined : new Date(time).toISOString();
  }

  const localIsoParts = parseLocalIsoDateTime(text);
  if (localIsoParts) return malaysiaLocalPartsToUtcIso(localIsoParts);

  const time = Date.parse(text);
  if (Number.isNaN(time)) return undefined;
  return malaysiaLocalPartsToUtcIso(partsFromParsedLocalDate(new Date(time)));
}
