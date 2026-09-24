import { describe, expect, it } from "vitest";
import { describeOutcome, formatMyt } from "./outcome";

describe("formatMyt", () => {
  it("shows Malaysian wall-clock time", () => {
    expect(formatMyt("2026-09-24T02:42:00Z")).toBe("10:42");
  });
});

describe("describeOutcome", () => {
  it("reads IN", () => {
    expect(describeOutcome({ result: "in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" }))
      .toEqual({ tone: "in", headline: "IN · 10:42", detail: "Block A" });
  });
  it("reads OUT with the duration", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-24T02:42:00Z", timeOut: "2026-09-24T02:49:00Z",
      areaName: "Block B", durationMinutes: 7, flagged: false,
    })).toEqual({ tone: "out", headline: "OUT · 10:49", detail: "7 min · Block B" });
  });
  it("mentions a long break without accusing", () => {
    expect(describeOutcome({
      result: "out", timeIn: "2026-09-23T02:00:00Z", timeOut: "2026-09-24T02:00:00Z",
      areaName: "Block A", durationMinutes: 1440, flagged: true,
    }).detail).toBe("24 h 0 min · Block A · OSHES will check this one — you may have missed a scan-out");
  });
  it("reads a double scan", () => {
    expect(describeOutcome({ result: "already-in", timeIn: "2026-09-24T02:42:00Z", areaName: "Block A" }))
      .toEqual({ tone: "info", headline: "Already in since 10:42", detail: "Scan again when you leave." });
  });
  it("reads a retired poster", () => {
    expect(describeOutcome({ result: "retired-area" }))
      .toEqual({ tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." });
  });
});
