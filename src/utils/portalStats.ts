import type { CatalogueEntry, PortalRecord, StatFilter } from "../types";
import { normalizeEmail } from "./portalPeople";

/**
 * The numbers the dashboard draws, and — just as importantly — the filter each
 * number stands for.
 *
 * Every tile on the dashboard is a question with a list behind it ("how many
 * are waiting on me?" → the list of them), so a count that cannot be opened is
 * a dead end. Each bucket therefore carries the `StatFilter` that reproduces
 * it, and the screens hand that straight to the records table. Nothing here
 * counts one way and filters another.
 */

export interface StatBucket {
  id: StatFilter;
  label: string;
  count: number;
  /** Share of `total`, 0–100. Used for the bars, not for the label. */
  percent: number;
  tone: "ink" | "alert" | "positive" | "muted";
}

export interface DayPoint {
  /** ISO day, for React keys and sorting. */
  key: string;
  /** "12 Aug" */
  label: string;
  /** Single letter for the axis on a narrow screen. */
  short: string;
  count: number;
  /** Height of this bar as a share of the busiest day, 0–100. */
  percent: number;
  isToday: boolean;
}

export interface PortalStats {
  total: number;
  /** Filed by the signed-in account. */
  mine: number;
  /** Waiting on the signed-in account's signature right now. */
  queue: number;
  /** Has a chain, and is still moving through it. */
  open: number;
  approved: number;
  returned: number;
  rejected: number;
  cancelled: number;
  /** Filed on a form with no approval step — complete on arrival. */
  recorded: number;
  overdue: number;
  /** Whether anything in this set has an SLA to miss. */
  hasSla: boolean;
  /** Filed on today's date. */
  filedToday: number;
  /** Filed within the last 7 calendar days, today included — the tail of `daily`. */
  last7: number;
  /** Filed within the last 30 calendar days, today included. */
  last30: number;
  /** Median hours from filing to the last signature, over settled records. */
  medianHoursToSettle: number;
  /** Buckets worth drawing, in order, zero-count ones dropped. */
  breakdown: StatBucket[];
  /** The last 14 days of intake, oldest first. */
  daily: DayPoint[];
}

