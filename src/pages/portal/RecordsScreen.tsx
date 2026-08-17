import { useMemo, useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { editorial, editorialHairline } from "../../theme/editorial";
import { liftSx, panelSx, radius } from "../../theme/surfaces";
import ReferenceTag from "../../components/ReferenceTag";
import {
  DataCell,
  DataRow,
  DataTable,
  PageHeader,
  Widget,
  WidgetEmpty,
} from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import { exportRecordsCsv } from "../../utils/portalExport";
import type { PortalRecord, StatFilter } from "../../types";
import { anySla, recordKey, recordMatchesQuery } from "../../utils/portalRecords";

type Scope = "mine" | "all";

const BASE_STATUS_OPTIONS: { value: StatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Still moving" },
  { value: "In approval", label: "In approval" },
  { value: "Past SLA", label: "Past SLA" },
  { value: "Recorded", label: "Recorded — no approval" },
  { value: "Approved", label: "Approved" },
  { value: "Returned", label: "Returned" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Rejected", label: "Rejected" },
];

const WORKFLOW_OPTIONS = [
  { value: "all", label: "Any workflow" },
  { value: "chain", label: "Has an approval chain" },
  { value: "none", label: "No approval step" },
] as const;

/** The cell contents each row needs, shared by the table and the phone card. */
function stageLine(record: PortalRecord): string {
  return record.waitNote ? `${record.stage} · ${record.waitNote}` : record.stage;
}

/**
 * The submissions table, in two framings: your own filings and everything you
 * may see. One component, because the columns, filters and export are identical
 * — only the source set and the copy differ.
 *
 * Filters can arrive already set. A form hub door ("All Permit to Work") or a
 * pressed statistic ("3 past SLA") opens this screen scoped to exactly what it
 * named, so the count on the dashboard and the rows on this page are the same
 * set by construction rather than by the reader re-deriving the filter.
 *
 * Below `md` the table becomes a list of cards: seven columns on a phone means
 * a horizontal scroll that hides the status, which is the column people came
 * for.
 */
export default function RecordsScreen({ scope = "all" }: { scope?: Scope }) {
  const { access, records, myRecords, catalogue, openDrawer, toast, prefs, setScreen, focusForm, focusStatus } =
    usePortal();

  const [formFilter, setFormFilter] = useState(focusForm ?? "all");
  const [statusFilter, setStatusFilter] = useState<StatFilter>(
    focusStatus ?? (prefs.hideSettled ? "open" : "all"),
  );
  const [workflowFilter, setWorkflowFilter] = useState<(typeof WORKFLOW_OPTIONS)[number]["value"]>("all");
  const [query, setQuery] = useState("");

  // `records` is already scoped to what this account may see — its own filings
  // plus anything it is on a layer of — so the framing narrows it, never widens.
  const mine = scope === "mine";
  const source = mine ? myRecords : records;
  const compact = prefs.compactTables;

  // The SLA column, filter option and note exist only where some form actually
  // declared an SLA. Nowhere does an unset SLA render as a target of zero.
  const slaInUse = useMemo(() => anySla(catalogue), [catalogue]);
  const statusOptions = useMemo(
    () => BASE_STATUS_OPTIONS.filter((option) => slaInUse || option.value !== "Past SLA"),
    [slaInUse],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((record) => {
      if (formFilter !== "all" && record.listTitle !== formFilter) return false;
      if (workflowFilter === "chain" && !record.hasWorkflow) return false;
      if (workflowFilter === "none" && record.hasWorkflow) return false;
      if (statusFilter === "open") {
        if (record.done || record.returned || !record.hasWorkflow) return false;
      } else if (statusFilter !== "all" && record.status !== statusFilter) {
        return false;
      }
      if (!recordMatchesQuery(record, needle)) return false;
      return true;
    });
  }, [source, formFilter, statusFilter, workflowFilter, query]);

  const scopedForm = catalogue.find((entry) => entry.listTitle === formFilter) ?? null;

  const title = mine
    ? scopedForm
      ? `My ${scopedForm.name}`
      : "My submissions"
    : access.isAuditor
      ? "Records"
      : access.canSeeEveryRecord
        ? scopedForm
          ? `All ${scopedForm.name}`
          : "All submissions"
        : "Records you are on";
  const subtitle = mine
    ? "only the forms you filed — including the ones you sent from a QR poster with this email"
    : access.isAuditor
      ? "read only · no action can be taken from this account"
      : access.canSeeEveryRecord
        ? "every form instance, whichever door it came through"
        : "everything you are on a layer of, including what you have already signed";

  const openRecord = (record: PortalRecord) => openDrawer(recordKey(record));

  const emptyLine =
    source.length === 0 ? "Nothing has been filed here yet." : "Nothing matches that filter.";

  return (
    <Box>
      <PageHeader
        title={title}
        subtitle={subtitle}
        meta={`${rows.length} of ${source.length} ${source.length === 1 ? "record" : "records"}`}
        // Arriving from a form's workspace, the way back is to that workspace —
        // not to the top of the portal.
        back={
          focusForm && scopedForm ? (
            <Button
              onClick={() => setScreen("form", focusForm)}
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 36, px: 0.75, ml: -0.75, mb: 1.5, fontSize: 12.5, color: editorial.muted }}
            >
              {scopedForm.name}
            </Button>
          ) : undefined
        }
        actions={
          /* Both framings are one click apart, so the table never becomes a dead
             end for an account that can see more than its own filings. */
          records.length > myRecords.length ? (
            <Button
              variant="outlined"
              onClick={() => setScreen(mine ? "subs" : "mine", formFilter === "all" ? null : formFilter, statusFilter)}
              sx={{ minHeight: 40, flex: "none" }}
            >
              {mine ? "Show everything I can see" : "Show only mine"}
            </Button>
          ) : undefined
        }
      />

      {/* The filter bar is a panel of its own: it is a control surface, not part
          of the table, and framing it that way is what stops six inputs reading
          as the table's first row. */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          ...panelSx,
          p: { xs: 1.5, sm: 1.75 },
          mb: 2,
          flexWrap: "wrap",
          alignItems: "flex-end",
          rowGap: 1.5,
        }}
      >
        <TextField
          select
          size="small"
          label="Form type"
          value={formFilter}
          onChange={(event) => setFormFilter(event.target.value)}
          sx={{ width: { xs: "100%", sm: 210 } }}
        >
          <MenuItem value="all">All form types</MenuItem>
          {catalogue.map((entry) => (
            <MenuItem key={entry.listTitle} value={entry.listTitle}>
              {entry.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatFilter)}
          sx={{ width: { xs: "calc(50% - 6px)", sm: 200 } }}
        >
          {statusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Workflow"
          value={workflowFilter}
          onChange={(event) => setWorkflowFilter(event.target.value as typeof workflowFilter)}
          sx={{ width: { xs: "calc(50% - 6px)", sm: 200 } }}
        >
          {WORKFLOW_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label="Search reference, subject or form"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flex: 1, minWidth: { xs: "100%", sm: 200 } }}
        />

        {access.canExport && (
          <Button
            variant="outlined"
            onClick={() =>
              toast(`Exported ${exportRecordsCsv(rows)} rows with the columns you can see, plus approval history.`)
            }
            sx={{ minHeight: 40, width: { xs: "100%", sm: "auto" } }}
          >
            Export {rows.length} rows
          </Button>
        )}
      </Stack>

      {rows.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>{emptyLine}</WidgetEmpty>
        </Widget>
      ) : (
        <>
          {/* Phone: one card per record, everything stacked and nothing clipped. */}
          <Stack spacing={1.25} sx={{ display: { xs: "flex", md: "none" } }}>
            {rows.map((record) => (
              <Box
                key={recordKey(record)}
                component="button"
                type="button"
                onClick={() => openRecord(record)}
                sx={{
                  ...panelSx,
                  ...liftSx,
                  width: "100%",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  p: 1.5,
                  cursor: "pointer",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.75 }}
                >
                  <ReferenceTag value={record.reference} size="md" />
                  <StatusPill status={record.status} />
                </Stack>
                <Typography sx={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>{record.subject}</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.25 }}>{record.formName}</Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    mt: 1,
                    pt: 1,
                    borderTop: editorialHairline,
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography
                    sx={{ fontSize: 11.5, color: record.overdue ? editorial.error : editorial.muted, minWidth: 0 }}
                  >
                    {stageLine(record)}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: editorial.muted, whiteSpace: "nowrap", flex: "none" }}>
                    {record.filedLabel}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Stack>

          {/* Desktop: the table, which scrolls inside its own box if it must. */}
          <Box sx={{ display: { xs: "none", md: "block" }, borderRadius: radius.lg, overflow: "hidden" }}>
            <DataTable
              minWidth={860}
              columns={[
                { key: "ref", label: "Reference", width: 120 },
                { key: "form", label: "Form" },
                { key: "source", label: "Source", width: 150 },
                { key: "stage", label: "Stage", width: 190 },
                { key: "status", label: "Status", width: 150 },
                { key: "filed", label: "Filed", width: 105 },
              ]}
            >
              {rows.map((record) => (
                <DataRow key={recordKey(record)} compact={compact} onOpen={() => openRecord(record)}>
                  <DataCell>
                    <ReferenceTag value={record.reference} size="md" />
                  </DataCell>
                  <DataCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{record.formName}</Typography>
                    {!compact && (
                      <Typography sx={{ fontSize: 12, color: editorial.muted }}>{record.subject}</Typography>
                    )}
                  </DataCell>
                  <DataCell muted>{record.source}</DataCell>
                  <DataCell>
                    <Typography sx={{ fontSize: 13 }}>{record.stage}</Typography>
                    {/* The wait line says the SLA where there is one and the
                        plain age where there is not — never "no SLA". */}
                    {!compact && record.waitNote && (
                      <Typography sx={{ fontSize: 11, color: record.overdue ? editorial.error : editorial.muted }}>
                        {record.waitNote}
                      </Typography>
                    )}
                  </DataCell>
                  <DataCell>
                    <StatusPill status={record.status} />
                  </DataCell>
                  <DataCell muted nowrap>
                    {record.filedLabel}
                  </DataCell>
                </DataRow>
              ))}
            </DataTable>
          </Box>
        </>
      )}
    </Box>
  );
}
