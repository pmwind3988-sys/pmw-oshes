import { FLAG_LASTED_LONG, FLAG_OPEN_LONG, type SmokingBreak } from "./schema.js";

export const LONG_BREAK_MS = 12 * 60 * 60 * 1000;

/**
 * The limits OSHES sets in the Settings tab, in whole seconds. Mirrored in
 * `src/utils/smoking/schema.ts`; the parity test runs both.
 *
 * - ignoreRepeatSeconds: a second scan this soon after the last one is a shaky
 *   hand, not a break starting or ending. Nothing is recorded.
 * - minBreakSeconds: a break shorter than this is still recorded, but flagged.
 * - restSeconds: a break started this soon after the last one ended is still
 *   recorded, but flagged.
 *
 * Zero turns the two flag limits off.
 */
export interface ScanLimits {
  ignoreRepeatSeconds: number;
  minBreakSeconds: number;
  restSeconds: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = { ignoreRepeatSeconds: 60, minBreakSeconds: 0, restSeconds: 0 };

export const SCAN_LIMIT_MAX: ScanLimits = { ignoreRepeatSeconds: 10 * 60, minBreakSeconds: 12 * 60 * 60, restSeconds: 24 * 60 * 60 };

/** Whatever SharePoint hands back, as usable limits: bad values fall back, big ones are capped. */
export function normalizeScanLimits(raw: Partial<Record<keyof ScanLimits, unknown>>): ScanLimits {
  const read = (key: keyof ScanLimits): number => {
    const value = raw[key];
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(n) || n < 0) return DEFAULT_SCAN_LIMITS[key];
    return Math.min(Math.floor(n), SCAN_LIMIT_MAX[key]);
  };
  return { ignoreRepeatSeconds: read("ignoreRepeatSeconds"), minBreakSeconds: read("minBreakSeconds"), restSeconds: read("restSeconds") };
}

/** "45 s", "5 min", "1 min 30 s", "1 h 15 min". */
export function formatSpan(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (rest && !h) parts.push(`${rest} s`);
  return parts.join(" ") || "0 s";
}

export const FLAG_SEPARATOR = "; ";

/** One break can break more than one rule; each reason is kept once. */
export function joinFlags(...flags: string[]): string {
  const parts = flags.flatMap((f) => f.split(FLAG_SEPARATOR)).map((f) => f.trim()).filter(Boolean);
  return [...new Set(parts)].join(FLAG_SEPARATOR);
}

export function shortBreakFlag(timeIn: Date, timeOut: Date, limits: ScanLimits): string {
  if (!limits.minBreakSeconds) return "";
  return timeOut.getTime() - timeIn.getTime() < limits.minBreakSeconds * 1000
    ? `Shorter than the ${formatSpan(limits.minBreakSeconds)} minimum`
    : "";
}

export function earlyStartFlag(lastTimeOut: Date | null, now: Date, limits: ScanLimits): string {
  if (!limits.restSeconds || !lastTimeOut) return "";
  const gapSeconds = (now.getTime() - lastTimeOut.getTime()) / 1000;
  return gapSeconds < limits.restSeconds
    ? `Started ${formatSpan(gapSeconds)} after the last break (rest is ${formatSpan(limits.restSeconds)})`
    : "";
}

export type ScanDecision =
  | { kind: "open" }
  | { kind: "already-in"; openBreak: SmokingBreak }
  | { kind: "close"; openBreak: SmokingBreak; durationMinutes: number; flagReason: string }
  | { kind: "close-stale-and-open"; openBreak: SmokingBreak; durationMinutes: number; flagReason: string };

export function durationMinutes(timeIn: Date, timeOut: Date): number {
  return Math.round((timeOut.getTime() - timeIn.getTime()) / 60_000);
}

/** Mirrored in `src/utils/smoking/schema.ts`; the parity test runs both. */
export function flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string {
  if (timeOut) return timeOut.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_LASTED_LONG : "";
  return now.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_OPEN_LONG : "";
}

export function decideScan(openBreak: SmokingBreak | null, now: Date, limits: ScanLimits = DEFAULT_SCAN_LIMITS): ScanDecision {
  if (!openBreak) return { kind: "open" };
  const timeIn = new Date(openBreak.timeIn);
  if (now.getTime() - timeIn.getTime() < limits.ignoreRepeatSeconds * 1000) return { kind: "already-in", openBreak };
  const minutes = durationMinutes(timeIn, now);
  const flagReason = joinFlags(openBreak.flagReason, flagReasonFor(timeIn, now, now), shortBreakFlag(timeIn, now, limits));
  if (now.getTime() - timeIn.getTime() > LONG_BREAK_MS) {
    return { kind: "close-stale-and-open", openBreak, durationMinutes: minutes, flagReason };
  }
  return { kind: "close", openBreak, durationMinutes: minutes, flagReason };
}
