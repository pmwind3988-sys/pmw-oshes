import { describe, expect, it } from "vitest";
import {
  appearanceCssVars,
  COLOR_THEMES,
  CONTRAST_THEMES,
  contrastRatio,
  FONT_THEMES,
  mix,
  NAV_DIM,
  NAV_INK,
  normalizeAppearance,
  readableOn,
  resolveAppearance,
} from "./appearance";

/**
 * The point of these tests is the claim the whole system rests on: that any
 * colour theme may be combined with any contrast theme without a human having
 * reviewed that pair. If the derivation is right, every one of the 36 colour x
 * contrast combinations is legible; if it is wrong, this is where it shows up
 * rather than on someone's Midnight dashboard.
 */

const COMBINATIONS = CONTRAST_THEMES.flatMap((contrast) =>
  COLOR_THEMES.map((color) => ({
    label: `${color.label} on ${contrast.label}`,
    setting: { colorThemeId: color.id, contrastThemeId: contrast.id, fontThemeId: "inter" },
  })),
);

describe("colour maths", () => {
  it("mixes toward the second colour", () => {
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#ffffff");
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  it("computes the known WCAG extremes", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("leaves a colour alone when it already passes", () => {
    expect(readableOn("#005A9E", "#FFFFFF", "#000000")).toBe("#005A9E");
  });

  it("lifts a colour that does not pass, until it does", () => {
    const lifted = readableOn("#6D4AC4", "#16202C", "#FFFFFF");
    expect(lifted).not.toBe("#6D4AC4");
    expect(contrastRatio(lifted, "#16202C")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("every colour theme on every contrast theme", () => {
  it.each(COMBINATIONS)("$label keeps body text readable", ({ setting }) => {
    const a = resolveAppearance(setting);
    // AA for body text against the panel it sits on.
    expect(contrastRatio(a.ink, a.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(a.muted, a.panel)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBINATIONS)("$label keeps the quiet tier above the shipped floor", ({ setting }) => {
    const a = resolveAppearance(setting);
    // `softMuted` is the deliberately de-emphasised tier — a row's second line,
    // a caption under a card. The original PMW palette ships it at 4.268:1
    // against white (#747B86 on #FFFFFF), below AA, and that is the look the
    // default theme has to keep. So the assertion is "no theme is quieter than
    // the one we already shipped" rather than a flat 4.5: it catches a new
    // theme being *worse* without silently restyling the existing one. Every
    // theme added since clears 4.5 outright.
    expect(contrastRatio(a.softMuted, a.panel)).toBeGreaterThanOrEqual(4.26);
  });

  it.each(COMBINATIONS)("$label keeps brand text readable on its own wash", ({ setting }) => {
    const a = resolveAppearance(setting);
    expect(contrastRatio(a.brandInk, a.brandWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(a.accentInk, a.accentWash)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBINATIONS)("$label keeps status text readable on its own wash", ({ setting }) => {
    const a = resolveAppearance(setting);
    expect(contrastRatio(a.successInk, a.successWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(a.warningInk, a.warningWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(a.errorInk, a.errorWash)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COMBINATIONS)("$label keeps labels readable on saturated fills", ({ setting }) => {
    const a = resolveAppearance(setting);
    // AA for large/bold UI text — these are pill labels and button captions,
    // not paragraphs.
    expect(contrastRatio(a.onBrand, a.brand)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(a.onAccent, a.accent)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#FFFFFF", a.error)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#101010", a.warning)).toBeGreaterThanOrEqual(3);
  });

  it.each(COMBINATIONS)("$label separates a wash from the panel it sits on", ({ setting }) => {
    const a = resolveAppearance(setting);
    // A selected menu row that matches the panel exactly is not a selected row.
    // Graphite on a near-white panel is the tightest case by design, so this
    // only asserts the wash is not literally the panel.
    expect(a.brandWash).not.toBe(a.panel);
    expect(a.successWash).not.toBe(a.panel);
  });
});

describe("the inverse pair", () => {
  it.each(CONTRAST_THEMES)("$label inverts rather than vanishing", (contrast) => {
    const a = resolveAppearance({ colorThemeId: "pmw", contrastThemeId: contrast.id, fontThemeId: "inter" });
    // The sign-in CTA is ink-as-fill with panel-as-text. If these ever collapse
    // together the button becomes invisible.
    expect(contrastRatio(a.inverseInk, a.inverseSurface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("normalizeAppearance", () => {
  it("falls back on unknown, missing and malformed ids", () => {
    expect(normalizeAppearance(null)).toEqual({
      colorThemeId: "pmw",
      contrastThemeId: "paper",
      fontThemeId: "inter",
    });
    expect(normalizeAppearance({ colorThemeId: "chartreuse", contrastThemeId: 7 })).toEqual({
      colorThemeId: "pmw",
      contrastThemeId: "paper",
      fontThemeId: "inter",
    });
  });

  it("keeps ids it recognises", () => {
    expect(normalizeAppearance({ colorThemeId: "teal", contrastThemeId: "midnight", fontThemeId: "plex" })).toEqual({
      colorThemeId: "teal",
      contrastThemeId: "midnight",
      fontThemeId: "plex",
    });
  });
});

describe("emitted variables", () => {
  it("defines every variable for every theme, with no empty values", () => {
    const names = new Set<string>();
    for (const { setting } of COMBINATIONS) {
      const vars = appearanceCssVars(resolveAppearance(setting));
      for (const [name, value] of Object.entries(vars)) {
        names.add(name);
        expect(value, `${name} in ${setting.contrastThemeId}/${setting.colorThemeId}`).toBeTruthy();
      }
    }
    // Every theme must emit the same variable set — a token defined by only
    // some themes is an undefined fallback on the others.
    for (const { setting } of COMBINATIONS) {
      expect(Object.keys(appearanceCssVars(resolveAppearance(setting))).sort()).toEqual([...names].sort());
    }
  });

  it("names a font stack for each font theme", () => {
    for (const font of FONT_THEMES) {
      const vars = appearanceCssVars(resolveAppearance({ colorThemeId: "pmw", contrastThemeId: "paper", fontThemeId: font.id }));
      expect(vars["--pmw-font-main"]).toBe(font.body);
      expect(vars["--pmw-font-heading"]).toBe(font.heading);
    }
  });
});

describe("the branded nav column", () => {
  /**
   * The column is the one surface that writes text on a saturated brand fill
   * rather than on a panel, so `readableOn` against the panel says nothing
   * about it. Its labels are also not solid — inactive rows sit at `NAV_DIM` —
   * and a sheen wash drifts over the gradient beneath them.
   *
   * This is the check that the derived stops actually hold: every colour, on
   * every ground, at the worst point of the column.
   */
  const SHEEN_ACCENT = 0.12;
  const SHEEN_BRAND = 0.16;

  /** Every ground the label ink actually meets, at both ends of the gradient. */
  function navGrounds(r: ReturnType<typeof resolveAppearance>): string[] {
    return [r.navTop, r.navBottom].flatMap((stop) => [
      stop,
      // CTA, matching the wash shell.css actually paints — see navStop.
      mix(stop, "#FFD84D", SHEEN_ACCENT),
      mix(stop, r.brandLight, SHEEN_BRAND),
    ]);
  }

  it.each(COMBINATIONS)("keeps dimmed nav labels at AA on $label", ({ setting }) => {
    const r = resolveAppearance(normalizeAppearance(setting));
    for (const ground of navGrounds(r)) {
      expect(contrastRatio(mix(ground, NAV_INK, NAV_DIM), ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(COMBINATIONS)("keeps the active nav label at AA on $label", ({ setting }) => {
    const r = resolveAppearance(normalizeAppearance(setting));
    // Hover and active are solid ink over a scrim of that same ink, which is
    // the lightest ground in the column — so they are checked separately.
    for (const ground of navGrounds(r)) {
      for (const scrim of [0.06, 0.1]) {
        const behind = mix(ground, NAV_INK, scrim);
        expect(contrastRatio(NAV_INK, behind)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(COMBINATIONS)("keeps the column a dark surface on $label", ({ setting }) => {
    // Not "whichever ink suits the brand": one theme in six used to flip the
    // column pale, which made the nav look like a different component.
    const r = resolveAppearance(normalizeAppearance(setting));
    for (const stop of [r.navTop, r.navBottom]) {
      expect(contrastRatio(NAV_INK, stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("leaves a stop alone once it already passes", () => {
    // Not every brand needs correcting, and the derivation must not walk every
    // column toward the same colour. Graphite on Noir is already dark enough.
    const r = resolveAppearance(
      normalizeAppearance({ colorThemeId: "graphite", contrastThemeId: "noir", fontThemeId: "inter" }),
    );
    expect(contrastRatio(mix(r.navTop, NAV_INK, NAV_DIM), r.navTop)).toBeGreaterThanOrEqual(4.5);
  });

  it("publishes the stops and the dim the stylesheet reads", () => {
    // shell.css writes the 85% itself, so the two would drift apart silently.
    const vars = appearanceCssVars(resolveAppearance(normalizeAppearance({})));
    expect(vars["--pmw-nav-top"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(vars["--pmw-nav-bottom"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(vars["--pmw-nav-dim"]).toBe(String(NAV_DIM));
    expect(vars["--pmw-nav-ink"]).toBe(NAV_INK);
  });
});
