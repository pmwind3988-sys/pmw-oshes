import { describe, expect, it } from "vitest";
import { decideScan, durationMinutes, flagReasonFor } from "./scanRules.js";
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
