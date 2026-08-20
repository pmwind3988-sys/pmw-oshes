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

/**
 * What a record shows is the form that was published: the questions it asked
 * and the answers given to them. A SharePoint list item carries more than that
 * — content type ids, author ids, version strings, and any column left behind
 * by an edit to the form — and appending all of it to the end of every record
 * put the list's own bookkeeping in front of an approver as though somebody had
 * answered it.
 */
describe("buildFormSubmissionSections — the form, and only the form", () => {
  const permitSurvey = {
    pages: [
      {
        name: "page1",
        elements: [
          { type: "text", name: "location", title: "Location of work" },
          {
            type: "text",
            name: "workPerformerNameInternalExternal",
            title: "Work Performer Name (Internal / External)",
          },
        ],
      },
    ],
  };

  it("calls an untitled first page the main page rather than page1", () => {
    const sections = buildFormSubmissionSections(permitSurvey, { location: "Berth 3" });

    expect(sections[0].title).toBe("Main Page");
  });

  it("reads an answer filed under the column name SharePoint shortened", () => {
    // A column's internal name stops at 32 characters, so this question's
    // 33-character name loses its last letter on the way into the list.
    const sections = buildFormSubmissionSections(permitSurvey, {
      location: "Berth 3",
      workPerformerNameInternalExterna: "Ali bin Osman",
    });
    const field = onlyField(sections, "workPerformerNameInternalExternal");

    expect(field.label).toBe("Work Performer Name (Internal / External)");
    expect(field.value).toBe("Ali bin Osman");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Main Page");
  });

  it("leaves the list's own bookkeeping off the record", () => {
    const sections = buildFormSubmissionSections(permitSurvey, {
      location: "Berth 3",
      ContentTypeId: "0x0100D1173C4683C8334EB3FC0F631517CFD6",
      OData__UIVersionString: "4.0",
      GUID: "b21ed150-4a30-402f-8a39-38047a113ed1",
    });
    const keys = sections.flatMap((section) => section.fields).map((field) => field.key);

    expect(keys).toEqual(["location"]);
  });

  it("falls back to the stored keys when no schema reached the reader", () => {
    // An old version deleted, or a record read before its form loaded. A
    // readable-but-ugly answer beats an empty record.
    const sections = buildFormSubmissionSections(null, { Staff_x0020_Name: "Ali Bakar" });

    expect(sections.flatMap((section) => section.fields).map((field) => field.key)).toEqual(["Staff_x0020_Name"]);
  });
});
