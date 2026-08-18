import { describe, expect, it } from "vitest";
import {
  answerEntries,
  humanizeChoiceLabel,
  isChoiceField,
  readTicks,
  schemaKey,
  shouldListChoices,
} from "./pdfChoiceMatching";

const NATURE = ["Vehicle / Machinery Work", "Hot Work", "Working at Height", "Confined Space"];

/** The options a reading says were ticked, by label. */
function ticked(value: unknown, choices: unknown[] = NATURE): string[] {
  return readTicks({ type: "checkbox", choices, value })
    .options.filter((option) => option.ticked)
    .map((option) => option.label);
}

describe("splitting a stored answer into the ticks inside it", () => {
  it("takes an array as the ticks themselves", () => {
    expect(answerEntries(["Hot Work", "Confined Space"])).toEqual(["Hot Work", "Confined Space"]);
  });

  it("splits SharePoint's multi-value string", () => {
    expect(answerEntries("Hot Work;#Confined Space")).toEqual(["Hot Work", "Confined Space"]);
  });

  it("opens the envelope a MultiChoice column arrives in, and what is inside it", () => {
    expect(answerEntries({ results: ["Hot Work;#Confined Space"] })).toEqual(["Hot Work", "Confined Space"]);
  });

  it("reads a JSON array that travelled in a text column", () => {
    expect(answerEntries('["Hot Work","Confined Space"]')).toEqual(["Hot Work", "Confined Space"]);
  });

  it("takes the ticked keys of a true/false map, and none of the unticked ones", () => {
    expect(answerEntries({ "Hot Work": true, "Confined Space": false, "Working at Height": "yes" }))
      .toEqual(["Hot Work", "Working at Height"]);
  });

  it("finds nothing in an answer that was never given", () => {
    expect(answerEntries("")).toEqual([]);
    expect(answerEntries([])).toEqual([]);
    expect(answerEntries(null)).toEqual([]);
  });

  it("keeps a tick whose label did not survive submission", () => {
    // Three blank entries are three ticks with lost labels, which is a
    // different claim from a question nobody touched.
    expect(answerEntries(["", "", ""])).toHaveLength(3);
  });
});

describe("matching a tick against the boxes on the form", () => {
  it("matches the label it was stored as", () => {
    expect(ticked(["Hot Work", "Confined Space"])).toEqual(["Hot Work", "Confined Space"]);
  });

  it("matches the value behind a label", () => {
    const choices = [{ value: "helmet", text: "Safety Helmet" }, { value: "gloves", text: "Cotton Gloves" }];
    expect(ticked(["helmet"], choices)).toEqual(["Safety Helmet"]);
  });

  it("matches a spelling that went through a data schema", () => {
    // Same tick, written the way a column name has to be written.
    expect(ticked(["Working_x0020_at_x0020_Height", "confinedSpace", "hot-work"]))
      .toEqual(["Hot Work", "Working at Height", "Confined Space"]);
  });

  it("ignores case and spacing, which carry no meaning in a tick", () => {
    expect(ticked(["  hot work  "])).toEqual(["Hot Work"]);
  });

  it("reads the generated values a form writes when the author typed only labels", () => {
    expect(ticked(["item2", "item4"])).toEqual(["Hot Work", "Confined Space"]);
  });

  it("reads a run of flags set against the boxes in order", () => {
    expect(ticked([false, true, false, true])).toEqual(["Hot Work", "Confined Space"]);
  });

  it("does not re-read a numeric option list as a set of positions", () => {
    // "3" among the options 1..5 is the option 3, not the third option.
    const rated = readTicks({ type: "checkbox", choices: ["1", "2", "3", "4", "5"], value: ["3"] });
    expect(rated.options.filter((option) => option.ticked).map((option) => option.value)).toEqual(["3"]);
  });

  it("keeps an answer the option list does not cover", () => {
    const reading = readTicks({ type: "checkbox", choices: NATURE, value: ["Hot Work", "Rope access"] });
    expect(reading.extras).toEqual(["Rope access"]);
    expect(reading.unresolved).toBe(0);
  });

  it("counts a tick it could not read rather than printing an untouched box", () => {
    const reading = readTicks({ type: "checkbox", choices: NATURE, value: ["", "", ""] });
    expect(reading.unresolved).toBe(3);
    expect(reading.options.every((option) => !option.ticked)).toBe(true);
  });

  it("reads a yes/no question stored as either the flag or the word", () => {
    const label = (value: unknown) => readTicks({ type: "boolean", value })
      .options.filter((option) => option.ticked).map((option) => option.label);
    expect(label(true)).toEqual(["Yes"]);
    expect(label("false")).toEqual(["No"]);
    expect(label("Checked")).toEqual(["Yes"]);
  });
});

describe("the label a box is printed with", () => {
  it("prints what the author typed, untouched", () => {
    expect(humanizeChoiceLabel("Full-body harness")).toBe("Full-body harness");
    expect(humanizeChoiceLabel("SWP/Job Instruction")).toBe("SWP/Job Instruction");
    expect(humanizeChoiceLabel("Dust Mask (N95)")).toBe("Dust Mask (N95)");
    expect(humanizeChoiceLabel("LOTO")).toBe("LOTO");
  });

  it("unpacks a label that never left the data schema", () => {
    expect(humanizeChoiceLabel("Working_x0020_at_x0020_Height")).toBe("Working at Height");
    expect(humanizeChoiceLabel("confinedSpace")).toBe("Confined Space");
  });

  it("reduces every spelling of one option to the same key", () => {
    expect(schemaKey("Working_x0020_at_x0020_height")).toBe(schemaKey("Working at Height"));
    expect(schemaKey("workingAtHeight")).toBe(schemaKey("working-at-height"));
  });
});

describe("which questions are printed as boxes", () => {
  it("prints a multi-select as its boxes even when only one was ticked", () => {
    expect(shouldListChoices({ type: "checkbox", choices: NATURE, value: ["Hot Work"] })).toBe(true);
  });

  it("leaves a one-answer question as a sentence", () => {
    expect(shouldListChoices({ type: "radiogroup", choices: ["Day", "Night"], value: "Day" })).toBe(false);
  });

  it("prints any question whose answer holds several values as boxes", () => {
    expect(shouldListChoices({ type: "dropdown", choices: NATURE, value: ["Hot Work", "Confined Space"] })).toBe(true);
  });

  it("does not bury an answer under forty empty boxes", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Option ${index + 1}`);
    expect(shouldListChoices({ type: "checkbox", choices: many, value: ["Option 3"] })).toBe(false);
  });

  it("knows a question that offers a list from one that does not", () => {
    expect(isChoiceField({ type: "checkbox", choices: NATURE, value: [] })).toBe(true);
    expect(isChoiceField({ type: "boolean", value: true })).toBe(true);
    expect(isChoiceField({ type: "text", value: "Bay 3" })).toBe(false);
  });
});
