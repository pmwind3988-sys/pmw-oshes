/**
 * malaysiaTime.ts — the clock an export is stamped in.
 *
 * On screen a timestamp is read in the viewer's own zone, which is right: the
 * person looking at it is the person it is for. A file has no viewer. A CSV
 * gets mailed on, opened in Excel on somebody else's laptop and filed, so the
 * moment it records has to mean one thing forever — and for this company that
 * thing is Malaysian time.
 *
 * The offset is arithmetic rather than an `Intl` time zone lookup: Malaysia has
 * been a flat UTC+8 with no daylight saving since 1982, so there is nothing to
 * look up, and eight hours gives the same answer in a SharePoint-embedded
 * browser with a trimmed ICU build as it does in the test runner.
 *
 * Wall-clock text is left alone. `2026-08-12` and `2026-08-12T23:31` carry no
 * zone — they are what somebody typed into a date field — so shifting them by
 * eight hours would invent a change of date the form never recorded. Only a
 * value that names an instant (a `Z` or `+08:00` timestamp, a `Date`, an epoch
 * number) is converted.
 */

/** Column-header suffix, so a reader never has to guess whose clock it is. */
export const MALAYSIA_TIME_LABEL = "MYT";

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const TIME_ONLY_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ZONE_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

interface MalaysiaMoment {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  hasDate: boolean;
  hasTime: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The UTC+8 wall clock for an instant.
 *
 * Reading the shifted date through its `getUTC*` accessors is what keeps the
 * machine's own zone out of the answer — `getHours()` here would put the
 * exporter's laptop back into a file that is supposed to be zone-free.
 */
function momentFromInstant(date: Date): MalaysiaMoment {
  const shifted = new Date(date.getTime() + MALAYSIA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    hasDate: true,
    hasTime: true,
  };
}

/** `null` when the value carries no readable moment at all. */
function readMoment(value: unknown): MalaysiaMoment | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : momentFromInstant(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return momentFromInstant(new Date(value));
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  const dateOnly = DATE_ONLY_RE.exec(text);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hour: 0,
      minute: 0,
      hasDate: true,
      hasTime: false,
    };
  }

  const wallClock = ZONE_SUFFIX_RE.test(text) ? null : WALL_CLOCK_RE.exec(text);
  if (wallClock) {
    return {
      year: Number(wallClock[1]),
      month: Number(wallClock[2]),
      day: Number(wallClock[3]),
      hour: Number(wallClock[4]),
      minute: Number(wallClock[5]),
      hasDate: true,
      hasTime: true,
    };
  }

  const timeOnly = TIME_ONLY_RE.exec(text);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    if (hour > 23 || minute > 59) return null;
    return { year: 0, month: 0, day: 0, hour, minute, hasDate: false, hasTime: true };
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : momentFromInstant(parsed);
}

/** "11:31 PM" */
function clockText(moment: MalaysiaMoment): string {
  const period = moment.hour >= 12 ? "PM" : "AM";
  return `${pad2(moment.hour % 12 || 12)}:${pad2(moment.minute)} ${period}`;
}

/** "12/08/2026" */
function dateText(moment: MalaysiaMoment): string {
  return `${pad2(moment.day)}/${pad2(moment.month)}/${moment.year}`;
}

/**
 * "12/08/2026 11:31 PM" in Malaysian time.
 *
 * Text that carries no moment is returned as it was stored rather than replaced
 * by the fallback: an answer nobody can parse is still an answer, and dropping
 * it would lose data the form holds.
 */
export function formatMalaysiaDateTime(value: unknown, fallback = ""): string {
  const moment = readMoment(value);
  if (!moment) return typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!moment.hasDate) return clockText(moment);
  return moment.hasTime ? `${dateText(moment)} ${clockText(moment)}` : dateText(moment);
}

/** "12/08/2026" — for a question that only ever asked for a date. */
export function formatMalaysiaDate(value: unknown, fallback = ""): string {
  const moment = readMoment(value);
  if (!moment) return typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!moment.hasDate) return clockText(moment);
  return dateText(moment);
}

/** "11:31 PM" — for a question that only ever asked for a time. */
export function formatMalaysiaTime(value: unknown, fallback = ""): string {
  const moment = readMoment(value);
  if (!moment) return typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!moment.hasTime) return dateText(moment);
  return clockText(moment);
}

/** "12 Aug 2026, 11:31 PM" — the roomier form, for a summary cell. */
export function formatMalaysiaDateTimeLong(value: unknown, fallback = ""): string {
  const moment = readMoment(value);
  if (!moment) return typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!moment.hasDate) return clockText(moment);
  const day = `${pad2(moment.day)} ${MONTHS_SHORT[moment.month - 1]} ${moment.year}`;
  return moment.hasTime ? `${day}, ${clockText(moment)}` : day;
}

/**
 * `2026-08-18`, in Malaysian time, for a file name.
 *
 * `toISOString().slice(0, 10)` — which is what the exports used to name their
 * files — is the UTC date, so anything exported after 8am UTC on a Malaysian
 * evening was filed under tomorrow.
 */
export function malaysiaDateStamp(now: Date = new Date()): string {
  const moment = momentFromInstant(now);
  return `${moment.year}-${pad2(moment.month)}-${pad2(moment.day)}`;
}
