import { SP_FIELD_KIND, type SpListSchema } from "../formBuilderSP";
import { SMOKING_LISTS } from "./lists";

export { SMOKING_LISTS, SMOKING_INDEXES } from "./lists";

/**
 * Browser mirror of `api/_utils/smoking/schema.ts` + `scanRules.ts`.
 * The admin page provisions the lists from here; the server writes to them.
 * `schema.parity.test.ts` fails if the two halves drift.
 */

export const FLAG_OPEN_LONG = "Open over 12 hours";
export const FLAG_LASTED_LONG = "Lasted over 12 hours";
export const LONG_BREAK_MS = 12 * 60 * 60 * 1000;

export function flagReasonFor(timeIn: Date, timeOut: Date | null, now: Date): string {
  if (timeOut) return timeOut.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_LASTED_LONG : "";
  return now.getTime() - timeIn.getTime() > LONG_BREAK_MS ? FLAG_OPEN_LONG : "";
}

/** OSHES's scan limits, in whole seconds — see `ScanLimits` in `api/_utils/smoking/scanRules.ts`. */
export interface ScanLimits {
  ignoreRepeatSeconds: number;
  minBreakSeconds: number;
  restSeconds: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = { ignoreRepeatSeconds: 60, minBreakSeconds: 0, restSeconds: 0 };

export const SCAN_LIMIT_MAX: ScanLimits = { ignoreRepeatSeconds: 10 * 60, minBreakSeconds: 12 * 60 * 60, restSeconds: 24 * 60 * 60 };

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

export function joinFlags(...flags: string[]): string {
  const parts = flags.flatMap((f) => f.split(FLAG_SEPARATOR)).map((f) => f.trim()).filter(Boolean);
  return [...new Set(parts)].join(FLAG_SEPARATOR);
}

/**
 * The flags a scan raised against OSHES's limits (too short, too soon), which
 * only the scan could judge. An admin edit keeps these and re-derives the rest.
 */
export function scanTimeFlags(flagReason: string): string {
  return joinFlags(...flagReason.split(FLAG_SEPARATOR).filter((f) => f !== FLAG_OPEN_LONG && f !== FLAG_LASTED_LONG));
}

const text = (n: string) => ({ n, k: SP_FIELD_KIND.text });
const when = (n: string) => ({ n, k: SP_FIELD_KIND.dateTime });

export const SMOKING_LIST_SCHEMAS: SpListSchema[] = [
  {
    title: SMOKING_LISTS.profiles,
    description: "Smoking log: one row per registered smoker",
    columns: [
      text("Email"), text("FullName"), text("Department"), text("DepartmentFromList"), text("Position"),
      text("StaffId"), text("Company"), text("SignInMethod"), when("FirstSeen"), when("LastSeen"),
      text("Blocked"), text("BlockedBy"), when("BlockedAt"),
    ],
  },
  {
    title: SMOKING_LISTS.log,
    description: "Smoking log: one row per break",
    columns: [
      text("Email"), text("FullName"), text("Department"), text("Position"), text("Company"), text("Status"),
      text("AreaInCode"), text("AreaInName"), text("AreaOutCode"), text("AreaOutName"),
      when("TimeIn"), when("TimeOut"), { n: "DurationMinutes", k: SP_FIELD_KIND.number },
      text("FlagReason"), { n: "ResolutionNote", k: SP_FIELD_KIND.note }, text("ResolvedBy"), when("ResolvedAt"),
    ],
  },
  {
    title: SMOKING_LISTS.areas,
    description: "Smoking log: one row per smoking area poster",
    columns: [text("Code"), text("Active")],
  },
  {
    title: SMOKING_LISTS.settings,
    description: "Smoking log: OSHES's scan limits, one row, in seconds",
    columns: [
      { n: "IgnoreRepeatSeconds", k: SP_FIELD_KIND.number },
      { n: "MinBreakSeconds", k: SP_FIELD_KIND.number },
      { n: "RestSeconds", k: SP_FIELD_KIND.number },
    ],
  },
];

export type SignInMethod = "google" | "microsoft";

export interface SmokingProfile {
  email: string;
  fullName: string;
  department: string;
  departmentFromList: boolean;
  position: string;
  staffId: string;
  company: string;
  signInMethod: SignInMethod;
}

export interface SmokingArea {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface SmokingBreak {
  id: string;
  email: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
  areaInCode: string;
  areaInName: string;
  areaOutCode: string;
  areaOutName: string;
  timeIn: string;
  timeOut: string | null;
  durationMinutes: number | null;
  flagReason: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}
