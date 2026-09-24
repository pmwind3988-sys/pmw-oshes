import { describe, expect, it } from "vitest";
import * as server from "../../../api/_utils/smoking/schema.js";
import * as serverRules from "../../../api/_utils/smoking/scanRules.js";
import { flagReasonFor as serverFlag } from "../../../api/_utils/smoking/scanRules.js";
import * as browser from "./schema";

const columnsOf = (title: string) =>
  browser.SMOKING_LIST_SCHEMAS.find((schema) => schema.title === title)!.columns!.map((column) => column.n);

describe("smoking schema parity", () => {
  it("names the same lists", () => {
    expect(browser.SMOKING_LISTS).toEqual(server.SMOKING_LISTS);
  });

  it("provisions every column the server writes", () => {
    expect(columnsOf(server.SMOKING_LISTS.profiles)).toEqual([...server.PROFILE_COLUMNS]);
    expect(columnsOf(server.SMOKING_LISTS.log)).toEqual([...server.LOG_COLUMNS]);
    expect(columnsOf(server.SMOKING_LISTS.areas)).toEqual([...server.AREA_COLUMNS]);
    expect(columnsOf(server.SMOKING_LISTS.settings)).toEqual([...server.SETTINGS_COLUMNS]);
  });

  it("reads and words OSHES's scan limits the same way on both sides", () => {
    expect(browser.DEFAULT_SCAN_LIMITS).toEqual(serverRules.DEFAULT_SCAN_LIMITS);
    expect(browser.SCAN_LIMIT_MAX).toEqual(serverRules.SCAN_LIMIT_MAX);
    expect(browser.FLAG_SEPARATOR).toBe(serverRules.FLAG_SEPARATOR);
    for (const raw of [
      { ignoreRepeatSeconds: "30", minBreakSeconds: 300.7, restSeconds: 1800 },
      { ignoreRepeatSeconds: "x", minBreakSeconds: -1, restSeconds: null },
      { ignoreRepeatSeconds: 1e9, minBreakSeconds: 1e9, restSeconds: 1e9 },
    ]) {
      expect(browser.normalizeScanLimits(raw)).toEqual(serverRules.normalizeScanLimits(raw));
    }
    for (const s of [0, 1, 45, 60, 90, 599, 3600, 4500, 86_400]) {
      expect(browser.formatSpan(s)).toBe(serverRules.formatSpan(s));
    }
    expect(browser.joinFlags("A", "A; B", "")).toBe(serverRules.joinFlags("A", "A; B", ""));
  });

  it("flags the same way on both sides", () => {
    expect(browser.FLAG_OPEN_LONG).toBe(server.FLAG_OPEN_LONG);
    expect(browser.FLAG_LASTED_LONG).toBe(server.FLAG_LASTED_LONG);
    const timeIn = new Date("2026-09-24T00:00:00Z");
    for (const [timeOut, now] of [
      [null, "2026-09-24T11:59:59Z"], [null, "2026-09-24T12:00:01Z"],
      ["2026-09-24T12:00:00Z", "2026-09-25T00:00:00Z"], ["2026-09-24T12:00:01Z", "2026-09-25T00:00:00Z"],
    ] as const) {
      const out = timeOut ? new Date(timeOut) : null;
      expect(browser.flagReasonFor(timeIn, out, new Date(now))).toBe(serverFlag(timeIn, out, new Date(now)));
    }
  });
});
