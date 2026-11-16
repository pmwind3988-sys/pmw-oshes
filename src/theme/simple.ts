/* ---------------------------------------------------------------------------
   Simple redesign tokens — the sun accent and the pastel tints used by the
   redesigned surfaces. Fixed values, not themeable: the tints are tuned to sit
   on the default canvas, and the sun is the single warm accent in the design.
--------------------------------------------------------------------------- */

/** The sun accent — one warm highlight per surface, never a status colour. */
export const SUN = "#FFC83D";

/** Pastel card tints, one per category. Each is a flat fill, never a border. */
export const TINTS = {
  amber: "#FFF1CC",
  red: "#FFE4E0",
  violet: "#ECE6FF",
  green: "#DDF5E6",
  blue: "#E3EEFF",
  grey: "#EEF1F6",
} as const;
