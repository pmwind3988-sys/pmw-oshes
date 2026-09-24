/**
 * Department names come from HR's own list, so the smoking log and HR never
 * disagree on what a department is called. HR's site is a different site on
 * the same SharePoint host; the app-only identity needs read on it (SETUP.md).
 */
export interface DepartmentSource {
  hostname: string;
  sitePath: string;
  listName: string;
  column: string;
}

export interface DepartmentList {
  departments: string[];
  /** False only when HR's list has never been reachable from this instance. */
  fromList: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function departmentSourceFromEnv(env: Record<string, string | undefined> = process.env): DepartmentSource {
  const siteUrl = env.VITE_SP_SITE_URL || env.SP_SITE_URL || "";
  return {
    hostname: siteUrl ? new URL(siteUrl).hostname : "",
    sitePath: env.HR_DEPARTMENTS_SITE_PATH || "/sites/PMWHRDocs",
    listName: env.HR_DEPARTMENTS_LIST || "Departments",
    column: env.HR_DEPARTMENTS_COLUMN || "Title",
  };
}

export function departmentsPath(source: DepartmentSource): string {
  return `/sites/${source.hostname}:${source.sitePath}:/lists/${encodeURIComponent(source.listName)}`
    + `/items?$expand=fields($select=${source.column})&$top=999`;
}

export function parseDepartments(data: unknown, column: string): string[] {
  const rows = (data as { value?: Array<{ fields?: Record<string, unknown> }> })?.value ?? [];
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const raw = row.fields?.[column];
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function createDepartmentCache(load: () => Promise<string[]>, ttlMs = DAY_MS) {
  let lastGood: string[] | null = null;
  let loadedAt = 0;
  return {
    async get(now: Date = new Date()): Promise<DepartmentList> {
      if (lastGood && now.getTime() - loadedAt < ttlMs) return { departments: lastGood, fromList: true };
      try {
        lastGood = await load();
        loadedAt = now.getTime();
      } catch {
        // Keep serving yesterday's list rather than breaking the profile form.
      }
      return lastGood ? { departments: lastGood, fromList: true } : { departments: [], fromList: false };
    },
  };
}
