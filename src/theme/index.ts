import { createTheme, keyframes } from "@mui/material/styles";
import { editorial, editorialFonts, editorialHairline, editorialShadow } from "./editorial";

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

const alertSurfaceShadow = "0 10px 26px rgba(16, 16, 16, 0.12), 0 0 0 1px rgba(16, 16, 16, 0.04)";

const theme = createTheme({
  palette: {
    primary: {
      main: editorial.pmwBlue,
      light: "#2F96DD",
      dark: editorial.pmwBlueDark,
      contrastText: editorial.white,
    },
    secondary: {
      main: editorial.pmwPurple,
      light: "#7A7CC0",
      dark: editorial.pmwPurpleDark,
      contrastText: editorial.white,
    },
    background: {
      default: editorial.skySoft,
      paper: editorial.panel,
    },
    text: {
      primary: editorial.ink,
      secondary: editorial.muted,
    },
    success: {
      main: editorial.success,
      light: "rgba(16, 124, 16, 0.12)",
      contrastText: editorial.white,
    },
    warning: {
      main: editorial.warning,
      light: "rgba(255, 245, 70, 0.42)",
      contrastText: editorial.black,
    },
    error: {
      main: editorial.error,
      light: "rgba(198, 40, 40, 0.12)",
      contrastText: editorial.white,
    },
    grey: {
      50: "#FBFAF5",
      100: "#F7F5EF",
      200: "#E7E2D6",
      300: "#D6DCE5",
      400: "#A7ADB6",
      500: "#747B86",
      600: "#5F646D",
      700: "#3F444C",
      800: "#24262B",
      900: "#101010",
    },
  },
  typography: {
    fontFamily: editorialFonts.sans,
    h1: {
      fontFamily: editorialFonts.serif,
      fontSize: "4.5rem",
      fontWeight: 400,
      letterSpacing: "0",
      lineHeight: 1,
    },
    h2: {
      fontFamily: editorialFonts.serif,
      fontSize: "3.25rem",
      fontWeight: 400,
      letterSpacing: "0",
      lineHeight: 1.05,
    },
    h3: {
      fontSize: "2rem",
      fontWeight: 700,
      letterSpacing: "0",
      lineHeight: 1.15,
    },
    h4: {
      fontSize: "1.35rem",
      fontWeight: 700,
      letterSpacing: "0",
      lineHeight: 1.3,
    },
    h5: {
      fontSize: "1.15rem",
      fontWeight: 700,
      letterSpacing: "0",
      lineHeight: 1.4,
    },
    h6: {
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
      fontFamily: editorialFonts.mono,
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
          background: "var(--app-bg, linear-gradient(180deg, #EAF5FC 0%, #F7FAFD 48%, #FFFFFF 100%))",
          color: editorial.ink,
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
          background: editorial.pmwBlueSoft,
          color: editorial.ink,
        },
        img: {
          maxWidth: "100%",
          height: "auto",
          outline: "1px solid rgba(0, 0, 0, 0.1)",
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
          backgroundColor: editorial.pmwBlue,
          color: editorial.white,
          border: `1px solid ${editorial.pmwBlue}`,
          boxShadow: "none",
          "&:hover": {
            backgroundColor: editorial.pmwBlueDark,
            borderColor: editorial.pmwBlueDark,
            boxShadow: "none",
          },
        },
        outlined: {
          color: editorial.pmwBlueDark,
          borderColor: editorial.pmwBlue,
          borderWidth: "1px",
          backgroundColor: "rgba(255, 255, 255, 0.72)",
          "&:hover": {
            borderWidth: "1px",
            backgroundColor: editorial.blueWash,
            borderColor: editorial.pmwBlueDark,
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
          borderRadius: 14,
          boxShadow: "none",
          border: editorialHairline,
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow: editorialShadow,
            borderColor: "rgba(0, 120, 212, 0.36)",
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
          border: editorialHairline,
        },
        elevation2: {
          boxShadow: editorialShadow,
          border: editorialHairline,
        },
        elevation3: {
          boxShadow: "0 18px 42px rgba(16, 16, 16, 0.16)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10,
            transition: "background-color 0.2s ease, box-shadow 0.2s ease",
            backgroundColor: editorial.white,
            "&:hover": {
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: editorial.pmwBlue,
              },
            },
            "&.Mui-focused": {
              boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.16)",
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
          border: editorialHairline,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          boxShadow: "0 18px 42px rgba(16, 16, 16, 0.16)",
          border: editorialHairline,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: editorialShadow,
          border: editorialHairline,
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
            backgroundColor: editorial.blueWash,
          },
          "&.Mui-selected": {
            backgroundColor: editorial.blueWash,
            "&:hover": {
              backgroundColor: editorial.pmwBlueSoft,
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
          "&.MuiAlert-standardSuccess, &.MuiAlert-outlinedSuccess": {
            backgroundColor: "#F1FAF1",
            borderColor: "rgba(16, 124, 16, 0.38)",
            color: editorial.ink,
          },
          "&.MuiAlert-standardWarning, &.MuiAlert-outlinedWarning": {
            backgroundColor: "#FFF3E0",
            borderColor: "rgba(177, 92, 0, 0.4)",
            color: editorial.ink,
          },
          "&.MuiAlert-standardError, &.MuiAlert-outlinedError": {
            backgroundColor: "#FFF1F1",
            borderColor: "rgba(198, 40, 40, 0.4)",
            color: editorial.ink,
          },
          "&.MuiAlert-standardInfo, &.MuiAlert-outlinedInfo": {
            backgroundColor: editorial.blueSoft,
            borderColor: editorial.pmwBlueSoft,
            color: editorial.ink,
          },
          "&.MuiAlert-filledSuccess": {
            backgroundColor: editorial.success,
            color: editorial.white,
          },
          "&.MuiAlert-filledWarning": {
            backgroundColor: editorial.warning,
            color: editorial.black,
          },
          "&.MuiAlert-filledError": {
            backgroundColor: editorial.error,
            color: editorial.white,
          },
          "&.MuiAlert-filledInfo": {
            backgroundColor: editorial.pmwBlue,
            color: editorial.white,
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
            backgroundColor: editorial.white,
            border: `1px solid ${editorial.pmwBlueSoft}`,
            borderRadius: "8px",
            boxShadow: alertSurfaceShadow,
            color: editorial.ink,
            fontWeight: 700,
            opacity: 1,
          },
          "& .MuiAlert-message": {
            color: editorial.ink,
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
            color: editorial.ink,
            paddingTop: 0,
          },
          "& .MuiAlert-standardSuccess, & .MuiAlert-filledSuccess, & .MuiAlert-outlinedSuccess": {
            borderColor: "rgba(16, 124, 16, 0.24)",
          },
          "& .MuiAlert-standardError, & .MuiAlert-filledError, & .MuiAlert-outlinedError": {
            borderColor: "rgba(198, 40, 40, 0.28)",
          },
          "& .MuiAlert-standardWarning, & .MuiAlert-filledWarning, & .MuiAlert-outlinedWarning": {
            borderColor: "rgba(177, 92, 0, 0.28)",
          },
          "& .MuiAlert-standardInfo, & .MuiAlert-filledInfo, & .MuiAlert-outlinedInfo": {
            borderColor: editorial.pmwBlueSoft,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(16px)",
          borderBottom: editorialHairline,
          boxShadow: "none",
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: "rgba(16, 16, 16, 0.1)",
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
          color: editorial.pmwBlue,
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
            backgroundColor: editorial.blueWash,
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
          backgroundColor: editorial.blueSoft,
          color: editorial.ink,
          fontWeight: 800,
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0",
          borderBottom: editorialHairline,
        },
        body: {
          borderBottom: editorialHairline,
          fontVariantNumeric: "tabular-nums",
        },
      },
    },
  },
});

export { fadeInUp };
export default theme;
