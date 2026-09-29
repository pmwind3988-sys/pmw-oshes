import { useState } from "react";
import { Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { DataCell, DataRow, DataTable, Widget, WidgetEmpty } from "../Widget";
import { Check as ResolveIcon, History as HistoryIcon, Pencil as EditIcon, Trash2 as DeleteIcon } from "../ui/Icons";
import { effectiveFlag } from "../../utils/smoking/adminData";
import type { AuditEntry } from "../../types";
import type { SmokingBreak } from "../../utils/smoking/schema";
import { isoToMytInput } from "./BreakEditDialog";
import { CardList, CardRow, Pager, useIsPhone, usePaged } from "./SmokingPaging";

const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  lineHeight: 1.35,
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  px: 0.9,
  py: 0.4,
  borderRadius: "8px",
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

/**
 * "Out 24/09 10:42 · In 10:49" on a card, where the year is noise; the date on
 * the check-in only shows when it is a different day. The table keeps full stamps.
 */
const dayOf = (myt: string) => `${myt.slice(8, 10)}/${myt.slice(5, 7)}`;

/** "29/09 12:11", Malaysian time — the date range above already says the year. */
const stamp = (iso: string) => {
  const myt = isoToMytInput(iso);
  return `${dayOf(myt)} ${myt.slice(11, 16)}`;
};

function cardTimes(b: SmokingBreak): string {
  const out = isoToMytInput(b.timeIn);
  const outLabel = `Out ${dayOf(out)} ${out.slice(11, 16)}`;
  if (!b.timeOut) return `${outLabel} · not back yet`;
  const back = isoToMytInput(b.timeOut);
  return `${outLabel} · In ${back.slice(0, 10) === out.slice(0, 10) ? "" : `${dayOf(back)} `}${back.slice(11, 16)}`;
}

export default function SmokingLogTable({
  breaks,
  now,
  canWrite,
  auditFor,
  onEdit,
  onResolve,
  onDelete,
  resetKey,
}: {
  breaks: SmokingBreak[];
  now: Date;
  canWrite: boolean;
  auditFor: (b: SmokingBreak) => AuditEntry[];
  onEdit: (b: SmokingBreak) => void;
  onResolve: (b: SmokingBreak) => void;
  onDelete: (b: SmokingBreak) => void;
  /** Changes when the filters do, which sends the table back to page 1. */
  resetKey: string;
}) {
  const phone = useIsPhone();
  const paged = usePaged(breaks, resetKey);

  if (breaks.length === 0) {
    return (
      <Widget bare>
        <WidgetEmpty>No breaks match these filters.</WidgetEmpty>
      </Widget>
    );
  }

  const actions = (b: SmokingBreak) => (
    <>
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
    </>
  );

  const duration = (b: SmokingBreak) => (b.durationMinutes == null ? "—" : `${b.durationMinutes} min`);
  const areaLabel = (b: SmokingBreak) => `${b.areaInName || "—"}${b.areaOutName && b.areaOutName !== b.areaInName ? ` → ${b.areaOutName}` : ""}`;

  return (
    <>
      {phone ? (
        <CardList>
          {paged.rows.map((b) => {
            const flagged = !!effectiveFlag(b, now) || !!b.resolvedAt;
            return (
              <CardRow
                key={b.id}
                title={b.fullName || b.email}
                badge={
                  <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, color: b.timeOut ? editorial.ink : editorial.success }}>
                    {b.timeOut ? duration(b) : "Still out"}
                  </Typography>
                }
                lines={[
                  cardTimes(b),
                  [areaLabel(b), b.department].filter(Boolean).join(" · "),
                  flagged ? <FlagCell b={b} now={now} /> : null,
                ]}
                actions={actions(b)}
              />
            );
          })}
        </CardList>
      ) : (
        <DataTable
          minWidth={900}
          columns={[
            { key: "name", label: "Name" },
            { key: "department", label: "Department" },
            { key: "company", label: "Company" },
            { key: "area", label: "Area" },
            { key: "in", label: "Checked out" },
            { key: "out", label: "Checked in" },
            { key: "duration", label: "Duration", align: "right" },
            { key: "actions", label: "", width: canWrite ? 150 : 60, align: "right" },
          ]}
        >
          {paged.rows.map((b) => (
            <DataRow key={b.id}>
              <DataCell>
                <Box sx={{ whiteSpace: "nowrap" }}>{b.fullName || b.email}</Box>
                {/* The flag rides under the name, not in a column of its own: a
                    long reason there pushed the row's buttons off the screen. */}
                {(effectiveFlag(b, now) || b.resolvedAt) && (
                  <Box sx={{ mt: 0.5, maxWidth: 200 }}>
                    <FlagCell b={b} now={now} />
                  </Box>
                )}
              </DataCell>
              <DataCell muted nowrap>{b.department}</DataCell>
              <DataCell muted nowrap>{b.company}</DataCell>
              <DataCell muted sx={{ minWidth: 170 }}>{areaLabel(b)}</DataCell>
              <DataCell muted nowrap>{stamp(b.timeIn)}</DataCell>
              <DataCell muted nowrap>{b.timeOut ? stamp(b.timeOut) : "—"}</DataCell>
              <DataCell align="right" muted>{duration(b)}</DataCell>
              <DataCell align="right">
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>{actions(b)}</Box>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
      <Pager paged={paged} noun="breaks" />
    </>
  );
}
