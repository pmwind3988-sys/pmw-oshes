import { describe, expect, it } from "vitest";
import { breakHeatmap, breakSummary, breakdownRows, breaksPerDay } from "./analytics";
import type { SmokingBreak } from "./schema";

// Thu 24 Sep 2026, 20:00 MYT.
const now = new Date("2026-09-24T12:00:00Z");

function brk(o: Partial<SmokingBreak>): SmokingBreak {
  return {
    id: "1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech", company: "PMW",
    areaInCode: "AAA111", areaInName: "Block A", areaOutCode: "AAA111", areaOutName: "Block A",
    timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z", durationMinutes: 7, flagReason: "", ...o,
  };
}

const flagged = { flagReason: "Lasted over 12 hours", timeIn: "2026-09-21T00:00:00Z", timeOut: "2026-09-21T13:00:00Z", durationMinutes: 780 };

describe("breakSummary", () => {
  it("counts people across every break but leaves flagged and open breaks out of the minutes", () => {
    const s = breakSummary(
      [
        brk({ id: "1", durationMinutes: 7 }),
        brk({ id: "2", durationMinutes: 5, email: "siti@gmail.com" }),
        brk({ id: "3", ...flagged, email: "raj@gmail.com" }),
        brk({ id: "4", timeIn: "2026-09-24T11:55:00Z", timeOut: null, durationMinutes: null, email: "tan@gmail.com" }),
      ],
      now,
    );
    expect(s).toEqual({ breaks: 2, people: 4, totalMinutes: 12, averageMinutes: 6, flagged: 1, open: 1 });
  });

  it("is all zeros for no breaks", () => {
    expect(breakSummary([], now)).toEqual({ breaks: 0, people: 0, totalMinutes: 0, averageMinutes: 0, flagged: 0, open: 0 });
  });
});

describe("breakHeatmap", () => {
  it("buckets by Malaysian weekday and hour, Monday first", () => {
    // 02:42Z Thu = 10:42 MYT Thu; 17:30Z Sun = 01:30 MYT Mon.
    const h = breakHeatmap([brk({ id: "1" }), brk({ id: "2", timeIn: "2026-09-20T17:30:00Z", timeOut: "2026-09-20T17:40:00Z", durationMinutes: 10 })], now);
    expect(h.cells[3][10]).toEqual({ day: 3, hour: 10, breaks: 1, minutes: 7 });
    expect(h.cells[0][1]).toEqual({ day: 0, hour: 1, breaks: 1, minutes: 10 });
  });

  it("counts a flagged break's start but not its minutes", () => {
    const h = breakHeatmap([brk(flagged)], now);
    // 00:00Z Mon = 08:00 MYT Mon.
    expect(h.cells[0][8]).toEqual({ day: 0, hour: 8, breaks: 1, minutes: 0 });
  });

  it("always shows 08:00–18:00 and widens to any break outside it", () => {
    expect(breakHeatmap([brk({})], now)).toMatchObject({ firstHour: 8, lastHour: 18 });
    const early = brk({ timeIn: "2026-09-20T17:30:00Z" }); // 01:30 MYT
    const late = brk({ timeIn: "2026-09-24T14:10:00Z" }); // 22:10 MYT
    expect(breakHeatmap([early, late], now)).toMatchObject({ firstHour: 1, lastHour: 22 });
  });

  it("names the busiest slot, earliest first on a tie", () => {
    const h = breakHeatmap(
      [
        brk({ id: "1", timeIn: "2026-09-24T02:05:00Z" }),
        brk({ id: "2", timeIn: "2026-09-24T02:50:00Z" }),
        brk({ id: "3", timeIn: "2026-09-22T06:00:00Z" }),
        brk({ id: "4", timeIn: "2026-09-22T06:30:00Z" }),
      ],
      now,
    );
    expect(h.peak).toMatchObject({ day: 1, hour: 14, breaks: 2 });
    expect(breakHeatmap([], now).peak).toBeNull();
  });
});

describe("breaksPerDay", () => {
  const weekFrom = "2026-09-20T16:00:00.000Z"; // Mon 21 Sep 00:00 MYT
  const weekTo = "2026-09-27T16:00:00.000Z";

  it("has one bar per Malaysian day, marking today", () => {
    const days = breaksPerDay([brk({ id: "1" }), brk({ id: "2" }), brk({ id: "3", timeIn: "2026-09-20T17:30:00Z" })], weekFrom, weekTo, now);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.count)).toEqual([1, 0, 0, 2, 0, 0, 0]);
    expect(days[0]).toMatchObject({ label: "21 Sep", short: "M" });
    expect(days[3]).toMatchObject({ label: "24 Sep", isToday: true, percent: 100 });
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("switches to weekly bars past two months", () => {
    const days = breaksPerDay([brk({})], "2026-06-28T16:00:00.000Z", weekTo, now);
    expect(days).toHaveLength(13);
    expect(days[0].label).toBe("w/c 29 Jun");
    expect(days[12]).toMatchObject({ label: "w/c 21 Sep", count: 1, isToday: true });
  });
});

describe("breakdownRows", () => {
  const rows = [
    brk({ id: "1", department: "QA/QC", company: "PMW", durationMinutes: 7 }),
    brk({ id: "2", department: "QA/QC", company: "Acme", durationMinutes: 5, email: "siti@gmail.com", fullName: "Siti" }),
    brk({ id: "3", department: "Civil", company: "Acme", durationMinutes: 20, email: "raj@gmail.com", fullName: "Raj", areaInName: "Gate 2" }),
    brk({ id: "4", department: "Civil", ...flagged }),
  ];

  it("ranks groups by counted minutes", () => {
    expect(breakdownRows(rows, "department", now)).toEqual([
      { id: "Civil", label: "Civil", minutes: 20, breaks: 1 },
      { id: "QA/QC", label: "QA/QC", minutes: 12, breaks: 2 },
    ]);
    expect(breakdownRows(rows, "company", now).map((r) => [r.label, r.minutes])).toEqual([["Acme", 25], ["PMW", 7]]);
    expect(breakdownRows(rows, "area", now).map((r) => r.label)).toEqual(["Gate 2", "Block A"]);
  });

  it("groups people by email and names them", () => {
    expect(breakdownRows(rows, "person", now)[0]).toEqual({ id: "raj@gmail.com", label: "Raj", minutes: 20, breaks: 1 });
  });

  it("stops at the limit", () => {
    expect(breakdownRows(rows, "person", now, 1)).toHaveLength(1);
  });
});
