import { describe, expect, it } from "vitest";
import { breakFilterFor, changedBreakFields, nextPageUrl, rowToArea, rowToBreak, rowToProfile } from "./adminStore";
import type { SmokingBreak } from "./schema";

function brk(o: Partial<SmokingBreak> = {}): SmokingBreak {
  return {
    id: "1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    areaInCode: "AAA111", areaInName: "Block A", areaOutCode: "AAA111", areaOutName: "Block A",
    timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 7, flagReason: "", ...o,
  };
}

describe("admin store mapping", () => {
  it("reads a SharePoint REST row into a break", () => {
    expect(rowToBreak({
      Id: 12, Email: "ali@gmail.com", FullName: "Ali", TimeIn: "2026-09-24T02:42:00Z", TimeOut: null,
      DurationMinutes: null, FlagReason: null, ResolvedAt: null,
    })).toMatchObject({ id: "12", email: "ali@gmail.com", timeOut: null, durationMinutes: null, flagReason: "", resolvedAt: "" });
  });

  it("reads an area", () => {
    expect(rowToArea({ Id: 3, Title: "Block A", Code: "AAA111", Active: "no" }))
      .toEqual({ id: "3", name: "Block A", code: "AAA111", active: false });
  });

  it("asks for the date range plus anything still open", () => {
    expect(breakFilterFor("2026-09-21T00:00:00.000Z", "2026-09-28T00:00:00.000Z")).toBe(
      "(TimeIn ge datetime'2026-09-21T00:00:00.000Z' and TimeIn lt datetime'2026-09-28T00:00:00.000Z') or Status eq 'open'",
    );
  });

  it("converts realistic relative SharePoint odata.nextLink to absolute", () => {
    // SharePoint relative links are relative to /_api/, not including it
    const relative = "Web/Lists(guid'00000000-0000-0000-0000-000000000000')/Items?%24skiptoken=Paged%3dTRUE%26p_ID%3d2000";
    const siteUrl = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");
    const expected = `${siteUrl}/_api/${relative}`;
    expect(nextPageUrl(relative)).toBe(expected);
  });

  it("returns absolute https URLs unchanged", () => {
    const absolute = "https://contoso.sharepoint.com/sites/mysite/_api/web/lists/getbytitle('Items')/items?$skiptoken=123";
    expect(nextPageUrl(absolute)).toBe(absolute);
  });

  it("returns undefined for falsy links", () => {
    expect(nextPageUrl(undefined)).toBeUndefined();
    expect(nextPageUrl("")).toBeUndefined();
  });

  it("reads a blocked profile", () => {
    expect(rowToProfile({ Id: 9, Email: "a@b.com", Blocked: "yes", BlockedBy: "oshes@pmw-group.com", BlockedAt: "2026-09-24T02:42:00Z" }))
      .toMatchObject({ blocked: true, blockedBy: "oshes@pmw-group.com", blockedAt: "2026-09-24T02:42:00Z" });
  });

  it("treats a profile as not blocked unless marked yes", () => {
    expect(rowToProfile({ Id: 9, Email: "a@b.com" })).toMatchObject({ blocked: false, blockedBy: "", blockedAt: "" });
  });
});

describe("changedBreakFields", () => {
  it("writes nothing for an unchanged row", () => {
    const b = brk();
    expect(changedBreakFields(b, b)).toEqual({});
  });

  it("writes only the field that changed on a department-only edit — no TimeOut/Status touched", () => {
    const before = brk();
    const after = brk({ department: "OSHES" });
    expect(changedBreakFields(before, after)).toEqual({ Department: "OSHES" });
  });

  it("writes area codes too, not just names", () => {
    const before = brk();
    const after = brk({ areaInCode: "BBB222", areaInName: "Block B" });
    expect(changedBreakFields(before, after)).toEqual({ AreaInCode: "BBB222", AreaInName: "Block B" });
  });

  it("reopens the break when the time out is cleared, recomputing status/duration/flag/area-out", () => {
    const before = brk({
      timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z", durationMinutes: 1440,
      flagReason: "Lasted over 12 hours", areaOutCode: "AAA111", areaOutName: "Block A",
    });
    const after = brk({
      timeIn: "2026-09-23T02:00:00Z", timeOut: null, durationMinutes: null,
      flagReason: "", areaOutCode: "", areaOutName: "",
    });
    expect(changedBreakFields(before, after)).toEqual({
      TimeOut: null,
      Status: "open",
      DurationMinutes: null,
      FlagReason: "",
      AreaOutName: "",
      AreaOutCode: "",
    });
  });

  it("recomputes status/duration/flag when time in changes, even if time out did not", () => {
    const before = brk({ timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 7, flagReason: "" });
    const after = brk({ timeIn: "2026-09-24T02:40:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 9, flagReason: "" });
    expect(changedBreakFields(before, after)).toEqual({
      TimeIn: "2026-09-24T02:40:00Z",
      Status: "closed",
      DurationMinutes: 9,
      FlagReason: "",
    });
  });
});
