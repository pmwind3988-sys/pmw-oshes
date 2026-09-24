import { useEffect, useMemo, useState } from "react";
import { Box, Button, MenuItem, Stack, Switch, Tab, Tabs, TextField, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { panelSx } from "../../theme/surfaces";
import { Callout, PageHeader, Widget } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import { writeAuditEntry } from "../../utils/portalAudit";
import { downloadCsv } from "../../utils/csv";
import { formatMalaysiaDateTime, malaysiaDateStamp } from "../../utils/malaysiaTime";
import BreakEditDialog, { isoToMytInput, mytInputToIso } from "../../components/smoking/BreakEditDialog";
import DeleteBreakDialog from "../../components/smoking/DeleteBreakDialog";
import OnBreakButton from "../../components/smoking/OnBreakButton";
import ResolveFlagDialog from "../../components/smoking/ResolveFlagDialog";
import SmokingLogTable from "../../components/smoking/SmokingLogTable";
import SmokingTotalsTable from "../../components/smoking/SmokingTotalsTable";
import {
  applyEdit,
  breakReference,
  breaksCsv,
  computeTotals,
  currentlyOut,
  describeChange,
  filterBreaks,
  totalsCsv,
  type BreakEdit,
  type BreakFilters,
} from "../../utils/smoking/adminData";
import { deleteBreak, ensureSmokingLists, loadBreaks, resolveFlag, saveBreak } from "../../utils/smoking/adminStore";
import type { SmokingBreak } from "../../utils/smoking/schema";

type Tab_ = "log" | "totals" | "areas" | "people";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 MYT of the week containing `now`, and the Monday after it. */
function defaultWeekRange(now: Date): { from: string; to: string } {
  const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + MYT_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7;
  const mondayShiftedMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday);
  const from = new Date(mondayShiftedMs - MYT_OFFSET_MS).toISOString();
  const to = new Date(mondayShiftedMs - MYT_OFFSET_MS + 7 * ONE_DAY_MS).toISOString();
  return { from, to };
}

const isoToMytDate = (iso: string) => isoToMytInput(iso).slice(0, 10);
const mytDateToIsoStart = (dateStr: string) => mytInputToIso(`${dateStr}T00:00`);

