import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReadOnlySubmissionPreview from "./ReadOnlySubmissionPreview";

/**
 * What an approver is shown of the submission they are deciding on.
 *
 * This is the strictest of the three readers, because a signature is being
 * asked for against what is on the screen. Two things used to be withheld from
 * it: a repeating panel, which was printed as the JSON its column holds rather
 * than as the list of people it is; and any answer the published version has no
 * question for, which was dropped outright — so a question added or renamed
 * after publication was signed off without ever being read.
 */

const surveyJson = {
  title: "Permit To Work",
  pages: [
    {
      name: "page1",
      title: "Work details",
      elements: [
        { type: "text", name: "location", title: "Location of work" },
        {
          type: "paneldynamic",
          name: "workPerformers",
          title: "Work performers",
          templateElements: [
            { type: "radiogroup", name: "performerType", title: "Internal / external", choices: ["Internal", "External"] },
            { type: "text", name: "performerName", title: "Name of work performer" },
          ],
        },
      ],
    },
  ],
};

const performers = [
  { performerType: "Internal", performerName: "Ali bin Osman" },
  { performerType: "External", performerName: "Ah Meng" },
];

function render(data: Record<string, unknown>): string {
  return renderToStaticMarkup(<ReadOnlySubmissionPreview surveyJson={surveyJson} data={data} />);
}

describe("ReadOnlySubmissionPreview", () => {
  it("draws a repeating panel as a table of its entries", () => {
    const markup = render({ location: "Berth 3", workPerformers: performers });

    expect(markup).toContain("Work performers");
    expect(markup).toContain("Name of work performer");
    expect(markup).toContain("Ali bin Osman");
    expect(markup).toContain("Ah Meng");
    expect(markup).not.toContain("performerName");
  });

  it("draws it the same way from the JSON a text column stored", () => {
    const markup = render({ location: "Berth 3", workPerformers: JSON.stringify(performers) });

    expect(markup).toContain("Ali bin Osman");
    expect(markup).not.toContain("performerName");
  });

  it("shows an answer the published version has no question for", () => {
    const markup = render({ location: "Berth 3", HotWorkPermitNo: "HW-2026-114" });

    expect(markup).toContain("HW-2026-114");
  });

  it("does not repeat a matrix by way of the markup stored beside it", () => {
    const markup = render({ location: "Berth 3", readings_Response: "<table><tr><td>0 LEL</td></tr></table>" });

    expect(markup).not.toContain("readings_Response");
  });
});
