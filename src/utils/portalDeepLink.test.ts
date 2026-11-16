import { describe, expect, it } from "vitest";
import { readPortalDeepLink } from "./portalDeepLink";

describe("readPortalDeepLink", () => {
  it("reads a screen, a form and an item from the address", () => {
    expect(readPortalDeepLink("?screen=subs&form=Permit%20to%20Work&item=42")).toEqual({
      screen: "subs",
      form: "Permit to Work",
      item: "42",
    });
  });

  it("reads a submissions scope when one is named", () => {
    expect(readPortalDeepLink("?screen=subs&scope=needs")).toEqual({ screen: "subs", scope: "needs" });
  });

  it("ignores a screen the portal no longer has", () => {
    expect(readPortalDeepLink("?screen=queue")).toEqual({});
    expect(readPortalDeepLink("?screen=nonsense")).toEqual({});
  });

  it("ignores an unknown scope but keeps the rest", () => {
    expect(readPortalDeepLink("?screen=subs&scope=everything")).toEqual({ screen: "subs" });
  });

  it("returns nothing for an empty address", () => {
    expect(readPortalDeepLink("")).toEqual({});
  });
});
