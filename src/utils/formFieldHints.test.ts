import { describe, expect, it } from "vitest";
import { findLocationField, findSurveyFieldByHints } from "./formFieldHints";

function survey(elements: Record<string, unknown>[]) {
  return { pages: [{ elements }] };
}

describe("findLocationField", () => {
  it("matches on the field name", () => {
    expect(findLocationField(survey([{ name: "incidentLocation", type: "text" }]))).toBe("incidentLocation");
  });

  it("matches on the question title when the name is opaque", () => {
    expect(findLocationField(survey([{ name: "q7", type: "text", title: "Where did it happen?" }]))).toBe("q7");
  });

  it("finds a field nested inside a panel", () => {
    const json = survey([{ type: "panel", elements: [{ name: "berth", type: "text" }] }]);
    expect(findLocationField(json)).toBe("berth");
  });

  it("returns nothing when the form has no such question", () => {
    expect(findLocationField(survey([{ name: "description", type: "comment" }]))).toBe("");
  });

  it("skips question types a string cannot fill", () => {
    // A signature pad whose title mentions the site must not swallow the value.
    const json = survey([
      { name: "sitePhoto", type: "signaturepad", title: "Site sign-off" },
      { name: "whereItHappened", type: "text" },
    ]);
    expect(findLocationField(json)).toBe("whereItHappened");
  });

  it("survives a form with no pages at all", () => {
    expect(findLocationField(null)).toBe("");
    expect(findLocationField(undefined)).toBe("");
    expect(findLocationField({})).toBe("");
    expect(findLocationField({ pages: "not an array" })).toBe("");
  });
});

describe("findSurveyFieldByHints", () => {
  it("takes the first match in document order, not the best one", () => {
    const json = survey([
      { name: "area", type: "text" },
      { name: "location", type: "text" },
    ]);
    expect(findSurveyFieldByHints(json, ["location", "area"])).toBe("area");
  });

  it("ignores punctuation and case when comparing", () => {
    expect(findSurveyFieldByHints(survey([{ name: "Where_Happened", type: "text" }]), ["wherehappened"])).toBe(
      "Where_Happened",
    );
  });
});
