import { Box, Stack, Typography } from "@mui/material";
import { LogOut as LogoutIcon, Lock as LockIcon, RefreshCw as RefreshIcon, Users as SwitchAccountIcon } from "../ui/Icons";
import { authCardSx, authPageSx, authPill, authSoft, AUTH_FONT } from "./LoadingScreen";

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
  return (
    <Box sx={authPageSx}>
      <Stack spacing={3} sx={{ ...authCardSx, maxWidth: 480, alignItems: "center" }}>
        <Box
          sx={{
            width: 112,
            height: 112,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: authSoft.lilacContainer,
            color: authSoft.onLilacContainer,
            flexShrink: 0,
          }}
        >
          <LockIcon size={48} />
        </Box>

        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography component="h1" sx={{ fontFamily: AUTH_FONT, fontSize: { xs: 26, sm: 30 }, fontWeight: 800, lineHeight: 1.2 }}>
            Access restricted
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 400, textWrap: "pretty" }}>
            Ask an administrator to add this exact account as a SharePoint site member, then try again.
          </Typography>
        </Stack>

        {userEmail && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderRadius: 999,
              backgroundColor: authSoft.ground,
              color: authSoft.ink,
              fontWeight: 700,
              fontSize: 15,
              overflowWrap: "anywhere",
              maxWidth: "100%",
            }}
          >
            {userEmail}
          </Box>
        )}

        <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: authSoft.muted, maxWidth: 400 }}>
          This Microsoft 365 account can sign in, but it does not have access to the configured OSHES SharePoint site.
        </Typography>

        <Stack spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
          <Box component="button" type="button" onClick={onRetry} sx={{ ...authPill.filled, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <RefreshIcon size={18} />
            Try again
          </Box>
          <Box component="button" type="button" onClick={onSwitch} sx={{ ...authPill.ghost, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <SwitchAccountIcon size={18} />
            Switch account
          </Box>
          <Box component="button" type="button" onClick={onSignOut} sx={{ ...authPill.ghost, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <LogoutIcon size={18} />
            Sign out
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
