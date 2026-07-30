export const C = {
  // Original colors (kept for backward compatibility)
  black: '#000000',
  white: '#ffffff',
  blue: '#0078D4',
  greenOriginal: '#107C10',
  redOriginal: '#C62828',
  gray: '#5F646D',
  lightGray: '#F6F9FC',
  darkGray: '#1A1F2B',
  yellow: '#F7C948',
  teal: '#00B294',
  purpleOriginal: '#6264A7',

  // PMW product palette for the form-builder workspace.
  purple: "#0078D4",           // Primary action
  purpleLight: "#106EBE",      // Primary hover
  purplePale: "#EAF5FC",       // Pale blue wash
  purpleMid: "#BFDDF4",        // Sky accent
  purpleDark: "#1A1F2B",       // Ink
  purpleAccent: "#6264A7",     // Secondary admin accent

  offWhite: "#F6F9FC",         // Workspace background
  border: "#D6DCE5",           // Border
  borderLight: "#E8EEF6",      // Border light

  textPrimary: "#1A1F2B",      // Text primary
  textSecond: "#5F646D",       // Text secondary
  textMuted: "#747B86",        // Text muted

  green: "#107C10",            // Success
  greenPale: "#E3F1E3",        // Success pale

  red: "#C62828",              // Error
  redPale: "#F8E4E4",          // Error pale

  amber: "#B15C00",            // Warning
  amberPale: "#FFF4CE",        // Warning pale

  // Shadows (very subtle)
  shadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.08), 0 8px 20px rgba(26,31,43,0.06)",
  shadowMd: "0 0 0 1px rgba(0,0,0,0.08), 0 10px 30px rgba(26,31,43,0.12)",
} as const;
