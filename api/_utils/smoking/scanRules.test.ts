import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCAN_LIMITS, SCAN_LIMIT_MAX, decideScan, durationMinutes, earlyStartFlag, flagReasonFor, formatSpan,
  joinFlags, normalizeScanLimits, type ScanLimits,
} from "./scanRules.js";
import { FLAG_LASTED_LONG, FLAG_OPEN_LONG, type SmokingBreak } from "./schema.js";

const at = (iso: string) => new Date(iso);

function openBreak(timeIn: string): SmokingBreak {
  return {
    id: "7", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", position: "Tech",
    company: "PMW", areaInCode: "A1", areaInName: "Block A", areaOutCode: "", areaOutName: "",
    timeIn, timeOut: null, durationMinutes: null, flagReason: "",
  };
}

describe("durationMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(durationMinutes(at("2026-09-24T02:42:00Z"), at("2026-09-24T02:49:29Z"))).toBe(7);
    expect(durationMinutes(at("2026-09-24T02:42:00Z"), at("2026-09-24T02:49:31Z"))).toBe(8);
  });
});

describe("flagReasonFor", () => {
  const timeIn = at("2026-09-24T00:00:00Z");
  it("flags an entry still open after 12 hours", () => {
    expect(flagReasonFor(timeIn, null, at("2026-09-24T12:00:01Z"))).toBe(FLAG_OPEN_LONG);
    expect(flagReasonFor(timeIn, null, at("2026-09-24T11:59:59Z"))).toBe("");
  });
  it("flags a closed break that lasted over 12 hours", () => {
    expect(flagReasonFor(timeIn, at("2026-09-24T12:00:01Z"), at("2026-09-25T00:00:00Z"))).toBe(FLAG_LASTED_LONG);
    expect(flagReasonFor(timeIn, at("2026-09-24T12:00:00Z"), at("2026-09-25T00:00:00Z"))).toBe("");
  });
});

describe("decideScan", () => {
  it("opens a break when none is open", () => {
    expect(decideScan(null, at("2026-09-24T02:42:00Z"))).toEqual({ kind: "open" });
  });

  it("ignores a re-scan inside one minute", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    expect(decideScan(open, at("2026-09-24T02:42:59Z"))).toEqual({ kind: "already-in", openBreak: open });
  });

  it("closes a break at one minute or later", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    expect(decideScan(open, at("2026-09-24T02:49:00Z"))).toEqual({
      kind: "close", openBreak: open, durationMinutes: 7, flagReason: "",
    });
  });

  it("closes a break left open overnight as a stale break and opens a new one", () => {
    const open = openBreak("2026-09-23T02:00:00Z");
    const decision = decideScan(open, at("2026-09-24T02:00:00Z"));
    expect(decision).toMatchObject({
      kind: "close-stale-and-open", openBreak: open, durationMinutes: 1440, flagReason: FLAG_LASTED_LONG,
    });
  });

  it("still just closes a break that is exactly 12 hours old", () => {
    const open = openBreak("2026-09-23T02:00:00Z");
    const decision = decideScan(open, at("2026-09-23T14:00:00Z"));
    expect(decision).toMatchObject({ kind: "close", durationMinutes: 720, flagReason: "" });
  });

  it("still just closes a break that is under 12 hours old", () => {
    const open = openBreak("2026-09-23T02:00:00Z");
    const decision = decideScan(open, at("2026-09-23T13:59:00Z"));
    expect(decision).toMatchObject({ kind: "close", durationMinutes: 719, flagReason: "" });
  });
});

describe("scan limits", () => {
  const limits = (over: Partial<ScanLimits> = {}): ScanLimits => ({ ...DEFAULT_SCAN_LIMITS, ...over });

  it("defaults to today's behaviour: ignore repeats for a minute, no other limits", () => {
    expect(DEFAULT_SCAN_LIMITS).toEqual({ ignoreRepeatSeconds: 60, minBreakSeconds: 0, restSeconds: 0 });
  });

  it("reads stored values as whole seconds, falling back or clamping when they make no sense", () => {
    expect(normalizeScanLimits({ ignoreRepeatSeconds: "30", minBreakSeconds: 300.7, restSeconds: 1800 }))
      .toEqual({ ignoreRepeatSeconds: 30, minBreakSeconds: 300, restSeconds: 1800 });
    expect(normalizeScanLimits({ ignoreRepeatSeconds: "nonsense", minBreakSeconds: -5, restSeconds: null }))
      .toEqual(DEFAULT_SCAN_LIMITS);
    expect(normalizeScanLimits({ ignoreRepeatSeconds: 99_999, minBreakSeconds: 99_999_999, restSeconds: 99_999_999 }))
      .toEqual(SCAN_LIMIT_MAX);
  });

  it("uses the configured window to ignore a repeat scan", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    const tenSeconds = limits({ ignoreRepeatSeconds: 10 });
    expect(decideScan(open, at("2026-09-24T02:42:09Z"), tenSeconds)).toEqual({ kind: "already-in", openBreak: open });
    expect(decideScan(open, at("2026-09-24T02:42:30Z"), tenSeconds)).toMatchObject({ kind: "close" });
  });

  it("closes a break shorter than the minimum but flags it", () => {
    const open = openBreak("2026-09-24T02:42:00Z");
    expect(decideScan(open, at("2026-09-24T02:45:00Z"), limits({ minBreakSeconds: 300 }))).toMatchObject({
      kind: "close", durationMinutes: 3, flagReason: "Shorter than the 5 min minimum",
    });
    expect(decideScan(open, at("2026-09-24T02:47:00Z"), limits({ minBreakSeconds: 300 }))).toMatchObject({
      kind: "close", flagReason: "",
    });
  });

  it("keeps a flag the break already carried when it closes", () => {
    const open = { ...openBreak("2026-09-24T02:42:00Z"), flagReason: "Started 10 min after the last break (rest is 30 min)" };
    expect(decideScan(open, at("2026-09-24T02:45:00Z"), limits({ minBreakSeconds: 300 }))).toMatchObject({
      flagReason: "Started 10 min after the last break (rest is 30 min); Shorter than the 5 min minimum",
    });
  });

  it("flags a break started before the rest time is up", () => {
    const rest = limits({ restSeconds: 1800 });
    expect(earlyStartFlag(at("2026-09-24T02:00:00Z"), at("2026-09-24T02:10:00Z"), rest))
      .toBe("Started 10 min after the last break (rest is 30 min)");
    expect(earlyStartFlag(at("2026-09-24T02:00:00Z"), at("2026-09-24T02:30:00Z"), rest)).toBe("");
    expect(earlyStartFlag(null, at("2026-09-24T02:10:00Z"), rest)).toBe("");
    expect(earlyStartFlag(at("2026-09-24T02:00:00Z"), at("2026-09-24T02:10:00Z"), limits())).toBe("");
  });

  it("says a span the way a person would", () => {
    expect(formatSpan(45)).toBe("45 s");
    expect(formatSpan(60)).toBe("1 min");
    expect(formatSpan(90)).toBe("1 min 30 s");
    expect(formatSpan(3600)).toBe("1 h");
    expect(formatSpan(4500)).toBe("1 h 15 min");
  });

  it("joins flags once each, skipping blanks", () => {
    expect(joinFlags("", "A", "A; B", "")).toBe("A; B");
    expect(joinFlags("", "")).toBe("");
  });
});
