import { describe, expect, it } from "vitest";
import { describeOutcome, formatMyt } from "./outcome";

describe("formatMyt", () => {
  it("shows Malaysian wall-clock time", () => {
    expect(formatMyt("2026-09-24T02:42:00Z")).toBe("10:42");
  });
});

describe("describeOutcome", () => {
  it("reads the scan that starts a break as checking out", () => {
    expect(describeOutcome({ result: "in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" })).toEqual({
      tone: "in",
      headline: "Checked out",
      time: "10:42",
      detail: "Block A",
      hint: "Scan a poster again when you're back in.",
    });
  });
  it("reads checking out after a missed check-in on the previous break", () => {
    expect(describeOutcome({
      result: "in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A", previousMissedScanOut: true,
    })).toEqual({
      tone: "in",
      headline: "Checked out",
      time: "10:42",
      detail: "Block A",
      note: "Your last break had no check-in — OSHES will check it.",
      hint: "Scan a poster again when you're back in.",
    });
  });
  it("reads the scan that ends a break as checking in, with the duration", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z",
      areaName: "Block B", durationMinutes: 7, flagged: false,
    })).toEqual({ tone: "out", headline: "Checked in", time: "10:49", detail: "7 min break · Block B" });
  });
  it("mentions a flagged break without accusing", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z",
      areaName: "Block A", durationMinutes: 1440, flagged: true,
    })).toEqual({
      tone: "out",
      headline: "Checked in",
      time: "10:00",
      detail: "24 h 0 min break · Block A",
      note: "OSHES will check this break — it was flagged.",
    });
  });
  it("reads a double scan", () => {
    expect(describeOutcome({ result: "already-in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" }))
      .toEqual({ tone: "info", headline: "Already checked out at 10:42", detail: "Scan again when you're back in." });
  });
  it("reads a double scan on the way back in", () => {
    expect(describeOutcome({ result: "already-out", timeOut: "2026-09-24T02:10:00Z", areaName: "Block A" }))
      .toEqual({ tone: "info", headline: "Already checked in at 10:10", detail: "Scan when you next go out for a break." });
  });
  it("reads a retired poster", () => {
    expect(describeOutcome({ result: "retired-area" }))
      .toEqual({ tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." });
  });
  it("reads a blocked person", () => {
    expect(describeOutcome({ result: "blocked" })).toEqual({
      tone: "warn",
      headline: "Access turned off",
      detail: "Your access to the smoking log has been turned off. Contact OSHES.",
    });
  });
});
