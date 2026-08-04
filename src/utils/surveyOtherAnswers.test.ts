import { describe, it, expect } from "vitest";
import { foldOtherAnswers } from "./surveyOtherAnswers";

describe("foldOtherAnswers", () => {
  it("replaces a single-select 'other' with what the respondent typed", () => {
    const data = { Hazard: "other", "Hazard-Comment": "Loose floor tile" };
    expect(foldOtherAnswers(data)).toEqual({ Hazard: "Loose floor tile" });
  });

  it("replaces 'other' inside a checkbox array and keeps the listed choices", () => {
    const data = {
      Ppe: ["Helmet", "other", "Gloves"],
      "Ppe-Comment": "Face shield",
    };
    expect(foldOtherAnswers(data)).toEqual({
      Ppe: ["Helmet", "Face shield", "Gloves"],
    });
  });

  it("leaves a showCommentArea note alone when the answer is a real choice", () => {
    const data = { Hazard: "Slip", "Hazard-Comment": "Near the loading bay" };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Slip",
      "Hazard-Comment": "Near the loading bay",
    });
  });

  it("drops an empty other comment rather than writing whitespace", () => {
    const data = { Hazard: "other", "Hazard-Comment": "   " };
    expect(foldOtherAnswers(data)).toEqual({ Hazard: "other" });
  });

  it("ignores a comment key with no matching question", () => {
    const data = { "Orphan-Comment": "stray" };
    expect(foldOtherAnswers(data)).toEqual({ "Orphan-Comment": "stray" });
  });

  it("leaves ordinary submissions untouched", () => {
    const data = { Hazard: "Slip", Ppe: ["Helmet"], Count: 3, Signed: true };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Slip",
      Ppe: ["Helmet"],
      Count: 3,
      Signed: true,
    });
  });

  it("folds several questions in one pass", () => {
    const data = {
      Hazard: "other",
      "Hazard-Comment": "Loose tile",
      Ppe: ["other"],
      "Ppe-Comment": "Face shield",
      Area: "Warehouse",
    };
    expect(foldOtherAnswers(data)).toEqual({
      Hazard: "Loose tile",
      Ppe: ["Face shield"],
      Area: "Warehouse",
    });
  });
});
