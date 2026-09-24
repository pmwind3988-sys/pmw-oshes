import { useState } from "react";
import { Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { DataCell, DataRow, DataTable, Widget, WidgetEmpty } from "../Widget";
import { Check as ResolveIcon, History as HistoryIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from "../ui/Icons";
import { effectiveFlag } from "../../utils/smoking/adminData";
import { formatMalaysiaDateTime } from "../../utils/malaysiaTime";
import type { AuditEntry } from "../../types";
import type { SmokingBreak } from "../../utils/smoking/schema";

const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  px: 0.9,
  py: 0.4,
  borderRadius: "999px",
  border: "1px solid transparent",
} as const;

/** A flag reads as a warning pill; a resolved one, quieter, with its note on hover. */
function FlagCell({ b, now }: { b: SmokingBreak; now: Date }) {
  const flag = effectiveFlag(b, now);
  if (flag) {
    return (
      <Box component="span" sx={{ ...PILL_BASE, color: editorial.error, backgroundColor: editorial.errorWash, borderColor: editorial.error }}>
        {flag}
      </Box>
    );
  }
  if (b.resolvedAt) {
    return (
      <Tooltip title={b.resolutionNote || "Resolved"}>
        <Box component="span" sx={{ ...PILL_BASE, color: editorial.muted, backgroundColor: editorial.neutralWash, borderColor: editorial.border }}>
          Resolved
        </Box>
      </Tooltip>
    );
  }
  return <>—</>;
}

function HistoryButton({ entries }: { entries: AuditEntry[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title="History">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="History">
          <HistoryIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 340, borderRadius: radius.md } } }}
      >
        {entries.length === 0 ? (
          <Typography sx={{ fontSize: 12.5, color: editorial.muted, p: 0.5 }}>No history yet.</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {entries.map((entry, index) => (
              <Box key={`${entry.at}-${index}`} sx={{ pb: 1, borderBottom: index < entries.length - 1 ? editorialHairline : "none" }}>
                <Typography sx={{ fontSize: 11, color: editorial.softMuted, fontWeight: 700 }}>{entry.whenLabel} · {entry.who}</Typography>
                <Typography sx={{ fontSize: 12.5, color: editorial.ink }}>{entry.event}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}

export default function SmokingLogTable({
  breaks,
  now,
  canWrite,
  auditFor,
  onEdit,
  onResolve,
  onDelete,
}: {
  breaks: SmokingBreak[];
  now: Date;
  canWrite: boolean;
  auditFor: (b: SmokingBreak) => AuditEntry[];
  onEdit: (b: SmokingBreak) => void;
  onResolve: (b: SmokingBreak) => void;
  onDelete: (b: SmokingBreak) => void;
}) {
  if (breaks.length === 0) {
    return (
      <Widget bare>
        <WidgetEmpty>No breaks match these filters.</WidgetEmpty>
      </Widget>
    );
  }

  return (
    <DataTable
      minWidth={1080}
      columns={[
        { key: "name", label: "Name" },
        { key: "department", label: "Department" },
        { key: "position", label: "Position" },
        { key: "company", label: "Company" },
        { key: "area", label: "Area" },
        { key: "in", label: "In" },
        { key: "out", label: "Out" },
        { key: "duration", label: "Duration", align: "right" },
        { key: "flag", label: "Flag" },
        { key: "actions", label: "", width: canWrite ? 150 : 60, align: "right" },
      ]}
    >
      {breaks.map((b) => (
        <DataRow key={b.id}>
          <DataCell>{b.fullName || b.email}</DataCell>
          <DataCell muted>{b.department}</DataCell>
          <DataCell muted>{b.position}</DataCell>
          <DataCell muted>{b.company}</DataCell>
          <DataCell muted nowrap>
            {b.areaInName || "—"}
            {b.areaOutName ? ` → ${b.areaOutName}` : ""}
          </DataCell>
          <DataCell muted nowrap>{formatMalaysiaDateTime(b.timeIn)}</DataCell>
          <DataCell muted nowrap>{b.timeOut ? formatMalaysiaDateTime(b.timeOut) : "—"}</DataCell>
          <DataCell align="right" muted>{b.durationMinutes == null ? "—" : `${b.durationMinutes} min`}</DataCell>
          <DataCell>
            <FlagCell b={b} now={now} />
          </DataCell>
          <DataCell align="right">
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
              <HistoryButton entries={auditFor(b)} />
              {canWrite && (
                <>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => onEdit(b)} aria-label={`Edit break for ${b.fullName || b.email}`}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {effectiveFlag(b, now) && (
                    <Tooltip title="Resolve flag">
                      <IconButton size="small" onClick={() => onResolve(b)} aria-label={`Resolve flag for ${b.fullName || b.email}`}>
                        <ResolveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => onDelete(b)} aria-label={`Delete break for ${b.fullName || b.email}`}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          </DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
