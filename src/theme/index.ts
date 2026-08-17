import { createTheme, keyframes, type Theme } from "@mui/material/styles";
import {
  DEFAULT_APPEARANCE,
  resolveAppearance,
  withAlpha,
  type AppearanceSetting,
  type ResolvedAppearance,
} from "./appearance";

/* ---------------------------------------------------------------------------
   The MUI theme, rebuilt whenever the appearance changes.

   Two layers dress this app and they have to agree. `editorial.ts` hands
   `var(--pmw-*)` to component `sx` props, which is how ~50 files follow the
   theme without being touched. MUI's own internals cannot use those: they parse
   palette entries to derive hover, disabled and ripple states, and a `var()`
   is not something you can lighten by 8%. So the palette below takes the
   *resolved* hex from the same appearance object the variables were written
   from. One source, two consumers, no drift.

   `buildTheme` is therefore a function of the setting, not a constant. The
   default export stays a ready-built theme so a module that only wants
   `fadeInUp` or a plain provider is unaffected.
--------------------------------------------------------------------------- */

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

export function buildTheme(input: AppearanceSetting | ResolvedAppearance = DEFAULT_APPEARANCE): Theme {
  const a: ResolvedAppearance = "panel" in input ? input : resolveAppearance(input);
  const alertSurfaceShadow = a.dark
    ? `0 10px 26px ${withAlpha("#000000", 0.55)}, 0 0 0 1px ${withAlpha("#FFFFFF", 0.08)}`
    : `0 10px 26px ${withAlpha("#101010", 0.12)}, 0 0 0 1px ${withAlpha("#101010", 0.04)}`;
  const hairline = `1px solid ${a.border}`;

  return createTheme({
    palette: {
      // Drives MUI's own defaults — scrollbars, the backdrop, ripple tints, and
      // anything reading `theme.palette.mode` rather than an explicit colour.
      mode: a.dark ? "dark" : "light",
      primary: {
        main: a.brand,
        light: a.brandLight,
        dark: a.brandDark,
        contrastText: a.onBrand,
      },
      secondary: {
        main: a.accent,
        light: a.color.accent,
        dark: a.accentDark,
        contrastText: a.onAccent,
      },
      background: {
        default: a.canvas,
        paper: a.panel,
      },
      text: {
        primary: a.ink,
        secondary: a.muted,
        disabled: a.softMuted,
      },
      divider: a.border,
      success: {
        main: a.success,
        light: a.successWash,
        contrastText: a.onBrand,
      },
      warning: {
        main: a.warning,
        light: a.warningWash,
        contrastText: "#101010",
      },
      error: {
        main: a.error,
        light: a.errorWash,
        contrastText: "#FFFFFF",
      },
      info: {
        main: a.brand,
        light: a.brandWash,
        dark: a.brandDark,
        contrastText: a.onBrand,
      },
      action: {
        hover: a.brandWash,
        selected: a.brandWashSoft,
      },
      // The grey ramp is walked from the theme's own ink to its own panel, so
      // "grey 200" is a light divider on Ink on Paper and a dark one on
      // Midnight — which is what every consumer of it actually meant.
      grey: {
        50: a.paperSoft,
        100: a.paper,
        200: a.sunken,
        300: a.border,
        400: a.softMuted,
        500: a.muted,
        600: a.muted,
        700: a.ink,
        800: a.ink,
        900: a.ink,
      },
    },
    typography: {
      fontFamily: a.fontBody,
      h1: {
        fontFamily: a.fontHeading,
        fontSize: "4.5rem",
        fontWeight: 400,
        letterSpacing: "0",
        lineHeight: 1,
      },
      h2: {
        fontFamily: a.fontHeading,
        fontSize: "3.25rem",
        fontWeight: 400,
        letterSpacing: "0",
        lineHeight: 1.05,
      },
      h3: {
        fontFamily: a.fontHeading,
        fontSize: "2rem",
        fontWeight: 700,
        letterSpacing: "0",
        lineHeight: 1.15,
      },
      h4: {
        fontFamily: a.fontHeading,
        fontSize: "1.35rem",
        fontWeight: 700,
        letterSpacing: "0",
        lineHeight: 1.3,
      },
      h5: {
        fontFamily: a.fontHeading,
        fontSize: "1.15rem",
        fontWeight: 700,
        letterSpacing: "0",
        lineHeight: 1.4,
      },
      h6: {
        fontFamily: a.fontHeading,
        fontSize: "1rem",
        fontWeight: 700,
        letterSpacing: "0",
        lineHeight: 1.45,
      },
      body1: {
        fontSize: "0.96rem",
        lineHeight: 1.65,
        fontWeight: 400,
      },
      body2: {
        fontSize: "0.875rem",
        lineHeight: 1.55,
        fontWeight: 400,
      },
      caption: {
        fontSize: "0.75rem",
        lineHeight: 1.5,
        letterSpacing: "0",
        fontWeight: 600,
      },
      button: {
        fontFamily: a.fontBody,
        fontWeight: 700,
        letterSpacing: "0",
        textTransform: "none",
        fontSize: "0.875rem",
      },
    },
    shape: {
      borderRadius: 12,
    },
    zIndex: {
      snackbar: 20000,
    },
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            minHeight: "100vh",
            // Through the variables rather than the resolved literals, even
            // though this theme was built from the same appearance. CssBaseline
            // outranks the rule in index.css, so a literal here would pin the
            // page ground and body ink to whichever appearance the theme was
            // last built from — leaving the two layers able to disagree. Going
            // through the variables means the document can only ever have one
            // answer. The literals remain as the pre-boot fallback.
            background: `var(--app-bg, var(--app-bg-fallback, ${a.ground}))`,
            color: `var(--pmw-ink, ${a.ink})`,
            textRendering: "optimizeLegibility",
          },
          "#root": {
            minHeight: "100vh",
          },
          "h1, h2, h3, h4, h5, h6": {
            textWrap: "balance",
          },
          "p, li, figcaption, blockquote": {
            textWrap: "pretty",
          },
          "::selection": {
            background: a.brandSoft,
            color: a.ink,
          },
          img: {
            maxWidth: "100%",
            height: "auto",
            // A hairline keeps a white-cornered logo from bleeding into a white
            // panel. On a dark ground the same black outline is a black halo,
            // so it inverts with the theme — via the variable, for the reason
            // given on `body` above.
            outline: `1px solid var(--pmw-image-edge, ${withAlpha(a.dark ? "#FFFFFF" : "#000000", 0.1)})`,
            outlineOffset: "-1px",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            textTransform: "none",
            fontWeight: 700,
            padding: "10px 18px",
            fontSize: "0.875rem",
            transition: "background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
            boxShadow: "none",
            "&:hover": {
              boxShadow: "none",
              transform: "translateY(-1px)",
            },
            "&:active": {
              transform: "scale(0.96)",
            },
          },
          contained: {
            backgroundColor: a.brand,
            color: a.onBrand,
            border: `1px solid ${a.brand}`,
            boxShadow: "none",
            "&:hover": {
              backgroundColor: a.brandDark,
              borderColor: a.brandDark,
              boxShadow: "none",
            },
          },
          outlined: {
            color: a.brandInk,
            borderColor: a.brand,
            borderWidth: "1px",
            backgroundColor: withAlpha(a.panel, 0.72),
            "&:hover": {
              borderWidth: "1px",
              backgroundColor: a.brandWash,
              borderColor: a.brandDark,
            },
          },
          text: {
            color: a.brandInk,
            "&:hover": {
              backgroundColor: a.brandWash,
            },
          },
          sizeLarge: {
            padding: "12px 24px",
            fontSize: "1rem",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: a.panel,
            backgroundImage: "none",
            borderRadius: 14,
            boxShadow: "none",
            border: hairline,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            "&:hover": {
              boxShadow: a.shadow,
              borderColor: withAlpha(a.brand, 0.36),
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
          rounded: {
            borderRadius: 14,
          },
          elevation1: {
            boxShadow: "none",
            border: hairline,
          },
          elevation2: {
            boxShadow: a.shadow,
            border: hairline,
          },
          elevation3: {
            boxShadow: a.shadowHover,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 10,
              transition: "background-color 0.2s ease, box-shadow 0.2s ease",
              backgroundColor: a.panel,
              "&:hover": {
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: a.brand,
                },
              },
              "&.Mui-focused": {
                boxShadow: a.ring,
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 700,
            fontSize: "0.8rem",
            height: 28,
            border: hairline,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: a.panel,
            borderRadius: 14,
            boxShadow: a.shadowHover,
            border: hairline,
          },
        },
      },
      MuiMenu: {
        defaultProps: {
          // Modal's scroll lock puts `overflow: hidden` + scrollbar-compensation
          // padding on <body>, which shunts the centered layout sideways every
          // time a dropdown opens. Dialogs still lock; anchored menus don't need to.
          disableScrollLock: true,
        },
        styleOverrides: {
          paper: {
            backgroundColor: a.panel,
            borderRadius: 12,
            boxShadow: a.shadow,
            border: hairline,
            marginTop: 8,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "2px 6px",
            padding: "10px 12px",
            transition: "background-color 0.15s ease, color 0.15s ease",
            "&:hover": {
              backgroundColor: a.brandWash,
            },
            "&.Mui-selected": {
              backgroundColor: a.brandWash,
              "&:hover": {
                backgroundColor: a.brandSoft,
              },
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            border: "1px solid transparent",
            borderRadius: "8px",
            boxShadow: alertSurfaceShadow,
            fontWeight: 700,
            opacity: 1,
            // Each severity is matched TWICE on purpose. MUI used to emit one
            // fused class (`MuiAlert-standardError`); from v6 it emits the
            // variant and the colour separately (`MuiAlert-standard` +
            // `MuiAlert-colorError`). On v9 the fused selectors match nothing, so
            // every Alert in the app fell back to MUI's defaults — which render
            // standard-variant text at 12% alpha, i.e. all but invisible. Keep
            // both shapes so the theme survives a version move in either
            // direction.
            "&.MuiAlert-standardSuccess, &.MuiAlert-outlinedSuccess, &.MuiAlert-colorSuccess.MuiAlert-standard, &.MuiAlert-colorSuccess.MuiAlert-outlined": {
              backgroundColor: a.successWash,
              borderColor: withAlpha(a.success, 0.38),
              color: a.ink,
            },
            "&.MuiAlert-standardWarning, &.MuiAlert-outlinedWarning, &.MuiAlert-colorWarning.MuiAlert-standard, &.MuiAlert-colorWarning.MuiAlert-outlined": {
              backgroundColor: a.warningWash,
              borderColor: withAlpha(a.warning, 0.4),
              color: a.ink,
            },
            "&.MuiAlert-standardError, &.MuiAlert-outlinedError, &.MuiAlert-colorError.MuiAlert-standard, &.MuiAlert-colorError.MuiAlert-outlined": {
              backgroundColor: a.errorWash,
              borderColor: withAlpha(a.error, 0.4),
              color: a.ink,
            },
            "&.MuiAlert-standardInfo, &.MuiAlert-outlinedInfo, &.MuiAlert-colorInfo.MuiAlert-standard, &.MuiAlert-colorInfo.MuiAlert-outlined": {
              backgroundColor: a.brandWashSoft,
              borderColor: a.brandSoft,
              color: a.ink,
            },
            "&.MuiAlert-filledSuccess, &.MuiAlert-colorSuccess.MuiAlert-filled": {
              backgroundColor: a.success,
              color: a.onBrand,
            },
            "&.MuiAlert-filledWarning, &.MuiAlert-colorWarning.MuiAlert-filled": {
              backgroundColor: a.warning,
              color: "#101010",
            },
            "&.MuiAlert-filledError, &.MuiAlert-colorError.MuiAlert-filled": {
              backgroundColor: a.error,
              color: "#FFFFFF",
            },
            "&.MuiAlert-filledInfo, &.MuiAlert-colorInfo.MuiAlert-filled": {
              backgroundColor: a.brand,
              color: a.onBrand,
            },
          },
          message: {
            color: "inherit",
            fontWeight: 700,
            lineHeight: 1.5,
            padding: "8px 0",
          },
          icon: {
            alignItems: "center",
            opacity: 1,
          },
          action: {
            alignItems: "center",
            color: "inherit",
            paddingTop: 0,
          },
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          root: {
            zIndex: 20000,
            "& .MuiAlert-root": {
              alignItems: "center",
              backgroundColor: a.panel,
              border: `1px solid ${a.brandSoft}`,
              borderRadius: "8px",
              boxShadow: alertSurfaceShadow,
              color: a.ink,
              fontWeight: 700,
              opacity: 1,
            },
            "& .MuiAlert-message": {
              color: a.ink,
              fontWeight: 700,
              lineHeight: 1.45,
              padding: "8px 0",
            },
            "& .MuiAlert-icon": {
              alignItems: "center",
              opacity: 1,
            },
            "& .MuiAlert-action": {
              alignItems: "center",
              color: a.ink,
              paddingTop: 0,
            },
            "& .MuiAlert-standardSuccess, & .MuiAlert-filledSuccess, & .MuiAlert-outlinedSuccess": {
              borderColor: withAlpha(a.success, 0.24),
            },
            "& .MuiAlert-standardError, & .MuiAlert-filledError, & .MuiAlert-outlinedError": {
              borderColor: withAlpha(a.error, 0.28),
            },
            "& .MuiAlert-standardWarning, & .MuiAlert-filledWarning, & .MuiAlert-outlinedWarning": {
              borderColor: withAlpha(a.warning, 0.28),
            },
            "& .MuiAlert-standardInfo, & .MuiAlert-filledInfo, & .MuiAlert-outlinedInfo": {
              borderColor: a.brandSoft,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: withAlpha(a.panel, 0.82),
            backdropFilter: "blur(16px)",
            borderBottom: hairline,
            boxShadow: "none",
            color: a.ink,
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: a.sunken,
            height: 6,
          },
          bar: {
            borderRadius: 6,
          },
        },
      },
      MuiCircularProgress: {
        styleOverrides: {
          root: {
            color: a.brand,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: "background-color 0.2s ease, color 0.2s ease, transform 0.2s ease",
            borderRadius: 8,
            minWidth: 40,
            minHeight: 40,
            "&:hover": {
              backgroundColor: a.brandWash,
            },
            "&:active": {
              transform: "scale(0.96)",
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: a.brandWashSoft,
            color: a.ink,
            fontWeight: 800,
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0",
            borderBottom: hairline,
          },
          body: {
            borderBottom: hairline,
            fontVariantNumeric: "tabular-nums",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: a.panel,
            backgroundImage: "none",
            borderRight: hairline,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: a.inverseSurface,
            color: a.inverseInk,
            fontSize: "0.75rem",
            fontWeight: 600,
            border: `1px solid ${a.border}`,
          },
          arrow: {
            color: a.inverseSurface,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: a.border,
          },
        },
      },
    },
  });
}

const theme = buildTheme(DEFAULT_APPEARANCE);

export { fadeInUp };
export default theme;
