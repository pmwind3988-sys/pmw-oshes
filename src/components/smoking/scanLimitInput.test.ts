import { describe, expect, it } from "vitest";
import { readSpanInput, toSpanInput } from "./scanLimitInput";

describe("scan limit input", () => {
  it("shows whole minutes as minutes and anything else as seconds", () => {
    expect(toSpanInput(1800)).toEqual({ value: "30", unit: "minutes" });
    expect(toSpanInput(90)).toEqual({ value: "90", unit: "seconds" });
    expect(toSpanInput(0)).toEqual({ value: "0", unit: "seconds" });
  });

  it("shows whole hours as hours", () => {
    expect(toSpanInput(3600)).toEqual({ value: "1", unit: "hours" });
    expect(toSpanInput(5400)).toEqual({ value: "90", unit: "minutes" });
    expect(readSpanInput({ value: "2", unit: "hours" }, 43_200)).toEqual({ seconds: 7200 });
    expect(readSpanInput({ value: "13", unit: "hours" }, 43_200)).toEqual({ error: "At most 12 hours." });
  });

  it("reads minutes and seconds into seconds", () => {
    expect(readSpanInput({ value: "30", unit: "minutes" }, 86_400)).toEqual({ seconds: 1800 });
    expect(readSpanInput({ value: " 45 ", unit: "seconds" }, 600)).toEqual({ seconds: 45 });
    expect(readSpanInput({ value: "0", unit: "minutes" }, 600)).toEqual({ seconds: 0 });
  });

  it("refuses what cannot be saved, saying why", () => {
    expect(readSpanInput({ value: "", unit: "seconds" }, 600)).toEqual({ error: "Enter a whole number (0 turns it off)." });
    expect(readSpanInput({ value: "1.5", unit: "minutes" }, 600)).toEqual({ error: "Enter a whole number (0 turns it off)." });
    expect(readSpanInput({ value: "11", unit: "minutes" }, 600)).toEqual({ error: "At most 10 minutes." });
  });
});
