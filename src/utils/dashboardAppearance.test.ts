import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CHOICE_FIELDS,
  DEFAULT_DASHBOARD_APPEARANCE,
  isAppearanceDirty,
  normalizeDashboardAppearance,
  type DashboardAppearanceSetting,
} from "./dashboardBackgrounds";

/**
 * The Save button in the appearance picker is gated on this predicate, and it
 * shipped once already comparing the draft against the *previewed* setting
 * rather than the saved one — which is the draft itself, so the button was
 * permanently disabled and the theme could not be changed at all.
 *
 * These lock the two properties that failure depended on: that a real change is
 * detected on every field an administrator can touch, and that server-written
 * bookkeeping never counts as one.
 */

const saved: DashboardAppearanceSetting = {
  ...DEFAULT_DASHBOARD_APPEARANCE,
  updatedBy: "someone@marinekita.com",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("isAppearanceDirty", () => {
  it("is false for an untouched draft", () => {
    expect(isAppearanceDirty({ ...saved }, saved)).toBe(false);
  });

  it("ignores who saved it and when", () => {
    const draft = { ...saved, updatedBy: "someone.else@marinekita.com", updatedAt: "2026-09-09T09:09:09.000Z" };
    expect(isAppearanceDirty(draft, saved)).toBe(false);
  });

  it("is insensitive to key order", () => {
    // Rebuilt back to front: same values, different insertion order. A
    // JSON.stringify comparison reports this as changed.
    const draft = Object.fromEntries(
      Object.entries(saved).reverse(),
    ) as unknown as DashboardAppearanceSetting;
    expect(isAppearanceDirty(draft, saved)).toBe(false);
  });

  it.each([
    ["contrastThemeId", "midnight"],
    ["colorThemeId", "magenta"],
    ["fontThemeId", "plex"],
    ["backgroundId", "aurora"],
    ["customImageUrl", "https://example.com/a.jpg"],
    ["customImageSource", "PMW owned asset"],
    ["imageOpacity", 0.9],
  ] as const)("detects a change to %s", (field, value) => {
    expect(isAppearanceDirty({ ...saved, [field]: value }, saved)).toBe(true);
  });

  it("covers every field the picker can edit", () => {
    // If a new choice is added to the record and not to this list, the picker
    // silently stops offering to save it.
    expect([...APPEARANCE_CHOICE_FIELDS].sort()).toEqual(
      Object.keys(DEFAULT_DASHBOARD_APPEARANCE).sort(),
    );
  });
});

describe("normalizeDashboardAppearance", () => {
  it("fills a record that predates the theme columns", () => {
    // What a site provisioned before this feature returns: the background
    // fields only. It must come back as a complete, valid record.
    const result = normalizeDashboardAppearance({
      backgroundId: "clarity",
      customImageUrl: "",
      customImageSource: "",
      imageOpacity: 0.22,
    });
    expect(result.contrastThemeId).toBe("paper");
    expect(result.colorThemeId).toBe("pmw");
    expect(result.fontThemeId).toBe("inter");
    expect(result.backgroundId).toBe("clarity");
  });

  it("drops a custom background with no usable URL", () => {
    const result = normalizeDashboardAppearance({ backgroundId: "custom", customImageUrl: "not-a-url" });
    expect(result.backgroundId).toBe(DEFAULT_DASHBOARD_APPEARANCE.backgroundId);
  });

  it("keeps a custom background that has one", () => {
    const result = normalizeDashboardAppearance({
      backgroundId: "custom",
      customImageUrl: "https://example.com/bg.jpg",
      customImageSource: "Unsplash",
    });
    expect(result.backgroundId).toBe("custom");
  });

  it("rejects an unknown background id", () => {
    const result = normalizeDashboardAppearance({ backgroundId: "wallpaper-of-the-month" });
    expect(result.backgroundId).toBe(DEFAULT_DASHBOARD_APPEARANCE.backgroundId);
  });
});
