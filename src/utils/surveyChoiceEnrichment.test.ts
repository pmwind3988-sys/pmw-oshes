import { describe, expect, it } from "vitest";

import { enrichSurveyJsonChoices } from "./surveyChoiceEnrichment";

describe("enrichSurveyJsonChoices", () => {
  it("loads SharePoint-sourced dropdown choices before the read-only preview uses submitted values", async () => {
    const surveyJson = {
      pages: [
        {
          name: "page1",
          elements: [
            {
              type: "dropdown",
              name: "Department",
              choices: [],
              spChoicesSource: { list: "Departments", column: "Title" },
            },
          ],
        },
      ],
    };

    const enriched = await enrichSurveyJsonChoices(surveyJson, {
      getSharePointChoices: async (list, column) => (
        list === "Departments" && column === "Title" ? ["Finance", "HR"] : []
      ),
      getFilteredListChoices: async () => [],
    });

    const firstPage = enriched.pages?.[0] as { elements?: { choices?: string[] }[] } | undefined;
    expect(firstPage?.elements?.[0]?.choices).toEqual(["Finance", "HR"]);
    expect(surveyJson.pages[0].elements[0].choices).toEqual([]);
  });

  it("loads SharePoint-sourced choices for nested panels and matrix columns", async () => {
    const surveyJson = {
      pages: [
        {
          name: "page1",
          elements: [
            {
              type: "panel",
              name: "panel1",
              elements: [
                {
                  type: "radiogroup",
                  name: "Location",
                  choices: [],
                  spFilteredListSource: { list: "Locations", valueColumn: "Name" },
                },
              ],
            },
            {
              type: "dynamicmatrix",
              name: "Assets",
              columns: [
                {
                  name: "Category",
                  cellType: "dropdown",
                  choices: [],
                  choicesSource: { list: "Asset Categories", column: "Title" },
                },
              ],
            },
          ],
        },
      ],
    };

    const enriched = await enrichSurveyJsonChoices(surveyJson, {
      getSharePointChoices: async () => ["Laptop", "Phone"],
      getFilteredListChoices: async () => ["Kuala Lumpur", "Penang"],
    });

    const firstPage = enriched.pages?.[0] as {
      elements?: {
        elements?: { choices?: string[] }[];
        columns?: { choices?: string[] }[];
      }[];
    } | undefined;

    expect(firstPage?.elements?.[0]?.elements?.[0]?.choices).toEqual(["Kuala Lumpur", "Penang"]);
    expect(firstPage?.elements?.[1]?.columns?.[0]?.choices).toEqual(["Laptop", "Phone"]);
  });
});
