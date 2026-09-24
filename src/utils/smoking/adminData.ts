import { csvRow } from "../csv";
import { MALAYSIA_TIME_LABEL, formatMalaysiaDateTime } from "../malaysiaTime";
import { flagReasonFor, type SmokingBreak } from "./schema";

export interface BreakFilters {
  from: string;
  to: string;
  department: string;
  area: string;
  search: string;
  flaggedOnly: boolean;
}

export interface PersonTotal {
  email: string;
  fullName: string;
  department: string;
  breaks: number;
  totalMinutes: number;
  averageMinutes: number;
  flagged: number;
}

export interface BreakEdit {
  timeIn: string;
  timeOut: string | null;
  areaInName: string;
  areaOutName: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
}

const AREA_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function effectiveFlag(b: SmokingBreak, now: Date): string {
  if (b.resolvedAt) return "";
  return b.flagReason || flagReasonFor(new Date(b.timeIn), b.timeOut ? new Date(b.timeOut) : null, now);
}

export function filterBreaks(breaks: SmokingBreak[], f: BreakFilters, now: Date): SmokingBreak[] {
  const search = f.search.trim().toLowerCase();
  return breaks
    .filter((b) => b.timeIn >= f.from && b.timeIn < f.to)
    .filter((b) => !f.department || b.department === f.department)
    .filter((b) => !f.area || b.areaInName === f.area || b.areaOutName === f.area)
    .filter((b) => !search || b.fullName.toLowerCase().includes(search) || b.email.includes(search))
    .filter((b) => !f.flaggedOnly || effectiveFlag(b, now) !== "")
    .sort((a, b) => b.timeIn.localeCompare(a.timeIn));
}

export function currentlyOut(breaks: SmokingBreak[], now: Date): SmokingBreak[] {
  return breaks.filter((b) => !b.timeOut && effectiveFlag(b, now) === "");
}

export function computeTotals(breaks: SmokingBreak[], now: Date): PersonTotal[] {
  const byEmail = new Map<string, PersonTotal>();
  for (const b of breaks) {
    const total = byEmail.get(b.email) ?? {
      email: b.email, fullName: b.fullName, department: b.department, breaks: 0, totalMinutes: 0, averageMinutes: 0, flagged: 0,
    };
    if (effectiveFlag(b, now)) total.flagged += 1;
    else if (b.durationMinutes != null) {
      total.breaks += 1;
      total.totalMinutes += b.durationMinutes;
    }
    byEmail.set(b.email, total);
  }
  return [...byEmail.values()]
    .map((t) => ({ ...t, averageMinutes: t.breaks ? Math.round(t.totalMinutes / t.breaks) : 0 }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || a.fullName.localeCompare(b.fullName));
}

export function validateEdit(edit: BreakEdit): string {
  if (!edit.fullName.trim()) return "Name is required.";
  if (!edit.department.trim()) return "Department is required.";
  if (Number.isNaN(Date.parse(edit.timeIn))) return "Time in is not a valid time.";
  if (edit.timeOut) {
    if (Number.isNaN(Date.parse(edit.timeOut))) return "Time out is not a valid time.";
    if (Date.parse(edit.timeOut) <= Date.parse(edit.timeIn)) return "Time out must be after time in.";
  }
  return "";
}

export function applyEdit(before: SmokingBreak, edit: BreakEdit, now: Date): SmokingBreak {
  const timeIn = new Date(edit.timeIn);
  const timeOut = edit.timeOut ? new Date(edit.timeOut) : null;
  return {
    ...before,
    fullName: edit.fullName.trim(),
    department: edit.department.trim(),
    position: edit.position.trim(),
    company: edit.company.trim(),
    areaInName: edit.areaInName,
    areaOutName: timeOut ? edit.areaOutName : "",
    areaOutCode: timeOut ? before.areaOutCode : "",
    timeIn: timeIn.toISOString(),
    timeOut: timeOut ? timeOut.toISOString() : null,
    durationMinutes: timeOut ? Math.round((timeOut.getTime() - timeIn.getTime()) / 60_000) : null,
    flagReason: timeOut ? flagReasonFor(timeIn, timeOut, now) : "",
  };
}

const show = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));
const when = (iso: string | null) => (iso ? formatMalaysiaDateTime(iso) : "—");

export function describeChange(before: SmokingBreak, after: SmokingBreak): string {
  const pairs: Array<[string, string, string]> = [
    ["Name", show(before.fullName), show(after.fullName)],
    ["Department", show(before.department), show(after.department)],
    ["Position", show(before.position), show(after.position)],
    ["Company", show(before.company), show(after.company)],
    ["Area in", show(before.areaInName), show(after.areaInName)],
    ["Area out", show(before.areaOutName), show(after.areaOutName)],
    ["Time in", when(before.timeIn), when(after.timeIn)],
    ["Time out", when(before.timeOut), when(after.timeOut)],
    ["Duration", before.durationMinutes == null ? "—" : `${before.durationMinutes} min`, after.durationMinutes == null ? "—" : `${after.durationMinutes} min`],
    ["Flag", show(before.flagReason), show(after.flagReason)],
  ];
  return pairs.filter(([, a, b]) => a !== b).map(([label, a, b]) => `${label}: ${a} → ${b}`).join("; ");
}

export function breakReference(b: SmokingBreak): string {
  return `SMK-${b.id}`;
}

export function breaksCsv(breaks: SmokingBreak[], now: Date): string {
  const lines = [csvRow([
    "Name", "Email", "Department", "Position", "Company", "Area in", "Area out",
    `Time in (${MALAYSIA_TIME_LABEL})`, `Time out (${MALAYSIA_TIME_LABEL})`, "Duration (min)", "Flag", "Resolution note",
  ])];
  for (const b of breaks) {
    lines.push(csvRow([
      b.fullName, b.email, b.department, b.position, b.company, b.areaInName, b.areaOutName,
      formatMalaysiaDateTime(b.timeIn), b.timeOut ? formatMalaysiaDateTime(b.timeOut) : "",
      b.durationMinutes ?? "", effectiveFlag(b, now), b.resolutionNote ?? "",
    ]));
  }
  return lines.join("\r\n");
}

export function totalsCsv(totals: PersonTotal[]): string {
  const lines = [csvRow(["Name", "Email", "Department", "Breaks", "Total (min)", "Average (min)", "Flagged"])];
  for (const t of totals) {
    lines.push(csvRow([t.fullName, t.email, t.department, t.breaks, t.totalMinutes, t.averageMinutes, t.flagged]));
  }
  return lines.join("\r\n");
}

export function newAreaCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += AREA_CODE_ALPHABET[Math.floor(random() * AREA_CODE_ALPHABET.length)];
  return code;
}
