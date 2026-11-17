import { useState, type ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { DEV_ROLE_OPTIONS, isDevRoleSwitchEnabled, readDevRole, writeDevRole } from "../../utils/devRoleOverride";
import { setStoredAuthDecision } from "../../utils/authDecision";
import type { PortalRole } from "../../types";
import Logo from "../Logo";
import Mascot from "../simple/Mascot";
import { radius } from "../../theme/surfaces";

interface SignInScreenProps {
  onLogin: () => void;
}

/** Microsoft's four-square mark. Their branding guidance wants it on the button that starts their sign-in. */
function MicrosoftMark() {
  return (
    <Box component="svg" width={20} height={20} viewBox="0 0 20 20" aria-hidden="true" focusable="false" sx={{ display: "block" }}>
      <rect x="0" y="0" width="9" height="9" fill="#F25022" />
      <rect x="11" y="0" width="9" height="9" fill="#7FBA00" />
      <rect x="0" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </Box>
  );
}

const SECONDARY_BUTTON_SX = {
  height: 56,
  borderRadius: radius.full,
  textTransform: "none",
  fontWeight: 700,
  fontSize: 17,
  color: "text.primary",
  borderColor: "divider",
  boxShadow: "none",
} as const;

/**
 * The shared sign-in layout, used by the sign-in screen and the guest page. A
 * colour panel with the mascot and a one-line promise on the left; the welcome
 * and the buttons on the right. On a phone the panel sits above the buttons.
 */
export function SignInPage({
  onSignIn,
  secondaryAction,
  smallPrint,
  children,
}: {
  onSignIn: () => void;
  secondaryAction?: { label: string; onClick: () => void };
  smallPrint: string;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
        bgcolor: "background.default",
      }}
    >
      <Stack
        sx={{
          bgcolor: "primary.main",
          color: "common.white",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 3,
          px: 4,
          py: { xs: 5, md: 6 },
        }}
      >
        <Mascot mood="hello" size={220} />
        <Typography sx={{ fontWeight: 700, fontSize: { xs: 22, md: 28 }, lineHeight: 1.3, color: "common.white", maxWidth: 420 }}>
          File a safety form in a minute. See where it is at any time.
        </Typography>
      </Stack>

      <Box component="main" sx={{ display: "flex", alignItems: "center", justifyContent: "center", px: { xs: 3, md: 6 }, py: { xs: 5, md: 6 } }}>
        <Stack spacing={2.5} sx={{ width: "100%", maxWidth: 420 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box sx={{ bgcolor: "background.paper", borderRadius: radius.full, p: 0.75, display: "flex" }}>
              <Logo size={40} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 18 }}>OSHES Forms</Typography>
          </Stack>

          <Typography component="h1" sx={{ mt: 2, fontWeight: 800, fontSize: { xs: 40, md: 52 }, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Welcome
          </Typography>
          <Typography sx={{ fontSize: 17, lineHeight: 1.5, color: "text.secondary" }}>
            Sign in with your PMW work account to file, track and sign forms.
          </Typography>

          <Button
            variant="contained"
            fullWidth
            onClick={onSignIn}
            startIcon={<MicrosoftMark />}
            sx={{
              mt: 1,
              height: 56,
              borderRadius: radius.full,
              textTransform: "none",
              fontWeight: 700,
              fontSize: 17,
              bgcolor: "text.primary",
              color: "background.paper",
              boxShadow: "none",
              "&:hover": { bgcolor: "text.primary", opacity: 0.9, boxShadow: "none" },
            }}
          >
            Sign in with Microsoft 365
          </Button>

          {secondaryAction && (
            <Button variant="outlined" fullWidth onClick={secondaryAction.onClick} sx={SECONDARY_BUTTON_SX}>
              {secondaryAction.label}
            </Button>
          )}

          <Typography sx={{ fontSize: 14, lineHeight: 1.5, color: "text.secondary" }}>{smallPrint}</Typography>
          <Box
            component="a"
            href="/privacy"
            sx={{ color: "primary.main", fontWeight: 600, fontSize: 14, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            Privacy notice
          </Box>

          {children}
        </Stack>
      </Box>
    </Box>
  );
}

export default function SignInScreen({ onLogin }: SignInScreenProps) {
  const [devRole, setDevRole] = useState<PortalRole | null>(() => readDevRole());
  const showDevRoles = isDevRoleSwitchEnabled();

  const pickDevRole = (role: PortalRole) => {
    const next = devRole === role ? null : role;
    writeDevRole(next);
    setDevRole(next);
  };

  // The guest path is decided at start-up from the stored choice, so record it and reload.
  const continueWithoutSignIn = () => {
    setStoredAuthDecision("guest");
    window.location.reload();
  };

  const currentRole = DEV_ROLE_OPTIONS.find((option) => option.role === devRole) ?? null;

  return (
    <SignInPage
      onSignIn={onLogin}
      secondaryAction={{ label: "Continue without signing in", onClick: continueWithoutSignIn }}
      smallPrint="Without signing in you can file public forms and track one by its reference no."
    >
      {showDevRoles && (
        <Box sx={{ p: 2, borderRadius: radius.lg, bgcolor: "background.paper" }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Preview as (dev only)</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }}>
            {DEV_ROLE_OPTIONS.map((option) => {
              const active = devRole === option.role;
              return (
                <Button
                  key={option.role}
                  variant={active ? "contained" : "outlined"}
                  aria-pressed={active}
                  title={option.description}
                  onClick={() => pickDevRole(option.role)}
                  sx={{ minHeight: 44, borderRadius: radius.full, textTransform: "none", fontWeight: 600 }}
                >
                  {option.label}
                </Button>
              );
            })}
          </Stack>
          <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: "text.secondary", mt: 1 }}>
            {currentRole
              ? `${currentRole.label} sees: ${currentRole.description.toLowerCase()}. Sign in to open it.`
              : "Pick a role to preview it. Sign in to open the real view."}
          </Typography>
        </Box>
      )}
    </SignInPage>
  );
}
