import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, draftKey, draftLabel, missingFields, missingLabel, severityWarns } from "./portalDraft";
import { formatAuditWhen, formatHours } from "./portalTime";

describe("draft persistence", () => {
  it("namespaces the key per form so two half-finished reports cannot collide", () => {
    expect(draftKey("Incident Report")).not.toBe(draftKey("Near-Miss Report"));
    expect(draftKey("")).toBe("pmw-oshes-draft-v2:default");
  });

  it("moves the indicator from seconds to minutes", () => {
    const now = Date.UTC(2026, 6, 30, 12, 0, 0);
    expect(draftLabel(0, now)).toBe("Saves as you type");
    expect(draftLabel(now - 12_000, now)).toBe("Draft saved 12s ago");
    expect(draftLabel(now - 180_000, now)).toBe("Draft saved 3 min ago");
  });
});

describe("completeness", () => {
  it("names everything still missing, in the order it is asked", () => {
    expect(missingFields(EMPTY_DRAFT, true)).toEqual(["where it happened", "the outcome", "what happened"]);
    expect(missingLabel(missingFields(EMPTY_DRAFT, true))).toBe(
      "Still needed: where it happened, the outcome, what happened.",
    );
  });

  it("does not ask for an outcome on a form that does not capture one", () => {
    expect(missingFields({ ...EMPTY_DRAFT, location: "Jetty 3", description: "Spill" }, false)).toEqual([]);
  });

  it("warns before submit only for serious or worse", () => {
    expect(severityWarns("Major · LTI")).toBe(true);
    expect(severityWarns("Serious")).toBe(true);
    expect(severityWarns("Minor")).toBe(false);
    expect(severityWarns("")).toBe(false);
  });
});

describe("time formatting", () => {
  it("reads as minutes, hours then days", () => {
    expect(formatHours(0.7)).toBe("42 min");
    expect(formatHours(6)).toBe("6 h");
    expect(formatHours(27)).toBe("1 d 3 h");
    expect(formatHours(48)).toBe("2 d");
  });

  it("labels the audit trail relative to today", () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 14);
    expect(formatAuditWhen(today)).toBe("Today 09:14");

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatAuditWhen(yesterday)).toBe("Yest. 09:14");
  });
});
