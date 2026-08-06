import { describe, expect, it } from "vitest";
import {
  formatDisplayDate,
  formatDisplayDateShort,
  formatDisplayDateTime,
  formatDisplayDateTimeLong,
  formatDisplayDayMonthTime,
  formatDisplayTime,
  isDisplayDateLike,
  parseDisplayMoment,
  uppercaseDayPeriod,
} from "./displayDateTime";

describe("parseDisplayMoment", () => {
  it("keeps a zoneless datetime on its own wall clock", () => {
    const moment = parseDisplayMoment("2026-08-12T23:31");
    expect(moment?.date.getHours()).toBe(23);
    expect(moment?.date.getMinutes()).toBe(31);
    expect(moment?.date.getDate()).toBe(12);
    expect(moment).toMatchObject({ hasDate: true, hasTime: true });
  });

  it("reads a date-only value as local midnight, not UTC midnight", () => {
    const moment = parseDisplayMoment("2026-08-12");
    expect(moment?.date.getDate()).toBe(12);
    expect(moment?.date.getMonth()).toBe(7);
    expect(moment).toMatchObject({ hasDate: true, hasTime: false });
  });

  it("reports a time-only value as having no date", () => {
    expect(parseDisplayMoment("07:05")).toMatchObject({ hasDate: false, hasTime: true });
  });

  it("rejects text that is not a moment", () => {
    expect(parseDisplayMoment("Confirmed")).toBeNull();
    expect(parseDisplayMoment("")).toBeNull();
    expect(parseDisplayMoment(null)).toBeNull();
    expect(parseDisplayMoment("29:00")).toBeNull();
  });
});

describe("formatDisplayDateTime", () => {
  it("renders a zoneless datetime with an uppercase day period", () => {
    expect(formatDisplayDateTime("2026-08-12T23:31")).toBe("12/08/2026 11:31 PM");
  });

  it("renders morning times as AM", () => {
    expect(formatDisplayDateTime("2026-08-12T00:05")).toBe("12/08/2026 12:05 AM");
    expect(formatDisplayDateTime("2026-08-12T09:07")).toBe("12/08/2026 09:07 AM");
  });

  it("renders noon as PM", () => {
    expect(formatDisplayDateTime("2026-08-12T12:00")).toBe("12/08/2026 12:00 PM");
  });

  it("leaves a date-only value without an invented midnight", () => {
    expect(formatDisplayDateTime("2026-08-12")).toBe("12/08/2026");
  });

  it("falls back when nothing parses", () => {
    expect(formatDisplayDateTime("not a date", "—")).toBe("—");
  });
});

describe("other display formats", () => {
  it("formats dates", () => {
    expect(formatDisplayDate("2026-08-12T23:31")).toBe("12/08/2026");
    expect(formatDisplayDateShort("2026-08-12T23:31")).toBe("12 Aug 2026");
  });

  it("formats standalone times", () => {
    expect(formatDisplayTime("2026-08-12T13:04")).toBe("01:04 PM");
    expect(formatDisplayTime("07:05")).toBe("07:05 AM");
    expect(formatDisplayTime("nope")).toBe("");
  });

  it("formats the long and compact variants", () => {
    expect(formatDisplayDateTimeLong("2026-08-12T23:31")).toBe("12 Aug 2026, 11:31 PM");
    expect(formatDisplayDayMonthTime("2026-08-12T23:31")).toBe("12 Aug 11:31 PM");
  });
});

describe("isDisplayDateLike", () => {
  it("accepts stored date shapes", () => {
    expect(isDisplayDateLike("2026-08-12")).toBe(true);
    expect(isDisplayDateLike("2026-08-12T23:31")).toBe(true);
    expect(isDisplayDateLike("2026-08-12T15:31:00Z")).toBe(true);
    expect(isDisplayDateLike("2026-08-12T23:31:00+08:00")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDisplayDateLike("23:31")).toBe(false);
    expect(isDisplayDateLike("Layer 2")).toBe(false);
    expect(isDisplayDateLike(12)).toBe(false);
  });
});

describe("uppercaseDayPeriod", () => {
  it("lifts a lowercase day period", () => {
    expect(uppercaseDayPeriod("05/08/2026 11:31 pm")).toBe("05/08/2026 11:31 PM");
  });
});
