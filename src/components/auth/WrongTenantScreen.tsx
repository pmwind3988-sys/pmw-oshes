import { Box, Stack, Typography } from "@mui/material";
import { LogOut as LogoutIcon, RefreshCw as RefreshIcon, ShieldAlert as ShieldIcon } from "../ui/Icons";
import { authCardSx, authPageSx, authPill, authSoft, AUTH_FONT } from "./LoadingScreen";

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
            backgroundColor: authSoft.amberContainer,
            color: authSoft.onAmberContainer,
            flexShrink: 0,
          }}
        >
          <ShieldIcon size={48} />
        </Box>

        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography component="h1" sx={{ fontFamily: AUTH_FONT, fontSize: { xs: 26, sm: 30 }, fontWeight: 800, lineHeight: 1.2 }}>
            Access restricted
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 400, overflowWrap: "anywhere", textWrap: "pretty" }}>
            <Box component="span" sx={{ color: authSoft.ink, fontWeight: 700 }}>
              {userEmail}
            </Box>{" "}
            is not part of the authorised PMW organisation.
          </Typography>
        </Stack>

        <Stack spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>
          <Box component="button" type="button" onClick={onSwitch} sx={{ ...authPill.filled, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <RefreshIcon size={18} />
            Switch account
          </Box>
          <Box component="button" type="button" onClick={onLogout} sx={{ ...authPill.ghost, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <LogoutIcon size={18} />
            Sign out
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
