import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Login as LoginIcon } from "@mui/icons-material";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";
import { editorial, editorialShadow } from "../../theme/editorial";

interface ChoiceScreenProps {
  onLogin: () => void;
  onGuest: () => void;
}

export default function ChoiceScreen({ onLogin }: ChoiceScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));

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
        padding: isMobile ? 2 : isTablet ? 3 : 4,
      }}
    >
      {/* Decorative background - refined gradient mesh */}
      <Box
        sx={{
          position: "absolute",
          display: "none",
          top: "-20%",
          right: "-15%",
          width: isMobile ? "350px" : "600px",
          height: isMobile ? "350px" : "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0, 120, 212, 0.05) 0%, rgba(0, 120, 212, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          display: "none",
          bottom: "-25%",
          left: "-20%",
          width: isMobile ? "400px" : "700px",
          height: isMobile ? "400px" : "700px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(98, 100, 167, 0.04) 0%, rgba(98, 100, 167, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        sx={{
          position: "absolute",
          display: "none",
          top: "35%",
          left: "55%",
          width: isMobile ? "250px" : "450px",
          height: isMobile ? "250px" : "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(98, 100, 167, 0.03) 0%, rgba(98, 100, 167, 0) 70%)",
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
        <path d="M0 120 Q360 80 720 140 T1440 100" stroke="rgba(0, 120, 212, 0.04)" strokeWidth="1.5" />
        <path d="M0 780 Q360 820 720 760 T1440 800" stroke="rgba(98, 100, 167, 0.04)" strokeWidth="1.5" />
        <circle cx="1200" cy="150" r="100" stroke="rgba(0, 120, 212, 0.03)" strokeWidth="1" />
        <circle cx="180" cy="720" r="70" stroke="rgba(98, 100, 167, 0.03)" strokeWidth="1" />
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
            {/* Logo with subtle glow */}
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
                  width: isMobile ? 88 : 104,
                  height: isMobile ? 88 : 104,
                  borderRadius: "50%",
                  background: editorial.blueWash,
                  border: `1px solid ${editorial.border}`,
                  zIndex: -1,
                },
              }}
            >
              <Logo size={{ xs: 72, sm: 80, md: 88 }} />
            </Box>

            <Typography
              variant="h2"
              component="h1"
              gutterBottom
              align="center"
              sx={{
                fontFamily: "Georgia, 'Times New Roman', Times, serif",
                fontWeight: 400,
                color: editorial.ink,
                letterSpacing: 0,
                fontSize: isMobile ? "2.6rem" : "4rem",
                lineHeight: 0.98,
              }}
            >
              PMW OSHE Forms
            </Typography>

            <Typography
              variant="body1"
              align="center"
              sx={{
                mb: 4,
                maxWidth: 380,
                lineHeight: 1.6,
                color: editorial.ink,
                fontSize: "1rem",
              }}
            >
              Sign in with your Microsoft 365 account to access your submission history.
            </Typography>

            <Stack spacing={2.5} sx={{ width: "100%" }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<LoginIcon />}
                onClick={() => {
                  onLogin();
                }}
                sx={{
                  // A deliberately inverted CTA: the ink colour as a fill, the
                  // panel colour as its text. Stated as the inverse pair rather
                  // than as black-on-white so it stays inverted on a dark theme
                  // instead of becoming a black button on a black page.
                  backgroundColor: editorial.inverseSurface,
                  color: editorial.inverseInk,
                  borderRadius: 0,
                  py: 1.75,
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

              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    sx={{
                      color: editorial.softMuted,
                      "&.Mui-checked": {
                        color: editorial.ink,
                      },
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ color: "#6B7280", fontSize: "0.85rem" }}>
                    Remember my choice on this device
                  </Typography>
                }
                sx={{
                  width: "100%",
                  justifyContent: "center",
                  mx: "auto",
                }}
              />

              <Divider>
              </Divider>
            </Stack>

            <Typography
              variant="caption"
              align="center"
              sx={{
                mt: 4,
                color: editorial.muted,
                fontSize: "0.75rem",
                lineHeight: 1.6,
                maxWidth: 380,
              }}
            >
              Only authorised PMW Microsoft 365 accounts are permitted. Public forms remain available through their direct links.
              {" "}
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
