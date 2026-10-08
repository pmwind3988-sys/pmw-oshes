import { Box, Stack, Typography } from "@mui/material";
import { AlertTriangle as AlertIcon, LogIn as LoginIcon, LogOut as LogoutIcon, RefreshCw as RefreshIcon } from "../ui/Icons";
import { authCardSx, authPageSx, authPill, authSoft, AUTH_FONT, StepPills, type LoadingStep } from "./LoadingScreen";

interface ErrorScreenProps {
  errorMsg: string;
  onRetry: () => void;
  onSignOut?: () => void;
  title?: string;
  primaryActionLabel?: string;
  primaryActionIcon?: "refresh" | "login";
  recoverySteps?: LoadingStep[];
}

/** A failed load, with one way forward. The primary action is the only filled pill. */
export default function ErrorScreen({
  errorMsg,
  onRetry,
  onSignOut,
  title = "Something went wrong",
  primaryActionLabel = "Try again",
  primaryActionIcon = "refresh",
  recoverySteps,
}: ErrorScreenProps) {
  const primaryIcon = primaryActionIcon === "login" ? <LoginIcon size={18} /> : <RefreshIcon size={18} />;
  const hasRecoverySteps = Boolean(recoverySteps?.length);

  return (
    <Box sx={authPageSx}>
      <Stack component="section" role="alert" spacing={3} sx={{ ...authCardSx, maxWidth: 480, alignItems: "center" }}>
        <Box
          sx={{
            width: 112,
            height: 112,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: authSoft.amberContainer,
            color: authSoft.onAmberContainer,
            flexShrink: 0,
          }}
        >
          <AlertIcon size={48} />
        </Box>

        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography
            component="h1"
            sx={{ fontFamily: AUTH_FONT, fontSize: { xs: 26, sm: 30 }, fontWeight: 800, lineHeight: 1.2, textWrap: "balance" }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 380, overflowWrap: "anywhere", textWrap: "pretty" }}>
            {errorMsg}
          </Typography>
        </Stack>

        {hasRecoverySteps && <StepPills steps={recoverySteps ?? []} />}

        <Stack spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
          <Box component="button" type="button" onClick={onRetry} sx={{ ...authPill.filled, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            {primaryIcon}
            {primaryActionLabel}
          </Box>

          {onSignOut && (
            <Box component="button" type="button" onClick={onSignOut} sx={{ ...authPill.ghost, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
              <LogoutIcon size={18} />
              Sign out
            </Box>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
