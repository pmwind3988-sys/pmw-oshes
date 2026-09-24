/**
 * Smoking log lists and their columns.
 *
 * Mirrored in `src/utils/smoking/schema.ts` — the browser provisions these lists
 * and the server writes to them, so both halves must name every column the same.
 * `src/utils/smoking/schema.parity.test.ts` fails if they drift.
 */
export const SMOKING_LISTS = {
  profiles: "Smoking Profiles",
  log: "Smoking Log",
  areas: "Smoking Areas",
} as const;

/** Title on Smoking Profiles holds the email too, so the list reads sensibly in SharePoint. */
export const PROFILE_COLUMNS = [
  "Email", "FullName", "Department", "DepartmentFromList", "Position",
  "StaffId", "Company", "SignInMethod", "FirstSeen", "LastSeen",
  "Blocked", "BlockedBy", "BlockedAt",
] as const;

export const LOG_COLUMNS = [
  "Email", "FullName", "Department", "Position", "Company", "Status",
  "AreaInCode", "AreaInName", "AreaOutCode", "AreaOutName",
  "TimeIn", "TimeOut", "DurationMinutes",
  "FlagReason", "ResolutionNote", "ResolvedBy", "ResolvedAt",
] as const;

/** Title on Smoking Areas is the area's name. */
export const AREA_COLUMNS = ["Code", "Active"] as const;

export const FLAG_OPEN_LONG = "Open over 12 hours";
export const FLAG_LASTED_LONG = "Lasted over 12 hours";

export type SignInMethod = "google" | "microsoft";

export interface SmokingProfile {
  email: string;
  fullName: string;
  department: string;
  /** False when HR's list was unreachable and the person typed the department. */
  departmentFromList: boolean;
  position: string;
  staffId: string;
  company: string;
  signInMethod: SignInMethod;
}

/** The profile as the store and the admin tooling see it — never shown to the smoker as-is. */
export type StoredProfile = SmokingProfile & { id: string; blocked: boolean };

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
}
