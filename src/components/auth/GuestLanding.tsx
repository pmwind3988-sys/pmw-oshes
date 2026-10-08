import { Box, Stack, Typography } from "@mui/material";
import { ArrowLeft as ArrowLeftIcon, LogIn as LoginIcon, User as UserIcon } from "../ui/Icons";
import { authCardSx, authPageSx, authPill, authSoft, AUTH_FONT } from "./LoadingScreen";

interface GuestLandingProps {
  onLogin: () => void;
  onForgetChoice: () => void;
}

export default function GuestLanding({ onLogin, onForgetChoice }: GuestLandingProps) {
  return (
    <Box sx={authPageSx}>
      <Stack component="section" spacing={3} sx={{ ...authCardSx, maxWidth: 480, alignItems: "center" }}>
        <Box sx={{ alignSelf: "stretch", display: "flex", justifyContent: "flex-start" }}>
          <Box
            component="button"
            type="button"
            onClick={onForgetChoice}
            sx={{ ...authPill.ghost, minHeight: 40, px: 2, fontSize: 14, border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 1 }}
          >
            <ArrowLeftIcon size={16} />
            Back to choice
          </Box>
        </Box>

        <Box
          sx={{
            width: 112,
            height: 112,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: authSoft.primaryContainer,
            color: authSoft.onPrimaryContainer,
            flexShrink: 0,
          }}
        >
          <UserIcon size={48} />
        </Box>

        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography
            component="h1"
            sx={{ fontFamily: AUTH_FONT, fontSize: { xs: 28, sm: 34 }, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.01em" }}
          >
            PMW OSHES Forms
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 400, textWrap: "pretty" }}>
            Sign in with your Microsoft 365 account to access submission history, approval status, and full portal features.
          </Typography>
        </Stack>

        <Box
          component="button"
          type="button"
          onClick={onLogin}
          sx={{ ...authPill.filled, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}
        >
          <LoginIcon size={18} />
          Sign in with Microsoft 365
        </Box>

        <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: authSoft.muted, maxWidth: 360 }}>
          Public form submissions may contain personal data.{" "}
          <Box
            component="a"
            href="/privacy"
            sx={{ color: authSoft.primary, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            Privacy notice
          </Box>
        </Typography>
      </Stack>
    </Box>
  );
}
