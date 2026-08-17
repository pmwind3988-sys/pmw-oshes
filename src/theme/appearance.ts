/* ---------------------------------------------------------------------------
   Appearance — three independent axes, one set of CSS variables.

   The design system used to be a single frozen palette (`editorial.ts`) read
   directly by ~50 components. That made every surface consistent and nothing
   adjustable: the only thing an administrator could change was the wallpaper
   behind the panels, which is the one layer that carries no information.

   This module replaces the frozen palette with three axes that vary
   independently:

     contrast — the ground/ink pairing. This is the structural axis: it decides
                what a panel is, what a hairline is, and whether the app is
                light or dark. "Black on White", "Blue on White", "Midnight".
     colour   — the brand hue. Identity and action only; it never decides
                legibility, because every readable pair is derived against the
                contrast theme's own panel rather than assumed.
     font     — the typeface pairing (heading + body + numerals).

   6 x 6 x 5 = 180 combinations, and every one of them is legible, because the
   washes and the "brand text" colours are *computed* against the active
   ground rather than hand-picked for a light one. Hand-picking 180 palettes is
   how a theme system rots; deriving them is how it stays honest.

   ── Two rules this file keeps ────────────────────────────────────────────────

   1. **Status colour is not themeable.** success/warning/error keep their hue
      across every theme, and no colour theme offers an amber or a red accent.
      DESIGN.md's rule stands: red and amber must keep specific meanings —
      overdue, rejected, high severity — or they stop reading as signals. An
      "Ember" brand would make every button look like a warning, so the accents
      on offer are blue, indigo, teal, violet, magenta and graphite. Only the
      *wash* behind a status varies, because a light wash on a dark panel is
      unreadable and has to be recomputed.

   2. **Contrast is verified, not asserted.** `readableOn` walks a colour toward
      the panel (or the ink) until it actually clears the WCAG ratio against the
      surface it will sit on. That is what lets a colour theme and a contrast
      theme be chosen independently without the pair having ever been reviewed
      together.

   Portable by design: this file and `editorial.ts` have no imports from the
   rest of the app, so they can be copied into pmw-hrform verbatim. See the
   porting note in DESIGN.md.
--------------------------------------------------------------------------- */

export type Rgb = readonly [number, number, number];

// ── Colour maths ────────────────────────────────────────────────────────────
// Small and local on purpose. MUI ships `alpha`/`darken`, but they throw on any
// value they cannot parse and they operate in sRGB without a contrast check,
// which is precisely the guarantee this file exists to provide.

function hexToRgb(hex: string): Rgb {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value) || full.length !== 6) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Blend `amount` of `b` into `a`. `mix(x, y, 0)` is x; `mix(x, y, 1)` is y. */
export function mix(a: string, b: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/** Same colour, expressed as an `rgba()` string — for rings, shadows and scrims. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Walk `colour` toward `toward` until it clears `min` contrast against `on`.
 *
 * This is the function that makes an arbitrary colour theme safe on an
 * arbitrary contrast theme. A violet brand at its natural saturation reads
 * fine on white and drops to about 2:1 on the Midnight panel — rather than
 * ship a second hand-tuned violet for dark grounds, the same violet is lifted
 * toward the panel's own ink until it is legible on it.
 *
 * Returns the original colour when it already passes, so light themes keep
 * exactly the hues their designer chose.
 */
export function readableOn(colour: string, on: string, toward: string, min = 4.5): string {
  if (contrastRatio(colour, on) >= min) return colour;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(colour, toward, step / 20);
    if (contrastRatio(candidate, on) >= min) return candidate;
  }
  return toward;
}

/** The better of black or white against `bg` — for text on a saturated fill. */
function inkFor(bg: string, light: string, dark: string): string {
  return contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;
}

// ── Contrast themes ─────────────────────────────────────────────────────────