export default function SmokingLogScreen() {
  const { access, spClient, userEmail, audit, appendAudit, toast } = usePortal();
  const [tab, setTab] = useState<Tab_>("log");

  const [range, setRange] = useState(() => defaultWeekRange(new Date()));
  const [breaks, setBreaks] = useState<SmokingBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [department, setDepartment] = useState("");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [groupByDepartment, setGroupByDepartment] = useState(false);

  const [editTarget, setEditTarget] = useState<SmokingBreak | null>(null);
  const [resolveTarget, setResolveTarget] = useState<SmokingBreak | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmokingBreak | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = access.isAdmin && !access.readOnly;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const token = await spClient.acquireToken();
        if (access.isAdmin) await ensureSmokingLists(token);
        const rows = await loadBreaks(token, range.from, range.to);
        if (!cancelled) setBreaks(rows);
      } catch (error) {
        if (cancelled) return;
        setBreaks([]);
        setLoadError(
          access.isAdmin
            ? error instanceof Error
              ? error.message
              : "Could not load the smoking log."
            : "OSHES hasn't set up the smoking log yet.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access.isAdmin, range.from, range.to, spClient]);

  // Recomputed per render rather than memoized: "now" has to move forward as
  // the clock does, not just when the loaded rows change.
  const now = new Date();

  const filters: BreakFilters = useMemo(
    () => ({ from: range.from, to: range.to, department, area, search, flaggedOnly }),
    [range, department, area, search, flaggedOnly],
  );
  // Not memoized: "now" is fresh every render, so a memo keyed on it would
  // never actually skip the recompute.
  const filtered = filterBreaks(breaks, filters, now);
  const outNow = currentlyOut(breaks, now);

  const departments = useMemo(
    () => [...new Set(breaks.map((b) => b.department).filter(Boolean))].sort(),
    [breaks],
  );
  const areas = useMemo(
    () => [...new Set(breaks.flatMap((b) => [b.areaInName, b.areaOutName]).filter(Boolean))].sort(),
    [breaks],
  );

  const auditFor = (b: SmokingBreak) => audit.filter((entry) => entry.reference === breakReference(b));

  const runWrite = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  };

  const handleEditSave = (edit: BreakEdit) => {
    const before = editTarget;
    if (!before) return;
    void runWrite(async () => {
      const after = applyEdit(before, edit, new Date());
      const token = await spClient.acquireToken();
      await saveBreak(token, after);
      const entry = await writeAuditEntry(spClient, {
        reference: breakReference(after),
        who: userEmail,
        event: `Smoking break edited — ${describeChange(before, after)}`,
      });
      appendAudit(entry);
      setBreaks((rows) => rows.map((r) => (r.id === after.id ? after : r)));
      setEditTarget(null);
      toast("Break updated");
    });
  };

  const handleResolveSave = (note: string) => {
    const b = resolveTarget;
    if (!b) return;
    void runWrite(async () => {
      const token = await spClient.acquireToken();
      const at = new Date();
      await resolveFlag(token, b.id, note, userEmail, at);
      const entry = await writeAuditEntry(spClient, {
        reference: breakReference(b),
        who: userEmail,
        event: `Smoking flag resolved — ${note}`,
      });
      appendAudit(entry);
      const after: SmokingBreak = {
        ...b,
        resolutionNote: note.trim(),
        resolvedBy: userEmail,
        resolvedAt: at.toISOString(),
      };
      setBreaks((rows) => rows.map((r) => (r.id === after.id ? after : r)));
      setResolveTarget(null);
      toast("Flag resolved");
    });
  };

  const handleDeleteYes = () => {
    const b = deleteTarget;
    if (!b) return;
    void runWrite(async () => {
      const token = await spClient.acquireToken();
      await deleteBreak(token, b.id);
      const entry = await writeAuditEntry(spClient, {
        reference: breakReference(b),
        who: userEmail,
        event: `Smoking break deleted — ${b.fullName} <${b.email}>, ${b.areaInName} ${formatMalaysiaDateTime(b.timeIn)} → ${
          b.timeOut ? formatMalaysiaDateTime(b.timeOut) : "no scan-out"
        }, ${b.durationMinutes ?? "—"} min`,
      });
      appendAudit(entry);
      setBreaks((rows) => rows.filter((r) => r.id !== b.id));
      setDeleteTarget(null);
      toast("Break deleted");
    });
  };

  const handleExport = () => {
    if (tab === "totals") {
      const totals = computeTotals(filtered, now);
      downloadCsv(totalsCsv(totals), `smoking-log-${malaysiaDateStamp()}.csv`);
      toast(`Exported ${totals.length} rows`);
    } else {
      downloadCsv(breaksCsv(filtered, now), `smoking-log-${malaysiaDateStamp()}.csv`);
      toast(`Exported ${filtered.length} rows`);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <PageHeader
        title="Smoking log"
        subtitle="every break scanned in and out, with edits, flags and deletions kept in the audit trail"
        actions={
          <>
            <OnBreakButton outNow={outNow} />
            <Button variant="outlined" onClick={handleExport} sx={{ minHeight: 40 }}>
              Export to CSV
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={(_, next: Tab_) => setTab(next)}
        sx={{ mb: 2, minHeight: 42, "& .MuiTab-root": { minHeight: 42, fontSize: 13, fontWeight: 700 } }}
      >
        <Tab value="log" label="Log" />
        <Tab value="totals" label="Totals" />
        {access.isAdmin && <Tab value="areas" label="Areas" />}
        <Tab value="people" label="People" />
      </Tabs>

      {(tab === "log" || tab === "totals") && (
        <>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ ...panelSx, p: { xs: 1.5, sm: 1.75 }, mb: 2, flexWrap: "wrap", alignItems: "flex-end", rowGap: 1.5 }}
          >
            <TextField
              type="date"
              size="small"
              label="From"
              value={isoToMytDate(range.from)}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: mytDateToIsoStart(e.target.value) }))}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: "calc(50% - 6px)", sm: 160 } }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={isoToMytDate(new Date(new Date(range.to).getTime() - ONE_DAY_MS).toISOString())}
              onChange={(e) =>
                e.target.value &&
                setRange((r) => ({ ...r, to: new Date(new Date(mytDateToIsoStart(e.target.value)).getTime() + ONE_DAY_MS).toISOString() }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { xs: "calc(50% - 6px)", sm: 160 } }}
            />
            <TextField
              select
              size="small"
              label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              sx={{ width: { xs: "calc(50% - 6px)", sm: 190 } }}
            >
              <MenuItem value="">All departments</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              sx={{ width: { xs: "calc(50% - 6px)", sm: 170 } }}
            >
              <MenuItem value="">All areas</MenuItem>
              {areas.map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: { xs: "100%", sm: 200 } }}
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 12.5, color: editorial.muted, fontWeight: 700 }}>Flagged only</Typography>
              <Switch
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
                slotProps={{ input: { "aria-label": "Flagged only" } }}
              />
            </Stack>
            {tab === "totals" && (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography sx={{ fontSize: 12.5, color: editorial.muted, fontWeight: 700 }}>Group by department</Typography>
                <Switch
                  checked={groupByDepartment}
                  onChange={(e) => setGroupByDepartment(e.target.checked)}
                  slotProps={{ input: { "aria-label": "Group by department" } }}
                />
              </Stack>
            )}
          </Stack>

          {loadError && (
            <Callout tone={access.isAdmin ? "error" : "info"} sx={{ mb: 2 }}>
              {loadError}
            </Callout>
          )}

          {loading ? (
            <Widget bare>
              <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.25 }}>Loading…</Typography>
            </Widget>
          ) : tab === "log" ? (
            <SmokingLogTable
              breaks={filtered}
              now={now}
              canWrite={canWrite}
              auditFor={auditFor}
              onEdit={setEditTarget}
              onResolve={setResolveTarget}
              onDelete={setDeleteTarget}
            />
          ) : (
            <SmokingTotalsTable totals={computeTotals(filtered, now)} groupByDepartment={groupByDepartment} />
          )}
        </>
      )}

      <BreakEditDialog open={!!editTarget} target={editTarget} busy={busy} onCancel={() => setEditTarget(null)} onSave={handleEditSave} />
      <ResolveFlagDialog
        open={!!resolveTarget}
        target={resolveTarget}
        busy={busy}
        onCancel={() => setResolveTarget(null)}
        onSave={handleResolveSave}
      />
      <DeleteBreakDialog open={!!deleteTarget} target={deleteTarget} busy={busy} onNo={() => setDeleteTarget(null)} onYes={handleDeleteYes} />
    </Box>
  );
}

