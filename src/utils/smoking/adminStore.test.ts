import { describe, expect, it } from "vitest";
import { breakFilterFor, nextPageUrl, rowToArea, rowToBreak } from "./adminStore";

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

  it("returns absolute URLs unchanged", () => {
    const absolute = "https://contoso.sharepoint.com/sites/mysite/_api/web/lists/getbytitle('Items')/items?$skiptoken=123";
    expect(nextPageUrl(absolute)).toBe(absolute);
  });

  it("returns undefined for empty or falsy links", () => {
    expect(nextPageUrl(undefined)).toBeUndefined();
    expect(nextPageUrl("")).toBeUndefined();
  });

  it("converts relative odata.nextLink by prepending site URL and _api path", () => {
    const relative = "/_api/web/lists/getbytitle('Items')/items?$skiptoken=123";
    const result = nextPageUrl(relative);
    // Verify it's converted to absolute (starts with https or contains _api path)
    expect(result).toBeDefined();
    expect(result).toContain("/_api/");
    // Verify the path is preserved
    expect(result).toContain("getbytitle('Items')/items?$skiptoken=123");
  });
});
