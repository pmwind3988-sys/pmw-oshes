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

const text = (n: string) => ({ n, k: SP_FIELD_KIND.text });
const when = (n: string) => ({ n, k: SP_FIELD_KIND.dateTime });

export const SMOKING_LIST_SCHEMAS: SpListSchema[] = [
  {
    title: SMOKING_LISTS.profiles,
    description: "Smoking log: one row per registered smoker",
    columns: [
      text("Email"), text("FullName"), text("Department"), text("DepartmentFromList"), text("Position"),
      text("StaffId"), text("Company"), text("SignInMethod"), when("FirstSeen"), when("LastSeen"),
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
