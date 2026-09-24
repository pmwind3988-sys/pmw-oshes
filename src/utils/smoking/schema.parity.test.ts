import { describe, expect, it } from "vitest";
import * as server from "../../../api/_utils/smoking/schema.js";
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
