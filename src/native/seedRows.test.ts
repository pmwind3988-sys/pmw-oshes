import { describe, expect, it } from "vitest";
import { parseForm } from "./schema";
import { seedForForm } from "./useNativeForm";

/**
 * Opening a stored record in the read-only renderer.
 *
 * A repeater and a table both hold an array of rows, and their controls read
 * one — but only a MultiChoice column takes an array, and a table is neither,
 * so the response list holds those rows as JSON text. Seeding the text straight
 * through left both controls with nothing they could read as rows, and a permit
 * opened in the response viewer showed no crew at all.
 */

const form = parseForm({
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "location", title: "Location of work" },
        {
          type: "paneldynamic",
          name: "workPerformers",
          title: "Work performers",
          templateElements: [
            { type: "text", name: "performerName", title: "Name of work performer" },
          ],
        },
        {
          type: "dynamicmatrix",
          name: "readings",
          title: "Gas readings",
          columns: [{ name: "point", title: "Point" }],
        },
      ],
    },
  ],
});

const performers = [{ performerName: "Ali bin Osman" }, { performerName: "Ah Meng" }];

describe("seedForForm", () => {
  it("reads a repeater's rows out of the JSON its column stored", () => {
    expect(seedForForm(form, { workPerformers: JSON.stringify(performers) }).workPerformers).toEqual(performers);
  });

  it("reads a table's rows out of the JSON its column stored", () => {
    const rows = [{ point: "Manhole A" }];
    expect(seedForForm(form, { readings: JSON.stringify(rows) }).readings).toEqual(rows);
  });

  it("leaves rows that already arrived as rows alone", () => {
    expect(seedForForm(form, { workPerformers: performers }).workPerformers).toBe(performers);
  });

  it("leaves a plain answer alone, JSON-looking or not", () => {
    const seed = { location: "Berth 3", workPerformers: "not json" };
    const seeded = seedForForm(form, seed);

    expect(seeded.location).toBe("Berth 3");
    // Nothing readable as rows, so the stored text is kept rather than lost.
    expect(seeded.workPerformers).toBe("not json");
  });

  it("does not touch a scalar question that happens to hold JSON", () => {
    expect(seedForForm(form, { location: '{"a":1}' }).location).toBe('{"a":1}');
  });
});
