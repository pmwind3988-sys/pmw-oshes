import { describe, expect, it } from "vitest";
import type { PortalRecord, PortalStatus } from "../types";
import {
  defaultWorkTab,
  emptyWorkCopy,
  pushRecentRef,
  recentlyViewed,
  signOffLabel,
  statusTone,
  visibleWorkTabs,
  workGreeting,
} from "./portalWork";

function record(itemId: string): PortalRecord {
  return { listTitle: "Permit To Work", itemId } as PortalRecord;
}

describe("statusTone", () => {
  it.each<[PortalStatus, string]>([
    ["Past SLA", "waiting"],
    ["In approval", "progress"],
    ["Approved", "done"],
    ["Returned", "returned"],
    ["Rejected", "returned"],
    ["Recorded", "neutral"],
    ["Cancelled", "neutral"],
  ])("maps %s to %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});

describe("defaultWorkTab", () => {
  it("opens Needs you when something is waiting", () => {
    expect(defaultWorkTab(2, false)).toBe("needs");
  });

  it("opens Filed by you when nothing is waiting", () => {
    expect(defaultWorkTab(0, false)).toBe("mine");
  });

  it("never opens Needs you for a read-only account", () => {
    expect(defaultWorkTab(3, true)).toBe("mine");
  });
});

describe("visibleWorkTabs", () => {
  it("hides Needs you from a read-only account", () => {
    expect(visibleWorkTabs(true)).toEqual(["mine", "viewed"]);
  });

  it("shows all three tabs otherwise", () => {
    expect(visibleWorkTabs(false)).toEqual(["needs", "mine", "viewed"]);
  });
});

describe("emptyWorkCopy", () => {
  it("says the Needs you tab is clear", () => {
    expect(emptyWorkCopy("needs").title).toBe("You're all caught up");
  });

  it("invites a first filing on Filed by you", () => {
    expect(emptyWorkCopy("mine").title).toBe("Nothing here yet");
  });

  it("gives the Viewed recently tab its own title", () => {
    expect(emptyWorkCopy("viewed").title).toBe("Nothing viewed yet");
  });
});

describe("signOffLabel", () => {
  it("names a form with no chain as having no sign-off", () => {
    expect(signOffLabel(0)).toBe("No sign-off");
  });

  it("uses the singular for one and the plural otherwise", () => {
    expect(signOffLabel(1)).toBe("1 sign-off");
    expect(signOffLabel(3)).toBe("3 sign-offs");
  });
});

describe("workGreeting", () => {
  it("names the person and says how many forms wait", () => {
    expect(workGreeting("Aina", 2)).toBe("Good morning, Aina. 2 forms are waiting for your signature.");
  });

  it("uses the singular for one waiting form", () => {
    expect(workGreeting("Aina", 1)).toBe("Good morning, Aina. 1 form is waiting for your signature.");
  });

  it("omits the second sentence when nothing is waiting", () => {
    expect(workGreeting("Aina", 0)).toBe("Good morning, Aina.");
  });

  it("drops the name cleanly when there is none", () => {
    expect(workGreeting(null, 0)).toBe("Good morning.");
  });
});

describe("pushRecentRef", () => {
  it("puts the newest reference first", () => {
    expect(pushRecentRef(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("moves a repeated reference to the front rather than duplicating it", () => {
    expect(pushRecentRef(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("keeps only the newest eight", () => {
    const full = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const next = pushRecentRef(full, "9");
    expect(next).toHaveLength(8);
    expect(next[0]).toBe("9");
    expect(next).not.toContain("8");
  });
});

describe("recentlyViewed", () => {
  it("returns the records in the order they were opened", () => {
    const records = [record("1"), record("2"), record("3")];
    const found = recentlyViewed(records, ["Permit To Work::3", "Permit To Work::1"]);
    expect(found.map((item) => item.itemId)).toEqual(["3", "1"]);
  });

  it("skips a reference whose record no longer exists", () => {
    const records = [record("1")];
    const found = recentlyViewed(records, ["Permit To Work::9", "Permit To Work::1"]);
    expect(found.map((item) => item.itemId)).toEqual(["1"]);
  });
});
