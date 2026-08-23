import { describe, expect, it } from "vitest";

import { isLayerExpired, malaysiaCalendarDay, resolveLayerExpiry } from "./layerExpiry.js";

/** 1 September 2026, 23:59:59.999 in Kuala Lumpur, as an instant. */
const END_OF_1_SEP_MYT = Date.parse("2026-09-01T15:59:59.999Z");

describe("malaysiaCalendarDay", () => {
  it("takes a bare date at face value", () => {
    expect(malaysiaCalendarDay("2026-09-01")).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("reads a SharePoint UTC instant as the Malaysian day it was picked on", () => {
    // 1 September chosen in Kuala Lumpur is stored as the previous UTC day.
    expect(malaysiaCalendarDay("2026-08-31T16:00:00Z")).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("unwraps a choice or lookup column", () => {
    expect(malaysiaCalendarDay({ Value: "2026-09-01" })).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it("refuses anything that is not a date", () => {
    expect(malaysiaCalendarDay("")).toBeNull();
    expect(malaysiaCalendarDay("   ")).toBeNull();
    expect(malaysiaCalendarDay("as agreed on site")).toBeNull();
    expect(malaysiaCalendarDay("2026-02-30")).toBeNull();
    expect(malaysiaCalendarDay(null)).toBeNull();
    expect(malaysiaCalendarDay(undefined)).toBeNull();
  });
});

describe("resolveLayerExpiry", () => {
  it("expires a field-mode link at the close of the Malaysian day", () => {
    const expiry = resolveLayerExpiry(
      { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 0 } },
      { permitEnd: "2026-09-01" },
    );
    expect(expiry?.getTime()).toBe(END_OF_1_SEP_MYT);
  });

  it("adds the grace days the author allowed", () => {
    const expiry = resolveLayerExpiry(
      { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 3 } },
      { permitEnd: "2026-09-01" },
    );
    expect(expiry?.toISOString()).toBe("2026-09-04T15:59:59.999Z");
  });

  it("never expires when the named answer cannot be read as a date", () => {
    const layer = { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 0 } };
    expect(resolveLayerExpiry(layer, { permitEnd: "" })).toBeNull();
    expect(resolveLayerExpiry(layer, { permitEnd: "when the job is done" })).toBeNull();
    expect(resolveLayerExpiry(layer, {})).toBeNull();
  });

  it("ignores the layer's fixed date once a field drives the expiry", () => {
    const expiry = resolveLayerExpiry(
      {
        tokenExpiresAt: "2020-01-01T00:00:00Z",
        tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 0 },
      },
      { permitEnd: "2026-09-01" },
    );
    expect(expiry?.getTime()).toBe(END_OF_1_SEP_MYT);
  });

  it("falls back to the fixed date when no field is named", () => {
    expect(
      resolveLayerExpiry({ tokenExpiresAt: "2026-09-01T00:00:00Z" }, {})?.toISOString(),
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("treats a layer with no expiry at all as never expiring", () => {
    expect(resolveLayerExpiry({}, {})).toBeNull();
    expect(resolveLayerExpiry(undefined, {})).toBeNull();
    expect(resolveLayerExpiry({ tokenExpiresAt: "not a date" }, {})).toBeNull();
  });
});

describe("isLayerExpired", () => {
  const layer = { tokenExpiry: { mode: "field", field: "permitEnd", offsetDays: 0 } };
  const fields = { permitEnd: "2026-09-01" };

  it("leaves the link alive for the whole of its Malaysian day", () => {
    // 23:59 in Kuala Lumpur — still the 1st, so still open.
    expect(isLayerExpired(layer, fields, new Date("2026-09-01T15:59:00Z"))).toBe(false);
  });

  it("closes the link once that day is over in Kuala Lumpur", () => {
    // 00:00:30 on the 2nd, Kuala Lumpur.
    expect(isLayerExpired(layer, fields, new Date("2026-09-01T16:00:30Z"))).toBe(true);
  });

  it("stays open when the answer is unreadable, whatever the date", () => {
    expect(isLayerExpired(layer, { permitEnd: "" }, new Date("2099-01-01T00:00:00Z"))).toBe(false);
  });
});
