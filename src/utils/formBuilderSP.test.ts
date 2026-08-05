import { describe, expect, it } from "vitest";

import { createSharePointColumnKeyResolver, createSharePointMultiValueResolver } from "./formBuilderSP";

describe("formBuilderSP column key resolver", () => {
  it("maps long display names to SharePoint REST entity property names", () => {
    const resolveColumnKey = createSharePointColumnKeyResolver([
      {
        Title: "questionsOpportunitiesSeekClarifications",
        InternalName: "questionsOpportunitiesSeekClari",
        StaticName: "questionsOpportunitiesSeekClari",
        EntityPropertyName: "questionsOpportunitiesSeekClari",
      },
    ]);

    expect(resolveColumnKey("questionsOpportunitiesSeekClarifications")).toBe(
      "questionsOpportunitiesSeekClari",
    );
    expect(resolveColumnKey("questionsOpportunitiesSeekClari")).toBe(
      "questionsOpportunitiesSeekClari",
    );
  });
});

// A checkbox question becomes a MultiChoice column. Posting a JSON *string* to
// one fails the whole item create with "An unexpected 'PrimitiveValue' node was
// found ... A 'StartArray' node was expected."
describe("formBuilderSP multi-value column resolver", () => {
  const isMultiValueColumn = createSharePointMultiValueResolver([
    { Title: "PPE Worn", InternalName: "PPE_x0020_Worn", EntityPropertyName: "PPEWorn", TypeAsString: "MultiChoice", FieldTypeKind: 15 },
    { Title: "Reviewers", InternalName: "Reviewers", EntityPropertyName: "Reviewers", TypeAsString: "UserMulti", FieldTypeKind: 20 },
    { Title: "Related", InternalName: "Related", EntityPropertyName: "Related", TypeAsString: "LookupMulti", FieldTypeKind: 7 },
    { Title: "Work Type", InternalName: "WorkType", EntityPropertyName: "WorkType", TypeAsString: "Choice", FieldTypeKind: 6 },
    { Title: "Remarks", InternalName: "Remarks", EntityPropertyName: "Remarks", TypeAsString: "Note", FieldTypeKind: 3 },
    { Title: "Attachments Json", InternalName: "AttachmentsJson", EntityPropertyName: "AttachmentsJson", TypeAsString: "Text", FieldTypeKind: 2 },
  ]);

  it("recognises every multi-value column shape, by any of its names", () => {
    expect(isMultiValueColumn("PPE Worn")).toBe(true);
    expect(isMultiValueColumn("PPEWorn")).toBe(true);
    expect(isMultiValueColumn("PPE_x0020_Worn")).toBe(true);
    expect(isMultiValueColumn("Reviewers")).toBe(true);
    expect(isMultiValueColumn("Related")).toBe(true);
  });

  it("leaves single-value columns alone, so a file-URL list still travels as JSON text", () => {
    expect(isMultiValueColumn("Work Type")).toBe(false);
    expect(isMultiValueColumn("Remarks")).toBe(false);
    expect(isMultiValueColumn("AttachmentsJson")).toBe(false);
    expect(isMultiValueColumn("NotAColumn")).toBe(false);
  });
});
