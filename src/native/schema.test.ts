import { describe, expect, it } from "vitest";
import { parseForm, type NativeElement } from "./schema";
import { applyAutocapitalize } from "./fields";

/** Find a parsed question by name, failing loudly when it is missing. */
function q(json: unknown, name: string): NativeElement {
  const found = parseForm(json).byName.get(name);
  if (!found) throw new Error(`No question named "${name}" in the parsed form.`);
  return found;
}

function page(json: unknown, index = 0) {
  return parseForm(json).pages[index];
}

describe("parseForm — structure", () => {
  it("survives an empty or malformed document", () => {
    expect(parseForm(null).pages).toHaveLength(1);
    expect(parseForm({}).questions).toEqual([]);
    expect(parseForm({ pages: "nonsense" }).questions).toEqual([]);
  });

  it("reads the form title and description", () => {
    const form = parseForm({ title: "Leave", description: "Apply for leave", pages: [] });
    expect(form.title).toBe("Leave");
    expect(form.description).toBe("Apply for leave");
  });

  it("flattens panel children into the question index", () => {
    const form = parseForm({
      pages: [
        {
          name: "page1",
          elements: [
            { type: "text", name: "a" },
            { type: "panel", name: "grp", elements: [{ type: "text", name: "b" }] },
          ],
        },
      ],
    });
    expect([...form.byName.keys()]).toEqual(["a", "b"]);
    expect(form.pages[0].elements).toHaveLength(2);
    expect(form.pages[0].elements[1].kind).toBe("section");
  });

  it("splits a page at each pagebreak, taking the break's own titles", () => {
    const form = parseForm({
      pages: [
        {
          name: "page1",
          title: "Original",
          elements: [
            { type: "text", name: "a" },
            { type: "pagebreak", pageTitle: "Second half", pageDescription: "Nearly done" },
            { type: "text", name: "b" },
          ],
        },
      ],
    });
    expect(form.pages).toHaveLength(2);
    expect(form.pages[0].title).toBe("Original");
    expect(form.pages[1].title).toBe("Second half");
    expect(form.pages[1].description).toBe("Nearly done");
    expect(form.pages[1].elements.map((e) => e.name)).toEqual(["b"]);
  });

  it("gives every element a unique id", () => {
    const form = parseForm({
      pages: [{ name: "p", elements: [{ type: "text", name: "a" }, { type: "text", name: "a" }] }],
    });
    const ids = form.pages[0].elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("marks a field that shares the previous field's row", () => {
    const els = page({
      pages: [
        {
          name: "p",
          elements: [
            { type: "text", name: "a" },
            { type: "text", name: "b", startWithNewLine: false },
          ],
        },
      ],
    }).elements;
    expect(els[0].inline).toBe(false);
    expect(els[1].inline).toBe(true);
  });
});

describe("parseForm — kinds", () => {
  const kindOf = (element: Record<string, unknown>) =>
    parseForm({ pages: [{ name: "p", elements: [{ name: "x", ...element }] }] }).pages[0].elements[0].kind;

  it("maps the SurveyJS types a published form contains", () => {
    expect(kindOf({ type: "text" })).toBe("text");
    expect(kindOf({ type: "comment" })).toBe("textarea");
    expect(kindOf({ type: "dropdown" })).toBe("select");
    expect(kindOf({ type: "radiogroup" })).toBe("single-choice");
    expect(kindOf({ type: "checkbox" })).toBe("multi-choice");
    expect(kindOf({ type: "boolean" })).toBe("boolean");
    expect(kindOf({ type: "rating" })).toBe("rating");
    expect(kindOf({ type: "file" })).toBe("file");
    expect(kindOf({ type: "signaturepad" })).toBe("signature");
    expect(kindOf({ type: "matrixdynamic" })).toBe("table");
    expect(kindOf({ type: "ranking" })).toBe("ranking");
    expect(kindOf({ type: "paneldynamic" })).toBe("repeater");
    expect(kindOf({ type: "expression" })).toBe("readout");
    expect(kindOf({ type: "panel" })).toBe("section");
    expect(kindOf({ type: "html" })).toBe("static");
  });

  it("still renders the builder's own type names, for older published forms", () => {
    expect(kindOf({ type: "dynamicmatrix" })).toBe("table");
    expect(kindOf({ type: "tableinput" })).toBe("table");
    expect(kindOf({ type: "columns" })).toBe("section");
    expect(kindOf({ type: "repeater" })).toBe("repeater");
    expect(kindOf({ type: "alert" })).toBe("static");
    expect(kindOf({ type: "consent" })).toBe("boolean");
  });

  it("falls back to a usable control for an unknown type", () => {
    expect(kindOf({ type: "somethingNew" })).toBe("text");
    expect(kindOf({ type: "somethingNew", choices: ["a"] })).toBe("single-choice");
  });

  it("reads the real input type off a text question", () => {
    const json = {
      pages: [
        {
          name: "p",
          elements: [
            { type: "text", name: "plain" },
            { type: "text", name: "mail", inputType: "email" },
            { type: "text", name: "when", inputType: "datetime" },
            { type: "text", name: "when2", inputType: "datetime-local" },
            { type: "text", name: "weird", inputType: "nonsense" },
          ],
        },
      ],
    };
    expect(q(json, "plain").inputType).toBe("text");
    expect(q(json, "mail").inputType).toBe("email");
    expect(q(json, "when").inputType).toBe("datetime-local");
    expect(q(json, "when2").inputType).toBe("datetime-local");
    expect(q(json, "weird").inputType).toBe("text");
  });
});

describe("parseForm — choices", () => {
  const choicesOf = (choices: unknown) =>
    q({ pages: [{ name: "p", elements: [{ type: "dropdown", name: "x", choices }] }] }, "x").choices;

  it("accepts bare strings, which is what the builder writes", () => {
    expect(choicesOf(["A", "B"])).toEqual([
      { value: "A", text: "A" },
      { value: "B", text: "B" },
    ]);
  });

  it("accepts {value, text}, which is what SharePoint enrichment writes", () => {
    expect(choicesOf([{ value: "hr", text: "Human Resources" }])).toEqual([{ value: "hr", text: "Human Resources" }]);
  });

  it("falls back to the value when a choice has no text", () => {
    expect(choicesOf([{ value: "hr" }])).toEqual([{ value: "hr", text: "hr" }]);
  });

  it("drops empty and malformed entries rather than rendering blank rows", () => {
    expect(choicesOf(["A", null, undefined, "", {}])).toEqual([{ value: "A", text: "A" }]);
  });

  it("returns nothing when choices is not a list", () => {
    expect(choicesOf("A,B")).toEqual([]);
  });
});

describe("parseForm — rating steps", () => {
  const stepsOf = (rateValues: unknown) =>
    q({ pages: [{ name: "p", elements: [{ type: "rating", name: "x", rateValues }] }] }, "x").rateValues;

  it("keeps a numeric step numeric, since the column behind it is a number", () => {
    expect(stepsOf([{ value: 1, text: "Disagree" }, { value: 2, text: "Agree" }])).toEqual([
      { value: 1, text: "Disagree" },
      { value: 2, text: "Agree" },
    ]);
  });

  it("labels a bare number with itself", () => {
    expect(stepsOf([1, 2])).toEqual([
      { value: 1, text: "1" },
      { value: 2, text: "2" },
    ]);
  });

  it("accepts a word-valued step", () => {
    expect(stepsOf(["low", { value: "high", text: "Very high" }])).toEqual([
      { value: "low", text: "low" },
      { value: "high", text: "Very high" },
    ]);
  });

  it("is empty for a scale authored as a plain min/max range", () => {
    expect(stepsOf(undefined)).toEqual([]);
  });

  it("drops empty and malformed entries rather than rendering blank steps", () => {
    expect(stepsOf([1, null, undefined, "", {}])).toEqual([{ value: 1, text: "1" }]);
  });
});

describe("parseForm — table columns", () => {
  const columnsOf = (columns: unknown) =>
    q({ pages: [{ name: "p", elements: [{ type: "matrixdynamic", name: "x", columns }] }] }, "x").columns;

  it("reads a header-only column list as text columns", () => {
    expect(columnsOf(["Name", "Qty"])).toEqual([
      { name: "Name", title: "Name", cellType: "text", choices: [] },
      { name: "Qty", title: "Qty", cellType: "text", choices: [] },
    ]);
  });

  it("maps declared cell types", () => {
    const cols = columnsOf([
      { name: "a", title: "A", cellType: "number" },
      { name: "b", title: "B", cellType: "dropdown", choices: ["x"] },
      { name: "c", title: "C", cellType: "boolean" },
      { name: "d", title: "D", cellType: "date" },
    ]);
    expect(cols.map((c) => c.cellType)).toEqual(["number", "select", "boolean", "date"]);
    expect(cols[1].choices).toEqual([{ value: "x", text: "x" }]);
  });

  it("infers a select when a column has choices but no declared type", () => {
    expect(columnsOf([{ name: "a", title: "A", choices: ["x", "y"] }])[0].cellType).toBe("select");
  });

  it("defaults an unrecognised cell type to text", () => {
    expect(columnsOf([{ name: "a", title: "A", cellType: "colorpicker" }])[0].cellType).toBe("text");
  });
});

describe("parseForm — formulas", () => {
  it("prefers the custom _expression over the native one", () => {
    const json = {
      pages: [
        {
          name: "p",
          elements: [{ type: "expression", name: "total", _expression: "{a}+{b}", expression: "{stale}" }],
        },
      ],
    };
    expect(q(json, "total").expression).toBe("{a}+{b}");
  });

  it("falls back to the native expression when there is no _expression", () => {
    const json = { pages: [{ name: "p", elements: [{ type: "expression", name: "total", expression: "{a}" }] }] };
    expect(q(json, "total").expression).toBe("{a}");
  });

  it("reads the display style and precision", () => {
    const json = {
      pages: [
        {
          name: "p",
          elements: [
            {
              type: "expression",
              name: "total",
              _expression: "{a}",
              displayStyle: "currency",
              currency: "MYR",
              maximumFractionDigits: 3,
            },
          ],
        },
      ],
    };
    expect(q(json, "total").displayStyle).toBe("currency");
    expect(q(json, "total").currency).toBe("MYR");
    expect(q(json, "total").decimals).toBe(3);
  });
});

describe("parseForm — repeaters", () => {
  it("reads template elements without treating them as form questions", () => {
    const form = parseForm({
      pages: [
        {
          name: "p",
          elements: [
            {
              type: "paneldynamic",
              name: "trips",
              templateElements: [
                { type: "text", name: "city" },
                { type: "text", name: "nights" },
              ],
            },
          ],
        },
      ],
    });
    const repeater = form.pages[0].elements[0];
    expect(repeater.kind).toBe("repeater");
    expect(repeater.elements.map((e) => e.name)).toEqual(["city", "nights"]);
    // The array lives under `trips`; the template fields are not top-level keys.
    expect([...form.byName.keys()]).toEqual(["trips"]);
  });
});

describe("parseForm — conditions and validators", () => {
  it("carries visibleIf and enableIf through unchanged", () => {
    const json = {
      pages: [
        {
          name: "p",
          elements: [{ type: "text", name: "x", visibleIf: "{a} = 'y'", enableIf: "{b} notempty" }],
        },
      ],
    };
    expect(q(json, "x").visibleIf).toBe("{a} = 'y'");
    expect(q(json, "x").enableIf).toBe("{b} notempty");
  });

  it("reads validators, ignoring malformed entries", () => {
    const json = {
      pages: [
        {
          name: "p",
          elements: [
            {
              type: "text",
              name: "x",
              validators: [{ type: "regex", regex: "^\\d+$", text: "Digits only" }, null, "nonsense"],
            },
          ],
        },
      ],
    };
    expect(q(json, "x").validators).toEqual([
      { type: "regex", text: "Digits only", regex: "^\\d+$", minValue: undefined, maxValue: undefined, minLength: undefined, maxLength: undefined },
    ]);
  });
});

describe("autocapitalize", () => {
  it("reads the rule, flattening 'none' and anything unrecognised to off", () => {
    const build = (mode: unknown) => ({
      pages: [{ name: "p", elements: [{ type: "text", name: "x", autocapitalize: mode }] }],
    });
    expect(q(build("words"), "x").autocapitalize).toBe("words");
    expect(q(build("CHARACTERS"), "x").autocapitalize).toBe("characters");
    expect(q(build("none"), "x").autocapitalize).toBe("");
    expect(q(build("shouting"), "x").autocapitalize).toBe("");
    expect(q(build(undefined), "x").autocapitalize).toBe("");
  });

  it("capitalises the way the SurveyJS build did", () => {
    expect(applyAutocapitalize("words", "ali bin ahmad")).toBe("Ali Bin Ahmad");
    expect(applyAutocapitalize("sentences", "one thing. then another")).toBe("One thing. Then another");
    expect(applyAutocapitalize("characters", "mykad")).toBe("MYKAD");
    expect(applyAutocapitalize("", "left alone")).toBe("left alone");
  });

  it("leaves a half-typed word alone rather than fighting the caret", () => {
    // Each keystroke re-runs the transform, so what matters is that applying it
    // to its own output does not keep changing the text.
    const once = applyAutocapitalize("words", "ali b");
    expect(once).toBe("Ali B");
    expect(applyAutocapitalize("words", once)).toBe(once);
  });
});
