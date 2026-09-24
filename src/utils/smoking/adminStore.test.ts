import { describe, expect, it } from "vitest";
import { breakFilterFor, rowToArea, rowToBreak } from "./adminStore";

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
});
