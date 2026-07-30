/**
 * AdminGuard.tsx — Route guard for admin-only pages
 *
 * Wraps admin routes and redirects non-admin users with a
 * clear error notification, preventing accidental access.
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  ThemeProvider,
  CssBaseline,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import theme from "../../theme";

interface AdminGuardProps {
  isAdmin: boolean;
  restrictedTo?: string;
  children: React.ReactNode;
}

export default function AdminGuard({ isAdmin, restrictedTo = "OSHES Forms Owners", children }: AdminGuardProps) {
  const navigate = useNavigate();
  const [showDenied, setShowDenied] = useState(false);
  const [showRedirect, setShowRedirect] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isAdmin) {
      setShowDenied(false);
      setShowRedirect(false);
      return;
    }

    // Only trigger once — prevents re-render loops
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      setShowDenied(true);

      const redirectTimer = setTimeout(() => {
        setShowRedirect(true);
        navigate("/user/dashboard", { replace: true });
      }, 4000);

      return () => {
        clearTimeout(redirectTimer);
      };
    }
  }, [isAdmin, navigate]);

  // While admin status is being determined, show nothing (the loading screen
  // in App.tsx handles the initial loading state)
  if (isAdmin) {
    return <>{children}</>;
  }

  if (showRedirect) {
    return null;
  }

  // Full-screen access denied
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--app-bg, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%))",
          p: 3,
        }}
      >
        <Box
          sx={{
            textAlign: "center",
            maxWidth: 440,
            animation: "fadeUp 0.3s ease",
            "@keyframes fadeUp": {
              from: { opacity: 0, transform: "translateY(12px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              backgroundColor: "rgba(220, 38, 38, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 3,
              border: "1px solid rgba(220, 38, 38, 0.12)",
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 34, color: "#DC2626" }} />
          </Box>

          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: "#111827",
              mb: 1,
              letterSpacing: 0,
            }}
          >
            Access Denied
          </Typography>

          <Typography
            variant="body1"
            sx={{ color: "#6B7280", mb: 0.5, lineHeight: 1.6 }}
          >
            You don&apos;t have permission to access this page.
          </Typography>

          <Typography
            variant="body2"
            sx={{ color: "#9CA3AF", mb: 4, lineHeight: 1.5 }}
          >
            This area is restricted to {restrictedTo}. You&apos;ll be redirected
            to the dashboard shortly.
          </Typography>

          <Button
            variant="contained"
            startIcon={<HomeOutlinedIcon />}
            onClick={() => navigate("/user/dashboard", { replace: true })}
            sx={{
              borderRadius: "8px",
              textTransform: "none",
              fontWeight: 600,
              px: 4,
              py: 1.25,
              backgroundColor: "#0078D4",
              "&:hover": { backgroundColor: "#106EBE" },
            }}
          >
            Go to Dashboard
          </Button>
        </Box>

        {/* Snackbar notification for backup */}
        <Snackbar
          open={showDenied}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
          sx={{ mt: 7 }}
        >
          <Alert
            severity="error"
            variant="filled"
            sx={{
              width: "100%",
              borderRadius: "8px",
              fontWeight: 500,
              boxShadow: "0 8px 32px rgba(220, 38, 38, 0.25)",
            }}
          >
            Access denied — redirecting to the dashboard...
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
