import { describe, expect, it } from "vitest";
import { legacyRouteTarget, legacyRouteTargetForPath } from "./legacyRoutes";

describe("legacyRouteTarget", () => {
  it("sends a submission or approval link with form and item to that record in the portal", () => {
    expect(legacyRouteTarget("/admin/submissions", "?form=Permit%20to%20Work&item=42")).toBe(
      "/portal?screen=subs&form=Permit%20to%20Work&item=42",
    );
    expect(legacyRouteTarget("/admin/approvals", "?form=Permit%20to%20Work&item=42")).toBe(
      "/portal?screen=subs&form=Permit%20to%20Work&item=42",
    );
  });

  it("sends a submission link without params to the portal's submissions screen", () => {
    expect(legacyRouteTarget("/admin/submissions", "")).toBe("/portal?screen=subs");
    expect(legacyRouteTarget("/admin/approvals", "")).toBe("/portal?screen=subs");
  });

  it("sends a responses link to the submissions screen filtered to that form", () => {
    expect(legacyRouteTarget("/admin/responses/Permit%20to%20Work", "")).toBe(
      "/portal?screen=subs&form=Permit%20to%20Work",
    );
  });

  it("round-trips a form title with spaces through the encoded path", () => {
    const encoded = encodeURIComponent("Permit to Work");
    expect(legacyRouteTarget(`/admin/responses/${encoded}`, "")).toBe(
      `/portal?screen=subs&form=${encoded}`,
    );
  });

  it("sends the legacy dashboards and the old home page to the portal", () => {
    expect(legacyRouteTarget("/admin/dashboard", "")).toBe("/portal");
    expect(legacyRouteTarget("/user/dashboard", "")).toBe("/portal");
    expect(legacyRouteTarget("/adminhomepage", "")).toBe("/portal");
  });

  it("sends the retired approval routing page to Manage", () => {
    expect(legacyRouteTarget("/admin/routing", "")).toBe("/portal?screen=manage");
  });

  it("returns null for anything that is not a legacy route", () => {
    expect(legacyRouteTarget("/portal", "")).toBeNull();
    expect(legacyRouteTarget("/", "")).toBeNull();
  });
});

describe("legacyRouteTargetForPath", () => {
  it("maps a stored sign-in path that includes a query string", () => {
    expect(legacyRouteTargetForPath("/admin/submissions?form=Permit%20to%20Work&item=42")).toBe(
      "/portal?screen=subs&form=Permit%20to%20Work&item=42",
    );
  });

  it("returns null for a stored path that is not legacy", () => {
    expect(legacyRouteTargetForPath("/form/abc")).toBeNull();
  });
});
