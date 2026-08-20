import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReadOnlySubmissionPreview from "./ReadOnlySubmissionPreview";

/**
 * What an approver is shown of the submission they are deciding on.
 *
 * This is the strictest of the three readers, because a signature is being
 * asked for against what is on the screen. It shows the published form and only
 * that: a repeating panel drawn as the list of people it is rather than as the
 * JSON its column holds, and every question the form asked — including one whose
 * answer SharePoint filed under a shortened column name, which used to be
 * stranded in a trailing list of keys nobody recognised, next to the list's own
 * content type ids and version strings.
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
          type: "text",
          name: "workPerformerNameInternalExternal",
          title: "Work Performer Name (Internal / External)",
        },
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

  it("shows the questions the form asked and not the list's own bookkeeping", () => {
    const markup = render({
      location: "Berth 3",
      ContentTypeId: "0x0100D1173C4683C8334EB3FC0F631517CFD6",
      OData__UIVersionString: "4.0",
    });

    expect(markup).toContain("Berth 3");
    expect(markup).not.toContain("0x0100D1173C4683C8334EB3FC0F631517CFD6");
    expect(markup).not.toContain("UIVersion");
  });

  it("shows an answer whose column name SharePoint had to shorten", () => {
    const markup = render({ location: "Berth 3", workPerformerNameInternalExterna: "Ali bin Osman" });

    expect(markup).toContain("Work Performer Name (Internal / External)");
    expect(markup).toContain("Ali bin Osman");
    expect(markup).not.toContain("work Performer Name Internal Externa");
  });

  it("calls an untitled first page the main page rather than page1", () => {
    // `page1` is the builder's own bookkeeping, not a heading anybody wrote.
    const untitledPage = { pages: [{ name: "page1", elements: [{ type: "text", name: "location", title: "Location of work" }] }] };
    const markup = renderToStaticMarkup(<ReadOnlySubmissionPreview surveyJson={untitledPage} data={{ location: "Berth 3" }} />);

    expect(markup).toContain("Main Page");
    expect(markup).not.toContain(">page1<");
  });

  it("does not repeat a matrix by way of the markup stored beside it", () => {
    const markup = render({ location: "Berth 3", readings_Response: "<table><tr><td>0 LEL</td></tr></table>" });

    expect(markup).not.toContain("readings_Response");
  });
});
