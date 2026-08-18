import { describe, expect, it } from "vitest";
import { parseForm, type NativeElement } from "./schema";
import { checkAnswer } from "./useNativeForm";

/** Parse one published question, so the tests run against the real element shape. */
function question(raw: Record<string, unknown>): NativeElement {
  const form = parseForm({ pages: [{ name: "page1", elements: [{ name: "q", ...raw }] }] });
  const found = form.byName.get("q");
  if (!found) throw new Error("The test question did not parse.");
  return found;
}

const numberField = (extra: Record<string, unknown> = {}) =>
  question({ type: "text", inputType: "number", ...extra });

describe("checkAnswer — a maximum reports while the answer is being typed", () => {
  it("catches a value over the maximum on the keystroke that passes it", () => {
    const q = numberField({ max: 10 });

    expect(checkAnswer(q, "1", "live")).toBe("");
    expect(checkAnswer(q, "11", "live")).toBe("Enter 10 or less.");
  });

  it("says the same thing at submission", () => {
    const q = numberField({ max: 10 });

    expect(checkAnswer(q, "11", "full")).toBe("Enter 10 or less.");
  });

  it("reads a max published as a numeric validator too", () => {
    const q = numberField({ validators: [{ type: "numeric", maxValue: 10 }] });

    expect(checkAnswer(q, "11", "live")).toBe("Enter 10 or less.");
  });

  it("uses the author's own message when they wrote one", () => {
    const q = numberField({ validators: [{ type: "numeric", maxValue: 10, text: "Ten days is the cap." }] });

    expect(checkAnswer(q, "11", "live")).toBe("Ten days is the cap.");
  });

  it("holds a minimum back until submission, since a small number may still be growing", () => {
    const q = numberField({ min: 10 });

    expect(checkAnswer(q, "4", "live")).toBe("");
    expect(checkAnswer(q, "4", "full")).toBe("Enter 10 or more.");
  });

  it("clears as soon as the value comes back into range", () => {
    const q = numberField({ min: 1, max: 10 });

    expect(checkAnswer(q, "11", "live")).toBe("Enter 10 or less.");
    expect(checkAnswer(q, "9", "full")).toBe("");
  });

  it("bounds a slider the same way", () => {
    const form = parseForm({
      pages: [{ name: "p", elements: [{ type: "slider", name: "q", max: 100 }] }],
    });
    const q = form.byName.get("q")!;

    expect(checkAnswer(q, 120, "live")).toBe("Enter 100 or less.");
  });
});

describe("checkAnswer — what waits for submission", () => {
  it("does not call a field required while someone is clearing it to retype", () => {
    const q = question({ type: "text", isRequired: true });

    expect(checkAnswer(q, "", "live")).toBe("");
    expect(checkAnswer(q, "", "full")).toBe("This field is required.");
  });

  it("does not call a half-typed address invalid", () => {
    const q = question({ type: "text", inputType: "email" });

    expect(checkAnswer(q, "someone@exa", "live")).toBe("");
    expect(checkAnswer(q, "someone@exa", "full")).toBe("Enter a valid email address.");
    expect(checkAnswer(q, "someone@example.com", "full")).toBe("");
  });

  it("does not hold a half-typed link against anyone", () => {
    const q = question({ type: "text", inputType: "url" });

    expect(checkAnswer(q, "htt", "live")).toBe("");
    expect(checkAnswer(q, "htt", "full")).toBe("Enter a valid link.");
  });

  it("waits on a pattern, which almost nothing matches part-way through", () => {
    const q = question({ type: "text", validators: [{ type: "regex", regex: "^[A-Z]{3}-[0-9]{4}$" }] });

    expect(checkAnswer(q, "AB", "live")).toBe("");
    expect(checkAnswer(q, "AB", "full")).toBe("This entry is not in the expected format.");
    expect(checkAnswer(q, "ABC-1234", "full")).toBe("");
  });

  it("waits on a minimum length for the same reason", () => {
    const q = question({ type: "text", validators: [{ type: "text", minLength: 5 }] });

    expect(checkAnswer(q, "ab", "live")).toBe("");
    expect(checkAnswer(q, "ab", "full")).toBe("Enter at least 5 characters.");
  });

  it("keeps quiet mid-word when the box is not yet a number", () => {
    const q = numberField({ max: 10 });

    expect(checkAnswer(q, "-", "live")).toBe("");
    expect(checkAnswer(q, "-", "full")).toBe("Enter a number.");
  });
});

describe("checkAnswer — the other ceilings report live too", () => {
  it("catches a character limit as it is passed", () => {
    const q = question({ type: "text", maxLength: 3 });

    expect(checkAnswer(q, "abc", "live")).toBe("");
    expect(checkAnswer(q, "abcd", "live")).toBe("Use at most 3 characters.");
  });

  it("catches a character limit published as a text validator", () => {
    const q = question({ type: "text", validators: [{ type: "text", maxLength: 3 }] });

    expect(checkAnswer(q, "abcd", "live")).toBe("Use at most 3 characters.");
  });

  it("catches one selection too many", () => {
    const q = question({ type: "checkbox", choices: ["a", "b", "c"], maxSelections: 2 });

    expect(checkAnswer(q, ["a", "b"], "live")).toBe("");
    expect(checkAnswer(q, ["a", "b", "c"], "live")).toBe("Select at most 2.");
  });
});

describe("checkAnswer — an untouched answer stays untouched", () => {
  it("says nothing about a blank optional field at either stage", () => {
    const q = numberField({ max: 10 });

    expect(checkAnswer(q, "", "live")).toBe("");
    expect(checkAnswer(q, "", "full")).toBe("");
    expect(checkAnswer(q, undefined, "full")).toBe("");
  });

  it("defaults to the full rulebook when no stage is named", () => {
    const q = question({ type: "text", isRequired: true });

    expect(checkAnswer(q, "")).toBe("This field is required.");
  });
});

describe("checkAnswer — a date bound is honoured, not quietly dropped", () => {
  const dateField = (extra: Record<string, unknown> = {}) =>
    question({ type: "text", inputType: "date", ...extra });

  it("catches a date past the maximum the author set", () => {
    const q = dateField({ maxDate: "2026-12-31" });

    expect(checkAnswer(q, "2026-06-01", "live")).toBe("");
    expect(checkAnswer(q, "2027-01-01", "live")).toBe("Choose 2026-12-31 or earlier.");
  });

  it("catches a date before the minimum", () => {
    const q = dateField({ minDate: "2026-01-01" });

    expect(checkAnswer(q, "2025-12-31", "live")).toBe("Choose 2026-01-01 or later.");
    expect(checkAnswer(q, "2026-01-01", "live")).toBe("");
  });

  it("compares only the date half of a date-and-time answer", () => {
    const q = question({ type: "text", inputType: "datetime-local", maxDate: "2026-12-31" });

    expect(checkAnswer(q, "2026-12-31T23:30", "live")).toBe("");
    expect(checkAnswer(q, "2027-01-01T00:30", "live")).toBe("Choose 2026-12-31 or earlier.");
  });

  it("says nothing while the date is still half-picked", () => {
    const q = dateField({ maxDate: "2026-12-31" });

    expect(checkAnswer(q, "2027", "live")).toBe("");
  });

  it("leaves a date field with no bounds alone", () => {
    const q = dateField();

    expect(checkAnswer(q, "2099-01-01", "full")).toBe("");
  });
});
