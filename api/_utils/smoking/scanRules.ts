import { FLAG_LASTED_LONG, FLAG_OPEN_LONG, type SmokingBreak } from "./schema.js";

/** A second scan this soon after scanning in is a shaky hand, not a break ending. */
export const DOUBLE_SCAN_WINDOW_MS = 60_000;
export const LONG_BREAK_MS = 12 * 60 * 60 * 1000;

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

export function decideScan(openBreak: SmokingBreak | null, now: Date): ScanDecision {
  if (!openBreak) return { kind: "open" };
  const timeIn = new Date(openBreak.timeIn);
  if (now.getTime() - timeIn.getTime() < DOUBLE_SCAN_WINDOW_MS) return { kind: "already-in", openBreak };
  const minutes = durationMinutes(timeIn, now);
  const flagReason = flagReasonFor(timeIn, now, now);
  if (now.getTime() - timeIn.getTime() > LONG_BREAK_MS) {
    return { kind: "close-stale-and-open", openBreak, durationMinutes: minutes, flagReason };
  }
  return { kind: "close", openBreak, durationMinutes: minutes, flagReason };
}
