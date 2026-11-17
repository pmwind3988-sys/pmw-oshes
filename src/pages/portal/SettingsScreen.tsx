import { useState } from "react";
import { Box, Button, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { SUN } from "../../theme/simple";
import { PageHeader, Widget } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { useAppearance } from "../../contexts/AppearanceContext";
import AppearancePicker from "../../components/dashboard/AppearancePicker";
import { findDashboardBackground } from "../../utils/dashboardBackgrounds";
import { accessSummary, roleLabel } from "../../utils/portalRole";
import { initialsOf } from "../../utils/portalPeople";
import type { PortalScreen } from "../../types";

/** The pages the account may open the portal on. Home shows the rest; Submissions is the list of work. */
const START_OPTIONS: { screen: PortalScreen; label: string }[] = [
  { screen: "home", label: "Your work" },
  { screen: "subs", label: "Submissions" },
];

/** A secondary action: a quiet outline, sized like the rest of the controls. */
const controlSx = { minHeight: 40, px: 2, borderRadius: radius.xs, fontWeight: 700, textTransform: "none" } as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.25, sm: 2 }} sx={{ py: 1.1, alignItems: { sm: "baseline" } }}>
      <Typography sx={{ fontSize: 12, color: editorial.muted, width: { sm: 180 }, flex: "none" }}>{label}</Typography>
      <Box sx={{ fontSize: 13.5, minWidth: 0 }}>{value}</Box>
    </Stack>
  );
}

/**
 * Account: who is signed in, how the appearance and the start page are set, and
 * the exits. Permissions are not listed here; the role line says what they mean.
 * Start page and list preferences are per browser; appearance is for the whole
 * workspace.
 */
export default function SettingsScreen() {
  const { access, role, userName, userEmail, isAdmin, prefs, setPrefs, refresh, toast, onSignOut } = usePortal();
  const { setting: appearance, resolved } = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const name = userName || userEmail || "Signed in";

  return (
    <Box sx={{ maxWidth: 840 }}>
      <PageHeader title="Account" />

      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Widget sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box
              aria-hidden="true"
              sx={{
                flex: "none",
                width: 56,
                height: 56,
                borderRadius: radius.full,
                bgcolor: SUN,
                border: "2px solid",
                borderColor: "text.primary",
                display: "grid",
                placeItems: "center",
                fontSize: 17,
                fontWeight: 800,
                color: "text.primary",
              }}
            >
              {initialsOf(userName, userEmail)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 800 }} noWrap>
                {name}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }} noWrap>
                {userEmail}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mt: 0.75 }}>
                <Box
                  component="span"
                  sx={{ fontSize: 11, fontWeight: 800, px: 1, py: 0.4, borderRadius: radius.tag, bgcolor: editorial.blueWash, color: editorial.pmwBlueDark, whiteSpace: "nowrap" }}
                >
                  {roleLabel(role)}
                </Box>
                <Typography component="span" sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  {accessSummary(access)}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </Widget>

        {/* Appearance is one record for the whole workspace, not one per browser,
            so it is said once here rather than repeated on each row. */}
        <Widget
          title="Appearance"
          caption={
            isAdmin
              ? "One setting for the whole workspace. Changing it changes what everyone sees."
              : "Chosen by an administrator for the whole workspace."
          }
          sx={{ p: { xs: 2, sm: 2.5 } }}
        >
          <Row label="Contrast" value={`${resolved.contrast.label} — ${resolved.contrast.note}`} />
          <Row label="Colour" value={`${resolved.color.label} — ${resolved.color.note}`} />
          <Row label="Typeface" value={`${resolved.font.label} — ${resolved.font.note}`} />
          <Row
            label="Background"
            value={
              appearance.backgroundId === "custom"
                ? appearance.customImageSource || "Custom image"
                : findDashboardBackground(appearance.backgroundId).label
            }
          />
          {appearance.updatedBy && (
            <Row
              label="Last changed"
              value={`by ${appearance.updatedBy}${appearance.updatedAt ? ` on ${new Date(appearance.updatedAt).toLocaleDateString()}` : ""}`}
            />
          )}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, pt: 2 }}>
            <Button variant="outlined" onClick={() => setAppearanceOpen(true)} sx={controlSx}>
              {isAdmin ? "Change appearance" : "View themes"}
            </Button>
          </Stack>
        </Widget>

        <Widget title="Open the app on" caption="The page the portal opens on after you sign in. Remembered in this browser only." sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", py: 0.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Start page</Typography>
            <TextField
              select
              size="small"
              value={START_OPTIONS.some((option) => option.screen === prefs.startScreen) ? prefs.startScreen : "home"}
              onChange={(event) => setPrefs({ startScreen: event.target.value as PortalScreen })}
              sx={{ width: { xs: "100%", sm: 240 }, flex: "none" }}
              slotProps={{ htmlInput: { "aria-label": "Open the app on" } }}
            >
              {START_OPTIONS.map((option) => (
                <MenuItem key={option.screen} value={option.screen}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ py: 1.25, alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Hide settled records by default</Typography>
              <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                Submission lists open on what is still moving. The filter still reaches everything.
              </Typography>
            </Box>
            <Switch
              checked={prefs.hideSettled}
              onChange={(event) => setPrefs({ hideSettled: event.target.checked })}
              slotProps={{ input: { "aria-label": "Hide settled records by default" } }}
            />
          </Stack>
        </Widget>

        <Widget sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  refresh();
                  toast("Re-reading submissions from SharePoint...");
                }}
                sx={controlSx}
              >
                Refresh my data
              </Button>
              <Button component="a" href="/privacy" target="_blank" rel="noopener noreferrer" sx={{ ...controlSx, color: editorial.muted }}>
                Privacy notice
              </Button>
            </Stack>
            <Button variant="outlined" color="error" onClick={onSignOut} sx={controlSx}>
              Sign out
            </Button>
          </Stack>
        </Widget>
      </Stack>

      <AppearancePicker open={appearanceOpen} onClose={() => setAppearanceOpen(false)} isAdmin={isAdmin} />
    </Box>
  );
}
