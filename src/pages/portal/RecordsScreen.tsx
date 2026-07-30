import { useMemo, useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { StatusPill } from "../../components/portal/PortalPills";
import { canExportCsv } from "../../utils/portalRole";
import { exportRecordsCsv } from "../../utils/portalExport";
import type { PortalStatus } from "../../types";

const STATUS_OPTIONS: { value: "all" | PortalStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "In approval", label: "In approval" },
  { value: "Past SLA", label: "Past SLA" },
  { value: "Approved", label: "Approved" },
  { value: "Returned", label: "Returned" },
  { value: "Cancelled", label: "Cancelled" },
];

/**
 * Submissions / My submissions / Records — one table, three framings.
 * The whole row opens the drawer; the export matches the filter above it.
 */
export default function RecordsScreen() {
  const { role, records, visibleRecords, catalogue, openDrawer, toast } = usePortal();
  const [formFilter, setFormFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PortalStatus>("all");
  const [query, setQuery] = useState("");

  const source = role === "submitter" ? visibleRecords : records;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((record) => {
      if (formFilter !== "all" && record.listTitle !== formFilter) return false;
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (needle && !`${record.reference} ${record.subject}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [source, formFilter, statusFilter, query]);

  const title = role === "submitter" ? "My submissions" : role === "auditor" ? "Records" : "Submissions";
  const subtitle = role === "submitter"
    ? "only the forms you filed — including the ones you sent from a QR poster with this email"
    : role === "auditor"
      ? "read only · no action can be taken from this account"
      : "every form instance, whichever door it came through";

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>{subtitle}</Typography>
      </Box>

      <Stack direction="row" spacing={1.7} sx={{ flexWrap: "wrap", alignItems: "flex-end", mb: 2, rowGap: 1.7 }}>
        <TextField
          select
          size="small"
          label="Form type"
          value={formFilter}
          onChange={(event) => setFormFilter(event.target.value)}
          sx={{ width: 220 }}
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
          onChange={(event) => setStatusFilter(event.target.value as "all" | PortalStatus)}
          sx={{ width: 190 }}
        >
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label="Search reference or subject"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />

        {canExportCsv(role) && (
          <Button
            variant="outlined"
            onClick={() => toast(`Exported ${exportRecordsCsv(rows)} rows with the columns you can see, plus approval history.`)}
            sx={{ minHeight: 40 }}
          >
            Export {rows.length} rows to CSV
          </Button>
        )}
      </Stack>

      {rows.length === 0 ? (
        <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", p: 2 }}>
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>Nothing matches that filter.</Typography>
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
                <Box component="th" sx={{ width: 130 }}>Status</Box>
                <Box component="th" sx={{ width: 105 }}>Filed</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((record) => (
                <Box
                  component="tr"
                  key={record.reference}
                  onClick={() => openDrawer(record.reference)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDrawer(record.reference);
                    }
                  }}
                  sx={{
                    cursor: "pointer",
                    "& td": { px: 2, py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" },
                    "&:hover": { backgroundColor: editorial.blueWash },
                  }}
                >
                  <Box component="td" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{record.reference}</Box>
                  <Box component="td">
                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{record.formName}</Typography>
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>{record.subject}</Typography>
                  </Box>
                  <Box component="td" sx={{ color: editorial.muted }}>{record.source}</Box>
                  <Box component="td">{record.stage}</Box>
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
