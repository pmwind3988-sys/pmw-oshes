/* Dev-only — answers the smoking screens' SharePoint and /api/smoking calls with fixtures. Never imported by the app. */
import { AREA_COLUMNS, LOG_COLUMNS, PROFILE_COLUMNS, SETTINGS_COLUMNS } from "../../api/_utils/smoking/schema";
import { sampleBreaks } from "./smokingFixtures";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ALL_COLUMNS = ["Title", ...PROFILE_COLUMNS, ...LOG_COLUMNS, ...AREA_COLUMNS, ...SETTINGS_COLUMNS];

const AREAS = [
  { Id: 1, Title: "Block A smoking area", Code: "AAA111", Active: "yes" },
  { Id: 2, Title: "Gate 2 shelter", Code: "BBB222", Active: "yes" },
  { Id: 3, Title: "Workshop yard", Code: "CCC333", Active: "yes" },
  { Id: 4, Title: "Old canteen corner", Code: "DDD444", Active: "no" },
];

function breakRows(fromIso: string, now: Date) {
  const rows: Record<string, unknown>[] = sampleBreaks(fromIso, now).map((b) => ({
    Id: Number(b.id),
    Email: b.email, FullName: b.fullName, Department: b.department, Position: b.position, Company: b.company,
    Status: "closed",
    AreaInCode: b.areaInCode, AreaInName: b.areaInName, AreaOutCode: b.areaOutCode, AreaOutName: b.areaOutName,
    TimeIn: b.timeIn, TimeOut: b.timeOut, DurationMinutes: b.durationMinutes, FlagReason: b.flagReason,
  }));
  // One break over the 1-hour maximum, and two people out right now.
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();
  rows.unshift(
    {
      Id: 900, Email: "raj@gmail.com", FullName: "Rajesh Kumar", Department: "Mechanical", Position: "Fitter", Company: "Acme Scaffold",
      Status: "closed", AreaInCode: "BBB222", AreaInName: "Gate 2 shelter", AreaOutCode: "BBB222", AreaOutName: "Gate 2 shelter",
      TimeIn: at(200), TimeOut: at(118), DurationMinutes: 82, FlagReason: "Longer than the 1 h maximum",
    },
    {
      Id: 901, Email: "siti@pmw-group.com", FullName: "Siti Aminah", Department: "QA/QC", Position: "Inspector", Company: "PMW",
      Status: "open", AreaInCode: "AAA111", AreaInName: "Block A smoking area", TimeIn: at(6),
    },
    {
      Id: 902, Email: "tan@gmail.com", FullName: "Tan Wei Ming", Department: "Electrical", Position: "Wireman", Company: "Voltline",
      Status: "open", AreaInCode: "CCC333", AreaInName: "Workshop yard", TimeIn: at(3),
    },
  );
  return rows;
}

const PROFILES = [
  ["Ali Hassan", "ali@gmail.com", "Civil", "Technician", "PMW", "S1021", "google"],
  ["Siti Aminah", "siti@pmw-group.com", "QA/QC", "Inspector", "PMW", "S1043", "microsoft"],
  ["Rajesh Kumar", "raj@gmail.com", "Mechanical", "Fitter", "Acme Scaffold", "AC-77", "google"],
  ["Tan Wei Ming", "tan@gmail.com", "Electrical", "Wireman", "Voltline", "V-310", "google"],
  ["Farid Osman", "farid@gmail.com", "Civil", "Rigger", "Acme Scaffold", "AC-81", "google"],
  ["Lim Chee Keong", "lim@pmw-group.com", "Stores", "Storekeeper", "PMW", "S1102", "microsoft"],
  ["Nora Aziz", "nora@gmail.com", "QA/QC", "Document controller", "Voltline", "V-322", "google"],
].map(([FullName, Email, Department, Position, Company, StaffId, SignInMethod], i) => ({
  Id: i + 1, Title: Email, FullName, Email, Department, DepartmentFromList: "yes", Position, Company, StaffId, SignInMethod,
  FirstSeen: "2026-08-03T01:10:00Z", LastSeen: "2026-09-28T02:40:00Z", Blocked: i === 4 ? "yes" : "no",
  BlockedBy: i === 4 ? "oshes@pmw-group.com" : "", BlockedAt: i === 4 ? "2026-09-20T03:00:00Z" : null,
}));

/** `scan` picks which result the scan page's preview shows. */
function smokingApi(body: Record<string, unknown>, scan: string, now: Date): Response {
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  switch (body.action) {
    case "area":
      return json({ name: "Block A smoking area", active: true });
    case "profile-get":
      return json({
        profile: scan === "profile" ? null : {
          email: "ali@gmail.com", fullName: "Ali Hassan", department: "Civil", departmentFromList: true,
          position: "Technician", staffId: "S1021", company: "PMW", signInMethod: "google",
        },
      });
    case "departments":
      return json({ departments: ["Civil", "Electrical", "Mechanical", "QA/QC", "Stores"], fromList: true });
    case "profile-save":
      return json({ ok: true });
    case "scan":
      if (scan === "profile") return json({ result: "no-profile" });
      if (scan === "in") return json({ result: "out", timeIn: minsAgo(9), timeOut: minsAgo(0), areaName: "Block A smoking area", durationMinutes: 9, flagged: false });
      if (scan === "already") return json({ result: "already-in", timeIn: minsAgo(0), areaName: "Block A smoking area" });
      if (scan === "flagged") return json({ result: "out", timeIn: minsAgo(75), timeOut: minsAgo(0), areaName: "Block A smoking area", durationMinutes: 75, flagged: true });
      return json({ result: "in", timeIn: minsAgo(0), areaName: "Block A smoking area" });
    default:
      return json({ ok: true });
  }
}

export function installSmokingStub(now: Date, weekFrom: string, scan: string): void {
  const real = window.fetch.bind(window);
  const breaks = breakRows(weekFrom, now);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.startsWith("/api/smoking")) return smokingApi(JSON.parse(String(init?.body ?? "{}")), scan, now);
    if (!url.includes("/_api/")) return real(input, init);
    if (url.includes("contextinfo")) return json({ FormDigestValue: "preview", d: { GetContextWebInformation: { FormDigestValue: "preview" } } });
    if (method !== "GET") return new Response(null, { status: 204 });
    if (url.includes("/fields")) return json({ value: ALL_COLUMNS.map((n) => ({ Title: n, InternalName: n, StaticName: n, EntityPropertyName: n, Indexed: true })) });
    const list = decodeURIComponent(url).match(/getbytitle\('([^']+)'\)/i)?.[1] ?? "";
    if (!url.includes("/items")) return json({ Title: list });
    if (list === "Smoking Log") return json({ value: breaks });
    if (list === "Smoking Areas") return json({ value: AREAS });
    if (list === "Smoking Profiles") return json({ value: PROFILES });
    if (list === "Smoking Settings") return json({ value: [{ Id: 1, IgnoreRepeatSeconds: 60, MaxBreakSeconds: 3600, RestSeconds: 0 }] });
    return json({ value: [] });
  };
}
