import {
  Box,
  CircularProgress,
  Container,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";

export type LoadingStepStatus = "pending" | "active" | "complete" | "error";

export interface LoadingStep {
  label: string;
  description?: string;
  status: LoadingStepStatus;
}

interface LoadingScreenProps {
  userEmail?: string;
  progress?: number; // 0-100
  status?: string; // e.g. "Fetching submissions from 'Leave Form' (2/5)..."
  steps?: LoadingStep[];
}

function getStepColor(status: LoadingStepStatus): string {
  if (status === "complete") return "#107C10";
  if (status === "error") return "#DC2626";
  if (status === "active") return "#0078D4";
  return "#9CA3AF";
}

function StepIcon({ status }: { status: LoadingStepStatus }) {
  const color = getStepColor(status);

  if (status === "complete") {
    return <CheckCircleOutlinedIcon sx={{ color, fontSize: 20 }} />;
  }

  if (status === "error") {
    return <ErrorOutlinedIcon sx={{ color, fontSize: 20 }} />;
  }

  if (status === "active") {
    return <CircularProgress size={18} thickness={5} sx={{ color }} />;
  }

  return <RadioButtonUncheckedIcon sx={{ color, fontSize: 20 }} />;
}

export default function LoadingScreen({ userEmail, progress, status, steps }: LoadingScreenProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const hasProgress = typeof progress === "number" && progress > 0;
  const hasSteps = Boolean(steps?.length);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#F8F9FC",
        position: "relative",
        overflow: "hidden",
        padding: isMobile ? 2 : 4,
      }}
    >
      {/* Decorative background blobs */}
      <Box
        sx={{
          position: "absolute",
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
        <Stack
          spacing={4}
          sx={{
            alignItems: "center",
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          <Logo size={{ xs: 56, sm: 72 }} />

          {/* Animated spinner with glow */}
          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(0, 120, 212, 0.15) 0%, rgba(0, 120, 212, 0) 70%)",
                animation: "pulse 2s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { transform: "translate(-50%, -50%) scale(1)", opacity: 0.3 },
                  "50%": { transform: "translate(-50%, -50%) scale(1.1)", opacity: 0 },
                },
              }}
            />
            {hasProgress && progress < 100 ? (
              <CircularProgress
                variant="determinate"
                value={progress}
                size={80}
                thickness={4}
                sx={{ color: "#0078D4" }}
              />
            ) : (
              <CircularProgress size={72} thickness={4} sx={{ color: "#0078D4" }} />
            )}
          </Box>

          {/* Percentage for determinate state */}
          {hasProgress && progress < 100 && (
            <Typography
              variant="h2"
              sx={{
                fontWeight: 700,
                color: "#111827",
                letterSpacing: 0,
                fontSize: "2.25rem",
              }}
            >
              {progress}%
            </Typography>
          )}

          <Stack spacing={1.5} sx={{ alignItems: "center" }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: "#111827",
                letterSpacing: 0,
              }}
            >
              {hasProgress && progress < 100 ? "Loading..." : "Please wait..."}
            </Typography>

            {status && (
              <Typography
                variant="body1"
                sx={{
                  color: "#6B7280",
                  textAlign: "center",
                  minHeight: "1.5em",
                  maxWidth: 400,
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                }}
              >
                {status}
              </Typography>
            )}
          </Stack>

          {hasProgress && (
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                width: "100%",
                maxWidth: 360,
                borderRadius: 4,
                height: 8,
                backgroundColor: "rgba(0, 120, 212, 0.1)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 4,
                  backgroundColor: "#0078D4",
                },
              }}
            />
          )}

          {hasSteps && (
            <Stack
              component="ol"
              spacing={1}
              sx={{
                width: "100%",
                maxWidth: 440,
                m: 0,
                p: 1,
                listStyle: "none",
                borderRadius: "12px",
                backgroundColor: "rgba(255, 255, 255, 0.78)",
                boxShadow: "0 16px 44px rgba(15, 23, 42, 0.08)",
              }}
            >
              {steps?.map((step) => {
                const color = getStepColor(step.status);
                const isActive = step.status === "active";

                return (
                  <Box
                    component="li"
                    key={step.label}
                    aria-current={isActive ? "step" : undefined}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr",
                      gap: 1.25,
                      alignItems: "start",
                      px: 1.5,
                      py: 1.25,
                      borderRadius: "8px",
                      backgroundColor: isActive ? "rgba(0, 120, 212, 0.08)" : "transparent",
                    }}
                  >
                    <Box sx={{ minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <StepIcon status={step.status} />
                    </Box>

                    <Stack spacing={0.25}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: step.status === "pending" ? "#6B7280" : "#111827",
                          fontWeight: isActive ? 700 : 600,
                          lineHeight: 1.35,
                        }}
                      >
                        {step.label}
                      </Typography>
                      {step.description && (
                        <Typography
                          variant="caption"
                          sx={{
                            color,
                            lineHeight: 1.45,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {step.description}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}

          {userEmail && (
            <Typography
              variant="caption"
              sx={{
                color: "#9CA3AF",
                fontSize: "0.75rem",
                lineHeight: 1.5,
                letterSpacing: 0,
                fontWeight: 500,
              }}
            >
              Signed in as {userEmail}
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
