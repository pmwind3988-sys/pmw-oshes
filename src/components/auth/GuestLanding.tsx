import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";
import { editorial, editorialShadow } from "../../theme/editorial";

interface GuestLandingProps {
  onLogin: () => void;
  onForgetChoice: () => void;
}

export default function GuestLanding({ onLogin, onForgetChoice }: GuestLandingProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 48%, #F7F5EF 100%)",
        position: "relative",
        overflow: "hidden",
        padding: isMobile ? 2 : 4,
      }}
    >
      {/* Decorative background blobs */}
      <Box
        sx={{
          position: "absolute",
          display: "none",
          top: "-15%",
          right: "-10%",
          width: isMobile ? "300px" : "500px",
          height: isMobile ? "300px" : "500px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,120,212,0.05) 0%, rgba(0,120,212,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          display: "none",
          bottom: "-20%",
          left: "-15%",
          width: isMobile ? "350px" : "600px",
          height: isMobile ? "350px" : "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(98,100,167,0.04) 0%, rgba(98,100,167,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          display: "none",
          top: "40%",
          left: "60%",
          width: isMobile ? "200px" : "350px",
          height: isMobile ? "200px" : "350px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,120,212,0.03) 0%, rgba(0,120,212,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
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
        <path
          d="M0 120 Q360 80 720 140 T1440 100"
          stroke="rgba(0,120,212,0.04)"
          strokeWidth="1.5"
        />
        <path
          d="M0 780 Q360 820 720 760 T1440 800"
          stroke="rgba(98,100,167,0.04)"
          strokeWidth="1.5"
        />
        <circle
          cx="1200"
          cy="150"
          r="80"
          stroke="rgba(0,120,212,0.03)"
          strokeWidth="1"
        />
        <circle
          cx="200"
          cy="700"
          r="60"
          stroke="rgba(98,100,167,0.03)"
          strokeWidth="1"
        />
      </svg>

      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          sx={{
            width: "100%",
            maxWidth: isMobile ? "100%" : 560,
            mx: "auto",
            borderRadius: "18px",
            boxShadow: editorialShadow,
            border: `1px solid ${editorial.ink}`,
            backgroundColor: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(10px)",
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            "&:hover": {
              boxShadow: "0 18px 42px rgba(16, 16, 16, 0.14)",
            },
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          {/* Top accent bar */}
          <Box
            sx={{
              height: 4,
              background: editorial.yellow,
              borderBottom: `1px solid ${editorial.ink}`,
              borderRadius: "18px 18px 0 0",
            }}
          />

          <CardContent
            sx={{
              padding: isMobile ? 3.5 : 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Back to choice link */}
            <Button
              variant="text"
              onClick={onForgetChoice}
              sx={{
                alignSelf: "flex-start",
                mb: 3,
                color: editorial.muted,
                fontSize: "0.85rem",
                fontWeight: 500,
                textTransform: "none",
                "&:hover": {
                  color: editorial.ink,
                  backgroundColor: editorial.blueWash,
                },
              }}
            >
              ← Back to choice
            </Button>

            {/* Logo with colored background */}
            <Box
              sx={{
                position: "relative",
                mb: 3,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: editorial.blueWash,
                  border: `1px solid ${editorial.border}`,
                  zIndex: -1,
                },
              }}
            >
              <Logo size={{ xs: 64, sm: 72 }} />
            </Box>

            <Typography
              variant="h2"
              component="h2"
              align="center"
              sx={{
                fontFamily: "Georgia, 'Times New Roman', Times, serif",
                fontWeight: 400,
                color: editorial.ink,
                letterSpacing: 0,
                fontSize: isMobile ? "2.5rem" : "3.6rem",
                lineHeight: 1,
                mb: 2,
              }}
            >
              PMW OSHE Forms
            </Typography>

            <Typography
              variant="body1"
              align="center"
              sx={{
                color: editorial.ink,
                lineHeight: 1.6,
                maxWidth: 480,
                mb: 4,
              }}
            >
              Sign in with your Microsoft 365 account to access submission history, approval status, and full portal features.
            </Typography>

            <Button
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              onClick={onLogin}
              sx={{
                // See the matching CTA in ChoiceScreen: the inverse pair, so a
                // dark theme inverts it rather than hiding it.
                backgroundColor: editorial.inverseSurface,
                color: editorial.inverseInk,
                borderRadius: 0,
                py: 1.75,
                px: 4,
                fontSize: "1rem",
                fontWeight: 800,
                boxShadow: "none",
                transition: "background-color 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, var(--pmw-inverse-surface, #000000) 82%, var(--pmw-inverse-ink, #ffffff))",
                  boxShadow: "none",
                },
              }}
            >
              Sign in with Microsoft 365
            </Button>

            <Typography
              variant="caption"
              align="center"
              sx={{ mt: 3, color: editorial.muted, fontSize: "0.75rem", lineHeight: 1.6, maxWidth: 360 }}
            >
              Public form submissions may contain personal data.{" "}
              <Box component="a" href="/privacy" sx={{ color: editorial.ink, fontWeight: 800, textDecoration: "underline" }}>
                Privacy Notice
              </Box>
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