export interface ContrastTheme {
  id: string;
  label: string;
  /** One line, shown under the swatch — says what the pairing is, not how it feels. */
  note: string;
  dark: boolean;
  ink: string;
  muted: string;
  softMuted: string;
  panel: string;
  canvas: string;
  sunken: string;
  paper: string;
  paperSoft: string;
  border: string;
  borderStrong: string;
  /** The page ground behind the panels, used when no wallpaper is selected. */
  ground: string;
}

export const CONTRAST_THEMES: ContrastTheme[] = [
  {
    id: "paper",
    label: "Ink on Paper",
    note: "Near-black on white, blue-tinted ground",
    dark: false,
    ink: "#101010",
    muted: "#5F646D",
    softMuted: "#747B86",
    panel: "#FFFFFF",
    canvas: "#F6F9FC",
    sunken: "#F1F3F6",
    paper: "#F8FAFC",
    paperSoft: "#F9FBFD",
    border: "#DDE4EC",
    borderStrong: "#111111",
    ground: "linear-gradient(180deg, #EAF5FC 0%, #F7FAFD 48%, #FFFFFF 100%)",
  },
  {
    id: "mono",
    label: "Black on White",
    note: "Pure black on pure white, neutral rules",
    dark: false,
    ink: "#000000",
    muted: "#3D3D3D",
    softMuted: "#5A5A5A",
    panel: "#FFFFFF",
    canvas: "#FFFFFF",
    sunken: "#F2F2F2",
    paper: "#FAFAFA",
    paperSoft: "#FCFCFC",
    // Not #000: a black hairline on every table row and card edge turns a dense
    // submissions table into a grid of boxes. The ink is pure, the rules are not.
    border: "#BDBDBD",
    borderStrong: "#000000",
    ground: "linear-gradient(180deg, #FFFFFF 0%, #F2F2F2 100%)",
  },
  {
    id: "azure",
    label: "Blue on White",
    note: "Deep navy ink on a cool white",
    dark: false,
    ink: "#0B2545",
    muted: "#44607F",
    // 4.8:1 on the panel. The obvious lighter blue-grey lands at 3.96, which is
    // below even the quiet tier's floor — see the softMuted test.
    softMuted: "#5C748F",
    panel: "#FFFFFF",
    canvas: "#EEF5FC",
    sunken: "#E4EFF9",
    paper: "#F4F9FD",
    paperSoft: "#F8FBFE",
    border: "#C7DCEF",
    borderStrong: "#0B2545",
    ground: "linear-gradient(180deg, #DCEAF7 0%, #F0F7FC 52%, #FFFFFF 100%)",
  },
  {
    id: "sepia",
    label: "Warm Paper",
    note: "Brown-black on cream, low glare",
    dark: false,
    ink: "#241F17",
    muted: "#6A5F4E",
    /** 4.9:1 on the cream panel — see the note on Blue on White. */
    softMuted: "#7A6E5A",
    panel: "#FFFDF7",
    canvas: "#F5EFE2",
    sunken: "#EFE7D6",
    paper: "#FAF5EA",
    paperSoft: "#FCF9F1",
    border: "#E2D9C6",
    borderStrong: "#241F17",
    ground: "linear-gradient(180deg, #EFE6D4 0%, #F8F3E8 55%, #FFFDF7 100%)",
  },
  {
    id: "midnight",
    label: "Midnight",
    note: "Soft white on slate, for low light",
    dark: true,
    ink: "#E9EFF7",
    muted: "#A6B4C6",
    softMuted: "#8794A5",
    panel: "#16202C",
    canvas: "#0E1621",
    sunken: "#111B26",
    paper: "#16202C",
    paperSoft: "#1A2531",
    border: "#2A3646",
    borderStrong: "#4A5A6E",
    ground: "linear-gradient(180deg, #0B131C 0%, #0E1621 55%, #131E2A 100%)",
  },
  {
    id: "noir",
    label: "White on Black",
    note: "Maximum contrast, inverted",
    dark: true,
    ink: "#FFFFFF",
    muted: "#C8C8C8",
    softMuted: "#A8A8A8",
    panel: "#000000",
    canvas: "#000000",
    sunken: "#101010",
    paper: "#050505",
    paperSoft: "#0A0A0A",
    border: "#4A4A4A",
    borderStrong: "#FFFFFF",
    ground: "linear-gradient(180deg, #000000 0%, #0B0B0B 100%)",
  },
];

