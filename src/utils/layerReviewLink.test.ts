import { describe, it, expect } from "vitest";
import type { LayerConfigItem } from "../types";
import { buildLayerReviewLink, describeMissingReviewLink } from "./layerReviewLink";

const BASE = "https://pmw-oshes.vercel.app";

function layer(overrides: Partial<LayerConfigItem>): LayerConfigItem {
  return {
    layerNumber: 2,
    type: "evaluation",
    authMode: "365",
    assignee: { type: "user", value: "a@x.com" },
    ...overrides,
  } as LayerConfigItem;
}

describe("buildLayerReviewLink", () => {
  // The regression: a public layer's notification carried the admin link, which
  // opens a sign-in wall for the outside reviewer it was meant to reach.
  it("addresses a public layer by its token so the link survives forwarding", () => {
    expect(buildLayerReviewLink({
      baseUrl: BASE,
      layer: layer({ authMode: "public", publicToken: "abc123" }),
      formSlug: "oshes-permit-to-work",
      responseItemId: 11,
    })).toBe(`${BASE}/eval/abc123?item=11`);
  });

  it("addresses a 365 layer by the signed-in route", () => {
    expect(buildLayerReviewLink({
      baseUrl: BASE,
      layer: layer({ layerNumber: 3 }),
      formSlug: "oshes-permit-to-work",
      responseItemId: 11,
    })).toBe(`${BASE}/eval/oshes-permit-to-work/11/3`);
  });

  it("never falls back to the signed-in route for a public layer", () => {
    // A public layer without a token is unreachable; a slug does not rescue it.
    expect(buildLayerReviewLink({
      baseUrl: BASE,
      layer: layer({ authMode: "public", publicToken: "  " }),
      formSlug: "oshes-permit-to-work",
      responseItemId: 11,
    })).toBeUndefined();
  });

  it("reports no link when there is nothing to build one from", () => {
    expect(buildLayerReviewLink({ baseUrl: BASE, layer: undefined, formSlug: "s", responseItemId: 1 })).toBeUndefined();
    expect(buildLayerReviewLink({ baseUrl: BASE, layer: layer({}), formSlug: "  ", responseItemId: 1 })).toBeUndefined();
  });

  it("escapes what it puts in the path and tolerates a trailing slash", () => {
    expect(buildLayerReviewLink({
      baseUrl: `${BASE}/`,
      layer: layer({ authMode: "public", publicToken: "a b/c" }),
      formSlug: "s",
      responseItemId: "1 2",
    })).toBe(`${BASE}/eval/a%20b%2Fc?item=1%202`);
  });

  it("explains which fault it is", () => {
    expect(describeMissingReviewLink(layer({ authMode: "public" }))).toMatch(/public link token/);
    expect(describeMissingReviewLink(layer({}))).toMatch(/no slug/);
  });
});
