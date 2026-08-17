---
name: PMW Editorial
colors:
  ink: '#101010'
  muted: '#5F646D'
  soft-muted: '#747B86'
  white: '#FFFFFF'
  black: '#000000'
  panel: '#FFFFFF'
  paper: '#F8FAFC'
  paper-soft: '#F9FBFD'
  app-surface: '#F6F9FC'
  sky: '#BFDDF4'
  sky-soft: '#EEF7FD'
  blue-wash: '#EDF7FE'
  blue-soft: '#F6FAFD'
  purple-wash: '#F4F3FB'
  border: '#DDE4EC'
  border-strong: '#111111'
  primary: '#0078D4'
  primary-dark: '#005A9E'
  primary-soft: '#D7ECFA'
  secondary: '#6264A7'
  secondary-dark: '#4B4D89'
  secondary-soft: '#E6E7F6'
  accent: '#FFF546'
  accent-soft: '#FFF4D6'
  success: '#107C10'
  warning: '#B15C00'
  error: '#C62828'
  grey-50: '#FBFAF5'
  grey-100: '#F7F5EF'
  grey-200: '#E7E2D6'
  grey-300: '#D6DCE5'
  grey-400: '#A7ADB6'
  grey-500: '#747B86'
  grey-600: '#5F646D'
  grey-700: '#3F444C'
  grey-800: '#24262B'
  grey-900: '#101010'
  app-bg-start: '#EAF5FC'
  app-bg-mid: '#F7FAFD'
  app-bg-end: '#FFFFFF'
typography:
  h1:
    fontFamily: Inter
    fontSize: 4.5rem
    fontWeight: '400'
    lineHeight: '1'
    letterSpacing: '0'
  h2:
    fontFamily: Inter
    fontSize: 3.25rem
    fontWeight: '400'
    lineHeight: '1.05'
    letterSpacing: '0'
  h3:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: '0'
  h4:
    fontFamily: Inter
    fontSize: 1.35rem
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: '0'
  h5:
    fontFamily: Inter
    fontSize: 1.15rem
    fontWeight: '700'
    lineHeight: '1.4'
    letterSpacing: '0'
  h6:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '700'
    lineHeight: '1.45'
    letterSpacing: '0'
  body1:
    fontFamily: Inter
    fontSize: 0.96rem
    fontWeight: '400'
    lineHeight: '1.65'
  body2:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: '1.55'
  caption:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: '1.5'
    letterSpacing: '0'
  button:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '700'
    letterSpacing: '0'
  stat:
    fontFamily: Inter
    fontSize: 2.4rem
    fontWeight: '800'
    lineHeight: '1.1'
  overline:
    fontFamily: Inter
    fontSize: 0.8rem
    fontWeight: '700'
    letterSpacing: '0.06em'
rounded:
  none: '0'
  sm: '8px'
  DEFAULT: '12px'
  lg: '14px'
  md: '10px'
  full: '999px'
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 24px
  gutter: 16px
---

## Brand & Style

The design system is **PMW Editorial**, defined in code at `src/theme/appearance.ts`,
`src/theme/editorial.ts` and `src/theme/index.ts`. Those files are the source of truth;
this document describes them.

The tone is calm and editorial rather than dense-industrial: generous whitespace, hairline
borders, high-contrast text, and colour reserved for action and identity.

**Safety context tempts toward hazard-yellow and alarm-red everywhere. Resist it.** Red
(`error`) and amber (`warning`) must keep specific meanings — overdue, rejected, high
severity — or they stop reading as signals. A screen where everything is urgent
communicates nothing. Severity must also survive greyscale printing, so encode it with
weight as well as hue.

## The three appearance axes

The palette above is the default, not the only one. An administrator picks three
independent settings for the whole workspace, stored in the OSHES admin settings list
alongside the wallpaper and applied through `applyAppearance`:

| Axis | What it decides | Options |
| --- | --- | --- |
| **contrast** | ground and ink — light or dark, and how hard the pairing is | Ink on Paper, Black on White, Blue on White, Warm Paper, Midnight, White on Black |
| **colour** | brand and accent — identity and action only | PMW Blue, Indigo, Teal, Violet, Magenta, Graphite |
| **font** | heading and body faces | Inter, Microsoft 365, Editorial Serif, Grotesk, IBM Plex |

