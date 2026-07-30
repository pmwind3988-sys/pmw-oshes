export const editorial = {
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
} as const;

export const editorialFonts = {
  sans: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  serif: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  mono: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
} as const;

export const editorialShadow = "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 14px 36px rgba(0, 90, 158, 0.08)";
export const editorialShadowHover = "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.1), 0 18px 42px rgba(0, 90, 158, 0.12)";
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;
