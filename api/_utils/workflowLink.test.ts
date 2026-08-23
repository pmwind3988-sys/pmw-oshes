import { describe, expect, it } from "vitest";
import { buildWorkflowReviewLink, workflowRoutePrefix } from "./workflowLink.js";

const base = {
  baseUrl: "https://forms.example.com",
  formSlug: "leave-application",
  responseItemId: 42,
  layerNumber: 3,
};

describe("workflowRoutePrefix", () => {
  it("sends evaluation layers to /eval and everything else to /approval", () => {
    expect(workflowRoutePrefix("evaluation")).toBe("eval");
    expect(workflowRoutePrefix("approval")).toBe("approval");
  });

  it("falls back to /approval for an unset or unrecognised layer type", () => {
    expect(workflowRoutePrefix(undefined)).toBe("approval");
    expect(workflowRoutePrefix("")).toBe("approval");
  });
});

describe("buildWorkflowReviewLink", () => {
  it("labels an approval layer's M365 link /approval", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "approval",
      authMode: "365",
      publicToken: undefined,
    })).toBe("https://forms.example.com/approval/leave-application/42/3");
  });

  it("labels an evaluation layer's M365 link /eval", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "evaluation",
      authMode: "365",
      publicToken: undefined,
    })).toBe("https://forms.example.com/eval/leave-application/42/3");
  });

  // The token form hard-fails without ?item= — EvaluationPage reports "Missing
  // response item ID." and cannot submit. Dropping it turns a live approval
  // link into a dead one, so it is pinned here.
  it("keeps ?item= on the public token form", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "approval",
      authMode: "public",
      publicToken: "tok-abc123",
    })).toBe("https://forms.example.com/approval/tok-abc123?item=42");
  });

  // The id says which record to fetch; `k` is what proves the link was issued
  // for it. Drop it and the far end refuses rather than opening the record.
  it("carries the submission's own link token on the public form", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "approval",
      authMode: "public",
      publicToken: "tok-abc123",
      linkToken: "item-tok-9f2",
    })).toBe("https://forms.example.com/approval/tok-abc123?item=42&k=item-tok-9f2");
  });

  it("escapes a link token that would otherwise break the query string", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "approval",
      authMode: "public",
      publicToken: "tok-abc123",
      linkToken: "a&b=c",
    })).toBe("https://forms.example.com/approval/tok-abc123?item=42&k=a%26b%3Dc");
  });

  it("leaves the M365 form alone — it is not reached by token at all", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "approval",
      authMode: "365",
      publicToken: undefined,
      linkToken: "item-tok-9f2",
    })).toBe("https://forms.example.com/approval/leave-application/42/3");
  });

  it("uses the slug form when the layer is public but has no token issued", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      layerType: "evaluation",
      authMode: "public",
      publicToken: "   ",
    })).toBe("https://forms.example.com/eval/leave-application/42/3");
  });

  it("escapes slugs and tokens that would otherwise break the path", () => {
    expect(buildWorkflowReviewLink({
      ...base,
      formSlug: "annual leave/2026",
      layerType: "approval",
      authMode: "365",
      publicToken: undefined,
    })).toBe("https://forms.example.com/approval/annual%20leave%2F2026/42/3");
  });
});
