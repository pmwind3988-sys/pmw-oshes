import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswersTab } from "./RecordDetail";
import { describeWorkflow, resolveFormVisibility } from "../../utils/formWorkflow";
import { toPortalRecord } from "../../utils/portalRecords";
import type { CatalogueEntry, Submission, SurveyJson } from "../../types";

/**
 * What the Answers tab shows of a filled-in permit.
 *
 * The tab used to decide whether a field had anything in it by asking a
 * person-name reader for the value's text, and that reader has nothing to say
 * about a list of rows or a stored file — it returned "" for both, and "" was
 * read as "not captured" and the row dropped. A permit's whole crew, and every
 * uploaded document, were missing from the record while sitting in it.
 */

const NOW = new Date("2026-08-20T09:00:00.000Z");

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
        { type: "file", name: "methodStatement", title: "Method statement" },
      ],
    },
  ],
} as unknown as SurveyJson;

function catalogueEntry(): CatalogueEntry {
  const workflow = describeWorkflow([]);
  const visibility = resolveFormVisibility({ masterFormIsPublic: true });
  return {
    listTitle: "Permit To Work",
    code: "PTW",
    name: "Permit To Work",
    slug: "permit-to-work",
    chain: [],
    layers: [],
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays: 0,
    hasSla: false,
    visibility,
    isPublic: visibility.isPublic,
    volume: 1,
    today: 0,
    firstApprover: "",
  };
}

function record(submissionData: Record<string, unknown>) {
  const submission = {
    id: "142",
    submissionId: "142",
    listTitle: "Permit To Work",
    formId: "PTW",
    formVersion: "1",
    title: "Hot work at Berth 3",
    submittedByEmail: "sazali@marinekita.com",
    submittedAt: "2026-08-19T09:00:00.000Z",
    formStatus: "Recorded",
    totalLayers: 0,
    currentLayer: 0,
    layers: [],
    submissionData,
    surveyJson,
  } as unknown as Submission;
  return toPortalRecord(submission, catalogueEntry(), {}, {}, NOW);
}

function render(submissionData: Record<string, unknown>): string {
  return renderToStaticMarkup(<AnswersTab record={record(submissionData)} surveyJson={surveyJson} />);
}

describe("AnswersTab", () => {
  const performers = [
    { performerType: "Internal", performerName: "Ali bin Osman" },
    { performerType: "External", performerName: "Ah Meng" },
  ];

  it("names every work performer a repeating panel collected", () => {
    const markup = render({ location: "Berth 3", workPerformers: performers });

    expect(markup).toContain("Work performers");
    expect(markup).toContain("Ali bin Osman");
    expect(markup).toContain("Ah Meng");
    expect(markup).toContain("Internal");
    expect(markup).toContain("External");
  });

  it("names them just the same when the column stored the rows as JSON", () => {
    const markup = render({ location: "Berth 3", workPerformers: JSON.stringify(performers) });

    expect(markup).toContain("Ali bin Osman");
    expect(markup).toContain("Ah Meng");
    // Drawn as rows, not tipped out as the text of the column that held them.
    expect(markup).not.toContain("performerName");
  });

  it("heads each column with the question the template asked", () => {
    const markup = render({ workPerformers: performers });

    expect(markup).toContain("Name of work performer");
    expect(markup).toContain("Internal / external");
  });

  it("shows a stored file rather than reporting it as not captured", () => {
    const markup = render({
      methodStatement: { Url: "https://pmw.sharepoint.com/docs/ms.pdf", Description: "method-statement.pdf" },
    });

    expect(markup).toContain("method-statement.pdf");
    expect(markup).not.toContain("Not captured");
  });

  it("still says so when a question really was left blank", () => {
    const markup = render({ location: "Berth 3" });

    expect(markup).toContain("Berth 3");
    expect(markup).not.toContain("Work performers");
  });
});
