import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material";
import { AlertCircle as ErrorOutlinedIcon, Check as CheckIcon, RefreshCw as RefreshIcon } from "../ui/Icons";
import { fadeInUp } from "../../theme";
import Logo from "../../components/Logo";

/*
 * Soft UI tokens for the sign-in, loading and auth-state screens. They are
 * shared here so the eight auth files read the same surfaces, pills and step
 * colours without a second token module. These screens stay light in every
 * appearance theme on purpose: the ground, card and ink pair must not invert.
 */
export const authSoft = {
  ground: "#EEF2F8",
  surface: "#FFFFFF",
  soft: "#F5F7FB",
  chip: "#EDF0F5",
  ink: "#161B24",
  muted: "#586174",
  bodyStrong: "#3B4352",
  divider: "#E3E8F0",
  primary: "#1A5FD0",
  primaryHover: "#174FB0",
  primaryContainer: "#D9E5FB",
  onPrimaryContainer: "#0B3B8C",
  selectedNav: "#C9DAF8",
  amberContainer: "#FCEFC7",
  onAmberContainer: "#6B4A00",
  amber: "#B15C00",
  redContainer: "#FADBD8",
  onRedContainer: "#8C1D18",
  red: "#B3261E",
  greenContainer: "#D5F0E1",
  onGreenContainer: "#0E5233",
  green: "#2E9D6A",
  lilacContainer: "#E7DEF8",
  onLilacContainer: "#4A2D85",
  focus: "#9DBDF5",
  cardShadow: "0 10px 40px rgba(22, 27, 36, 0.06)",
} as const;

export const AUTH_FONT = 'Figtree, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const pillBase = {
  minHeight: 52,
  px: 3,
  borderRadius: 999,
  textTransform: "none",
  fontFamily: AUTH_FONT,
  fontWeight: 700,
  fontSize: 16,
  boxShadow: "none",
  transition: "background-color 0.2s ease, box-shadow 0.2s ease, transform 0.12s ease",
  "&:active": { transform: "scale(0.97)" },
  "&:focus-visible": { outline: `3px solid ${authSoft.focus}`, outlineOffset: 2 },
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
} as const satisfies SxProps<Theme>;

/** The pill buttons on these screens: one filled per view, the rest ghost or tonal. */
export const authPill = {
  filled: {
    ...pillBase,
    backgroundColor: authSoft.primary,
    color: "#FFFFFF",
    "&:hover": { backgroundColor: authSoft.primaryHover, boxShadow: "0 6px 16px rgba(26, 95, 208, 0.28)" },
  },
  tonal: {
    ...pillBase,
    backgroundColor: authSoft.primaryContainer,
    color: authSoft.onPrimaryContainer,
    "&:hover": { backgroundColor: authSoft.selectedNav },
  },
  ghost: {
    ...pillBase,
    backgroundColor: authSoft.ground,
    color: authSoft.bodyStrong,
    "&:hover": { backgroundColor: "#E1E6EE" },
  },
} as const satisfies Record<"filled" | "tonal" | "ghost", SxProps<Theme>>;

/** The white card the state screens sit in, centred on the ground. */
export const authCardSx = {
  width: "100%",
  maxWidth: 480,
  backgroundColor: authSoft.surface,
  borderRadius: "32px",
  boxShadow: authSoft.cardShadow,
  p: { xs: 3, sm: 5 },
  textAlign: "center",
  animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
} as const satisfies SxProps<Theme>;

export const authPageSx = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: authSoft.ground,
  p: { xs: 2, sm: 4 },
  fontFamily: AUTH_FONT,
  color: authSoft.ink,
} as const satisfies SxProps<Theme>;

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

/** How long a load may run before the page offers a way out. */
const SLOW_AFTER_MS = 10_000;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const RING_SIZE = 168;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * One ring for every wait. With a `progress` it fills to that share; without
 * one it turns gently on a short arc, so the screen never looks frozen.
 */
