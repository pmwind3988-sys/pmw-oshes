/* ---------------------------------------------------------------------------
   PMW Editorial tokens.

   Roughly fifty components import `editorial` and drop its values straight into
   `sx` colours, `border` strings and `boxShadow` strings. They used to be
   literal hex, which is why the app had exactly one look.

   They are now `var(--pmw-*)` references with the original hex as the fallback,
   so every one of those fifty files became themeable without being edited. The
   variables are written to <html> by `applyAppearance` in `./appearance`; the
   fallbacks are what renders if that never runs — a public form opened before
   boot, a component mounted in a test — and they are the exact values this file
   held before, so the untouched app looks untouched.

   `editorialHex` keeps the literal defaults for the two places a `var()` is not
   a colour: MUI's `createTheme`, which parses palette entries to derive hover
   and disabled states, and anything drawing outside the DOM. Reach for
   `editorial` unless you are in one of those.

   Shared byte-for-byte with pmw-hrform — see the porting note in DESIGN.md.
--------------------------------------------------------------------------- */

/** The literal light-theme defaults. Real colours, safe to parse and compute on. */
export const editorialHex = {
  black: "#000000",
  ink: "#101010",
  muted: "#5F646D",
  softMuted: "#747B86",
  white: "#FFFFFF",
  sky: "#BFDDF4",
  skySoft: "#EEF7FD",
  blueWash: "#EDF7FE",
  blueSoft: "#F6FAFD",
  purpleWash: "#F4F3FB",
  paper: "#F8FAFC",
  neutralWash: "#F1F3F6",
  appSurface: "#F6F9FC",
  paperSoft: "#F9FBFD",
  panel: "#FFFFFF",
  border: "#DDE4EC",
  borderStrong: "#111111",
  pmwBlue: "#0078D4",
  pmwBlueDark: "#005A9E",
  pmwBlueSoft: "#D7ECFA",
  pmwPurple: "#6264A7",
  pmwPurpleDark: "#4B4D89",
  pmwPurpleSoft: "#E6E7F6",
  yellow: "#FFF546",
  yellowSoft: "#FFF4D6",
  success: "#107C10",
  warning: "#B15C00",
  error: "#C62828",
  inverseSurface: "#000000",
  inverseInk: "#FFFFFF",
} as const;

const v = (name: string, fallback: string) => `var(--pmw-${name}, ${fallback})`;

export const editorial = {
  /**
   * A hard black, kept literal. Its only jobs are text on the signal yellow and
   * text on the amber `warning` fill, and both of those fills keep their hue in
   * every theme — so this must not follow the ink, or it inverts to white on
   * yellow the moment a dark theme is picked.
   */
  black: v("on-yellow", editorialHex.black),
  ink: v("ink", editorialHex.ink),
  muted: v("muted", editorialHex.muted),
  softMuted: v("soft-muted", editorialHex.softMuted),
  /**
   * Text and glyphs sitting *on* a saturated fill — a blue button, a red pill.
   * Not a surface: those fills stay saturated in every theme, so this stays
   * light. Use `editorial.panel` for a white background.
   */
  white: v("on-blue", editorialHex.white),

  sky: v("sky", editorialHex.sky),
  skySoft: v("sky-soft", editorialHex.skySoft),
  blueWash: v("blue-wash", editorialHex.blueWash),
  blueSoft: v("blue-wash-soft", editorialHex.blueSoft),
  purpleWash: v("purple-wash", editorialHex.purpleWash),

  paper: v("paper", editorialHex.paper),
  neutralWash: v("sunken", editorialHex.neutralWash),
  appSurface: v("canvas", editorialHex.appSurface),
  paperSoft: v("paper-soft", editorialHex.paperSoft),
  panel: v("panel", editorialHex.panel),
  border: v("border", editorialHex.border),
  borderStrong: v("border-strong", editorialHex.borderStrong),

  pmwBlue: v("blue", editorialHex.pmwBlue),
  /** The readable brand — verified against `blueWash`, so it is safe as text. */
  pmwBlueDark: v("blue-ink", editorialHex.pmwBlueDark),
  pmwBlueSoft: v("blue-soft", editorialHex.pmwBlueSoft),
  pmwPurple: v("purple", editorialHex.pmwPurple),
  pmwPurpleDark: v("purple-ink", editorialHex.pmwPurpleDark),
  pmwPurpleSoft: v("purple-soft", editorialHex.pmwPurpleSoft),

  yellow: v("yellow", editorialHex.yellow),
  yellowSoft: v("warning-wash", editorialHex.yellowSoft),

  /**
   * Status as *text*, on its own wash or on a panel. This is the common case —
   * a "Rejected" label, a severity word, an icon beside one — so it keeps the
   * short name.
   */
  success: v("success-ink", editorialHex.success),
  warning: v("warning-ink", editorialHex.warning),
  error: v("error-ink", editorialHex.error),

  /**
   * Status as a saturated *fill*, with `onStatus` on top: a solid pill, a
   * segment of a progress bar, a count badge.
   *
   * Separate from the text tokens because the two requirements diverge on a
   * dark ground. There, readable status text is a *lightened* red — and white
   * on a lightened red is about 2.5:1. The fill stays deep so its label stays
   * legible; the text lifts so it stays legible on the wash. One token could
   * not do both without one of the two going unreadable.
   */
  successFill: v("success", editorialHex.success),
  warningFill: v("warning", editorialHex.warning),
  errorFill: v("error", editorialHex.error),

  /** Status at wash strength — the tint behind a status pill or banner. */
  successWash: v("success-wash", "rgba(16, 124, 16, 0.10)"),
  warningWash: v("warning-wash", editorialHex.yellowSoft),
  errorWash: v("error-wash", "rgba(198, 40, 40, 0.10)"),

  /** Text on a saturated status fill. */
  onStatus: v("on-blue", editorialHex.white),

  /** A deliberately inverted panel — the primary CTA on the sign-in screens. */
  inverseSurface: v("inverse-surface", editorialHex.inverseSurface),
  inverseInk: v("inverse-ink", editorialHex.inverseInk),
} as const;

export const editorialShadow = `var(--pmw-shadow, 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 14px 36px rgba(0, 90, 158, 0.08))`;
export const editorialShadowHover = `var(--pmw-shadow-hover, 0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.1), 0 18px 42px rgba(0, 90, 158, 0.12))`;
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;