// ── Colour themes ───────────────────────────────────────────────────────────

export interface ColorTheme {
  id: string;
  label: string;
  note: string;
  /** Brand: identity, primary action, the active nav rail. */
  main: string;
  dark: string;
  light: string;
  /** Secondary: the role/evaluator register, never an action. */
  accent: string;
  accentDark: string;
}

/**
 * Every accent here is cool or neutral. That is a constraint, not a shortage of
 * ideas: `warning` is amber and `error` is red, and a brand in either family
 * would make an ordinary "Save" button carry the same colour as an overdue
 * approval. See rule 1 at the top of this file.
 */
export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "pmw",
    label: "PMW Blue",
    note: "The house palette",
    main: "#0078D4",
    dark: "#005A9E",
    light: "#2F96DD",
    accent: "#6264A7",
    accentDark: "#4B4D89",
  },
  {
    id: "indigo",
    label: "Indigo",
    note: "Deeper and cooler than the house blue",
    main: "#4F46E5",
    dark: "#3730A3",
    light: "#7C74F0",
    accent: "#0EA5E9",
    accentDark: "#0369A1",
  },
  {
    id: "teal",
    label: "Teal",
    note: "Green-blue, reads calm at density",
    main: "#0D8A8A",
    dark: "#0A6A6A",
    light: "#17A9A5",
    accent: "#6D5BC4",
    accentDark: "#52439C",
  },
  {
    id: "violet",
    label: "Violet",
    note: "Warm purple against a cyan register",
    main: "#6D4AC4",
    dark: "#52379A",
    light: "#8C6FD8",
    accent: "#0E9BB0",
    accentDark: "#0A7386",
  },
  {
    id: "magenta",
    label: "Magenta",
    note: "The loudest option, still clear of error red",
    main: "#B5179E",
    dark: "#8A1179",
    light: "#CB48B8",
    accent: "#4C6EF5",
    accentDark: "#364FC7",
  },
  {
    id: "graphite",
    label: "Graphite",
    note: "Near-monochrome — status colour is the only colour",
    main: "#2F3A45",
    dark: "#1B242C",
    light: "#4C5A68",
    accent: "#6E7B8A",
    accentDark: "#4E5A67",
  },
];

// ── Font themes ─────────────────────────────────────────────────────────────

const SYSTEM_TAIL = '"Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif';

export interface FontTheme {
  id: string;
  label: string;
  note: string;
  heading: string;
  body: string;
  /** Tabular figures for references, counts and timestamps. */
  mono: string;
  /**
   * Google Fonts `family=` segments to load for this theme, or [] for the
   * stacks already on the machine. Loaded on selection rather than up front —
   * the default theme must not pay for the other four.
   */
  families: string[];
}

export const FONT_THEMES: FontTheme[] = [
  {
    id: "inter",
    label: "Inter",
    note: "One family, weight does the work",
    heading: `"Inter", ${SYSTEM_TAIL}`,
    body: `"Inter", ${SYSTEM_TAIL}`,
    mono: `"Inter", ${SYSTEM_TAIL}`,
    families: ["Inter:wght@400;500;600;700;800;900"],
  },
  {
    id: "system",
    label: "Microsoft 365",
    note: "Segoe UI and Aptos — native inside SharePoint, nothing to download",
    heading: SYSTEM_TAIL,
    body: SYSTEM_TAIL,
    mono: SYSTEM_TAIL,
    families: [],
  },
  {
    id: "editorial",
    label: "Editorial Serif",
    note: "Source Serif headings over an Inter body",
    heading: `"Source Serif 4", Georgia, "Times New Roman", serif`,
    body: `"Inter", ${SYSTEM_TAIL}`,
    mono: `"Inter", ${SYSTEM_TAIL}`,
    families: ["Inter:wght@400;500;600;700;800;900", "Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700"],
  },
  {
    id: "grotesk",
    label: "Grotesk",
    note: "Space Grotesk headings, wide and technical",
    heading: `"Space Grotesk", ${SYSTEM_TAIL}`,
    body: `"Inter", ${SYSTEM_TAIL}`,
    mono: `"Space Grotesk", ${SYSTEM_TAIL}`,
    families: ["Inter:wght@400;500;600;700;800;900", "Space+Grotesk:wght@500;600;700"],
  },
  {
    id: "plex",
    label: "IBM Plex",
    note: "Plex Sans throughout, Plex Mono for references",
    heading: `"IBM Plex Sans", ${SYSTEM_TAIL}`,
    body: `"IBM Plex Sans", ${SYSTEM_TAIL}`,
    mono: `"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace`,
    families: ["IBM+Plex+Sans:wght@400;500;600;700", "IBM+Plex+Mono:wght@400;500;600"],
  },
];

