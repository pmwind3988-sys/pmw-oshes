import { describe, expect, it, vi } from "vitest";
import { createDepartmentCache, departmentSourceFromEnv, departmentsPath, parseDepartments } from "./departments.js";

describe("department source", () => {
  it("defaults to HR's Departments list on the tenant's SharePoint host", () => {
    const source = departmentSourceFromEnv({ VITE_SP_SITE_URL: "https://pmwgroupcom.sharepoint.com/sites/OSHES" });
    expect(source).toEqual({
      hostname: "pmwgroupcom.sharepoint.com", sitePath: "/sites/PMWHRDocs", listName: "Departments", column: "Title",
    });
    expect(departmentsPath(source)).toBe(
      "/sites/pmwgroupcom.sharepoint.com:/sites/PMWHRDocs:/lists/Departments/items?$expand=fields($select=Title)&$top=999",
    );
  });
});

describe("parseDepartments", () => {
  it("trims, de-duplicates case-insensitively and sorts", () => {
    const data = { value: [
      { fields: { Title: " QA/QC " } }, { fields: { Title: "OSHES" } },
      { fields: { Title: "qa/qc" } }, { fields: { Title: "" } }, { fields: {} },
    ] };
    expect(parseDepartments(data, "Title")).toEqual(["OSHES", "QA/QC"]);
  });
});

describe("createDepartmentCache", () => {
  const t0 = new Date("2026-09-24T00:00:00Z");
  const later = (hours: number) => new Date(t0.getTime() + hours * 3600_000);

  it("loads once per day", async () => {
    const load = vi.fn().mockResolvedValue(["OSHES"]);
    const cache = createDepartmentCache(load);
    await cache.get(t0);
    await cache.get(later(23));
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get(later(25));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("serves the last good copy when HR is unreachable", async () => {
    const load = vi.fn().mockResolvedValueOnce(["OSHES"]).mockRejectedValue(new Error("403"));
    const cache = createDepartmentCache(load);
    await cache.get(t0);
    await expect(cache.get(later(25))).resolves.toEqual({ departments: ["OSHES"], fromList: true });
  });

  it("says the list is unavailable when it has never loaded", async () => {
    const cache = createDepartmentCache(vi.fn().mockRejectedValue(new Error("403")));
    await expect(cache.get(t0)).resolves.toEqual({ departments: [], fromList: false });
  });
});