const DAY_MS = 86_400_000;
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "narrow" });

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Local midnight of the day a moment falls on — the day boundary the viewer reads it against. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days between two local midnights. Rounded, so a daylight-saving day still counts as one. */
function daysApart(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

/**
 * `2026-08-19` from the local date parts.
 *
 * `toISOString().slice(0, 10)` is the UTC day, which for a local midnight east
 * of Greenwich is yesterday — the bar would key itself to the day before the
 * one it draws.
 */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Intake per day for the last `days` days, oldest first. Empty days are kept — a gap is data. */
function dailyIntake(records: PortalRecord[], days: number, now: Date): DayPoint[] {
  const today = startOfDay(now);
  const counts = new Array<number>(days).fill(0);

  for (const record of records) {
    if (!record.filedAt) continue;
    // Which day it was filed on, not how long ago it was filed. Measuring from
    // midnight to the filing instant put anything filed after 00:00 yesterday
    // less than a day back, so it landed on today's bar — and pushed today's
    // own intake off the end of the fortnight entirely.
    const back = daysApart(startOfDay(record.filedAt), today);
    const index = days - 1 - back;
    if (index >= 0 && index < days) counts[index] += 1;
  }

  const busiest = Math.max(1, ...counts);
  return counts.map((count, index) => {
    // Stepping the day number rather than subtracting milliseconds keeps every
    // bar on its own midnight where a zone observes daylight saving.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - index));
    return {
      key: isoDay(date),
      label: DAY_LABEL.format(date),
      short: DAY_SHORT.format(date),
      count,
      percent: Math.round((count / busiest) * 100),
      isToday: index === days - 1,
    } satisfies DayPoint;
  });
}

export interface PortalStatsInput {
  /** Everything in scope — already narrowed to one form type where that applies. */
  records: PortalRecord[];
  userEmail: string;
  /** Catalogue entries in scope, consulted only for whether an SLA exists at all. */
  catalogue?: CatalogueEntry[];
  now?: Date;
}

/**
 * One pass over the records in scope. Callers narrow the set (all records, one
 * form type, only mine) and read the same shape back, so the dashboard, the
 * form hub and the record tables cannot drift apart on what "open" means.
 */
export function portalStats({ records, userEmail, catalogue, now = new Date() }: PortalStatsInput): PortalStats {
  const email = normalizeEmail(userEmail);
  const today = startOfDay(now);

  let mine = 0;
  let queue = 0;
  let open = 0;
  let approved = 0;
  let returned = 0;
  let rejected = 0;
  let cancelled = 0;
  let recorded = 0;
  let overdue = 0;
  let filedToday = 0;
  let last7 = 0;
  let last30 = 0;
  let sla = false;
  const settleHours: number[] = [];

  for (const record of records) {
    if (record.submitterEmail === email) mine += 1;
    if (record.hasSla) sla = true;
    if (record.overdue) overdue += 1;

    const isOpen = record.hasWorkflow && !record.done && !record.returned;
    if (isOpen) open += 1;
    if (isOpen && record.currentAssigneeEmail === email) queue += 1;

    if (record.returned) returned += 1;
    else if (record.status === "Approved") approved += 1;
    else if (record.status === "Rejected") rejected += 1;
    else if (record.status === "Cancelled") cancelled += 1;
    else if (!record.hasWorkflow) recorded += 1;

    if (record.filedAt) {
      // Which day it was filed on, counted the same way the chart counts it, so
      // "last 7 days" is the sum of the last seven bars rather than a rolling
      // 168 hours that cuts yesterday in half. Today is 0, so the last seven
      // days are 0 to 6 back; a date still in the future is in neither window.
      const back = daysApart(startOfDay(record.filedAt), today);
      if (back === 0) filedToday += 1;
      if (back >= 0 && back < 7) last7 += 1;
      if (back >= 0 && back < 30) last30 += 1;
    }
    if (record.done && record.hasWorkflow && record.hoursSinceFiled > 0) {
      settleHours.push(record.hoursSinceFiled);
    }
  }

  const total = records.length;
  const bucket = (id: StatFilter, label: string, count: number, tone: StatBucket["tone"]): StatBucket => ({
    id,
    label,
    count,
    percent: total === 0 ? 0 : Math.round((count / total) * 100),
    tone,
  });

  const breakdown = [
    bucket("open", "In approval", open - overdue, "ink"),
    bucket("Past SLA", "Past SLA", overdue, "alert"),
    bucket("Approved", "Approved", approved, "positive"),
    bucket("Recorded", "Recorded", recorded, "muted"),
    bucket("Returned", "Returned", returned, "alert"),
    bucket("Rejected", "Rejected", rejected, "muted"),
    bucket("Cancelled", "Cancelled", cancelled, "muted"),
  ].filter((entry) => entry.count > 0);

  return {
    total,
    mine,
    queue,
    open,
    approved,
    returned,
    rejected,
    cancelled,
    recorded,
    overdue,
    // The catalogue is the authority where it was passed: a form type can
    // declare an SLA before anything has been filed against it.
    hasSla: catalogue ? catalogue.some((entry) => entry.hasSla) : sla,
    filedToday,
    last7,
    last30,
    medianHoursToSettle: median(settleHours),
    breakdown,
    daily: dailyIntake(records, 14, now),
  } satisfies PortalStats;
}

/** Records of one form type. Passing null means every form. */
export function scopeToForm(records: PortalRecord[], listTitle: string | null): PortalRecord[] {
  if (!listTitle) return records;
  return records.filter((record) => record.listTitle === listTitle);
}
