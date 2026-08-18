import { describe, it, expect } from "vitest";
import {
  formatMalaysiaDate,
  formatMalaysiaDateTime,
  formatMalaysiaDateTimeLong,
  formatMalaysiaTime,
  malaysiaDateStamp,
} from "./malaysiaTime";

describe("formatMalaysiaDateTime", () => {
  it("reads a UTC timestamp on the Malaysian clock", () => {
    // 15:31 UTC is 23:31 in Kuala Lumpur, whatever zone the exporter is in.
    expect(formatMalaysiaDateTime("2026-08-12T15:31:00Z")).toBe("12/08/2026 11:31 PM");
  });

  it("rolls the date over when +8 crosses midnight", () => {
    expect(formatMalaysiaDateTime("2026-08-12T16:00:00Z")).toBe("13/08/2026 12:00 AM");
  });

  it("honours an offset the timestamp carries itself", () => {
    // 09:00+08:00 is already Malaysian time and must not be shifted again.
    expect(formatMalaysiaDateTime("2026-08-12T09:00:00+08:00")).toBe("12/08/2026 09:00 AM");
    expect(formatMalaysiaDateTime("2026-08-12T09:00:00-05:00")).toBe("12/08/2026 10:00 PM");
  });

  it("leaves wall-clock text where it was typed", () => {
    // A datetime-local field stores no zone. Converting it would move an
    // incident reported at 11:31 PM to half past seven the next morning.
    expect(formatMalaysiaDateTime("2026-08-12T23:31")).toBe("12/08/2026 11:31 PM");
    expect(formatMalaysiaDateTime("2026-08-12 23:31:09")).toBe("12/08/2026 11:31 PM");
  });

  it("keeps a date-only value date-only rather than growing a midnight", () => {
    expect(formatMalaysiaDateTime("2026-08-12")).toBe("12/08/2026");
  });

  it("reads a Date and an epoch as instants", () => {
    expect(formatMalaysiaDateTime(new Date("2026-08-12T15:31:00Z"))).toBe("12/08/2026 11:31 PM");
    expect(formatMalaysiaDateTime(Date.parse("2026-08-12T15:31:00Z"))).toBe("12/08/2026 11:31 PM");
  });

  it("hands back text it cannot read instead of losing it", () => {
    expect(formatMalaysiaDateTime("as soon as possible")).toBe("as soon as possible");
  });

  it("falls back only when there is nothing there", () => {
    expect(formatMalaysiaDateTime("", "—")).toBe("—");
    expect(formatMalaysiaDateTime(null, "—")).toBe("—");
    expect(formatMalaysiaDateTime(undefined)).toBe("");
    expect(formatMalaysiaDateTime(new Date("nope"), "—")).toBe("—");
  });
});

describe("formatMalaysiaDate", () => {
  it("drops the time a stored instant carries", () => {
    expect(formatMalaysiaDate("2026-08-12T15:31:00Z")).toBe("12/08/2026");
  });

  it("keeps midnight UTC on the day it was submitted", () => {
    // A date field posted as `2026-08-12` comes back from SharePoint as UTC
    // midnight; +8 keeps it on the 12th.
    expect(formatMalaysiaDate("2026-08-12T00:00:00Z")).toBe("12/08/2026");
  });
});

describe("formatMalaysiaTime", () => {
  it("reads a bare time as typed", () => {
    expect(formatMalaysiaTime("07:05")).toBe("07:05 AM");
    expect(formatMalaysiaTime("19:05")).toBe("07:05 PM");
  });

  it("converts a full timestamp", () => {
    expect(formatMalaysiaTime("2026-08-12T15:31:00Z")).toBe("11:31 PM");
  });

  it("hands back an impossible clock rather than reading it as a date", () => {
    // Not a moment, so nothing to convert — but still what the form holds, so it
    // is passed through rather than replaced by a dash.
    expect(formatMalaysiaTime("25:99", "—")).toBe("25:99");
  });
});

describe("formatMalaysiaDateTimeLong", () => {
  it("spells the month for a summary line", () => {
    expect(formatMalaysiaDateTimeLong("2026-08-12T15:31:00Z")).toBe("12 Aug 2026, 11:31 PM");
    expect(formatMalaysiaDateTimeLong("2026-08-12")).toBe("12 Aug 2026");
  });
});

describe("malaysiaDateStamp", () => {
  it("names the file after the Malaysian date, not the UTC one", () => {
    // 17:00 UTC on the 17th is already the 18th in Kuala Lumpur, which is the
    // date the person clicking Export sees on their own screen.
    expect(malaysiaDateStamp(new Date("2026-08-17T17:00:00Z"))).toBe("2026-08-18");
    expect(malaysiaDateStamp(new Date("2026-08-17T15:59:00Z"))).toBe("2026-08-17");
  });
});
