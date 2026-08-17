import type { SxProps, Theme } from "@mui/material";
import { editorial, editorialHairline } from "./editorial";

/* ---------------------------------------------------------------------------
   Surface geometry — the radii and card recipes the widget language is built on.

   `editorial.ts` is copied byte-for-byte into pmw-hrform, so it holds colour and
   nothing else. The geometry that dresses *this* app's panels lives here, beside
   `appearanceBoot` and the other app-specific glue DESIGN.md names.

   Every panel in the portal and the admin dashboard used to carry its own
   `borderRadius: "14px"` string — thirty-odd copies of one decision, which is
   why the radius scale in DESIGN.md and the radius in the code had quietly
   stopped matching in a few places. Import `radius` instead of typing a pixel
   value, and the scale stays one thing.
--------------------------------------------------------------------------- */

/** The radius scale from DESIGN.md. Nothing should type a pixel radius by hand. */
export const radius = {
  /** MUI buttons, and anywhere a deliberate hard corner is wanted. */
  none: "0",
  /** Small surfaces: reference tags, icon tiles, menu items. */
  sm: "8px",
  /** Slightly larger small surfaces: chips, inline swatches. */
  md: "10px",
  /** Inputs, menus, nested panels. */
  base: "12px",
  /** Structural cards — the widget. */
  lg: "16px",
  /** Pills, bars, avatars. */
  full: "999px",
} as const;

/**
 * The widget surface: a white panel, a hairline, and a card radius.
 *
 * Written as a plain object rather than a styled component because roughly forty
 * call sites spread it into an existing `sx` alongside their own padding and
 * grid placement.
 */
export const panelSx = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: radius.lg,
} as const satisfies SxProps<Theme>;

/** A recessed area *inside* a panel — a chart well, a table head, an empty state. */
export const sunkenSx = {
  backgroundColor: editorial.paper,
  border: editorialHairline,
  borderRadius: radius.base,
} as const satisfies SxProps<Theme>;

/**
 * Lift on hover, for a surface that is itself a button.
 *
 * Kept here so every pressable card rises by the same 2px over the same
 * duration, and so the reduced-motion escape is written once rather than
 * remembered thirty times.
 */
export const liftSx = {
  transition: "border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
  "&:hover": {
    borderColor: editorial.pmwBlue,
    transform: "translateY(-2px)",
    boxShadow: `0 10px 26px color-mix(in srgb, ${editorial.pmwBlueDark} 14%, transparent)`,
  },
  "&:active": { transform: "translateY(0)" },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "none",
    "&:hover": { transform: "none" },
  },
} as const satisfies SxProps<Theme>;

/**
 * The dashed rule the charts and number strips are ruled with.
 *
 * A gridline is scaffolding, not data: it has to be readable enough to measure a
 * bar against and quiet enough that it never reads as a bar itself. Dashing it
 * at the border colour is what buys both, and it is the one thing every chart in
 * the app has to agree on or the widgets stop looking like one instrument.
 */
export const gridline = `1px dashed color-mix(in srgb, ${editorial.border} 82%, transparent)`;
