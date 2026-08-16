import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listChoiceValues, toListChoiceOptions } from "../listChoiceOptions";

describe("toListChoiceOptions without a label column", () => {
  // This is the path every form published before label columns existed takes,
  // so these cases pin the old behaviour rather than describing new behaviour.
  it("returns plain strings, not value/text pairs", () => {
    expect(toListChoiceOptions([{ value: "Penang" }, { value: "Johor" }]))
      .toEqual(["Johor", "Penang"]);
  });

  it("sorts exactly as the flat list did", () => {
    const values = ["banana", "Apple", "cherry", "10", "2"];
    const expected = Array.from(new Set(values)).sort();
    expect(toListChoiceOptions(values.map((value) => ({ value })))).toEqual(expected);
  });

  it("drops blanks and nulls rather than offering an empty option", () => {
    expect(toListChoiceOptions([
      { value: "Penang" },
      { value: "" },
      { value: null },
      { value: undefined },
    ])).toEqual(["Penang"]);
  });

  it("de-duplicates repeated values", () => {
    expect(toListChoiceOptions([{ value: "Penang" }, { value: "Penang" }]))
      .toEqual(["Penang"]);
  });

  it("stringifies non-text cells the way the flat list did", () => {
    expect(toListChoiceOptions([{ value: 10 }, { value: 2 }])).toEqual(["10", "2"]);
  });

  it("treats a label column that is empty on every row as no label column", () => {
    expect(toListChoiceOptions([{ value: "a", label: "" }, { value: "b", label: null }]))
      .toEqual(["a", "b"]);
  });
});

describe("toListChoiceOptions with a label column", () => {
  it("shows the label and stores the value", () => {
    expect(toListChoiceOptions([
      { value: "siti@pmw.com", label: "Siti Nurhaliza" },
      { value: "ali@pmw.com", label: "Ali bin Ahmad" },
    ])).toEqual([
      { value: "ali@pmw.com", text: "Ali bin Ahmad" },
      { value: "siti@pmw.com", text: "Siti Nurhaliza" },
    ]);
  });

  it("sorts by what the person reads, not by the hidden value", () => {
    const options = toListChoiceOptions([
      { value: "zzz@pmw.com", label: "Ali" },
      { value: "aaa@pmw.com", label: "Siti" },
    ]);
    expect(options.map((option) => typeof option === "string" ? option : option.text))
      .toEqual(["Ali", "Siti"]);
  });

  it("falls back to the value for a row whose label is blank", () => {
    // Otherwise that person renders as an unidentifiable empty line.
    expect(toListChoiceOptions([
      { value: "ali@pmw.com", label: "Ali" },
      { value: "raj@pmw.com", label: "" },
    ])).toEqual([
      { value: "ali@pmw.com", text: "Ali" },
      { value: "raj@pmw.com", text: "raj@pmw.com" },
    ]);
  });

  it("keeps two people who share a name as separate options", () => {
    expect(toListChoiceOptions([
      { value: "ali.a@pmw.com", label: "Ali" },
      { value: "ali.b@pmw.com", label: "Ali" },
    ])).toHaveLength(2);
  });

  it("de-duplicates by value, keeping the first label", () => {
    expect(toListChoiceOptions([
      { value: "ali@pmw.com", label: "Ali bin Ahmad" },
      { value: "ali@pmw.com", label: "ALI" },
    ])).toEqual([{ value: "ali@pmw.com", text: "Ali bin Ahmad" }]);
  });

  it("never emits a value the source did not have", () => {
    const options = toListChoiceOptions([{ value: "ali@pmw.com", label: "Ali" }]);
    expect(listChoiceValues(options)).toEqual(["ali@pmw.com"]);
  });
});

describe("listChoiceValues", () => {
  it("reads values out of both shapes, for SharePoint column definitions", () => {
    // A choice column stores what a submission stores, so it must be given the
    // values and never the labels shown beside them.
    expect(listChoiceValues(["Penang", { value: "ali@pmw.com", text: "Ali" }]))
      .toEqual(["Penang", "ali@pmw.com"]);
  });

  it("is empty for an empty list", () => {
    expect(listChoiceValues([])).toEqual([]);
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n").split("\n");

    const client = read("src/utils/listChoiceOptions.ts");
    const server = read("api/_utils/listChoiceOptions.ts");

    expect(server.length).toBe(client.length);
    const differing = client
      .map((line, index) => (line === server[index] ? null : index))
      .filter((index): index is number => index !== null);

    // The guest path and the signed-in path must build identical dropdowns.
    // Anything differing beyond the header means they have drifted.
    expect(differing.length).toBe(1);
    expect(client[differing[0]]).toContain("api/_utils/listChoiceOptions.ts");
  });
});
