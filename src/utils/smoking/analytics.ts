import type { DayPoint } from "../portalStats";
import { effectiveFlag } from "./adminData";
import type { SmokingBreak } from "./schema";

/*
 * The Totals dashboard's arithmetic, kept apart from the drawing.
 *
 * Two counting rules, the same ones the per-person table uses:
 *   - *When* a break happened is real even if the break is flagged — someone
 *     did walk out at 10:42 — so start-time charts count every break.
 *   - *How long* is only trusted for a closed, unflagged break. A forgotten
 *     scan-out is not a thirteen-hour smoke, so flagged breaks add no minutes.
 *
 * Everything is bucketed on Malaysian wall-clock time, a flat UTC+8, whatever
 * zone the viewer's laptop is in: "10 o'clock" means 10 o'clock on site.
 */

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NARROW = ["S", "M", "T", "W", "T", "F", "S"];

/** Past this many days the per-day chart draws one bar per week instead. */
const MAX_DAILY_BARS = 62;
/** The working day the heat map always shows, so a quiet week keeps its shape. */
const WORKDAY_FIRST_HOUR = 8;
const WORKDAY_LAST_HOUR = 18;

/** A Date whose UTC fields read as Malaysian wall-clock time. */
const myt = (iso: string | number) => new Date(new Date(iso).getTime() + MYT_OFFSET_MS);

/** Minutes the break adds to totals, or null when it adds none. */
function countedMinutes(b: SmokingBreak, now: Date): number | null {
  if (effectiveFlag(b, now) || b.durationMinutes == null) return null;
  return b.durationMinutes;
}

export interface BreakSummary {
  /** Closed, unflagged breaks — the ones with trusted minutes. */
  breaks: number;
  people: number;
  totalMinutes: number;
  averageMinutes: number;
  flagged: number;
  /** Still out, not yet flagged. */
  open: number;
}

export function breakSummary(breaks: SmokingBreak[], now: Date): BreakSummary {
  const s: BreakSummary = { breaks: 0, people: new Set(breaks.map((b) => b.email)).size, totalMinutes: 0, averageMinutes: 0, flagged: 0, open: 0 };
  for (const b of breaks) {
    if (effectiveFlag(b, now)) s.flagged += 1;
    else if (b.durationMinutes == null) s.open += 1;
    else {
      s.breaks += 1;
      s.totalMinutes += b.durationMinutes;
    }
  }
  s.averageMinutes = s.breaks ? Math.round(s.totalMinutes / s.breaks) : 0;
  return s;
}

export interface HeatCell {
  /** 0 = Monday .. 6 = Sunday. */
  day: number;
  /** 0–23, Malaysian time. */
  hour: number;
  breaks: number;
  minutes: number;
}

export interface Heatmap {
  /** `cells[day][hour]`, every hour of every day. */
  cells: HeatCell[][];
  /** The hour columns worth drawing: the working day, widened to any break outside it. */
  firstHour: number;
  lastHour: number;
  /** The slot with the most breaks — earliest in the week on a tie — or null when empty. */
  peak: HeatCell | null;
}

export function breakHeatmap(breaks: SmokingBreak[], now: Date): Heatmap {
  const cells = Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => ({ day, hour, breaks: 0, minutes: 0 })));
  let firstHour = WORKDAY_FIRST_HOUR;
  let lastHour = WORKDAY_LAST_HOUR;
  for (const b of breaks) {
    const start = myt(b.timeIn);
    const day = (start.getUTCDay() + 6) % 7;
    const hour = start.getUTCHours();
    const cell = cells[day][hour];
    cell.breaks += 1;
    cell.minutes += countedMinutes(b, now) ?? 0;
    firstHour = Math.min(firstHour, hour);
    lastHour = Math.max(lastHour, hour);
  }
  let peak: HeatCell | null = null;
  for (const row of cells) for (const cell of row) if (cell.breaks > (peak?.breaks ?? 0)) peak = cell;
  return { cells, firstHour, lastHour, peak };
}

const dayLabel = (d: Date) => `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;

/**
 * Breaks started per Malaysian day across [from, to) — or per week, from
 * `from`, once the range is too long for a bar a day to be readable.
 */
export function breaksPerDay(breaks: SmokingBreak[], fromIso: string, toIso: string, now: Date): DayPoint[] {
  const from = new Date(fromIso).getTime();
  const days = Math.max(1, Math.round((new Date(toIso).getTime() - from) / DAY_MS));
  const weekly = days > MAX_DAILY_BARS;
  const size = weekly ? 7 : 1;
  const count = Math.ceil(days / size);
  const counts = new Array<number>(count).fill(0);
  for (const b of breaks) {
    const index = Math.floor((new Date(b.timeIn).getTime() - from) / (size * DAY_MS));
    if (index >= 0 && index < count) counts[index] += 1;
  }
  const busiest = Math.max(...counts, 0);
  // Every letter fits under a week or two of bars; past that, label a dozen.
  const labelEvery = count <= 14 ? 1 : Math.ceil(count / 12);
  return counts.map((n, i) => {
    const startMs = from + i * size * DAY_MS;
    const start = myt(startMs);
    const short = count <= 14 && !weekly ? WEEKDAY_NARROW[start.getUTCDay()] : i % labelEvery === 0 ? String(start.getUTCDate()) : "";
    return {
      key: new Date(startMs).toISOString(),
      label: weekly ? `w/c ${dayLabel(start)}` : dayLabel(start),
      short,
      count: n,
      percent: busiest ? Math.round((n / busiest) * 100) : 0,
      isToday: now.getTime() >= startMs && now.getTime() < startMs + size * DAY_MS,
    };
  });
}

export type BreakdownBy = "department" | "company" | "area" | "person";

export interface BreakdownRow {
  id: string;
  label: string;
  minutes: number;
  breaks: number;
}

function groupOf(b: SmokingBreak, by: BreakdownBy): { id: string; label: string } {
  if (by === "person") return { id: b.email, label: b.fullName || b.email };
  const value = (by === "area" ? b.areaInName : by === "company" ? b.company : b.department) || "—";
  return { id: value, label: value };
}

/** Counted minutes per group, most first. Groups with no counted break are left out. */
export function breakdownRows(breaks: SmokingBreak[], by: BreakdownBy, now: Date, limit = 10): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>();
  for (const b of breaks) {
    const minutes = countedMinutes(b, now);
    if (minutes == null) continue;
    const { id, label } = groupOf(b, by);
    const row = groups.get(id) ?? { id, label, minutes: 0, breaks: 0 };
    row.minutes += minutes;
    row.breaks += 1;
    groups.set(id, row);
  }
  return [...groups.values()]
    .sort((a, b) => b.minutes - a.minutes || b.breaks - a.breaks || a.label.localeCompare(b.label))
    .slice(0, limit);
}
