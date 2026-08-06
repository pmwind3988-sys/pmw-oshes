/**
 * displayDateTime.ts — one clock for every screen.
 *
 * Two rules the whole app follows:
 *  1. Times read in 12-hour form with an uppercase AM/PM, never `am`/`pm`.
 *  2. Wall-clock strings stay wall-clock. `2026-08-12T23:31` and `2026-08-12`
 *     carry no zone, so reading them through UTC used to shift the value by the
 *     viewer's offset (and print the raw ISO text when nothing parsed it).
 *     They are parsed as local time here instead.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DAY_PERIOD_PATTERN = /\b(am|pm)\b/gi;

export interface DisplayMoment {
  date: Date;
  hasDate: boolean;
  hasTime: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Uppercases a day period inside text that came from `toLocaleString`. */
export function uppercaseDayPeriod(value: string): string {
  return value.replace(DAY_PERIOD_PATTERN, (match) => match.toUpperCase());
}

/**
 * Reads any stored date value into a local-time moment, remembering which parts
 * the source actually carried so a date-only value never grows a "12:00 AM".
 */
export function parseDisplayMoment(value: unknown): DisplayMoment | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, hasDate: true, hasTime: true };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { date: new Date(value), hasDate: true, hasTime: true };
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = DATE_ONLY_RE.exec(trimmed);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : { date, hasDate: true, hasTime: false };
  }

  const localDateTime = LOCAL_DATE_TIME_RE.exec(trimmed);
  if (localDateTime) {
    const date = new Date(
      Number(localDateTime[1]),
      Number(localDateTime[2]) - 1,
      Number(localDateTime[3]),
      Number(localDateTime[4]),
      Number(localDateTime[5]),
      Number(localDateTime[6] ?? 0),
    );
    return Number.isNaN(date.getTime()) ? null : { date, hasDate: true, hasTime: true };
  }

  const timeOnly = TIME_ONLY_RE.exec(trimmed);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    if (hour > 23 || minute > 59) return null;
    const date = new Date();
    date.setHours(hour, minute, Number(timeOnly[3] ?? 0), 0);
    return { date, hasDate: false, hasTime: true };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return { date: parsed, hasDate: true, hasTime: true };
}

/** True when the text looks like something `parseDisplayMoment` can read. */
export function isDisplayDateLike(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return DATE_ONLY_RE.test(trimmed)
    || LOCAL_DATE_TIME_RE.test(trimmed)
    || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
}

/** "11:31 PM" */
export function formatClock(date: Date): string {
  const hours = date.getHours();
  return `${pad2(hours % 12 || 12)}:${pad2(date.getMinutes())} ${hours >= 12 ? "PM" : "AM"}`;
}

/** "12/08/2026" */
export function formatDisplayDate(value: unknown, fallback = "—"): string {
  const moment = parseDisplayMoment(value);
  if (!moment || !moment.hasDate) return fallback;
  const { date } = moment;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "12 Aug 2026" */
export function formatDisplayDateShort(value: unknown, fallback = "—"): string {
  const moment = parseDisplayMoment(value);
  if (!moment || !moment.hasDate) return fallback;
  const { date } = moment;
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "11:31 PM" */
export function formatDisplayTime(value: unknown, fallback = ""): string {
  const moment = parseDisplayMoment(value);
  if (!moment || !moment.hasTime) return fallback;
  return formatClock(moment.date);
}

/** "12/08/2026 11:31 PM" — date-only sources keep their date alone. */
export function formatDisplayDateTime(value: unknown, fallback = "—"): string {
  const moment = parseDisplayMoment(value);
  if (!moment) return fallback;
  if (!moment.hasDate) return formatClock(moment.date);
  const datePart = formatDisplayDate(moment.date);
  return moment.hasTime ? `${datePart} ${formatClock(moment.date)}` : datePart;
}

/** "12 Aug 2026, 11:31 PM" — the dashboard's roomier form. */
export function formatDisplayDateTimeLong(value: unknown, fallback = "—"): string {
  const moment = parseDisplayMoment(value);
  if (!moment) return fallback;
  if (!moment.hasDate) return formatClock(moment.date);
  const datePart = formatDisplayDateShort(moment.date);
  return moment.hasTime ? `${datePart}, ${formatClock(moment.date)}` : datePart;
}

/** "12 Aug 11:31 PM" — compact timeline rows where the year is implied. */
export function formatDisplayDayMonthTime(value: unknown, fallback = "—"): string {
  const moment = parseDisplayMoment(value);
  if (!moment) return fallback;
  if (!moment.hasDate) return formatClock(moment.date);
  const { date } = moment;
  const datePart = `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}`;
  return moment.hasTime ? `${datePart} ${formatClock(date)}` : datePart;
}
