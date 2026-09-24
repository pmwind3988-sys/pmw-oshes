import { describe, expect, it } from "vitest";
import { isoToMytInput, mytInputToIso } from "./BreakEditDialog";

describe("edit dialog time fields", () => {
  it("shows Malaysian wall-clock time and round-trips it", () => {
    expect(isoToMytInput("2026-09-24T02:42:00.000Z")).toBe("2026-09-24T10:42");
    expect(mytInputToIso("2026-09-24T10:42")).toBe("2026-09-24T02:42:00.000Z");
  });

  it("returns an empty field for no time out", () => {
    expect(isoToMytInput(null)).toBe("");
  });
});
