import { describe, it, expect } from "vitest";
import { buildFormSubmissionSections, type FormSubmissionField } from "./formSubmissionLayout";

/**
 * A repeating panel — the builder calls it a "repeater", SurveyJS publishes it
 * as `paneldynamic` — is how a form asks for a list of people: the work
 * performers on a permit, the crew signing on, the attendees at a briefing.
 *
 * Its answer is one array under the panel's own name, and a SharePoint text
 * column stores that array as JSON. Both shapes are tested, because the
 * in-memory submission carries the array and the record read back carries the
 * string, and a record that shows the crew in one place and not the other is
 * the same bug reported twice.
 */
const workPerformerSurvey = {
  pages: [
    {
      name: "page1",
      title: "Work details",
      elements: [
        {
          type: "paneldynamic",
          name: "workPerformers",
          title: "Work performers",
          templateElements: [
            { type: "radiogroup", name: "performerType", title: "Internal / external", choices: ["Internal", "External"] },
            { type: "text", name: "performerName", title: "Name of work performer" },
            { type: "text", name: "startDate", title: "Start date", inputType: "date" },
          ],
        },
      ],
    },
  ],
};

const performerRows = [
  { performerType: "Internal", performerName: "Ali bin Osman", startDate: "2026-08-20" },
  { performerType: "External", performerName: "Ah Meng (Marine Kita Sdn Bhd)", startDate: "2026-08-21" },
];

function onlyField(sections: ReturnType<typeof buildFormSubmissionSections>, key: string): FormSubmissionField {
  const matches = sections.flatMap((section) => section.fields).filter((field) => field.key === key);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe("buildFormSubmissionSections — repeating panels", () => {
  it("lays a repeating panel's answers out as a table, not as unanswered questions", () => {
    const sections = buildFormSubmissionSections(workPerformerSurvey, { workPerformers: performerRows });
    const field = onlyField(sections, "workPerformers");

    expect(field.kind).toBe("matrix");
    expect(field.label).toBe("Work performers");
    expect(field.matrixRows).toEqual(performerRows);
    expect(field.matrixColumns?.map((column) => column.title)).toEqual([
      "Internal / external",
      "Name of work performer",
      "Start date",
    ]);
  });

  it("reads a repeating panel back out of the JSON a text column stored it as", () => {
    const sections = buildFormSubmissionSections(workPerformerSurvey, {
      workPerformers: JSON.stringify(performerRows),
    });

    expect(onlyField(sections, "workPerformers").matrixRows).toEqual(performerRows);
  });

  it("carries a column's cell type through, so a date in a row prints as a date", () => {
    const sections = buildFormSubmissionSections(workPerformerSurvey, { workPerformers: performerRows });
    const columns = onlyField(sections, "workPerformers").matrixColumns ?? [];

    expect(columns.find((column) => column.name === "startDate")?.cellType).toBe("date");
    expect(columns.find((column) => column.name === "performerType")?.choices).toEqual(["Internal", "External"]);
  });

  it("does not print the rows a second time as unlabelled additional data", () => {
    const sections = buildFormSubmissionSections(workPerformerSurvey, { workPerformers: performerRows });

    expect(sections.map((section) => section.title)).not.toContain("Additional data");
  });

  it("still shows what a repeating panel asks when nobody filled it in", () => {
    // The blank record printed for signing by hand: no rows to draw, so the
    // questions themselves are what the page has to carry.
    const sections = buildFormSubmissionSections(workPerformerSurvey, {}, { includeUnansweredFields: true });
    const keys = sections.flatMap((section) => section.fields).map((field) => field.key);

    expect(keys).toEqual(["performerType", "performerName", "startDate"]);
    expect(sections[0].title).toBe("Work performers");
  });

  it("keeps an unreadable stored value rather than dropping it", () => {
    // Not JSON, so there are no rows to draw. Printing it verbatim is the only
    // honest option — silence would report an answered question as unasked.
    const sections = buildFormSubmissionSections(workPerformerSurvey, { workPerformers: "Ali, Ah Meng" });

    expect(onlyField(sections, "workPerformers").value).toBe("Ali, Ah Meng");
  });
});

describe("buildFormSubmissionSections — matrices stored as text", () => {
  const matrixSurvey = {
    pages: [
      {
        name: "page1",
        elements: [
          {
            type: "dynamicmatrix",
            name: "readings",
            title: "Gas readings",
            columns: [
              { name: "point", title: "Point" },
              { name: "lel", title: "LEL %" },
            ],
          },
        ],
      },
    ],
  };

  it("reads matrix rows back out of a JSON string", () => {
    const rows = [{ point: "Manhole A", lel: "0" }, { point: "Manhole B", lel: "2" }];
    const sections = buildFormSubmissionSections(matrixSurvey, { readings: JSON.stringify(rows) });
    const field = onlyField(sections, "readings");

    expect(field.kind).toBe("matrix");
    expect(field.matrixRows).toEqual(rows);
  });
});
