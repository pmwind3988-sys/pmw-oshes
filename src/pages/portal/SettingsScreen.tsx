import { Box, Button, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { accessSummary, portalNav, roleLabel } from "../../utils/portalRole";
import type { PortalScreen } from "../../types";

const PANEL_SX = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "14px",
  p: 2.5,
} as const;

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <Box sx={PANEL_SX}>
      <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ fontSize: 12, color: editorial.muted, mb: 2 }}>{caption}</Typography>
      {children}
    </Box>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{ py: 1.1, borderTop: editorialHairline, alignItems: { sm: "baseline" } }}
    >
      <Typography sx={{ fontSize: 12, color: editorial.muted, width: { sm: 180 }, flex: "none" }}>{label}</Typography>
      <Box sx={{ fontSize: 13.5, minWidth: 0 }}>{value}</Box>
    </Stack>
  );
}

function Toggle({
  label,
  caption,
  checked,
  onChange,
}: {
  label: string;
  caption: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ py: 1.25, borderTop: editorialHairline, alignItems: "center", justifyContent: "space-between" }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, color: editorial.muted }}>{caption}</Typography>
      </Box>
      <Switch
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        slotProps={{ input: { "aria-label": label } }}
      />
    </Stack>
  );
}

/**
 * Settings — the account's own page, which the portal did not previously have.
 *
 * It answers the three questions people actually bring here: who am I signed in
 * as, what is this account allowed to do, and where do I land when I open the
 * portal. Preferences are per-browser (see portalPrefs); permissions are shown
 * but never edited here — they come from SharePoint group membership and from
 * what the form catalogue assigns, and inviting an edit that cannot work would
 * be worse than not offering one.
 */
export default function SettingsScreen() {
  const {
    access,
    role,
    userName,
    userEmail,
    prefs,
    setPrefs,
    records,
    myRecords,
    queue,
    catalogue,
    audit,
    refresh,
    toast,
    onSignOut,
  } = usePortal();

  const startOptions = portalNav(access, {
    queue: queue.length,
    allRecords: records.length,
    myRecords: myRecords.length,
    catalogue: catalogue.length,
    audit: audit.length,
  }).filter((item) => item.screen !== "settings");

  const capabilities: { label: string; granted: boolean; why: string }[] = [
    { label: "File forms", granted: access.canFile, why: "Any signed-in account, unless it is read-only." },
    {
      label: access.isEvaluator ? "Evaluate assigned layers" : "Sign assigned layers",
      granted: access.isAssignee && !access.readOnly,
      why: "Granted by being named on a layer in the form catalogue, or by a reassignment.",
    },
    { label: "See every record", granted: access.canSeeEveryRecord, why: "Administrators, evaluators and auditors." },
    { label: "Nudge and reassign approvers", granted: access.canChase, why: "Administrators and evaluators." },
    { label: "Export to CSV", granted: access.canExport, why: "Anyone who can see every record." },
    { label: "Edit the form catalogue", granted: access.canManageCatalogue, why: "Administrators only." },
    { label: "Read the audit trail", granted: access.canSeeAudit, why: "Administrators and auditors." },
  ];

  return (
    <Box sx={{ maxWidth: 840 }}>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          Settings
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
          your account, what it can do, and where the portal opens
        </Typography>
      </Box>

      <Stack spacing={2.5}>
        <Panel title="Account" caption="from your Microsoft 365 sign-in — nothing here is stored by this app">
          <Row label="Name" value={userName || "—"} />
          <Row label="Signed in as" value={userEmail || "—"} />
          <Row label="Role" value={roleLabel(role)} />
          <Row label="What that means" value={accessSummary(access)} />
        </Panel>

        <Panel
          title="What this account can do"
          caption="derived from SharePoint group membership and from the layers assigned to you — it is not editable here"
        >
          {capabilities.map((capability) => (
            <Row
              key={capability.label}
              label={capability.label}
              value={
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                  <Box
                    component="span"
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                      px: 0.9,
                      py: 0.3,
                      borderRadius: "999px",
                      border: editorialHairline,
                      whiteSpace: "nowrap",
                      color: capability.granted ? editorial.pmwBlueDark : editorial.muted,
                      backgroundColor: capability.granted ? editorial.blueWash : "transparent",
                    }}
                  >
                    {capability.granted ? "Yes" : "No"}
                  </Box>
                  <Typography component="span" sx={{ fontSize: 12, color: editorial.muted }}>
                    {capability.why}
                  </Typography>
                </Stack>
              }
            />
          ))}
        </Panel>

        <Panel title="Preferences" caption="remembered in this browser only, so a shared machine never carries them over">
          <Stack sx={{ pt: 0.5 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ py: 1.25, borderTop: editorialHairline, alignItems: { sm: "center" }, justifyContent: "space-between" }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Start on</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                  The page the portal opens on. Home shows all the others.
                </Typography>
              </Box>
              <TextField
                select
                size="small"
                value={prefs.startScreen}
                onChange={(event) => setPrefs({ startScreen: event.target.value as PortalScreen })}
                sx={{ width: { xs: "100%", sm: 240 }, flex: "none" }}
                slotProps={{ htmlInput: { "aria-label": "Start on" } }}
              >
                {startOptions.map((item) => (
                  <MenuItem key={item.screen} value={item.screen}>
                    {item.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Toggle
              label="Compact tables"
              caption="Tighter rows, and the second line of each row is dropped."
              checked={prefs.compactTables}
              onChange={(compactTables) => setPrefs({ compactTables })}
            />
            <Toggle
              label="Hide settled records by default"
              caption="Submission tables open on what is still moving. The filter still reaches everything."
              checked={prefs.hideSettled}
              onChange={(hideSettled) => setPrefs({ hideSettled })}
            />
          </Stack>
        </Panel>

        <Panel title="Session" caption="the data below was read when you signed in, or when you last refreshed">
          <Row
            label="Loaded"
            value={`${records.length} records · ${catalogue.length} form types · ${audit.length} audit rows`}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, pt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => {
                refresh();
                toast("Re-reading submissions from SharePoint...");
              }}
              sx={{ minHeight: 40 }}
            >
              Refresh data
            </Button>
            <Button variant="outlined" onClick={onSignOut} sx={{ minHeight: 40 }}>
              Sign out
            </Button>
            <Button
              component="a"
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: 40, color: editorial.muted }}
            >
              Privacy notice
            </Button>
          </Stack>
        </Panel>
      </Stack>
    </Box>
  );
}
