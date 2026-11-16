import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL_PREFS, parsePortalPrefs } from "./portalPrefs";

describe("parsePortalPrefs", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(parsePortalPrefs(null)).toEqual(DEFAULT_PORTAL_PREFS);
  });

  it("keeps a landing page that still exists", () => {
    expect(parsePortalPrefs(JSON.stringify({ startScreen: "subs" })).startScreen).toBe("subs");
  });

  it("falls back to Home for a landing page that is no longer a screen", () => {
    expect(parsePortalPrefs(JSON.stringify({ startScreen: "queue" })).startScreen).toBe("home");
    expect(parsePortalPrefs(JSON.stringify({ startScreen: "today" })).startScreen).toBe("home");
  });

  it("falls back to Home when the stored value is not readable", () => {
    expect(parsePortalPrefs("{not json").startScreen).toBe("home");
  });
});