Two rules make 180 combinations safe without any of them having been reviewed by hand:

1. **Status colour is not themeable.** `success`, `warning` and `error` keep their hue in
   every theme, and no colour theme offers an amber, green or red accent — a brand in
   those families would make an ordinary Save button carry the same colour as an overdue
   approval. Only the *wash* behind a status varies, because it is mixed against the
   active panel.
2. **Contrast is computed, not asserted.** `readableOn` walks a colour toward the panel
   until it clears its WCAG ratio against the surface it will actually sit on. This is
   what lets a colour and a contrast theme be chosen independently.

**This supersedes the previous "light theme only, and one should not be invented" rule.**
Dark grounds are now first-class, which imposes one obligation on new code: never write a
literal colour. Every value must come from `editorial` (which is `var(--pmw-*)` under the
hood) or from the MUI theme, or it will be a white card on a black page the first time
someone picks Midnight. In particular:

- `editorial.white` is **text on a saturated fill**, not a surface. Use `editorial.panel`
  for a white background.
- `editorial.success` / `.warning` / `.error` are **text**; `.successFill` / `.warningFill`
  / `.errorFill` are saturated fills with `.onStatus` on top. The pair diverges on dark
  grounds.
- Compose transparency with `color-mix(in srgb, <token> N%, transparent)`. String
  concatenation of a hex alpha suffix (`${token}33`) silently produces `var(--x)33`.

### Sharing with pmw-hrform

`src/theme/appearance.ts` and `src/theme/editorial.ts` have no imports from the rest of the
app and are meant to be copied into `pmw-hrform` verbatim; `src/theme/index.ts` follows if
that app's component overrides match. The glue is deliberately outside them —
`src/utils/appearanceBoot.ts`, `src/contexts/AppearanceContext.tsx` and
`src/utils/dashboardBackgrounds.ts` are app-specific and each app wires its own. Until that
port happens the two apps differ, which is known divergence rather than accidental drift.

## Typography

The default is one family throughout: `"Inter", "Segoe UI", "Aptos", "Helvetica Neue",
Arial, sans-serif`, with headings differing from body by weight (700–900) rather than by
face. Segoe UI and Aptos are the Microsoft 365 system faces, which is why they sit
directly behind Inter: this app renders inside SharePoint and should not look foreign
there.

The other font themes split heading from body, so `--pmw-font-heading` and
`--pmw-font-main` are separate variables and the `h1–h6` rule in `src/index.css` has to
carry `!important` to beat the universal rule above it. A face is fetched from Google
Fonts only when its theme is selected — the default pays for nothing else — permitted by
the `style-src`/`font-src` entries in the `index.html` CSP.

The frontmatter at the top of this file records the **default** theme's values. It is a
description of one point in the space, not of the whole system.

## Layout & Spacing

MUI `spacing()` on an 8px base — read prototype gaps as multiples of it. Content uses 24px
desktop margins and 16px gutters. The responsive convention is a desktop grid or table that
becomes stacked cards on mobile, with the header collapsing to a single menu. Every tap
target in the public QR flow is at least 44px; it is filled in one-handed, outdoors,
sometimes wearing gloves.

## Components

Panels are white on a pale blue-tinted ground. Structural cards use 14px radius, inputs and
menus 12px, small surfaces 8–10px, pills 999px, and **MUI buttons are square (radius 0)** —
that contrast is intentional, not an oversight.

Elevation is a hairline plus a soft tinted shadow rather than grey material elevation. In
the default theme that resolves to:

```
border: 1px solid #DDE4EC
box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.06), 0 14px 36px rgba(0,90,158,.08)
```

The shadow is tinted with the active brand and deepens to near-black on the dark themes,
where a 6%-black shadow is invisible. `editorialShadowHover` deepens the same three
layers on hover. Use `editorialHairline` for dividers and `editorialInkline` only where a
deliberate hard edge is wanted.

## Note on the previous version

This file previously documented the Google Stitch "Industrial Logic" system — a
steel-blue, 4px-radius, dense-table wireframe palette from an early prototype. That system
was never adopted: the design handoff explicitly instructed re-skinning with the PMW
editorial tokens instead. It has been replaced here so automated design checks validate
against the system the code actually uses.
