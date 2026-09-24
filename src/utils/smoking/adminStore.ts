import { ensureListSchema, spDelete, spGet, spPatch, spPost } from "../formBuilderSP";
import { SMOKING_LISTS, SMOKING_LIST_SCHEMAS, type SmokingArea, type SmokingBreak, type SmokingProfile } from "./schema";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

function items(list: string): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(list)}')/items`;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

const MAX_PAGES = 20;

/** Converts a relative odata.nextLink into an absolute URL, or returns absolute links unchanged. */
export function nextPageUrl(link: string | undefined): string | undefined {
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  const siteUrl = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");
  return `${siteUrl}/_api/${link.replace(/^\/+/, "")}`;
}

export async function ensureSmokingLists(token: string): Promise<void> {
  for (const schema of SMOKING_LIST_SCHEMAS) await ensureListSchema(token, schema);
}

export function rowToBreak(row: Record<string, unknown>): SmokingBreak {
  const duration = row.DurationMinutes;
  return {
    id: str(row.Id),
    email: str(row.Email),
    fullName: str(row.FullName),
    department: str(row.Department),
    position: str(row.Position),
    company: str(row.Company),
    areaInCode: str(row.AreaInCode),
    areaInName: str(row.AreaInName),
    areaOutCode: str(row.AreaOutCode),
    areaOutName: str(row.AreaOutName),
    timeIn: str(row.TimeIn),
    timeOut: str(row.TimeOut) || null,
    durationMinutes: duration == null || duration === "" ? null : Number(duration),
    flagReason: str(row.FlagReason),
    resolutionNote: str(row.ResolutionNote),
    resolvedBy: str(row.ResolvedBy),
    resolvedAt: str(row.ResolvedAt),
  };
}

export function rowToArea(row: Record<string, unknown>): SmokingArea {
  return { id: str(row.Id), name: str(row.Title), code: str(row.Code), active: str(row.Active) !== "no" };
}

export function rowToProfile(
  row: Record<string, unknown>,
): SmokingProfile & { id: string; firstSeen: string; lastSeen: string; blocked: boolean; blockedBy: string; blockedAt: string } {
  return {
    id: str(row.Id),
    email: str(row.Email),
    fullName: str(row.FullName),
    department: str(row.Department),
    departmentFromList: str(row.DepartmentFromList) !== "no",
    position: str(row.Position),
    staffId: str(row.StaffId),
    company: str(row.Company),
    signInMethod: str(row.SignInMethod) === "microsoft" ? "microsoft" : "google",
    firstSeen: str(row.FirstSeen),
    lastSeen: str(row.LastSeen),
    blocked: str(row.Blocked) === "yes",
    blockedBy: str(row.BlockedBy),
    blockedAt: str(row.BlockedAt),
  };
}

export function breakFilterFor(fromIso: string, toIso: string): string {
  return `(TimeIn ge datetime'${fromIso}' and TimeIn lt datetime'${toIso}') or Status eq 'open'`;
}

/** Follows SharePoint's paging so a busy month is never silently cut at 2,000 rows. Caps at MAX_PAGES to prevent infinite loops. */
async function readAll(token: string, url: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const data = (await spGet(token, next)) as { value?: Record<string, unknown>[]; "odata.nextLink"?: string };
    rows.push(...(data.value ?? []));
    next = nextPageUrl(data["odata.nextLink"]);
  }
  return rows;
}

export async function loadBreaks(token: string, fromIso: string, toIso: string): Promise<SmokingBreak[]> {
  const filter = encodeURIComponent(breakFilterFor(fromIso, toIso));
  return (await readAll(token, `${items(SMOKING_LISTS.log)}?$filter=${filter}&$top=2000`)).map(rowToBreak);
}

/** `before`/`after` field → SharePoint column, written only when it actually changed. */
const BREAK_FIELD_MAP: Array<[keyof SmokingBreak, string]> = [
  ["fullName", "FullName"],
  ["department", "Department"],
  ["position", "Position"],
  ["company", "Company"],
  ["areaInName", "AreaInName"],
  ["areaInCode", "AreaInCode"],
  ["areaOutName", "AreaOutName"],
  ["areaOutCode", "AreaOutCode"],
  ["timeIn", "TimeIn"],
  ["timeOut", "TimeOut"],
];

/**
 * A pure diff of two break snapshots into the SharePoint columns that actually
 * changed. An admin edit must not blindly rewrite the whole row: another scan
 * (or another admin) may have closed this break after the page loaded, and a
 * blind PATCH of the in-memory row would silently reopen it. Status,
 * DurationMinutes and FlagReason are derived from the times, so they're only
 * recomputed (and written) when TimeIn or TimeOut actually changed.
 */
export function changedBreakFields(before: SmokingBreak, after: SmokingBreak): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [key, column] of BREAK_FIELD_MAP) {
    if (before[key] !== after[key]) changes[column] = after[key];
  }
  if (before.timeIn !== after.timeIn || before.timeOut !== after.timeOut) {
    changes.Status = after.timeOut ? "closed" : "open";
    changes.DurationMinutes = after.durationMinutes;
    changes.FlagReason = after.flagReason;
  }
  return changes;
}

/** Writes only what `changedBreakFields` finds different — see its doc comment. */
export async function saveBreakChanges(token: string, before: SmokingBreak, after: SmokingBreak): Promise<void> {
  const changes = changedBreakFields(before, after);
  if (Object.keys(changes).length === 0) return;
  await spPatch(token, `${items(SMOKING_LISTS.log)}(${after.id})`, changes);
}

export async function resolveFlag(token: string, id: string, note: string, by: string, at: Date): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.log)}(${id})`, {
    ResolutionNote: note.trim(),
    ResolvedBy: by,
    ResolvedAt: at.toISOString(),
  });
}

export async function deleteBreak(token: string, id: string): Promise<void> {
  await spDelete(token, `${items(SMOKING_LISTS.log)}(${id})`);
}

export async function loadAreas(token: string): Promise<SmokingArea[]> {
  return (await readAll(token, `${items(SMOKING_LISTS.areas)}?$top=500`)).map(rowToArea)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function createArea(token: string, name: string, code: string): Promise<void> {
  await spPost(token, items(SMOKING_LISTS.areas), { Title: name.trim(), Code: code, Active: "yes" });
}

export async function updateArea(token: string, area: SmokingArea): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.areas)}(${area.id})`, { Title: area.name.trim(), Active: area.active ? "yes" : "no" });
}

export async function loadProfiles(token: string) {
  return (await readAll(token, `${items(SMOKING_LISTS.profiles)}?$top=2000`)).map(rowToProfile)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Blocking is enforced by the server; unblocking clears who/when it happened. */
export async function setProfileBlocked(token: string, id: string, blocked: boolean, by: string, at: Date): Promise<void> {
  await spPatch(token, `${items(SMOKING_LISTS.profiles)}(${id})`, {
    Blocked: blocked ? "yes" : "no",
    BlockedBy: blocked ? by : "",
    BlockedAt: blocked ? at.toISOString() : null,
  });
}

/** Removes the profile only — break records in Smoking Log are untouched. */
export async function deleteProfile(token: string, id: string): Promise<void> {
  await spDelete(token, `${items(SMOKING_LISTS.profiles)}(${id})`);
}
