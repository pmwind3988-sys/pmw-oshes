import { useMemo, useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import { exportRecordsCsv } from "../../utils/portalExport";
import type { PortalStatus } from "../../types";
import { recordKey, recordMatchesQuery } from "../../utils/portalRecords";

type Scope = "mine" | "all";
type StatusFilter = "all" | "open" | PortalStatus;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
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

/**
 * The submissions table, in two framings: your own filings and everything you
 * may see. One component, because the columns, filters and export are identical
 * — only the source set and the copy differ.
 *
 * The status filter now offers "Recorded" as its own answer, because a form
 * with no approval step is not in approval and never was.
 */
export default function RecordsScreen({ scope = "all" }: { scope?: Scope }) {
  const { access, records, myRecords, catalogue, openDrawer, toast, prefs, setScreen } = usePortal();
  const [formFilter, setFormFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(prefs.hideSettled ? "open" : "all");
  const [workflowFilter, setWorkflowFilter] = useState<(typeof WORKFLOW_OPTIONS)[number]["value"]>("all");
  const [query, setQuery] = useState("");

  // `records` is already scoped to what this account may see — its own filings
  // plus anything it is on a layer of — so the framing narrows it, never widens.
  const mine = scope === "mine";
  const source = mine ? myRecords : records;
  const compact = prefs.compactTables;

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

  const title = mine
    ? "My submissions"
    : access.isAuditor
      ? "Records"
      : access.canSeeEveryRecord
        ? "All submissions"
        : "Records you are on";
  const subtitle = mine
    ? "only the forms you filed — including the ones you sent from a QR poster with this email"
    : access.isAuditor
      ? "read only · no action can be taken from this account"
      : access.canSeeEveryRecord
        ? "every form instance, whichever door it came through"
        : "everything you are on a layer of, including what you have already signed";

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", rowGap: 1.5, mb: 3 }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            {title}
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{subtitle}</Typography>
        </Box>
        {/* Both framings are one click apart, so the table never becomes a dead
            end for an account that can see more than its own filings. */}
        {records.length > myRecords.length && (
          <Button variant="outlined" onClick={() => setScreen(mine ? "subs" : "mine")} sx={{ minHeight: 40 }}>
            {mine ? `Show all ${records.length} records` : `Show only my ${myRecords.length}`}
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={1.7} sx={{ flexWrap: "wrap", alignItems: "flex-end", mb: 2, rowGap: 1.7 }}>
        <TextField
          select
          size="small"
          label="Form type"
          value={formFilter}
          onChange={(event) => setFormFilter(event.target.value)}
          sx={{ width: 210 }}
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
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          sx={{ width: 200 }}
        >
          {STATUS_OPTIONS.map((option) => (
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
          sx={{ width: 200 }}
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
          sx={{ flex: 1, minWidth: 200 }}
        />

        {access.canExport && (
          <Button
            variant="outlined"
            onClick={() =>
              toast(`Exported ${exportRecordsCsv(rows)} rows with the columns you can see, plus approval history.`)
            }
            sx={{ minHeight: 40 }}
          >
            Export {rows.length} rows to CSV
          </Button>
        )}
      </Stack>

      {rows.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>
            {source.length === 0 ? "Nothing has been filed here yet." : "Nothing matches that filter."}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13 }}>
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
                    px: 2,
                    py: 1.25,
                    borderBottom: editorialHairline,
                  },
                }}
              >
                <Box component="th" sx={{ width: 120 }}>Reference</Box>
                <Box component="th">Form</Box>
                <Box component="th" sx={{ width: 150 }}>Source</Box>
                <Box component="th" sx={{ width: 170 }}>Stage</Box>
                <Box component="th" sx={{ width: 150 }}>Status</Box>
                <Box component="th" sx={{ width: 105 }}>Filed</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((record) => (
                <Box
                  component="tr"
                  key={recordKey(record)}
                  onClick={() => openDrawer(recordKey(record))}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDrawer(recordKey(record));
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    "& td": { px: 2, py: compact ? 0.85 : 1.25, borderBottom: editorialHairline, verticalAlign: "top" },
                    "&:hover": { backgroundColor: editorial.blueWash },
                  }}
                >
                  <Box component="td" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {record.reference}
                  </Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{record.formName}</Typography>
                    {!compact && <Typography sx={{ fontSize: 12, color: editorial.muted }}>{record.subject}</Typography>}
                  </Box>
                  <Box component="td" sx={{ color: editorial.muted }}>{record.source}</Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13 }}>{record.stage}</Typography>
                    {!compact && record.hasWorkflow && !record.done && !record.returned && (
                      <Typography sx={{ fontSize: 11, color: record.overdue ? editorial.error : editorial.muted }}>
                        {record.slaNote}
                      </Typography>
                    )}
                  </Box>
                  <Box component="td"><StatusPill status={record.status} /></Box>
                  <Box component="td" sx={{ color: editorial.muted, whiteSpace: "nowrap" }}>{record.filedLabel}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
