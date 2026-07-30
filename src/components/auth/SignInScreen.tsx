import { useState } from "react";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { OSHES_APP } from "../../config/oshes";
import { DEV_ROLE_OPTIONS, isDevRoleSwitchEnabled, readDevRole, writeDevRole } from "../../utils/devRoleOverride";
import type { PortalRole } from "../../types";
import IdleAnimationPanel from "./IdleAnimationPanel";

interface SignInScreenProps {
  onLogin: () => void;
  /** "Report something — scanned a poster" — straight into the linear public flow. */
  onReportSomething: () => void;
  /** "Track a report I already filed" — reference lookup, no sign-in. */
  onTrackReport: () => void;
}

/**
 * Two equal columns divided by a hairline: an idle animation on the left, the
 * sign-in stack on the right.
 *
 * This is not a password form. Sign-in goes through the existing MSAL redirect;
 * the demo-account list from the prototype becomes a dev-only role switcher.
 */
export default function SignInScreen({ onLogin, onReportSomething, onTrackReport }: SignInScreenProps) {
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
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        background: editorial.panel,
        color: editorial.ink,
      }}
    >
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
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>PMW OSHES</Typography>
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
          {OSHES_APP.name} · sign in with your Microsoft 365 work account
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 3, md: 5 } }}>
        <Stack spacing={1.7} sx={{ width: "100%", maxWidth: 420 }}>
          <Box sx={{ display: { xs: "block", md: "none" }, mb: 1 }}>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>PMW OSHES</Typography>
            <Typography
              sx={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: editorial.muted, fontWeight: 700 }}
            >
              Safety · Health · Environment · Security
            </Typography>
          </Box>

          <Typography component="h1" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
            Sign in
          </Typography>
          <Typography variant="body2" sx={{ color: editorial.muted }}>
            Your PMW work account decides what you see — there is nothing to choose here.
          </Typography>

          <Button variant="contained" onClick={onLogin} sx={{ minHeight: 44, width: "100%" }}>
            Sign in with Microsoft 365
          </Button>

          {showDevRoles && (
            <>
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
            </>
          )}

          <Divider sx={{ borderColor: editorial.border }} />
          <Typography
            sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: editorial.muted, fontWeight: 800 }}
          >
            No account
          </Typography>
          <Button variant="outlined" onClick={onReportSomething} sx={{ minHeight: 44, width: "100%" }}>
            Report something — scanned a poster
          </Button>
          <Button onClick={onTrackReport} sx={{ minHeight: 44, width: "100%", color: editorial.muted }}>
            Track a report I already filed
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
