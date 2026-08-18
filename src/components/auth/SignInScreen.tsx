import { useState } from "react";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { panelSx } from "../../theme/surfaces";
import { OSHE_APP } from "../../config/oshe";
import { DEV_ROLE_OPTIONS, isDevRoleSwitchEnabled, readDevRole, writeDevRole } from "../../utils/devRoleOverride";
import type { PortalRole } from "../../types";
import Logo from "../Logo";
import IdleAnimationPanel from "./IdleAnimationPanel";

interface SignInScreenProps {
  onLogin: () => void;
}

/** Microsoft's four-square mark. Their branding guidance wants it on the button that starts their sign-in. */
function MicrosoftMark() {
  return (
    <Box component="svg" viewBox="0 0 20 20" aria-hidden focusable="false" sx={{ width: 18, height: 18, flexShrink: 0 }}>
      <rect x="0" y="0" width="9" height="9" fill="#F25022" />
      <rect x="11" y="0" width="9" height="9" fill="#7FBA00" />
      <rect x="0" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </Box>
  );
}

/**
 * One door in, presented as a single centred card: the mark, the product name,
 * and the Microsoft button. The public report and tracking flows are reached by
 * their own links off the poster, so they are no longer offered here — this
 * screen is only ever seen by someone who has an account to sign in with.
 *
 * The idle animation is the left column on a wide screen. A phone has no room
 * for a column, so rather than drop it the animation becomes a backdrop behind
 * the card: held back to a wash so it reads as texture and never as something
 * to look at, with the card opaque over it.
 *
 * This is not a password form. Sign-in goes through the existing MSAL redirect;
 * the demo-account list from the prototype becomes a dev-only role switcher.
 */
export default function SignInScreen({ onLogin }: SignInScreenProps) {
  const [devRole, setDevRole] = useState<PortalRole | null>(() => readDevRole());
  const showDevRoles = isDevRoleSwitchEnabled();

  const pickDevRole = (role: PortalRole) => {
    const next = devRole === role ? null : role;
    writeDevRole(next);
    setDevRole(next);
  };

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
        background: editorial.panel,
        color: editorial.ink,
      }}
    >
      {/* Phone only: the same animation, dimmed to a backdrop rather than lost. */}
      <Box
        aria-hidden
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.42,
          zIndex: 0,
        }}
      >
        <IdleAnimationPanel sx={{ my: 0 }} />
      </Box>

      <Box
        sx={{
          p: { xs: 3, md: 5 },
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: editorialHairline,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>PMW OSHE</Typography>
          <Typography
            sx={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: editorial.muted,
              fontWeight: 700,
            }}
          >
            Safety · Health · Environment · Security
          </Typography>
        </Box>

        <IdleAnimationPanel />

        <Typography sx={{ fontSize: 11, color: editorial.muted }}>
          {OSHE_APP.name} · sign in with your Microsoft 365 work account
        </Typography>
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 3, md: 5 },
        }}
      >
        <Box
          sx={{
            ...panelSx,
            width: "100%",
            maxWidth: 420,
            p: { xs: 3, sm: 4 },
            textAlign: "center",
            // Only the phone needs the lift: there the card floats over the
            // animation, and a hairline alone leaves it sitting in the texture.
            boxShadow: {
              xs: `0 24px 60px color-mix(in srgb, ${editorial.ink} 18%, transparent)`,
              md: "none",
            },
          }}
        >
          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <Logo size={48} />

            <Box>
              <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
                {OSHE_APP.name}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, color: editorial.muted }}>
                Sign in to reach your submissions, approvals, and the forms assigned to you.
              </Typography>
            </Box>

            <Button
              variant="contained"
              onClick={onLogin}
              startIcon={<MicrosoftMark />}
              sx={{ minHeight: 48, width: "100%" }}
            >
              Continue with Microsoft 365
            </Button>
          </Stack>

          {showDevRoles && (
            <Stack spacing={1.5} sx={{ mt: 2.5, textAlign: "left" }}>
              <Divider sx={{ borderColor: editorial.border }} />
              <Typography
                sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: editorial.muted, fontWeight: 800 }}
              >
                Dev only — preview a role view
              </Typography>
              <Stack>
                {DEV_ROLE_OPTIONS.map((option) => {
                  const active = devRole === option.role;
                  return (
                    <Box
                      key={option.role}
                      component="button"
                      type="button"
                      onClick={() => pickDevRole(option.role)}
                      sx={{
                        minHeight: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        px: 1.5,
                        py: 1,
                        textAlign: "left",
                        cursor: "pointer",
                        border: "none",
                        borderTop: editorialHairline,
                        background: active ? editorial.blueWash : "transparent",
                        color: "inherit",
                        font: "inherit",
                        "&:hover": { background: editorial.blueWash },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{option.label}</Typography>
                        <Typography sx={{ fontSize: 11, color: editorial.muted }}>{option.description}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 800, color: active ? editorial.pmwBlueDark : editorial.softMuted }}>
                        {active ? "Active" : "Preview"}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Stack>
          )}

          <Divider sx={{ mt: 3, mb: 2, borderColor: editorial.border }} />
          <Typography sx={{ fontSize: 12, lineHeight: 1.6, color: editorial.muted }}>
            Only PMW Microsoft 365 work accounts can sign in.{" "}
            <Box component="a" href="/privacy" sx={{ color: editorial.ink, fontWeight: 800, textDecoration: "underline" }}>
              Privacy Notice
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
