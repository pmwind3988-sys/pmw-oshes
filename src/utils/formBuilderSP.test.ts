import { describe, expect, it } from "vitest";

import {
  SP_FIELD_KIND,
  coerceForColumnKind,
  unsavableAnswerReason,
  createSharePointColumnKeyResolver,
  createSharePointColumnKindResolver,
  createSharePointMultiValueResolver,
} from "./formBuilderSP";

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

describe("an answer written to a typed SharePoint column", () => {
  it("sends a Yes/No answer as a real true or false, never as text", () => {
    for (const yes of [true, "true", "True", "yes", "1", 1, "Accepted"]) expect(coerceForColumnKind(yes, SP_FIELD_KIND.boolean)).toBe(true);
    for (const no of [false, "false", "No", "0", 0]) expect(coerceForColumnKind(no, SP_FIELD_KIND.boolean)).toBe(false);
    expect(coerceForColumnKind("", SP_FIELD_KIND.boolean)).toBeNull();
  });

  it("sends a number as a number, and a blank number as empty", () => {
    expect(coerceForColumnKind("12.5", SP_FIELD_KIND.number)).toBe(12.5);
    expect(coerceForColumnKind("", SP_FIELD_KIND.number)).toBeNull();
  });

  it("leaves text columns, and values it cannot read, exactly as they were", () => {
    expect(coerceForColumnKind("true", SP_FIELD_KIND.text)).toBe("true");
    expect(coerceForColumnKind("maybe", SP_FIELD_KIND.boolean)).toBe("maybe");
    expect(coerceForColumnKind("true", undefined)).toBe("true");
  });

  it("finds a column's type by any of its names", () => {
    const kindOf = createSharePointColumnKindResolver([
      { Title: "Hot Work", InternalName: "hotWork", EntityPropertyName: "hotWork", FieldTypeKind: SP_FIELD_KIND.boolean },
    ]);
    expect(kindOf("hotWork")).toBe(SP_FIELD_KIND.boolean);
    expect(kindOf("Hot Work")).toBe(SP_FIELD_KIND.boolean);
    expect(kindOf("missing")).toBeUndefined();
  });
});

describe("an answer SharePoint would refuse", () => {
  it("is caught before posting, with a reason a person can act on", () => {
    expect(unsavableAnswerReason("N/A", SP_FIELD_KIND.boolean)).toMatch(/Yes or No/);
    expect(unsavableAnswerReason("twelve", SP_FIELD_KIND.number)).toMatch(/number/);
  });

  it("lets through anything the column will take", () => {
    expect(unsavableAnswerReason(true, SP_FIELD_KIND.boolean)).toBe("");
    expect(unsavableAnswerReason(null, SP_FIELD_KIND.boolean)).toBe("");
    expect(unsavableAnswerReason(4, SP_FIELD_KIND.number)).toBe("");
    expect(unsavableAnswerReason("anything", SP_FIELD_KIND.text)).toBe("");
  });
});
