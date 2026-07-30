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
import { Refresh as RefreshIcon, Logout as LogoutIcon } from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";

interface WrongTenantScreenProps {
  userEmail: string;
  onLogout: () => void;
  onSwitch: () => void;
}

export default function WrongTenantScreen({
  userEmail,
  onLogout,
  onSwitch,
}: WrongTenantScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F8F9FC",
        position: "relative",
        overflow: "hidden",
        py: 4,
        padding: isMobile ? 2 : 4,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: isMobile ? 300 : 500,
          height: isMobile ? 300 : 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(220,38,38,0.04) 0%, rgba(220,38,38,0) 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "-20%",
          left: "-15%",
          width: isMobile ? 350 : 600,
          height: isMobile ? 350 : 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(98,100,167,0.03) 0%, rgba(98,100,167,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Subtle geometric accent lines */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
        }}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path d="M0 120 Q360 80 720 140 T1440 100" stroke="rgba(220, 38, 38, 0.04)" strokeWidth="1.5" />
        <path d="M0 780 Q360 820 720 760 T1440 800" stroke="rgba(98, 100, 167, 0.04)" strokeWidth="1.5" />
        <circle cx="1200" cy="150" r="100" stroke="rgba(220, 38, 38, 0.03)" strokeWidth="1" />
        <circle cx="180" cy="720" r="70" stroke="rgba(98, 100, 167, 0.03)" strokeWidth="1" />
      </svg>

      <Container maxWidth="xs" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: "8px",
            border: "1px solid rgba(220,38,38,0.1)",
            boxShadow: "0 4px 24px rgba(220,38,38,0.06)",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              boxShadow: "0 8px 40px rgba(220, 38, 38, 0.1), 0 2px 8px rgba(220, 38, 38, 0.06)",
            },
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          <Box sx={{ height: 4, background: "linear-gradient(90deg, #DC2626, #F59E0B)" }} />

          <CardContent sx={{ p: isMobile ? 3.5 : 5 }}>
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              {/* Logo */}
              <Box
                sx={{
                  position: "relative",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(220, 38, 38, 0.1) 0%, rgba(220, 38, 38, 0) 70%)",
                    zIndex: -1,
                  },
                }}
              >
                <Logo size={{ xs: 64, sm: 72 }} />
              </Box>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  color: "#DC2626",
                  letterSpacing: 0,
                  textAlign: "center",
                  fontSize: isMobile ? "1.75rem" : "2.25rem",
                }}
              >
                Access Restricted
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: "#6B7280",
                  lineHeight: 1.6,
                  textAlign: "center",
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontFamily: "inherit",
                    color: "#111827",
                    fontWeight: 600,
                  }}
                >
                  {userEmail}
                </Typography>
                {" "}is not part of the authorised PMW organisation.
              </Typography>

              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<RefreshIcon />}
                onClick={onSwitch}
                sx={{
                  backgroundColor: "#0078D4",
                  borderRadius: "8px",
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 500,
                  boxShadow: "0 2px 8px rgba(0, 120, 212, 0.2)",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    backgroundColor: "#0068C4",
                    boxShadow: "0 6px 20px rgba(0, 120, 212, 0.3)",
                  },
                }}
              >
                Switch account
              </Button>

              <Button
                variant="outlined"
                fullWidth
                size="large"
                startIcon={<LogoutIcon />}
                onClick={onLogout}
                sx={{
                  borderRadius: "8px",
                  py: 1.75,
                  fontSize: "1rem",
                  fontWeight: 500,
                  borderColor: "rgba(220, 38, 38, 0.3)",
                  color: "#DC2626",
                  borderWidth: "1.5px",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    borderColor: "#DC2626",
                    backgroundColor: "rgba(220, 38, 38, 0.04)",
                  },
                }}
              >
                Sign out
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
