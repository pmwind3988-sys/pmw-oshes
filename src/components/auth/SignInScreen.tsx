import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { OSHES_APP } from "../../config/oshes";
import { DEV_ROLE_OPTIONS, isDevRoleSwitchEnabled, readDevRole, writeDevRole } from "../../utils/devRoleOverride";
import type { PortalRole } from "../../types";
import Logo from "../Logo";
import { Check as CheckIcon } from "../ui/Icons";
import IdleAnimationPanel from "./IdleAnimationPanel";
import { authPageSx, authPill, authSoft, AUTH_FONT } from "./LoadingScreen";
import { fadeInUp } from "../../theme";

interface SignInScreenProps {
  onLogin: () => void;
}

/** Microsoft's four-square mark. Their branding guidance wants it on the button that starts their sign-in. */
function MicrosoftMark() {
  return (
    <Box component="svg" viewBox="0 0 20 20" aria-hidden focusable="false" sx={{ width: 15, height: 15, flexShrink: 0 }}>
      <rect x="0" y="0" width="9" height="9" fill="#F25022" />
      <rect x="11" y="0" width="9" height="9" fill="#7FBA00" />
      <rect x="0" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </Box>
  );
}

/**
 * The sign-in screen: on a wide screen the story and the floating orbs sit on
 * the left, and a white card holds the one Microsoft button on the right. On a
 * phone the same two blocks stack, story first.
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

  const currentRole = DEV_ROLE_OPTIONS.find((option) => option.role === devRole) ?? null;

  return (
    <Box sx={{ ...authPageSx, display: "block", minHeight: "100dvh", p: 0 }}>
      <Box
        component="main"
        sx={{
          minHeight: "100dvh",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 440px)" },
          alignItems: "center",
          gap: { xs: 4, md: 6 },
          maxWidth: 1200,
          mx: "auto",
          px: { xs: 2.5, md: 5 },
          py: { xs: 4, md: 6 },
        }}
      >
        <Stack spacing={{ xs: 3, md: 3.5 }} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Logo size={44} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: AUTH_FONT, fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                {OSHES_APP.name}
              </Typography>
              <Typography sx={{ fontFamily: AUTH_FONT, fontSize: 15, color: authSoft.muted, lineHeight: 1.4 }}>
                Occupational safety, health &amp; environmental services
              </Typography>
            </Box>
          </Stack>

          <Box>
            <Typography
              component="h1"
              sx={{
                fontFamily: AUTH_FONT,
                fontSize: { xs: 40, md: 56 },
                fontWeight: 800,
                lineHeight: 1.04,
                letterSpacing: "-0.025em",
                m: 0,
              }}
            >
              Report it, sign it,
              <br />
              see it through.
            </Typography>
            <Typography
              sx={{
                fontFamily: AUTH_FONT,
                fontSize: 19,
                lineHeight: 1.55,
                color: authSoft.muted,
                mt: 2.5,
                maxWidth: 480,
              }}
            >
              Every safety form at PMW in one place. File a permit in a minute, approve from your phone, and always know
              where a record stands.
            </Typography>
          </Box>

          <IdleAnimationPanel />
        </Stack>

        <Box
          sx={{
            width: "100%",
            maxWidth: 440,
            justifySelf: { xs: "stretch", md: "end" },
            backgroundColor: authSoft.surface,
            borderRadius: "32px",
            p: { xs: 3.5, sm: 4.5 },
            boxShadow: authSoft.cardShadow,
            fontFamily: AUTH_FONT,
            animation: `${fadeInUp} 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 999,
              overflow: "hidden",
              mb: 2.5,
            }}
          >
            <Logo size={64} />
          </Box>

          <Typography component="h2" sx={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2, m: 0, mb: 1 }}>
            Welcome back
          </Typography>
          <Typography sx={{ fontSize: 16, lineHeight: 1.5, color: authSoft.muted, mb: 3.25 }}>
            Sign in with your PMW work account to see your forms, approvals and records.
          </Typography>

          <Box
            component="button"
            type="button"
            onClick={onLogin}
            sx={{
              ...authPill.filled,
              width: "100%",
              minHeight: 56,
              fontSize: 17,
              border: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 30,
                height: 30,
                borderRadius: 999,
                backgroundColor: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MicrosoftMark />
            </Box>
            Continue with Microsoft 365
          </Box>

          {showDevRoles && (
            <Box sx={{ mt: 3.5, p: 2.25, borderRadius: "24px", backgroundColor: authSoft.soft, textAlign: "left" }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Preview as</Typography>
                <Box
                  component="span"
                  sx={{
                    px: 1.25,
                    py: 0.4,
                    borderRadius: 999,
                    backgroundColor: authSoft.amberContainer,
                    color: authSoft.onAmberContainer,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Dev only
                </Box>
              </Stack>

              <Stack
                component="div"
                direction="row"
                useFlexGap
                sx={{ flexWrap: "wrap", gap: 1 }}
              >
                {DEV_ROLE_OPTIONS.map((option) => {
                  const active = devRole === option.role;
                  return (
                    <Box
                      key={option.role}
                      component="button"
                      type="button"
                      aria-pressed={active}
                      title={option.description}
                      onClick={() => pickDevRole(option.role)}
                      sx={{
                        height: 40,
                        pl: 0.75,
                        pr: 1.75,
                        border: 0,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                        cursor: "pointer",
                        fontFamily: AUTH_FONT,
                        fontSize: 14,
                        fontWeight: 600,
                        backgroundColor: active ? authSoft.primary : authSoft.surface,
                        color: active ? "#FFFFFF" : authSoft.ink,
                        transition: "background-color 0.15s ease, transform 0.12s ease",
                        "&:hover": { backgroundColor: active ? authSoft.primaryHover : "#E6ECF6" },
                        "&:active": { transform: "scale(0.97)" },
                        "&:focus-visible": { outline: `3px solid ${authSoft.focus}`, outlineOffset: 2 },
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          backgroundColor: active ? "#FFFFFF" : authSoft.ground,
                          color: active ? authSoft.primary : authSoft.bodyStrong,
                        }}
                      >
                        {active ? <CheckIcon size={14} strokeWidth={3} /> : option.label.charAt(0)}
                      </Box>
                      {option.label}
                    </Box>
                  );
                })}
              </Stack>

              <Typography sx={{ fontSize: 13.5, lineHeight: 1.5, color: authSoft.muted, mt: 1.5 }}>
                {currentRole
                  ? `${currentRole.label} sees: ${currentRole.description.toLowerCase()}. Sign in to open it.`
                  : "Pick a role to preview it. Sign in to open the real view."}
              </Typography>
            </Box>
          )}

          <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: authSoft.muted, mt: 3, textAlign: "center" }}>
            Only PMW Microsoft 365 work accounts can sign in.{" "}
            <Box
              component="a"
              href="/privacy"
              sx={{ color: authSoft.primary, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
            >
              Privacy notice
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
