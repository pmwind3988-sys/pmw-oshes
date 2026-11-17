import { useEffect, useState } from "react";
import { Box, Button, Stack, Typography, type SxProps, type Theme } from "@mui/material";
import { fadeInUp } from "../../theme";
import { radius } from "../../theme/surfaces";
import { LoadingView } from "../simple/LoadingView";

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

export const AUTH_FONT = 'var(--pmw-font-main, "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif)';

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
  progress?: number; // 0-100, no longer shown
  status?: string; // e.g. "Fetching submissions from 'Leave Form' (2/5)..."
  steps?: LoadingStep[]; // no longer shown
}

/** After this long on the loading screen, offer a way out of a stuck load. */
export const SLOW_AFTER_MS = 10_000;

/** Whether a load has been running long enough to offer "Try again". */
export function isLoadSlow(elapsedMs: number): boolean {
  return elapsedMs >= SLOW_AFTER_MS;
}

/** The "taking longer than usual" line and its retry button, shown under the loading bar. */
export function SlowLoadNotice() {
  return (
    <Stack spacing={1.5} sx={{ alignItems: "center", mt: 2 }}>
      <Typography sx={{ fontSize: 15, color: "text.secondary", textAlign: "center" }}>Taking longer than usual.</Typography>
      <Button
        variant="contained"
        onClick={() => window.location.reload()}
        sx={{ minHeight: 44, px: 3, borderRadius: radius.full, textTransform: "none", fontWeight: 600, boxShadow: "none" }}
      >
        Try again
      </Button>
    </Stack>
  );
}

/** The loading view, plus the slow-load notice once `slow` is set. */
export function LoadingScreenBody({ status, slow }: { status?: string; slow: boolean }) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <LoadingView status={status} />
      {slow && <SlowLoadNotice />}
    </Box>
  );
}

/** Shown while the portal loads. After SLOW_AFTER_MS it offers a reload, so a stuck load has a way out. */
export default function LoadingScreen({ status }: LoadingScreenProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return <LoadingScreenBody status={status} slow={slow} />;
}
