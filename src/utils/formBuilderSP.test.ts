import { describe, expect, it } from "vitest";

import { createSharePointColumnKeyResolver } from "./formBuilderSP";

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