// ── The setting ─────────────────────────────────────────────────────────────

export interface AppearanceSetting {
  colorThemeId: string;
  contrastThemeId: string;
  fontThemeId: string;
}

export const DEFAULT_APPEARANCE: AppearanceSetting = {
  colorThemeId: "pmw",
  contrastThemeId: "paper",
  fontThemeId: "inter",
};

export function findColorTheme(id: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
}

export function findContrastTheme(id: string): ContrastTheme {
  return CONTRAST_THEMES.find((t) => t.id === id) ?? CONTRAST_THEMES[0];
}

export function findFontTheme(id: string): FontTheme {
  return FONT_THEMES.find((t) => t.id === id) ?? FONT_THEMES[0];
}

/** Coerce anything — a stale localStorage blob, an API payload — into a valid setting. */
export function normalizeAppearance(value: unknown): AppearanceSetting {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof AppearanceSetting, unknown>>;
  const pick = (candidate: unknown, valid: { id: string }[], fallback: string): string => {
    const id = typeof candidate === "string" ? candidate : "";
    return valid.some((entry) => entry.id === id) ? id : fallback;
  };
  return {
    colorThemeId: pick(raw.colorThemeId, COLOR_THEMES, DEFAULT_APPEARANCE.colorThemeId),
    contrastThemeId: pick(raw.contrastThemeId, CONTRAST_THEMES, DEFAULT_APPEARANCE.contrastThemeId),
    fontThemeId: pick(raw.fontThemeId, FONT_THEMES, DEFAULT_APPEARANCE.fontThemeId),
  };
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** Status hues are fixed across every theme — only their washes are derived. */
const STATUS = {
  success: "#107C10",
  warning: "#B15C00",
  error: "#C62828",
  /** The signal yellow, used as a flat fill on the privacy and guest screens. */
  yellow: "#FFF546",
} as const;

export interface ResolvedAppearance {
  setting: AppearanceSetting;
  color: ColorTheme;
  contrast: ContrastTheme;
  font: FontTheme;
  dark: boolean;

  ink: string;
  muted: string;
  softMuted: string;
  panel: string;
  canvas: string;
  sunken: string;
  paper: string;
  paperSoft: string;
  border: string;
  borderStrong: string;
  ground: string;

  /** Brand, as a fill. Legible under `onBrand`. */
  brand: string;
  brandDark: string;
  brandLight: string;
  /** Brand at wash strength — the active nav row, the selected menu item. */
  brandWash: string;
  brandWashSoft: string;
  brandSoft: string;
  /** Brand as *text*, verified against `brandWash`. Never used as a fill. */
  brandInk: string;
  onBrand: string;

  accent: string;
  accentDark: string;
  accentWash: string;
  accentSoft: string;
  accentInk: string;
  onAccent: string;

  success: string;
  successWash: string;
  successInk: string;
  warning: string;
  warningWash: string;
  warningInk: string;
  error: string;
  errorWash: string;
  errorInk: string;
  yellow: string;
  onYellow: string;

  /** A hard inverted surface — the primary CTA on the sign-in screens. */
  inverseSurface: string;
  inverseInk: string;

  shadow: string;
  shadowHover: string;
  ring: string;

  fontHeading: string;
  fontBody: string;
  fontMono: string;
}

/**
 * Turn a setting into every value the app needs.
 *
 * Washes are mixed *toward the panel* rather than toward white, which is the
 * whole trick: on Midnight the same 8% mix produces a dark blue-slate instead
 * of a pale blue, so a selected menu row stays a selected menu row.
 */
export function resolveAppearance(setting: AppearanceSetting): ResolvedAppearance {
  const color = findColorTheme(setting.colorThemeId);
  const contrast = findContrastTheme(setting.contrastThemeId);
  const font = findFontTheme(setting.fontThemeId);
  const { panel, ink, dark } = contrast;

  // On a dark panel a wash has to be *stronger* to register at all: 8% of a
  // hue over white is clearly tinted, 8% over near-black is still near-black.
  const washAmount = dark ? 0.82 : 0.9;
  const softAmount = dark ? 0.66 : 0.76;

  const wash = (hue: string, amount = washAmount) => mix(hue, panel, amount);
  const soft = (hue: string) => mix(hue, panel, softAmount);

  const brandWash = wash(color.main);
  const accentWash = wash(color.accent);
  const successWash = wash(STATUS.success);
  const warningWash = wash(STATUS.warning);
  const errorWash = wash(STATUS.error);

  // Brand as a fill needs to survive on the *page*, brand as text needs to
  // survive on its own wash. They are different requirements and on dark
  // grounds they pull in opposite directions, which is why they are separate
  // tokens rather than one colour used for both.
  const brand = readableOn(color.main, panel, dark ? "#FFFFFF" : color.dark, 3);
  const accent = readableOn(color.accent, panel, dark ? "#FFFFFF" : color.accentDark, 3);

  return {
    setting,
    color,
    contrast,
    font,
    dark,

    ink,
    muted: contrast.muted,
    softMuted: contrast.softMuted,
    panel,
    canvas: contrast.canvas,
    sunken: contrast.sunken,
    paper: contrast.paper,
    paperSoft: contrast.paperSoft,
    border: contrast.border,
    borderStrong: contrast.borderStrong,
    ground: contrast.ground,

    brand,
    brandDark: dark ? mix(color.light, panel, 0.15) : color.dark,
    brandLight: color.light,
    brandWash,
    brandWashSoft: wash(color.main, dark ? 0.9 : 0.95),
    brandSoft: soft(color.main),
    brandInk: readableOn(dark ? color.light : color.dark, brandWash, ink),
    onBrand: inkFor(brand, "#FFFFFF", "#101010"),

    accent,
    accentDark: dark ? mix(color.accent, panel, 0.15) : color.accentDark,
    accentWash,
    accentSoft: soft(color.accent),
    accentInk: readableOn(dark ? mix(color.accent, "#FFFFFF", 0.35) : color.accentDark, accentWash, ink),
    onAccent: inkFor(accent, "#FFFFFF", "#101010"),

    success: readableOn(STATUS.success, panel, dark ? "#FFFFFF" : "#000000", 3),
    successWash,
    successInk: readableOn(dark ? mix(STATUS.success, "#FFFFFF", 0.45) : STATUS.success, successWash, ink),
    warning: readableOn(STATUS.warning, panel, dark ? "#FFFFFF" : "#000000", 3),
    warningWash,
    warningInk: readableOn(dark ? mix(STATUS.warning, "#FFFFFF", 0.5) : STATUS.warning, warningWash, ink),
    error: readableOn(STATUS.error, panel, dark ? "#FFFFFF" : "#000000", 3),
    errorWash,
    errorInk: readableOn(dark ? mix(STATUS.error, "#FFFFFF", 0.45) : STATUS.error, errorWash, ink),
    yellow: STATUS.yellow,
    onYellow: "#101010",

    inverseSurface: ink,
    inverseInk: panel,

    // Depth is a hairline plus a tinted shadow, per DESIGN.md. On a dark ground
    // a black shadow is invisible, so the shadow darkens toward true black and
    // leans on the ring layer instead.
    shadow: dark
      ? `0 0 0 1px ${withAlpha("#000000", 0.5)}, 0 1px 2px -1px ${withAlpha("#000000", 0.6)}, 0 14px 36px ${withAlpha("#000000", 0.45)}`
      : `0 0 0 1px ${withAlpha("#000000", 0.06)}, 0 1px 2px -1px ${withAlpha("#000000", 0.06)}, 0 14px 36px ${withAlpha(color.dark, 0.08)}`,
    shadowHover: dark
      ? `0 0 0 1px ${withAlpha("#000000", 0.6)}, 0 2px 6px -2px ${withAlpha("#000000", 0.7)}, 0 18px 42px ${withAlpha("#000000", 0.55)}`
      : `0 0 0 1px ${withAlpha("#000000", 0.08)}, 0 2px 6px -2px ${withAlpha("#000000", 0.1)}, 0 18px 42px ${withAlpha(color.dark, 0.12)}`,
    ring: `0 0 0 3px ${withAlpha(color.main, dark ? 0.4 : 0.22)}`,

    fontHeading: font.heading,
    fontBody: font.body,
    fontMono: font.mono,
  };
}

// ── Emission ────────────────────────────────────────────────────────────────

/**
 * The variable names are the contract between this module and `editorial.ts`.
 *
 * Several are kept under their original names (`--pmw-blue`, `--pmw-sky`) even
 * though a magenta theme makes "blue" a lie, because those names are already
 * written into `index.css` and into the styles of components that predate this
 * system. Renaming them buys a tidier vocabulary and costs a silent regression
 * anywhere one was missed; the names stay, the values move.
 */
export function appearanceCssVars(r: ResolvedAppearance): Record<string, string> {
  return {
    "--pmw-ink": r.ink,
    "--pmw-muted": r.muted,
    "--pmw-soft-muted": r.softMuted,
    "--pmw-panel": r.panel,
    "--pmw-canvas": r.canvas,
    "--pmw-sunken": r.sunken,
    "--pmw-paper": r.paper,
    "--pmw-paper-soft": r.paperSoft,
    "--pmw-border": r.border,
    "--pmw-border-strong": r.borderStrong,

    "--pmw-blue": r.brand,
    "--pmw-blue-dark": r.brandDark,
    // The colour theme's hue *before* any correction for the current ground.
    // Consumed by surfaces that run their own light/dark logic and would be
    // wrong to inherit ours — the native form engine, which renders on public
    // routes and in the builder's preview where this app's ground does not
    // apply. Everything inside the app should use the corrected tokens above.
    "--pmw-hue": r.color.main,
    "--pmw-hue-deep": r.color.dark,
    "--pmw-hue-accent": r.color.accent,
    "--pmw-blue-light": r.brandLight,
    "--pmw-blue-soft": r.brandSoft,
    "--pmw-blue-wash": r.brandWash,
    "--pmw-blue-wash-soft": r.brandWashSoft,
    "--pmw-blue-ink": r.brandInk,
    "--pmw-on-blue": r.onBrand,
    // `sky` predates the wash vocabulary and is used as a mid-strength brand
    // tint (progress bars, the idle animation). It tracks the brand, softer.
    "--pmw-sky": mix(r.brand, r.panel, r.dark ? 0.5 : 0.72),
    "--pmw-sky-soft": r.brandWashSoft,

    "--pmw-purple": r.accent,
    "--pmw-purple-dark": r.accentDark,
    "--pmw-purple-soft": r.accentSoft,
    "--pmw-purple-wash": r.accentWash,
    "--pmw-purple-ink": r.accentInk,
    "--pmw-on-purple": r.onAccent,

    "--pmw-success": r.success,
    "--pmw-success-wash": r.successWash,
    "--pmw-success-ink": r.successInk,
    "--pmw-warning": r.warning,
    "--pmw-warning-wash": r.warningWash,
    "--pmw-warning-ink": r.warningInk,
    "--pmw-error": r.error,
    "--pmw-error-wash": r.errorWash,
    "--pmw-error-ink": r.errorInk,
    "--pmw-yellow": r.yellow,
    "--pmw-on-yellow": r.onYellow,

    "--pmw-inverse-surface": r.inverseSurface,
    "--pmw-inverse-ink": r.inverseInk,

    "--pmw-shadow": r.shadow,
    "--pmw-shadow-hover": r.shadowHover,
    "--pmw-ring": r.ring,

    "--pmw-font-main": r.fontBody,
    "--pmw-font-heading": r.fontHeading,
    "--pmw-font-mono": r.fontMono,

    "--app-bg-fallback": r.ground,
  };
}

const FONT_LINK_ID = "pmw-appearance-fonts";

/**
 * Load a font theme's families, once, without blocking first paint.
 *
 * `media="print"` then flipping to `all` on load is the standard way to make a
 * stylesheet non-render-blocking; without it, switching typeface would stall
 * the page on a Google Fonts round trip. The body keeps its previous face for
 * the few hundred milliseconds that takes, which is the correct trade — a
 * momentarily stale font beats a momentarily blank screen.
 *
 * Permitted by the `style-src`/`font-src` entries in the index.html CSP.
 */
function ensureFontsLoaded(font: FontTheme, doc: Document): void {
  const existing = doc.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;

  if (font.families.length === 0) {
    existing?.remove();
    return;
  }

  const href = `https://fonts.googleapis.com/css2?${font.families
    .map((family) => `family=${family}`)
    .join("&")}&display=swap`;

  if (existing) {
    if (existing.getAttribute("data-href") !== href) {
      existing.setAttribute("data-href", href);
      existing.href = href;
    }
    return;
  }

  const link = doc.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.media = "print";
  link.setAttribute("data-href", href);
  link.href = href;
  link.addEventListener("load", () => {
    link.media = "all";
  }, { once: true });
  doc.head.appendChild(link);
}

/**
 * Fetch every theme's faces at once, so the picker's specimens are real.
 *
 * Without this, "Editorial Serif" renders its own specimen in Inter until the
 * moment you choose it — the one screen where the typeface is the entire
 * subject would be the one screen that lies about it. Called when the picker
 * opens, never on a normal page load.
 */
export function preloadFontThemes(doc: Document = document): void {
  const id = "pmw-appearance-font-specimens";
  if (doc.getElementById(id)) return;

  const families = [...new Set(FONT_THEMES.flatMap((theme) => theme.families))];
  if (families.length === 0) return;

  const link = doc.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.media = "print";
  link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
  link.addEventListener("load", () => {
    link.media = "all";
  }, { once: true });
  doc.head.appendChild(link);
}

/**
 * Write the resolved appearance onto the document.
 *
 * Also stamps `data-appearance-*` attributes on <html>. Those are what CSS
 * files reach for when a rule needs to know it is on a dark ground — the
 * native form engine's `[data-theme="dark"]` block, for one — and what a test
 * asserts against without having to read computed styles.
 */
export function applyAppearance(setting: AppearanceSetting, doc: Document = document): ResolvedAppearance {
  const resolved = resolveAppearance(normalizeAppearance(setting));
  const root = doc.documentElement;

  for (const [name, value] of Object.entries(appearanceCssVars(resolved))) {
    root.style.setProperty(name, value);
  }

  root.setAttribute("data-appearance-contrast", resolved.contrast.id);
  root.setAttribute("data-appearance-color", resolved.color.id);
  root.setAttribute("data-appearance-font", resolved.font.id);
  root.setAttribute("data-appearance-mode", resolved.dark ? "dark" : "light");
  // Native form controls, scrollbars and the browser's own UI follow this.
  root.style.colorScheme = resolved.dark ? "dark" : "light";

  ensureFontsLoaded(resolved.font, doc);

  const themeColor = doc.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", resolved.dark ? resolved.panel : resolved.brand);

  return resolved;
}
