import { describe, expect, it } from "vitest";
import { answerColumnName, isReservedColumnName, questionNameForReservedKey } from "./reservedColumns";
import { createQuestionNameResolver, createResponseKeyResolver } from "./responseKeys";
import { collectRecordAttachments } from "./fileAttachments";
import { SP_FIELD_KIND, unsavableAnswerReason } from "./formBuilderSP";

describe("a question named like one of SharePoint's own columns", () => {
  it("is stored in a column of its own", () => {
    expect(isReservedColumnName("attachments")).toBe(true);
    expect(isReservedColumnName("Attachments")).toBe(true);
    expect(answerColumnName("attachments")).toBe("attachments_Answer");
    expect(answerColumnName("supportingDocuments")).toBe("supportingDocuments");
  });

  it("is read back from that column, never from SharePoint's", () => {
    const record = { Attachments: false, attachments_Answer: '["/sites/a/Files/quote.pdf"]' };
    expect(createResponseKeyResolver(record)("attachments")).toBe("attachments_Answer");
    const survey = { pages: [{ elements: [{ type: "file", name: "attachments", title: "Attachments" }] }] };
    expect(collectRecordAttachments(survey, record).map((a) => a.name)).toEqual(["quote.pdf"]);
  });

  it("maps the stored key back to the question, and SharePoint's own column to none", () => {
    const toQuestion = createQuestionNameResolver(["attachments", "location"]);
    expect(toQuestion("attachments_Answer")).toBe("attachments");
    expect(toQuestion("Attachments")).toBeUndefined();
    expect(questionNameForReservedKey("location_Answer")).toBeUndefined();
  });

  it("is refused by name if it ever reaches SharePoint's Attachments column", () => {
    expect(unsavableAnswerReason('["/sites/a/x.pdf"]', 19)).toMatch(/Attachments/);
    expect(unsavableAnswerReason("x", SP_FIELD_KIND.text)).toBe("");
  });
});
