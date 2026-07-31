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

The design system is **PMW Editorial**, defined in code at `src/theme/editorial.ts` and
`src/theme/index.ts`. Those files are the source of truth; this document describes them.
It is shared byte-for-byte with `pmw-hrform` — the two apps are one product visually, and
a change here that is not also made there is drift, not design.

The tone is calm and editorial rather than dense-industrial: generous whitespace, hairline
borders, high-contrast near-black text, and blue reserved for action and identity. Light
theme only — there is no dark palette, and one should not be invented.

**Safety context tempts toward hazard-yellow and alarm-red everywhere. Resist it.** Red
(`error`) and amber (`warning`) must keep specific meanings — overdue, rejected, high
severity — or they stop reading as signals. A screen where everything is urgent
communicates nothing. Severity must also survive greyscale printing, so encode it with
weight as well as hue.

## Typography

One family throughout: `"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif`.
`editorialFonts.sans`, `.serif` and `.mono` are deliberately identical — headings differ
from body by weight (700–900), not by face. Segoe UI and Aptos are the Microsoft 365
system faces, which is why they sit directly behind Inter: this app renders inside
SharePoint and should not look foreign there. Inter is loaded from Google Fonts in
`src/index.css`, permitted by the `style-src`/`font-src` entries in the `index.html` CSP.

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

Elevation is a hairline plus a soft blue shadow rather than grey material elevation:

```
border: 1px solid #DDE4EC
box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.06), 0 14px 36px rgba(0,90,158,.08)
```

`editorialShadowHover` deepens the same three layers on hover. Use `editorialHairline` for
dividers and `editorialInkline` only where a deliberate hard edge is wanted.

## Note on the previous version

This file previously documented the Google Stitch "Industrial Logic" system — a
steel-blue, 4px-radius, dense-table wireframe palette from an early prototype. That system
was never adopted: the design handoff explicitly instructed re-skinning with the PMW
editorial tokens instead. It has been replaced here so automated design checks validate
against the system the code actually uses.
