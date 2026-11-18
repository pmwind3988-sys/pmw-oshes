import { describe, expect, it } from "vitest";
import { historyStateFor, navFromHistoryState, sameNav, type PortalNav } from "./portalHistory";

const base: PortalNav = {
  screen: "subs",
  focusForm: "Permit to Work",
  focusStatus: null,
  focusSubsScope: "mine",
  focusFiled: null,
  returnTo: null,
  drawerChoice: { ref: null },
  manageView: "overview",
  search: { query: "", at: 0 },
};

describe("portal history", () => {
  it("reads back the page it wrote", () => {
    expect(navFromHistoryState(historyStateFor(base))).toEqual(base);
  });

  it("survives the browser's structured clone of history state", () => {
    expect(navFromHistoryState(structuredClone(historyStateFor(base)))).toEqual(base);
  });

  it("ignores entries the portal did not write", () => {
    expect(navFromHistoryState(null)).toBeNull();
    expect(navFromHistoryState(undefined)).toBeNull();
    expect(navFromHistoryState({ usr: 1 })).toBeNull();
    expect(navFromHistoryState({ portalNav: { screen: "home" } })).toBeNull();
  });

  it("treats equal pages as the same page", () => {
    expect(sameNav(base, { ...base })).toBe(true);
    expect(sameNav(base, { ...base, screen: "home" })).toBe(false);
  });
});
