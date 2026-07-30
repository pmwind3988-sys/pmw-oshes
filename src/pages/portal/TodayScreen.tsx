import { useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { ProportionBar, SeverityPill } from "../../components/portal/PortalPills";
import { bottlenecks, severeRecords, stuckRecords } from "../../utils/portalRecords";
import { canChase, canExportCsv } from "../../utils/portalRole";
import { exportRecordsCsv } from "../../utils/portalExport";
import { formatTodayDate } from "../../utils/portalTime";
import { nudgeApprover } from "../../utils/portalActions";
import type { PortalRecord } from "../../types";
import ReassignDialog from "../../components/portal/ReassignDialog";

const PANEL_SX = {
  backgroundColor: editorial.panel,
  border: editorialHairline,
  borderRadius: "14px",
  p: 2,
} as const;

function PanelHeading({ title, caption, right }: { title: string; caption: string; right?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: editorial.muted }}>{caption}</Typography>
      </Box>
      {right}
    </Stack>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.5 }}>{children}</Typography>
  );
}

/**
 * Today — the admin and evaluator landing screen.
 *
 * Panel order is deliberate: what is dangerous now, then what has stalled, then
 * what is waiting on you personally, then the shape of the day's intake.
 */
export default function TodayScreen({ severityFirst = true, showBottlenecks = true }: {
  severityFirst?: boolean;
  showBottlenecks?: boolean;
}) {
  const portal = usePortal();
  const { records, queue, catalogue, role, openDrawer, nudged, markNudged, applyPatch, appendAudit, toast, spClient, userName, userEmail } = portal;
  const [reassignTarget, setReassignTarget] = useState<PortalRecord | null>(null);

  const severe = useMemo(() => severeRecords(records), [records]);
  const stuck = useMemo(() => stuckRecords(records), [records]);
  const people = useMemo(() => bottlenecks(records), [records]);
  const filedToday = useMemo(() => records.filter((record) => record.hoursSinceFiled <= 24).length, [records]);

  const maxToday = Math.max(1, ...catalogue.map((entry) => entry.today));
  const inbound = [...catalogue].sort((a, b) => b.today - a.today);
  const showChase = canChase(role);

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
    <Box sx={PANEL_SX} key="severity">
      <PanelHeading title="High severity · last 24 hours" caption="paged to the duty officer on receipt" />
      {severe.length === 0 ? (
        <EmptyLine>Nothing high-severity in the last 24 hours.</EmptyLine>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 1.5 }}>
          {severe.map((record) => (
            <Box
              key={record.reference}
              component="button"
              type="button"
              onClick={() => openDrawer(record.reference)}
              sx={{
                textAlign: "left",
                border: editorialHairline,
                borderRadius: "12px",
                background: editorial.panel,
                font: "inherit",
                color: "inherit",
                p: 1.5,
                cursor: "pointer",
                "&:hover": { borderColor: editorial.pmwBlue },
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <SeverityPill label={record.severity} tone={record.tone} />
                <Typography sx={{ fontSize: 11, color: editorial.muted, whiteSpace: "nowrap" }}>{record.filedLabel}</Typography>
              </Stack>
              <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{record.subject}</Typography>
              <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.5 }}>{record.location || "Location not given"}</Typography>
              <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 1.25, pt: 1, borderTop: editorialHairline }}>
                {record.reference} · {record.layerLabel}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  const stuckPanel = (
    <Box sx={PANEL_SX} key="stuck">
      <PanelHeading
        title="Stuck approvals"
        caption="oldest first · age measured on the current layer only"
        right={
          <Typography sx={{ fontSize: 12, color: editorial.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {stuck.length} past SLA
          </Typography>
        }
      />
      {stuck.length === 0 ? (
        <EmptyLine>Nothing is past its SLA right now.</EmptyLine>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13 }}>
            <Box component="thead">
              <Box component="tr" sx={{ "& th": { textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: editorial.muted, pb: 1, borderBottom: editorialHairline } }}>
                <Box component="th" sx={{ width: 118 }}>Reference</Box>
                <Box component="th">Form</Box>
                <Box component="th" sx={{ width: 170 }}>Waiting on</Box>
                <Box component="th" sx={{ width: 86 }}>Layer</Box>
                <Box component="th" sx={{ width: 130 }}>Age on layer</Box>
                {showChase && <Box component="th" sx={{ width: 170, textAlign: "right !important" }}>Actions</Box>}
              </Box>
            </Box>
            <Box component="tbody">
              {stuck.map((record) => (
                <Box component="tr" key={record.reference} sx={{ "& td": { py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" } }}>
                  <Box component="td">
                    <Box
                      component="button"
                      type="button"
                      onClick={() => openDrawer(record.reference)}
                      sx={{ border: "none", background: "none", p: 0, font: "inherit", fontWeight: 700, color: editorial.pmwBlueDark, cursor: "pointer", textAlign: "left" }}
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
                    <Typography sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{record.ageOnLayerLabel}</Typography>
                    <Typography sx={{ fontSize: 11, color: editorial.error }}>{record.slaNote}</Typography>
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
                        <Button size="small" variant="outlined" onClick={() => setReassignTarget(record)} sx={{ minHeight: 32, px: 1.25 }}>
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
    </Box>
  );

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3.5 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            Today
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            {formatTodayDate()} · {filedToday} filed in the last 24 h · {stuck.length} approvals past SLA
          </Typography>
        </Box>
        {canExportCsv(role) && (
          <Button
            variant="outlined"
            onClick={() => toast(`Exported ${exportRecordsCsv(records)} rows with the columns you can see, plus approval history.`)}
            sx={{ minHeight: 40 }}
          >
            Export view to CSV
          </Button>
        )}
      </Stack>

      <Stack spacing={3.4}>
        {severityFirst ? [severePanel, stuckPanel] : [stuckPanel, severePanel]}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: showBottlenecks ? "1fr 1fr" : "1fr" }, gap: 3.4 }}>
          <Box sx={PANEL_SX}>
            <PanelHeading
              title="Awaiting your signature"
              caption="signing releases it to the next layer immediately"
              right={<Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{queue.length}</Typography>}
            />
            {queue.length === 0 ? (
              <EmptyLine>Your queue is clear.</EmptyLine>
            ) : (
              <Stack divider={<Box sx={{ borderTop: editorialHairline }} />}>
                {queue.map((record) => (
                  <Stack
                    key={record.reference}
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: "center", justifyContent: "space-between", py: 1.25 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{record.subject}</Typography>
                      <Typography sx={{ fontSize: 11, color: editorial.muted }}>
                        {record.reference} · {record.formName} · {record.layerLabel} · waiting {record.ageOnLayerLabel}
                      </Typography>
                    </Box>
                    <Button variant="contained" size="small" onClick={() => openDrawer(record.reference)} sx={{ flex: "none", minHeight: 36 }}>
                      Review
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>

          {showBottlenecks && (
            <Box sx={PANEL_SX}>
              <PanelHeading title="Where work is sitting" caption="approvers ranked by longest wait on their current layer" />
              {people.length === 0 ? (
                <EmptyLine>Nothing is open with anyone right now.</EmptyLine>
              ) : (
                <Stack spacing={1.75}>
                  {people.map((person) => (
                    <Box key={`${person.name}-${person.role}`}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                          {person.name}
                          <Box component="span" sx={{ color: editorial.muted, fontWeight: 400 }}> · {person.role}</Box>
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: editorial.muted, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {person.worstLabel}
                        </Typography>
                      </Stack>
                      <ProportionBar percent={person.barPercent} />
                      <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 0.5 }}>
                        {person.open} open · {person.breached} past SLA
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </Box>

        <Box sx={PANEL_SX}>
          <PanelHeading title="Inbound today, by form" caption="form types come from the catalogue — this list follows it" />
          {inbound.length === 0 ? (
            <EmptyLine>No form types are published yet.</EmptyLine>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, columnGap: 3.4, rowGap: 1.25 }}>
              {inbound.map((entry) => (
                <Stack key={entry.listTitle} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Typography sx={{ width: 200, flex: "none", fontSize: 13 }} noWrap title={entry.name}>
                    {entry.name}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <ProportionBar percent={Math.round((entry.today / maxToday) * 100)} height={10} />
                  </Box>
                  <Typography sx={{ fontSize: 26, fontWeight: 700, width: 48, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {entry.today}
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}
        </Box>
      </Stack>

      <ReassignDialog record={reassignTarget} onClose={() => setReassignTarget(null)} />
    </Box>
  );
}
