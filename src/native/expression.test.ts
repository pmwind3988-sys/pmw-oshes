import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateFormula, formatNumber, referencedFields } from "./expression";

describe("referencedFields", () => {
  it("returns each referenced field once", () => {
    expect(referencedFields("{a} + {b} + {a}")).toEqual(["a", "b"]);
  });

  it("returns nothing for an expression with no references", () => {
    expect(referencedFields("1 + 2")).toEqual([]);
  });
});

describe("evaluateCondition", () => {
  it("compares a field against a quoted literal", () => {
    expect(evaluateCondition("{dept} = 'HR'", { dept: "HR" })).toBe(true);
    expect(evaluateCondition("{dept} = 'HR'", { dept: "Finance" })).toBe(false);
  });

  it("treats <> as the negation of =", () => {
    expect(evaluateCondition("{dept} <> 'HR'", { dept: "Finance" })).toBe(true);
  });

  it("compares numerically across the string/number boundary", () => {
    // A `<select>` yields "3"; a default value yields 3. A rule written against
    // either has to match both.
    expect(evaluateCondition("{years} = 3", { years: "3" })).toBe(true);
    expect(evaluateCondition("{years} > 2", { years: "3" })).toBe(true);
    expect(evaluateCondition("{years} >= 3", { years: 3 })).toBe(true);
    expect(evaluateCondition("{years} <= 2", { years: 3 })).toBe(false);
  });

  it("does not read >= as >", () => {
    expect(evaluateCondition("{n} >= 5", { n: 5 })).toBe(true);
    expect(evaluateCondition("{n} > 5", { n: 5 })).toBe(false);
  });

  it("handles empty and notempty", () => {
    expect(evaluateCondition("{note} empty", { note: "" })).toBe(true);
    expect(evaluateCondition("{note} empty", { note: "   " })).toBe(true);
    expect(evaluateCondition("{note} notempty", { note: "hi" })).toBe(true);
    expect(evaluateCondition("{list} empty", { list: [] })).toBe(true);
    expect(evaluateCondition("{list} notempty", { list: ["a"] })).toBe(true);
  });

  it("combines with and / or, with or binding loosest", () => {
    const values = { a: "x", b: 1, c: "z" };
    expect(evaluateCondition("{a} = 'x' and {b} = 1", values)).toBe(true);
    expect(evaluateCondition("{a} = 'x' and {b} = 2", values)).toBe(false);
    expect(evaluateCondition("{a} = 'no' or {c} = 'z'", values)).toBe(true);
    // false and false, or true → true only if `or` is split first.
    expect(evaluateCondition("{a} = 'no' and {b} = 9 or {c} = 'z'", values)).toBe(true);
  });

  it("does not split on the letters and/or inside a field name", () => {
    expect(evaluateCondition("{brandName} = 'Acme'", { brandName: "Acme" })).toBe(true);
    expect(evaluateCondition("{forecast} = 'up'", { forecast: "up" })).toBe(true);
  });

  it("matches a value inside a multi-select answer", () => {
    expect(evaluateCondition("{tags} = 'safety'", { tags: ["quality", "safety"] })).toBe(true);
    expect(evaluateCondition("{tags} contains 'safety'", { tags: ["quality", "safety"] })).toBe(true);
    expect(evaluateCondition("{tags} contains 'legal'", { tags: ["quality"] })).toBe(false);
  });

  it("handles anyof and allof against a list literal", () => {
    const values = { tags: ["a", "b"] };
    expect(evaluateCondition("{tags} anyof ['b', 'c']", values)).toBe(true);
    expect(evaluateCondition("{tags} anyof ['c']", values)).toBe(false);
    expect(evaluateCondition("{tags} allof ['a', 'b']", values)).toBe(true);
    expect(evaluateCondition("{tags} allof ['a', 'c']", values)).toBe(false);
  });

  it("truthy-tests a bare field reference", () => {
    expect(evaluateCondition("{agreed}", { agreed: true })).toBe(true);
    expect(evaluateCondition("{agreed}", { agreed: false })).toBe(false);
    expect(evaluateCondition("{note}", { note: "" })).toBe(false);
  });

  it("negates with not", () => {
    expect(evaluateCondition("not {agreed}", { agreed: false })).toBe(true);
  });

  it("ignores a separator inside a quoted literal", () => {
    expect(evaluateCondition("{title} = 'Research and Development'", { title: "Research and Development" })).toBe(true);
  });

  it("returns undefined for an empty expression, so callers show the field", () => {
    expect(evaluateCondition("", {})).toBeUndefined();
    expect(evaluateCondition("   ", {})).toBeUndefined();
  });

  it("compares a boolean answer against the literal true", () => {
    expect(evaluateCondition("{claim} = true", { claim: true })).toBe(true);
    expect(evaluateCondition("{claim} = true", { claim: false })).toBe(false);
  });
});

describe("evaluateFormula", () => {
  it("substitutes fields and evaluates arithmetic", () => {
    expect(evaluateFormula("{a} + {b}", { a: 2, b: 3 })).toBe(5);
    expect(evaluateFormula("{a} * ({b} + 1)", { a: 2, b: 3 })).toBe(8);
  });

  it("counts a missing or non-numeric answer as zero", () => {
    expect(evaluateFormula("{a} + {b}", { a: 5 })).toBe(5);
    expect(evaluateFormula("{a} + {b}", { a: 5, b: "" })).toBe(5);
    expect(evaluateFormula("{a} + {b}", { a: 5, b: "abc" })).toBe(5);
  });

  it("reads numeric strings, which is how typed answers arrive", () => {
    expect(evaluateFormula("{a} + {b}", { a: "1200", b: "350.5" })).toBe(1550.5);
  });

  it("repairs the duplicated operators left by an older builder", () => {
    expect(evaluateFormula("{a} + + {b}", { a: 1, b: 2 })).toBe(3);
    expect(evaluateFormula("{a} ++ {b}", { a: 1, b: 2 })).toBe(3);
  });

  it("returns undefined rather than throwing on a broken expression", () => {
    expect(evaluateFormula("{a} +", { a: 1 })).toBeUndefined();
    expect(evaluateFormula("", {})).toBeUndefined();
  });

  it("returns undefined for a non-finite result", () => {
    expect(evaluateFormula("{a} / {b}", { a: 1, b: 0 })).toBeUndefined();
  });
});

describe("formatNumber", () => {
  it("renders MYR as RM, matching the SurveyJS renderer", () => {
    expect(formatNumber(1550.5, "currency", 2, "MYR")).toBe("RM 1550.50");
  });

  it("renders other currencies with their own code", () => {
    expect(formatNumber(20, "currency", 2, "USD")).toBe("USD 20.00");
  });

  it("renders decimals and percents", () => {
    expect(formatNumber(3.14159, "decimal", 2, "MYR")).toBe("3.14");
    expect(formatNumber(50, "percent", 0, "MYR")).toBe("50%");
  });
});
