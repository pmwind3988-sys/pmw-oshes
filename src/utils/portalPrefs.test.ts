import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL_PREFS, parsePortalPrefs, startScreenOf } from "./portalPrefs";

describe("startScreenOf", () => {
  it("keeps Home and Submissions and maps everything else to Home", () => {
    expect(startScreenOf("home")).toBe("home");
    expect(startScreenOf("subs")).toBe("subs");
    expect(startScreenOf("manage")).toBe("home");
    expect(startScreenOf(undefined)).toBe("home");
  });
});

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

  it("opens on Home for a Manage page, since Account offers only Your work and Submissions", () => {
    expect(parsePortalPrefs(JSON.stringify({ startScreen: "manage" })).startScreen).toBe("home");
    expect(parsePortalPrefs(JSON.stringify({ startScreen: "people" })).startScreen).toBe("home");
  });

  it("falls back to Home when the stored value is not readable", () => {
    expect(parsePortalPrefs("{not json").startScreen).toBe("home");
  });
});

describe("submissions view preferences", () => {
  it("defaults to the list view with 25 rows a page", () => {
    const prefs = parsePortalPrefs(null);
    expect(prefs.subsView).toBe("list");
    expect(prefs.pageSize).toBe(25);
  });

  it("keeps a stored board view and page size", () => {
    const prefs = parsePortalPrefs(JSON.stringify({ subsView: "board", pageSize: 50 }));
    expect(prefs.subsView).toBe("board");
    expect(prefs.pageSize).toBe(50);
  });

  it("falls back to the defaults for an unknown view or a page size the pager does not offer", () => {
    const prefs = parsePortalPrefs(JSON.stringify({ subsView: "kanban", pageSize: 10 }));
    expect(prefs.subsView).toBe("list");
    expect(prefs.pageSize).toBe(25);
    expect(parsePortalPrefs(JSON.stringify({ pageSize: "50" })).pageSize).toBe(25);
  });
});
