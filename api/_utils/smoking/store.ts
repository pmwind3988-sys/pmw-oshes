import {
  createListItem,
  deleteListItem,
  getGraphToken,
  graphFieldEquals,
  queryListItems,
  updateListItemFields,
  type GraphListItem,
} from "../graphClient.js";
import { LONG_BREAK_MS, normalizeScanLimits, type ScanLimits } from "./scanRules.js";
import { SMOKING_LISTS, type SmokingArea, type SmokingBreak, type SmokingProfile, type StoredProfile } from "./schema.js";

export type NewBreak = Pick<
  SmokingBreak,
  "email" | "fullName" | "department" | "position" | "company" | "areaInCode" | "areaInName" | "timeIn"
> & { flagReason?: string };

/** Settings change rarely; a minute's delay reaching every scan is fine, a SharePoint read per scan is not. */
const LIMITS_CACHE_MS = 60_000;
let limitsCache: { at: number; limits: ScanLimits } | null = null;

/** Tests only: forget the cached settings. */
export function clearLimitsCache(): void {
  limitsCache = null;
}

export interface BreakClose {
  timeOut: string;
  areaOutCode: string;
  areaOutName: string;
  durationMinutes: number;
  flagReason: string;
}

export interface SmokingStore {
  findProfile(email: string): Promise<StoredProfile | null>;
  saveProfile(profile: SmokingProfile, now: Date): Promise<void>;
  touchProfile(id: string, now: Date): Promise<void>;
  findArea(code: string): Promise<SmokingArea | null>;
  openBreaksFor(email: string): Promise<SmokingBreak[]>;
  /** The break this person most recently scanned out of, if that was at or after `since`. */
  lastClosedBreakFor(email: string, since: Date): Promise<SmokingBreak | null>;
  /** OSHES's limits from the Settings tab. Throws when SharePoint cannot be read. */
  readLimits(): Promise<ScanLimits>;
  createBreak(input: NewBreak): Promise<string>;
  closeBreak(id: string, close: BreakClose): Promise<void>;
  deleteBreak(id: string): Promise<void>;
}

const str = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));

export function toBreak(item: GraphListItem): SmokingBreak {
  const f = item.fields;
  const duration = f.DurationMinutes;
  return {
    id: item.id,
    email: str(f.Email),
    fullName: str(f.FullName),
    department: str(f.Department),
    position: str(f.Position),
    company: str(f.Company),
    areaInCode: str(f.AreaInCode),
    areaInName: str(f.AreaInName),
    areaOutCode: str(f.AreaOutCode),
    areaOutName: str(f.AreaOutName),
    timeIn: str(f.TimeIn),
    timeOut: str(f.TimeOut) || null,
    durationMinutes: typeof duration === "number" ? duration : duration ? Number(duration) : null,
    flagReason: str(f.FlagReason),
  };
}

export function toProfile(item: GraphListItem): StoredProfile {
  const f = item.fields;
  return {
    id: item.id,
    email: str(f.Email),
    fullName: str(f.FullName),
    department: str(f.Department),
    departmentFromList: str(f.DepartmentFromList) !== "no",
    position: str(f.Position),
    staffId: str(f.StaffId),
    company: str(f.Company),
    signInMethod: str(f.SignInMethod) === "microsoft" ? "microsoft" : "google",
    blocked: str(f.Blocked) === "yes",
  };
}

export function toArea(item: GraphListItem): SmokingArea {
  const f = item.fields;
  return { id: item.id, code: str(f.Code), name: str(f.Title), active: str(f.Active) !== "no" };
}

/**
 * Graph-backed store on the OSHES site. Lists are provisioned by the admin
 * page (`src/utils/smoking/adminStore.ts`); a missing list surfaces as a 500
 * the handler turns into "not set up yet".
 */