function ProgressRing({ progress }: { progress?: number }) {
  const determinate = typeof progress === "number";
  const fraction = determinate ? Math.min(100, Math.max(0, progress)) / 100 : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - fraction);

  return (
    <Box sx={{ position: "relative", width: RING_SIZE, height: RING_SIZE, flexShrink: 0 }}>
      <Box
        component="svg"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        aria-hidden
        focusable="false"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transform: "rotate(-90deg)",
          animation: determinate ? "none" : `${spin} 2.4s linear infinite`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={authSoft.ground}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={authSoft.primary}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={determinate ? RING_CIRCUMFERENCE : `${RING_CIRCUMFERENCE * 0.28} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={determinate ? dashOffset : 0}
          style={{ transition: determinate ? "stroke-dashoffset 0.6s ease" : undefined }}
        />
      </Box>

      <Box
        sx={{
          position: "absolute",
          inset: 26,
          borderRadius: 999,
          backgroundColor: authSoft.soft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Logo size={72} />
      </Box>
    </Box>
  );
}

/** Steps as pills: done is a green container with a check, active a primary container with a dot, pending neutral. */
export function StepPills({ steps }: { steps: LoadingStep[] }) {
  const described = steps.filter((step) => step.description && (step.status === "active" || step.status === "error"));

  return (
    <Stack spacing={1.5} sx={{ alignItems: "center", width: "100%" }}>
      <Stack
        component="ol"
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", justifyContent: "center", gap: 1.25, m: 0, p: 0, listStyle: "none" }}
      >
        {steps.map((step) => {
          const isActive = step.status === "active";
          const palette = pillPalette(step.status);

          return (
            <Box
              component="li"
              key={step.label}
              aria-current={isActive ? "step" : undefined}
              sx={{
                height: 40,
                pl: 1,
                pr: 2,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                fontFamily: AUTH_FONT,
                fontSize: 15,
                fontWeight: 600,
                transition: "background-color 0.3s ease",
                backgroundColor: palette.background,
                color: palette.color,
              }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  backgroundColor: palette.dot,
                  color: "#FFFFFF",
                }}
              >
                {step.status === "complete" && <CheckIcon size={14} strokeWidth={3} />}
                {step.status === "error" && <ErrorOutlinedIcon size={14} strokeWidth={2.6} />}
                {step.status === "active" && (
                  <Box sx={{ width: 8, height: 8, borderRadius: 999, backgroundColor: authSoft.primary }} />
                )}
              </Box>
              {step.label}
            </Box>
          );
        })}
      </Stack>

      {described.map((step) => (
        <Typography key={`${step.label}-note`} sx={{ fontSize: 13, color: authSoft.muted, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {step.description}
        </Typography>
      ))}
    </Stack>
  );
}

function pillPalette(status: LoadingStepStatus): { background: string; color: string; dot: string } {
  if (status === "complete") {
    return { background: authSoft.greenContainer, color: authSoft.onGreenContainer, dot: authSoft.green };
  }
  if (status === "error") {
    return { background: authSoft.redContainer, color: authSoft.onRedContainer, dot: authSoft.red };
  }
  if (status === "active") {
    return { background: authSoft.primaryContainer, color: authSoft.onPrimaryContainer, dot: "#FFFFFF" };
  }
  return { background: authSoft.chip, color: authSoft.muted, dot: authSoft.divider };
}

export default function LoadingScreen({ userEmail, progress, status, steps }: LoadingScreenProps) {
  const [slow, setSlow] = useState(false);
  const hasProgress = typeof progress === "number" && progress > 0;
  const hasSteps = Boolean(steps?.length);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Box sx={authPageSx}>
      <Stack
        role="status"
        aria-live="polite"
        spacing={3}
        sx={{ ...authCardSx, maxWidth: 520, alignItems: "center" }}
      >
        <ProgressRing progress={hasProgress ? progress : undefined} />

        <Stack spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography component="h1" sx={{ fontFamily: AUTH_FONT, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>
            Getting things ready
          </Typography>
          {status && (
            <Typography sx={{ fontSize: 15, color: authSoft.muted, lineHeight: 1.5, maxWidth: 420, overflowWrap: "anywhere" }}>
              {status}
            </Typography>
          )}
          {userEmail && (
            <Typography sx={{ fontSize: 14, color: authSoft.muted, overflowWrap: "anywhere" }}>
              Signed in as {userEmail}
            </Typography>
          )}
        </Stack>

        {hasSteps && <StepPills steps={steps ?? []} />}

        {slow && (
          <Stack
            direction="row"
            useFlexGap
            spacing={1.5}
            sx={{
              width: "100%",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
              p: 2,
              borderRadius: "24px",
              backgroundColor: authSoft.amberContainer,
              color: authSoft.onAmberContainer,
              textAlign: "left",
            }}
          >
            <Typography sx={{ flex: "1 1 200px", fontWeight: 600, fontSize: 15, lineHeight: 1.45 }}>
              Taking longer than usual. Your connection or SharePoint may be slow.
            </Typography>
            <Box
              component="button"
              type="button"
              onClick={() => window.location.reload()}
              sx={{
                ...authPill.tonal,
                minHeight: 40,
                px: 2.25,
                fontSize: 15,
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <RefreshIcon size={16} />
              Try again
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
