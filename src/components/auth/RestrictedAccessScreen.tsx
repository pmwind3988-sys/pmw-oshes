import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Logout as LogoutIcon,
  Refresh as RefreshIcon,
  SwitchAccount as SwitchAccountIcon,
} from "@mui/icons-material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";

interface RestrictedAccessScreenProps {
  userEmail: string;
  onRetry: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}

export default function RestrictedAccessScreen({
  userEmail,
  onRetry,
  onSwitch,
  onSignOut,
}: RestrictedAccessScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F8F9FC",
        position: "relative",
        overflow: "hidden",
        py: 4,
        px: isMobile ? 2 : 4,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(0,120,212,0.08) 0%, rgba(255,255,255,0) 42%), linear-gradient(315deg, rgba(98,100,167,0.08) 0%, rgba(255,255,255,0) 44%)",
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: "8px",
            border: "1px solid rgba(17, 24, 39, 0.1)",
            boxShadow: "0 18px 60px rgba(15, 23, 42, 0.1)",
            backgroundColor: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(12px)",
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          <Box sx={{ height: 4, background: "linear-gradient(90deg, #0078D4, #6264A7)" }} />

          <CardContent sx={{ p: isMobile ? 3.5 : 5 }}>
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              <Logo size={{ xs: 60, sm: 72 }} />

              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  backgroundColor: "rgba(0, 120, 212, 0.08)",
                  color: "#0078D4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(0, 120, 212, 0.14)",
                }}
              >
                <LockOutlinedIcon sx={{ fontSize: 32 }} />
              </Box>

              <Stack spacing={1.5} sx={{ alignItems: "center" }}>
                <Typography
                  variant="h2"
                  sx={{
                    fontWeight: 700,
                    color: "#111827",
                    letterSpacing: 0,
                    textAlign: "center",
                    fontSize: isMobile ? "1.8rem" : "2.3rem",
                  }}
                >
                  Access Restricted
                </Typography>

                <Typography
                  variant="body1"
                  sx={{
                    color: "#4B5563",
                    lineHeight: 1.65,
                    textAlign: "center",
                    maxWidth: 460,
                  }}
                >
                  This Microsoft 365 account can sign in, but it does not have access to the configured OSHE SharePoint site.
                </Typography>

                {userEmail && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#111827",
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                      textAlign: "center",
                    }}
                  >
                    {userEmail}
                  </Typography>
                )}

                <Typography
                  variant="body2"
                  sx={{
                    color: "#6B7280",
                    lineHeight: 1.6,
                    textAlign: "center",
                    maxWidth: 460,
                  }}
                >
                  Ask an administrator to add this exact account as a SharePoint site member, then try again.
                </Typography>
              </Stack>

              <Stack spacing={1.25} sx={{ width: "100%" }}>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  startIcon={<RefreshIcon />}
                  onClick={onRetry}
                  sx={{
                    backgroundColor: "#0078D4",
                    borderRadius: "8px",
                    py: 1.5,
                    fontWeight: 600,
                    boxShadow: "0 2px 8px rgba(0, 120, 212, 0.2)",
                    "&:hover": {
                      backgroundColor: "#0068C4",
                      boxShadow: "0 6px 20px rgba(0, 120, 212, 0.3)",
                    },
                  }}
                >
                  Try again
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  size="large"
                  startIcon={<SwitchAccountIcon />}
                  onClick={onSwitch}
                  sx={{
                    borderRadius: "8px",
                    py: 1.5,
                    fontWeight: 600,
                    borderColor: "rgba(0, 120, 212, 0.3)",
                    color: "#0078D4",
                    borderWidth: "1.5px",
                    "&:hover": {
                      borderColor: "#0078D4",
                      backgroundColor: "rgba(0, 120, 212, 0.04)",
                    },
                  }}
                >
                  Switch account
                </Button>

                <Button
                  variant="text"
                  fullWidth
                  size="large"
                  startIcon={<LogoutIcon />}
                  onClick={onSignOut}
                  sx={{
                    borderRadius: "8px",
                    py: 1.25,
                    color: "#6B7280",
                    fontWeight: 600,
                    "&:hover": {
                      backgroundColor: "rgba(17, 24, 39, 0.04)",
                    },
                  }}
                >
                  Sign out
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