export function createGraphSmokingStore(getToken: () => Promise<string> = getGraphToken): SmokingStore {
  const query = async (list: string, filter: string, top = 50) =>
    queryListItems(await getToken(), list, { filter, top, preferNonIndexed: true });

  return {
    async findProfile(email) {
      const [item] = await query(SMOKING_LISTS.profiles, graphFieldEquals("Email", email), 1);
      return item ? toProfile(item) : null;
    },
    async saveProfile(profile, now) {
      const token = await getToken();
      const fields = {
        Title: profile.email,
        Email: profile.email,
        FullName: profile.fullName,
        Department: profile.department,
        DepartmentFromList: profile.departmentFromList ? "yes" : "no",
        Position: profile.position,
        StaffId: profile.staffId,
        Company: profile.company,
        SignInMethod: profile.signInMethod,
        LastSeen: now.toISOString(),
      };
      const existing = await this.findProfile(profile.email);
      if (existing) await updateListItemFields(token, SMOKING_LISTS.profiles, existing.id, fields);
      else await createListItem(token, SMOKING_LISTS.profiles, { ...fields, FirstSeen: now.toISOString() });
    },
    async touchProfile(id, now) {
      await updateListItemFields(await getToken(), SMOKING_LISTS.profiles, id, { LastSeen: now.toISOString() });
    },
    async findArea(code) {
      const [item] = await query(SMOKING_LISTS.areas, graphFieldEquals("Code", code), 1);
      return item ? toArea(item) : null;
    },
    async openBreaksFor(email) {
      const items = await query(
        SMOKING_LISTS.log,
        `${graphFieldEquals("Email", email)} and ${graphFieldEquals("Status", "open")}`,
      );
      return items.map(toBreak).sort((a, b) => a.timeIn.localeCompare(b.timeIn) || Number(a.id) - Number(b.id));
    },
    /**
     * Most recently closed break, for the repeat-scan and rest-time checks.
     * SharePoint hands rows back oldest first, so an unbounded query stops
     * seeing a regular smoker's latest break once they pass 50. Bounding on
     * TimeIn (indexed) keeps it to recent rows: a break that ended at or after
     * `since` started no more than 12 hours before it, or it was closed stale.
     */
    async lastClosedBreakFor(email, since) {
      const earliestStart = new Date(since.getTime() - LONG_BREAK_MS).toISOString();
      const items = await query(
        SMOKING_LISTS.log,
        `${graphFieldEquals("Email", email)} and ${graphFieldEquals("Status", "closed")} and fields/TimeIn ge '${earliestStart}'`,
      );
      const sinceIso = since.toISOString();
      const closed = items.map(toBreak).filter((b) => b.timeOut && new Date(b.timeOut).toISOString() >= sinceIso);
      closed.sort((a, b) => (b.timeOut as string).localeCompare(a.timeOut as string));
      return closed[0] ?? null;
    },
    async createBreak(input) {
      const { id } = await createListItem(await getToken(), SMOKING_LISTS.log, {
        Title: `${input.email} ${input.timeIn}`,
        Email: input.email,
        FullName: input.fullName,
        Department: input.department,
        Position: input.position,
        Company: input.company,
        Status: "open",
        AreaInCode: input.areaInCode,
        AreaInName: input.areaInName,
        TimeIn: input.timeIn,
        ...(input.flagReason ? { FlagReason: input.flagReason } : {}),
      });
      return id;
    },
    /**
     * The first row of Smoking Settings; defaults when OSHES has not saved any
     * yet. A failed read is not cached, so the next scan tries again.
     */
    async readLimits() {
      if (limitsCache && Date.now() - limitsCache.at < LIMITS_CACHE_MS) return limitsCache.limits;
      const [item] = await queryListItems(await getToken(), SMOKING_LISTS.settings, { top: 1 });
      const f = item?.fields ?? {};
      const limits = normalizeScanLimits({
        ignoreRepeatSeconds: f.IgnoreRepeatSeconds,
        minBreakSeconds: f.MinBreakSeconds,
        restSeconds: f.RestSeconds,
      });
      limitsCache = { at: Date.now(), limits };
      return limits;
    },
    async closeBreak(id, close) {
      await updateListItemFields(await getToken(), SMOKING_LISTS.log, id, {
        Status: "closed",
        TimeOut: close.timeOut,
        AreaOutCode: close.areaOutCode,
        AreaOutName: close.areaOutName,
        DurationMinutes: close.durationMinutes,
        FlagReason: close.flagReason,
      });
    },
    async deleteBreak(id) {
      await deleteListItem(await getToken(), SMOKING_LISTS.log, id);
    },
  };
}
