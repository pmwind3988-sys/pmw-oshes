import { useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import ManageLayout from "../../components/portal/ManageLayout";
import TestRunLauncher from "../../components/builder/TestRunLauncher";
import TestRunPanel from "../../components/builder/TestRunPanel";
import { DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { toneColors, statusTone, type StatusTone } from "../../utils/portalWork";
import { overviewCards } from "../../utils/manageOverview";
import { recordKey, waitingLongest } from "../../utils/portalRecords";
import { normalizeEmail } from "../../utils/portalPeople";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import type { PortalRecord } from "../../types";

/** A status pill in the shared tone colours. */
function Lozenge({ tone, children }: { tone: StatusTone; children: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 1,
        py: 0.5,
        borderRadius: radius.tag,
        fontSize: 11,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        backgroundColor: toneColors[tone].bg,
        color: toneColors[tone].fg,
      }}
    >
      {children}
    </Box>
  );
}

const controlSx = { minHeight: 40, borderRadius: radius.xs, fontWeight: 800, textTransform: "none" } as const;

/** The three counts, and the longest waits. Each number opens the list it counted. */
function OverviewSection() {
  const { records, catalogue, userEmail, setScreen, setPrefs, openDrawer } = usePortal();
  const cards = overviewCards(records, catalogue);
  const longest = waitingLongest(records, 5);
  const me = normalizeEmail(userEmail);

  return (
    <>
      <PageHeader title="Overview" subtitle="Today across every form. Each number opens the list behind it." />

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
        {cards.map((card) => {
          const late = card.key === "late";
          return (
            <Box
              key={card.key}
              component="button"
              type="button"
              onClick={() => setScreen("subs", null, card.target.status, card.target.subsScope, card.target.filedScope)}
              sx={{
                textAlign: "left",
                fontFamily: "inherit",
                cursor: "pointer",
                p: 2.25,
                borderRadius: radius.sm,
                border: "1.5px solid",
                borderColor: late ? "transparent" : "divider",
                bgcolor: late ? TINTS.red : "background.paper",
                color: "text.primary",
                "&:hover": { borderColor: "primary.main" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: late ? toneColors.returned.fg : "text.secondary" }}>
                {card.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 34,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  mt: 0.5,
                  fontVariantNumeric: "tabular-nums",
                  color: late ? "error.main" : "text.primary",
                }}
              >
                {card.value}
              </Typography>
            </Box>
          );
        })}
      </Box>

      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mt: 4, mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>Waiting the longest</Typography>
        <Button
          variant="outlined"
          onClick={() => {
            setPrefs({ subsView: "board" });
            setScreen("subs");
          }}
          sx={{ ...controlSx, fontWeight: 700 }}
        >
          Open board
        </Button>
      </Stack>

      {longest.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>Nothing is waiting on a signature.</WidgetEmpty>
        </Widget>
      ) : (
        <DataTable
          minWidth={640}
          columns={[
            { key: "ref", label: "Reference", width: 200 },
            { key: "with", label: "With", width: 170 },
            { key: "step", label: "Step", width: 110 },
            { key: "age", label: "Waiting" },
          ]}
        >
          {longest.map((record: PortalRecord) => (
            <DataRow key={recordKey(record)} onOpen={() => openDrawer(recordKey(record))}>
              <DataCell>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: "primary.main" }}>{record.reference}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>
                  {record.subject}
                </Typography>
              </DataCell>
              <DataCell>{record.currentAssigneeEmail === me ? "You" : record.currentAssignee || "—"}</DataCell>
              <DataCell>{`${record.at + 1} of ${record.totalLayers}`}</DataCell>
              <DataCell>
                <Lozenge tone={record.overdue ? statusTone("Past SLA") : "progress"}>{record.ageOnLayerLabel}</Lozenge>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </>
  );
}

/** Pick a form, then start its test workflow or read its test runs. */
function TestRunsSection() {
  const { catalogue, formSlugs } = usePortal();
  const [picked, setPicked] = useState("");
  const [dialog, setDialog] = useState<"launch" | "panel" | null>(null);
  const form = catalogue.find((entry) => entry.listTitle === picked) ?? catalogue[0];

  return (
    <>
      <PageHeader
        title="Test runs"
        subtitle="Start a test workflow for one form, or read the results of its earlier test runs."
      />

      {!form ? (
        <Widget bare>
          <WidgetEmpty>No forms yet, so there is nothing to test.</WidgetEmpty>
        </Widget>
      ) : (
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <TextField select label="Form" value={form.listTitle} onChange={(event) => setPicked(event.target.value)} fullWidth>
            {catalogue.map((entry) => (
              <MenuItem key={entry.listTitle} value={entry.listTitle}>
                {entry.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            <Button variant="contained" onClick={() => setDialog("launch")} sx={controlSx}>
              Test workflow
            </Button>
            <Button variant="outlined" onClick={() => setDialog("panel")} sx={{ ...controlSx, fontWeight: 700 }}>
              Test runs
            </Button>
          </Stack>
        </Stack>
      )}

      {form && dialog === "launch" && (
        <TestRunLauncher open onClose={() => setDialog(null)} form={{ Title: form.listTitle, Slug: formSlugs[form.listTitle] }} />
      )}
      {form && dialog === "panel" && (
        <TestRunPanel open onClose={() => setDialog(null)} form={{ Title: form.listTitle, Slug: formSlugs[form.listTitle] }} />
      )}
    </>
  );
}

/**
 * Manage: the admin tools behind a sidebar. The overview is the default; the test
 * runs section opens only for an account holding the form-builder grant.
 */
export default function ManageScreen() {
  const { manageView, canRunTestRuns } = usePortal();
  const testing = manageView === "tests" && canRunTestRuns;
  return <ManageLayout active={testing ? "tests" : "overview"}>{testing ? <TestRunsSection /> : <OverviewSection />}</ManageLayout>;
}
