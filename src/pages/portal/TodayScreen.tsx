import { useMemo, useState, type MouseEvent } from "react";
import { Box, Button, Divider, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { ClipboardClock as PendingActionsOutlinedIcon } from "../../components/ui/Icons";
import { editorial } from "../../theme/editorial";
import { liftSx, radius } from "../../theme/surfaces";
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
import {
  anySla,
  bottlenecks,
  layerActionLabel,
  queueVoice,
  recordKey,
  severeRecords,
  stuckRecords,
  waitingLongest,
} from "../../utils/portalRecords";
import ExportCsvButton from "../../components/portal/ExportCsvButton";
import { exportRecordsCsv } from "../../utils/portalExport";
import { formatTodayDate } from "../../utils/portalTime";
import { canDeleteRecord, canWithdrawRecord, withdrawLabel } from "../../utils/portalRole";
import type { PortalRecord } from "../../types";
import WithdrawDialog from "../../components/portal/WithdrawDialog";
import DeleteRecordDialog from "../../components/portal/DeleteRecordDialog";

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
  const { records, queue, catalogue, access, openDrawer, userEmail } = portal;
  const [withdrawTarget, setWithdrawTarget] = useState<PortalRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalRecord | null>(null);
  /** The open ⋯ menu for one waiting row: where it hangs, and which record it acts on. */
  const [actionsMenu, setActionsMenu] = useState<{ anchor: HTMLElement; record: PortalRecord } | null>(null);

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
        // A layer pointed at a role rather than a named person has no holder to
        // name, so the record falls back to the role label for both — and the
        // bar read "Safety Department Review & Approval · Safety Department
        // Review & Approval". One name is the whole answer there.
        label: person.role && person.role !== person.name ? `${person.name} · ${person.role}` : person.name,
        value: person.open,
        hint: person.worstLabel,
        // Only a breach earns the alert hue. Everyone else is a category, not a
        // problem, and colouring them all brand-blue made the panel read as one
        // undifferentiated block.
        tone: person.breached > 0 ? ("alert" as const) : undefined,
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

  /**
   * What the waiting table offers: stand the item down, or remove it outright.
   *
   * Both are per-record, so the column appears when anything in view has a
   * button and stays away when nothing does — a column of empty cells reads as
   * "you may not", which is a different statement from "there is nothing here
   * to act on".
   */
  const canDelete = canDeleteRecord(access);
  const showActions = useMemo(
    () => canDelete || waiting.some((record) => canWithdrawRecord(record, access, userEmail)),
    [canDelete, waiting, access, userEmail],
  );

  /** How to name this person's own pile — approvals, evaluations, or both. */
  const voice = useMemo(
    () => queueVoice(queue, access.isEvaluator ? "evaluation" : "approval"),
    [queue, access.isEvaluator],
  );

  const severeCards = severe.map((record) => (
    <Box
      key={recordKey(record)}
      component="button"
      type="button"
      onClick={() => openDrawer(recordKey(record))}
      sx={{
        ...liftSx,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        textAlign: "left",
        borderRadius: "24px",
        border: "none",
        backgroundColor: editorial.paper,
        font: "inherit",
        color: "inherit",
        p: 2,
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
  ));

  // Nothing to report is one green pill line, not an empty card: the good news
  // takes no more of the page than it needs.
  const severePanel =
    severe.length === 0 ? (
      <Box key="severity" sx={{ display: "flex" }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            px: 1.75,
            py: 0.875,
            borderRadius: radius.full,
            backgroundColor: editorial.successWash,
            color: editorial.success,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          No high-severity reports in the last 24 hours
        </Box>
      </Box>
    ) : (
      <Widget
        key="severity"
        title="High severity · last 24 hours"
        caption="paged to the duty officer on receipt"
        meta={<WidgetCount value={severe.length} tone="alert" />}
      >
        <WidgetGrid min={230}>{severeCards}</WidgetGrid>
      </Widget>
    );

  const menuRecord = actionsMenu?.record ?? null;
  const menuWithdraw = menuRecord !== null && canWithdrawRecord(menuRecord, access, userEmail);

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
                    fontSize: 12,
                    fontWeight: 700,
                    color: editorial.muted,
                    pb: 1,
                  },
                }}
              >
                <Box component="th" sx={{ width: 150 }}>Reference</Box>
                <Box component="th">Form</Box>
                <Box component="th" sx={{ width: 170 }}>Waiting on</Box>
                <Box component="th" sx={{ width: 86 }}>Layer</Box>
                <Box component="th" sx={{ width: 130 }}>Age on layer</Box>
                {showActions && <Box component="th" sx={{ width: 56 }} aria-label="Actions" />}
              </Box>
            </Box>
            <Box component="tbody">
              {waiting.map((record) => {
                const canAct = canDelete || canWithdrawRecord(record, access, userEmail);
                return (
                  <Box
                    component="tr"
                    key={recordKey(record)}
                    sx={{
                      "& td": { py: 1.25, verticalAlign: "middle" },
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
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontSize: 12,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          color: editorial.pmwBlueDark,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {record.reference}
                      </Box>
                    </Box>
                    <Box component="td" sx={{ verticalAlign: "top" }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{record.formName}</Typography>
                      <Typography sx={{ fontSize: 12, color: editorial.muted }}>{record.subject}</Typography>
                    </Box>
                    <Box component="td" sx={{ verticalAlign: "top" }}>
                      <Typography sx={{ fontSize: 13 }}>{record.currentAssignee}</Typography>
                      <Typography sx={{ fontSize: 11, color: editorial.muted }}>{record.currentRole}</Typography>
                    </Box>
                    <Box component="td" sx={{ fontVariantNumeric: "tabular-nums" }}>{record.layerLabel}</Box>
                    <Box component="td" sx={{ verticalAlign: "top" }}>
                      <Typography sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                        {record.ageOnLayerLabel}
                      </Typography>
                      {record.slaNote && (
                        <Typography sx={{ fontSize: 11, color: record.overdue ? editorial.error : editorial.muted }}>
                          {record.slaNote}
                        </Typography>
                      )}
                    </Box>
                    {showActions && (
                      <Box component="td" sx={{ textAlign: "right" }}>
                        {canAct && (
                          <IconButton
                            size="small"
                            aria-label={`Actions for ${record.reference}`}
                            aria-haspopup="menu"
                            onClick={(event: MouseEvent<HTMLElement>) =>
                              setActionsMenu({ anchor: event.currentTarget, record })
                            }
                            sx={{
                              width: 36,
                              height: 36,
                              color: editorial.muted,
                              backgroundColor: editorial.neutralWash,
                              "&:hover": { backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark },
                            }}
                          >
                            <MoreHorizIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
          <Menu
            anchorEl={actionsMenu?.anchor ?? null}
            open={actionsMenu !== null}
            onClose={() => setActionsMenu(null)}
            slotProps={{
              paper: {
                sx: {
                  borderRadius: radius.base,
                  minWidth: 200,
                  boxShadow: "0 16px 40px rgba(22, 27, 36, 0.18)",
                },
              },
            }}
          >
            {menuRecord && menuWithdraw && (
              <MenuItem
                onClick={() => {
                  setWithdrawTarget(menuRecord);
                  setActionsMenu(null);
                }}
              >
                {withdrawLabel(menuRecord, userEmail)}
              </MenuItem>
            )}
            {menuRecord && menuWithdraw && canDelete && <Divider />}
            {menuRecord && canDelete && (
              <MenuItem
                onClick={() => {
                  setDeleteTarget(menuRecord);
                  setActionsMenu(null);
                }}
                sx={{ color: editorial.error }}
              >
                Delete…
              </MenuItem>
            )}
          </Menu>
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
            <ExportCsvButton
              label="Export view to CSV"
              done={(count) =>
                `Exported ${count} record${count === 1 ? "" : "s"} in full: every answer, every decision, signatures as images, times in Malaysian time.`
              }
              run={(token) => exportRecordsCsv(records, { token })}
            />
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
            title={voice.title}
            caption={voice.caption}
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
                        {layerActionLabel(record)}
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

      <WithdrawDialog record={withdrawTarget} onClose={() => setWithdrawTarget(null)} />
      <DeleteRecordDialog record={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Box>
  );
}
