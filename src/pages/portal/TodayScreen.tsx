import { useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import { editorial, editorialHairline } from "../../theme/editorial";
import { liftSx, panelSx, radius } from "../../theme/surfaces";
import ReferenceTag from "../../components/ReferenceTag";
import {
  PageHeader,
  TaskRow,
  Widget,
  WidgetCount,
  WidgetEmpty,
  WidgetGrid,
} from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { SeverityPill } from "../../components/portal/PortalPills";
import { BarRows, StatTile, StatTileRow, type BarRow } from "../../components/portal/PortalStats";
import { anySla, bottlenecks, recordKey, severeRecords, stuckRecords, waitingLongest } from "../../utils/portalRecords";
import { exportRecordsCsv } from "../../utils/portalExport";
import { formatTodayDate } from "../../utils/portalTime";
import { nudgeApprover } from "../../utils/portalActions";
import type { PortalRecord } from "../../types";
import ReassignDialog from "../../components/portal/ReassignDialog";

/**
 * Today — the admin and evaluator landing screen.
 *
 * Panel order is deliberate: what is dangerous now, then what has stalled, then
 * what is waiting on you personally, then the shape of the day's intake. The
 * statistics across the top are the same four questions as headlines, so the
 * screen can be read in three seconds from the doorway and in three minutes at
 * the desk.
 */
export default function TodayScreen({ severityFirst = true, showBottlenecks = true }: {
  severityFirst?: boolean;
  showBottlenecks?: boolean;
}) {
  const portal = usePortal();
  const { records, queue, catalogue, access, openDrawer, nudged, markNudged, applyPatch, appendAudit, toast, spClient, userName, userEmail } = portal;
  const [reassignTarget, setReassignTarget] = useState<PortalRecord | null>(null);

  const severe = useMemo(() => severeRecords(records), [records]);
  // Where no form declares an SLA, "stuck" cannot mean "breached" — so the
  // panel reports the longest waits instead, which is the honest version of
  // the same question and the only one the data can answer.
  const slaInUse = useMemo(() => anySla(catalogue), [catalogue]);
  const stuck = useMemo(() => stuckRecords(records), [records]);
  const longest = useMemo(() => waitingLongest(records), [records]);
  const waiting = slaInUse ? stuck : longest;
  const people = useMemo(() => bottlenecks(records), [records]);
  const filedToday = useMemo(() => records.filter((record) => record.hoursSinceFiled <= 24).length, [records]);

  /** Approvers as bars: how much is sitting with each, and how long the worst has waited. */
  const peopleRows = useMemo<BarRow[]>(
    () =>
      people.map((person) => ({
        id: `${person.name}-${person.role}`,
        label: `${person.name} · ${person.role}`,
        value: person.open,
        hint: person.worstLabel,
        tone: person.breached > 0 ? ("alert" as const) : ("ink" as const),
      })),
    [people],
  );

  /** Form types as bars, busiest first — the day's intake by kind. */
  const inboundRows = useMemo<BarRow[]>(
    () =>
      [...catalogue]
        .sort((a, b) => b.today - a.today)
        .map((entry) => ({ id: entry.listTitle, label: entry.name, value: entry.today })),
    [catalogue],
  );

  const showChase = access.canChase;

  const handleNudge = async (record: PortalRecord) => {
    try {
      const result = await nudgeApprover({ spClient, actorName: userName || userEmail, actorEmail: userEmail }, record);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      markNudged(record.reference);
      toast(result.toast);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the reminder.");
    }
  };

  const severePanel = (
    <Widget
      key="severity"
      title="High severity · last 24 hours"
      caption="paged to the duty officer on receipt"
      meta={<WidgetCount value={severe.length} tone={severe.length > 0 ? "alert" : "ink"} />}
    >
      {severe.length === 0 ? (
        <WidgetEmpty>Nothing high-severity in the last 24 hours.</WidgetEmpty>
      ) : (
        <WidgetGrid min={230}>
          {severe.map((record) => (
            <Box
              key={recordKey(record)}
              component="button"
              type="button"
              onClick={() => openDrawer(recordKey(record))}
              sx={{
                ...panelSx,
                ...liftSx,
                display: "flex",
                flexDirection: "column",
                height: "100%",
                textAlign: "left",
                borderRadius: radius.base,
                font: "inherit",
                color: "inherit",
                p: 1.5,
                cursor: "pointer",
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                  <ReferenceTag value={record.reference} />
                  <SeverityPill label={record.severity} tone={record.tone} />
                </Stack>
                <Typography sx={{ fontSize: 11, color: editorial.muted, whiteSpace: "nowrap" }}>
                  {record.filedLabel}
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{record.subject}</Typography>
              <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.5 }}>
                {record.location || "Location not given"}
              </Typography>
              <Typography sx={{ fontSize: 11, color: editorial.muted, mt: "auto", pt: 1.25 }}>
                {record.layerLabel}
              </Typography>
            </Box>
          ))}
        </WidgetGrid>
      )}
    </Widget>
  );

  const stuckPanel = (
    <Widget
      key="stuck"
      title={slaInUse ? "Stuck approvals" : "Longest waits"}
      caption="oldest first · age measured on the current layer only"
      meta={<WidgetCount value={waiting.length} tone={slaInUse && stuck.length > 0 ? "alert" : "muted"} />}
    >
      {waiting.length === 0 ? (
        <WidgetEmpty>
          {slaInUse ? "Nothing is past its SLA right now." : "Nothing is waiting on an approver right now."}
        </WidgetEmpty>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13 }}>
            <Box component="thead">
              <Box
                component="tr"
                sx={{
                  "& th": {
                    textAlign: "left",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: editorial.muted,
                    pb: 1,
                    borderBottom: editorialHairline,
                  },
                }}
              >
                <Box component="th" sx={{ width: 118 }}>Reference</Box>
                <Box component="th">Form</Box>
                <Box component="th" sx={{ width: 170 }}>Waiting on</Box>
                <Box component="th" sx={{ width: 86 }}>Layer</Box>
                <Box component="th" sx={{ width: 130 }}>Age on layer</Box>
                {showChase && <Box component="th" sx={{ width: 170, textAlign: "right !important" }}>Actions</Box>}
              </Box>
            </Box>
            <Box component="tbody">
              {waiting.map((record) => (
                <Box
                  component="tr"
                  key={recordKey(record)}
                  sx={{
                    "& td": { py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" },
                    "&:hover td": { backgroundColor: editorial.blueSoft },
                  }}
                >
                  <Box component="td">
                    <Box
                      component="button"
                      type="button"
                      onClick={() => openDrawer(recordKey(record))}
                      sx={{
                        border: "none",
                        background: "none",
                        p: 0,
                        font: "inherit",
                        fontWeight: 700,
                        color: editorial.pmwBlueDark,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {record.reference}
                    </Box>
                  </Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{record.formName}</Typography>
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>{record.subject}</Typography>
                  </Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13 }}>{record.currentAssignee}</Typography>
                    <Typography sx={{ fontSize: 11, color: editorial.muted }}>{record.currentRole}</Typography>
                  </Box>
                  <Box component="td" sx={{ fontVariantNumeric: "tabular-nums" }}>{record.layerLabel}</Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                      {record.ageOnLayerLabel}
                    </Typography>
                    {record.slaNote && (
                      <Typography sx={{ fontSize: 11, color: record.overdue ? editorial.error : editorial.muted }}>
                        {record.slaNote}
                      </Typography>
                    )}
                  </Box>
                  {showChase && (
                    <Box component="td" sx={{ textAlign: "right" }}>
                      <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end" }}>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={Boolean(nudged[record.reference])}
                          onClick={() => void handleNudge(record)}
                          sx={{ minHeight: 32, px: 1.25 }}
                        >
                          {nudged[record.reference] ? "Nudged" : "Nudge"}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setReassignTarget(record)}
                          sx={{ minHeight: 32, px: 1.25 }}
                        >
                          Reassign
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Widget>
  );

  return (
    <Box>
      <PageHeader
        title="Today"
        subtitle={
          slaInUse
            ? `${filedToday} filed in the last 24 h · ${stuck.length} approvals past SLA`
            : `${filedToday} filed in the last 24 h`
        }
        meta={formatTodayDate()}
        actions={
          access.canExport ? (
            <Button
              variant="outlined"
              onClick={() =>
                toast(
                  `Exported ${exportRecordsCsv(records)} rows with the columns you can see, plus approval history.`,
                )
              }
              sx={{ minHeight: 40 }}
            >
              Export view to CSV
            </Button>
          ) : undefined
        }
      />

      <Box sx={{ mb: 3 }}>
        <StatTileRow>
          <StatTile
            value={severe.length}
            label="High severity"
            hint="last 24 hours"
            tone={severe.length > 0 ? "alert" : "ink"}
          />
          <StatTile value={filedToday} label="Filed today" hint="last 24 hours" />
          <StatTile value={queue.length} label="Awaiting you" hint="on your layer now" tone="ink" />
          {/* An SLA nobody set is not a target of zero — the tile is absent. */}
          {slaInUse && <StatTile value={stuck.length} label="Past SLA" hint="over their target" tone="alert" />}
        </StatTileRow>
      </Box>

      <Stack spacing={{ xs: 2, md: 2.5 }}>
        {severityFirst ? [severePanel, stuckPanel] : [stuckPanel, severePanel]}

        <WidgetGrid min={showBottlenecks ? 340 : 600}>
          <Widget
            title="Awaiting your signature"
            caption="signing releases it to the next layer immediately"
            meta={<WidgetCount value={queue.length} />}
          >
            {queue.length === 0 ? (
              <WidgetEmpty>Your queue is clear.</WidgetEmpty>
            ) : (
              <Box>
                {queue.map((record) => (
                  <TaskRow
                    key={recordKey(record)}
                    icon={<PendingActionsOutlinedIcon />}
                    tone={record.overdue ? "alert" : "ink"}
                    title={record.subject}
                    description={`${record.reference} · ${record.formName} · ${record.layerLabel}`}
                    timestamp={`waiting ${record.ageOnLayerLabel}`}
                    onOpen={() => openDrawer(recordKey(record))}
                    action={
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => openDrawer(recordKey(record))}
                        sx={{ minHeight: 32 }}
                      >
                        Review
                      </Button>
                    }
                  />
                ))}
              </Box>
            )}
          </Widget>

          {showBottlenecks && (
            <Widget
              title="Where work is sitting"
              caption="open items per approver · the label is their longest wait"
            >
              <BarRows rows={peopleRows} emptyNote="Nothing is open with anyone right now." valueSuffix="open" />
            </Widget>
          )}
        </WidgetGrid>

        <Widget title="Inbound today, by form" caption="form types come from the catalogue — this list follows it">
          <BarRows rows={inboundRows} emptyNote="No form types are published yet." valueSuffix="filed" />
        </Widget>
      </Stack>

      <ReassignDialog record={reassignTarget} onClose={() => setReassignTarget(null)} />
    </Box>
  );
}
