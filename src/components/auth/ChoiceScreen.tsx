import { Box, Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import { LogIn as LoginIcon } from "../ui/Icons";
import { authCardSx, authPageSx, authPill, authSoft, AUTH_FONT } from "./LoadingScreen";

interface ChoiceScreenProps {
  onLogin: () => void;
  onGuest: () => void;
}

export default function ChoiceScreen({ onLogin }: ChoiceScreenProps) {
  return (
    <Box sx={authPageSx}>
      <Stack component="section" spacing={3} sx={{ ...authCardSx, maxWidth: 480, alignItems: "center" }}>
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
          <LoginIcon size={48} />
        </Box>

        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography
            component="h1"
            sx={{ fontFamily: AUTH_FONT, fontSize: { xs: 28, sm: 34 }, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.01em" }}
          >
            PMW OSHES Forms
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 380, textWrap: "pretty" }}>
            Sign in with your Microsoft 365 account to access your submission history.
          </Typography>
        </Stack>

        <Box
          component="button"
          type="button"
          onClick={() => {
            onLogin();
          }}
          sx={{ ...authPill.filled, width: "100%", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1 }}
        >
          <LoginIcon size={18} />
          Sign in with Microsoft 365
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              size="small"
              sx={{
                color: authSoft.muted,
                "&.Mui-checked": { color: authSoft.primary },
              }}
            />
          }
          label={
            <Typography sx={{ fontFamily: AUTH_FONT, fontSize: 14, color: authSoft.muted }}>Remember my choice on this device</Typography>
          }
          sx={{ m: 0 }}
        />

        <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: authSoft.muted, maxWidth: 380 }}>
          Only authorised PMW Microsoft 365 accounts are permitted. Public forms remain available through their direct links.{" "}
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
