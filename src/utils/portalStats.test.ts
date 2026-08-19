import { describe, expect, it } from "vitest";
import { portalStats } from "./portalStats";
import type { PortalRecord } from "../types";

/**
 * The intake chart buckets by calendar day, read in the viewer's own zone —
 * the rule every on-screen timestamp in the app follows. These tests pin the
 * day boundary, because the arithmetic that measures "how long ago" and the
 * arithmetic that answers "which day" are one midnight apart, and the chart
 * needs the second one.
 */

const EMAIL = "nurul@pmw.gov.my";

/** Local wall-clock moment, so the assertions mean the same in any test-runner zone. */
function localMoment(year: number, month: number, day: number, hour = 9, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function record(filedAt: Date | null): PortalRecord {
  return { filedAt, submitterEmail: EMAIL, chain: [] } as unknown as PortalRecord;
}

function stats(records: PortalRecord[], now: Date) {
  return portalStats({ records, userEmail: EMAIL, now });
}

const NOW = localMoment(2026, 8, 19, 14, 30);

function bar(records: PortalRecord[], key: string) {
  const point = stats(records, NOW).daily.find((day) => day.key === key);
  if (!point) throw new Error(`no bar for ${key}`);
  return point;
}

describe("dailyIntake", () => {
  it("keeps yesterday's filings on yesterday's bar", () => {
    const yesterday = [
      record(localMoment(2026, 8, 18, 0, 1)),
      record(localMoment(2026, 8, 18, 9, 0)),
      record(localMoment(2026, 8, 18, 23, 59)),
    ];

    expect(bar(yesterday, "2026-08-18").count).toBe(3);
    expect(bar(yesterday, "2026-08-19").count).toBe(0);
  });

  it("counts today's filings on today's bar, whatever time of day they arrived", () => {
    const today = [
      record(localMoment(2026, 8, 19, 0, 0)),
      record(localMoment(2026, 8, 19, 8, 15)),
      record(localMoment(2026, 8, 19, 14, 29)),
    ];

    const point = bar(today, "2026-08-19");
    expect(point.count).toBe(3);
    expect(point.isToday).toBe(true);
  });

  it("agrees with the filed-today tile", () => {
    const mixed = [
      record(localMoment(2026, 8, 19, 8, 15)),
      record(localMoment(2026, 8, 19, 13, 0)),
      record(localMoment(2026, 8, 18, 22, 0)),
      record(localMoment(2026, 8, 17, 10, 0)),
    ];

    const result = stats(mixed, NOW);
    const today = result.daily[result.daily.length - 1];
    expect(today.isToday).toBe(true);
    expect(today.count).toBe(result.filedToday);
    expect(result.filedToday).toBe(2);
  });

  it("keys and labels each bar by its own local day", () => {
    const result = stats([], NOW);
    expect(result.daily).toHaveLength(14);
    expect(result.daily[13].key).toBe("2026-08-19");
    expect(result.daily[13].label).toBe("19 Aug");
    expect(result.daily[0].key).toBe("2026-08-06");
    expect(result.daily[0].label).toBe("6 Aug");
  });

  it("holds the oldest day in the fortnight and drops the day before it", () => {
    const oldest = record(localMoment(2026, 8, 6, 23, 30));
    const tooOld = record(localMoment(2026, 8, 5, 23, 30));

    expect(bar([oldest], "2026-08-06").count).toBe(1);
    const dropped = stats([tooOld], NOW).daily.reduce((sum, day) => sum + day.count, 0);
    expect(dropped).toBe(0);
  });

  it("scales the bars against the busiest day, not the total", () => {
    const records = [
      record(localMoment(2026, 8, 19, 9, 0)),
      record(localMoment(2026, 8, 18, 9, 0)),
      record(localMoment(2026, 8, 18, 11, 0)),
      record(localMoment(2026, 8, 18, 15, 0)),
      record(localMoment(2026, 8, 18, 17, 0)),
    ];

    expect(bar(records, "2026-08-18").percent).toBe(100);
    expect(bar(records, "2026-08-19").percent).toBe(25);
  });

  it("ignores a record with no filing date rather than counting it today", () => {
    const result = stats([record(null)], NOW);
    expect(result.daily.reduce((sum, day) => sum + day.count, 0)).toBe(0);
    expect(result.filedToday).toBe(0);
  });
});

describe("intake windows", () => {
  it("counts the last 7 calendar days, today included", () => {
    // Day 0 through day 6 are in; day 7 is out. All at 23:30, the time a rolling
    // 168-hour window would have cut in half.
    const records = [0, 1, 2, 3, 4, 5, 6, 7].map((back) =>
      record(localMoment(2026, 8, 19 - back, 23, 30)),
    );

    expect(stats(records, NOW).last7).toBe(7);
  });

  it("counts the last 30 calendar days, today included", () => {
    const inside = [0, 1, 15, 29].map((back) => record(localMoment(2026, 8, 19 - back, 23, 30)));
    const outside = [record(localMoment(2026, 8, 19 - 30, 23, 30))];

    expect(stats([...inside, ...outside], NOW).last30).toBe(4);
  });

  it("keeps last7 equal to the tail of the chart, so the two can be read together", () => {
    const records = [0, 0, 1, 3, 6, 7, 9, 13].map((back) =>
      record(localMoment(2026, 8, 19 - back, 16, 45)),
    );

    const result = stats(records, NOW);
    const tail = result.daily.slice(-7).reduce((sum, day) => sum + day.count, 0);
    expect(result.last7).toBe(tail);
    expect(result.last7).toBe(5);
  });

  it("puts a whole day in one window, whatever hour it was filed at", () => {
    const yesterday = [
      record(localMoment(2026, 8, 18, 0, 1)),
      record(localMoment(2026, 8, 18, 12, 0)),
      record(localMoment(2026, 8, 18, 23, 59)),
    ];

    const result = stats(yesterday, NOW);
    expect(result.last7).toBe(3);
    expect(result.last30).toBe(3);
    expect(result.filedToday).toBe(0);
  });

  it("leaves a future filing date out of every window", () => {
    const result = stats([record(localMoment(2026, 8, 20, 9, 0))], NOW);
    expect(result.filedToday).toBe(0);
    expect(result.last7).toBe(0);
    expect(result.last30).toBe(0);
  });
});
