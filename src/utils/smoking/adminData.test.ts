import { describe, expect, it } from "vitest";
import {
  applyEdit, breakReference, breaksCsv, computeTotals, currentlyOut, describeChange,
  effectiveFlag, filterBreaks, newAreaCode, validateEdit, type BreakFilters,
} from "./adminData";
import type { SmokingBreak } from "./schema";

const now = new Date("2026-09-24T12:00:00Z");

function brk(o: Partial<SmokingBreak>): SmokingBreak {
  return {
    id: "1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    areaInCode: "AAA111", areaInName: "Block A", areaOutCode: "AAA111", areaOutName: "Block A",
    timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 7, flagReason: "", ...o,
  };
}

const ALL: BreakFilters = { from: "2026-09-21T00:00:00Z", to: "2026-09-28T00:00:00Z", department: "", area: "", search: "", flaggedOnly: false };

describe("effectiveFlag", () => {
  it("computes open-over-12h at read time", () => {
    expect(effectiveFlag(brk({ timeIn: "2026-09-23T23:00:00Z", timeOut: null, durationMinutes: null }), now)).toBe("Open over 12 hours");
  });
  it("clears once resolved", () => {
    expect(effectiveFlag(brk({ flagReason: "Lasted over 12 hours", resolvedAt: "2026-09-24T05:00:00Z" }), now)).toBe("");
  });
});

describe("filterBreaks", () => {
  const rows = [
    brk({ id: "1" }),
    brk({ id: "2", department: "OSHES", fullName: "Siti", email: "siti@pmw-group.com", timeIn: "2026-09-24T05:00:00Z" }),
    brk({ id: "3", timeIn: "2026-09-10T02:00:00Z" }),
    brk({ id: "4", flagReason: "Lasted over 12 hours", timeIn: "2026-09-22T02:00:00Z" }),
  ];
  it("keeps the date range, newest first", () => {
    expect(filterBreaks(rows, ALL, now).map((r) => r.id)).toEqual(["2", "1", "4"]);
  });
  it("filters by department, person and flag", () => {
    expect(filterBreaks(rows, { ...ALL, department: "OSHES" }, now).map((r) => r.id)).toEqual(["2"]);
    expect(filterBreaks(rows, { ...ALL, search: "SITI" }, now).map((r) => r.id)).toEqual(["2"]);
    expect(filterBreaks(rows, { ...ALL, flaggedOnly: true }, now).map((r) => r.id)).toEqual(["4"]);
  });
  it("matches an area on the way in or out", () => {
    const moved = brk({ id: "5", areaInName: "Block A", areaOutName: "Block B" });
    expect(filterBreaks([moved], { ...ALL, area: "Block B" }, now)).toHaveLength(1);
  });
});

describe("currentlyOut", () => {
  it("lists open breaks that are not stale", () => {
    const open = brk({ id: "6", timeIn: "2026-09-24T11:50:00Z", timeOut: null, durationMinutes: null });
    const stale = brk({ id: "7", timeIn: "2026-09-23T11:50:00Z", timeOut: null, durationMinutes: null });
    expect(currentlyOut([open, stale, brk({})], now).map((r) => r.id)).toEqual(["6"]);
  });
});

describe("computeTotals", () => {
  it("totals per person and leaves flagged breaks out", () => {
    const totals = computeTotals([
      brk({ id: "1", durationMinutes: 7 }), brk({ id: "2", durationMinutes: 13 }),
      brk({ id: "3", durationMinutes: 900, flagReason: "Lasted over 12 hours" }),
    ], now);
    expect(totals).toEqual([{
      email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", breaks: 2, totalMinutes: 20, averageMinutes: 10, flagged: 1,
    }]);
  });
});

describe("applyEdit", () => {
  it("recomputes duration and clears the flag when times are fixed", () => {
    const before = brk({ timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z", durationMinutes: 1440, flagReason: "Lasted over 12 hours" });
    const after = applyEdit(before, {
      timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-23T02:10:00Z", areaInName: "Block A", areaOutName: "Block A",
      fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    }, now);
    expect(after).toMatchObject({ durationMinutes: 10, flagReason: "" });
    expect(describeChange(before, after)).toBe(
      "Time out: 24/09/2026 10:00 AM → 23/09/2026 10:10 AM; Duration: 1440 min → 10 min; Flag: Lasted over 12 hours → —",
    );
  });
});

describe("validateEdit", () => {
  const base = { timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", areaInName: "A", areaOutName: "A", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW" };
  it("refuses a time out before the time in", () => {
    expect(validateEdit({ ...base, timeOut: "2026-09-24T02:00:00Z" })).toBe("Time out must be after time in.");
  });
  it("accepts a valid edit", () => {
    expect(validateEdit(base)).toBe("");
  });
});

describe("export and references", () => {
  it("names the break for the audit trail", () => {
    expect(breakReference(brk({ id: "42" }))).toBe("SMK-42");
  });
  it("exports one header and one row per break", () => {
    const csv = breaksCsv([brk({})], now).split("\r\n");
    expect(csv).toHaveLength(2);
    expect(csv[0]).toContain("Time in (MYT)");
    expect(csv[1]).toContain("ali@gmail.com");
  });
  it("makes unambiguous area codes", () => {
    expect(newAreaCode(() => 0)).toBe("AAAAAA");
    expect(newAreaCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
