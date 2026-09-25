import { useEffect, useMemo, useRef, useState } from "react";
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
import SmokingAreasTab from "../../components/smoking/SmokingAreasTab";
import SmokingLogTable from "../../components/smoking/SmokingLogTable";
import SmokingPeopleTab from "../../components/smoking/SmokingPeopleTab";
import SmokingSettingsTab from "../../components/smoking/SmokingSettingsTab";
import SmokingTotalsDashboard from "../../components/smoking/SmokingTotalsDashboard";
import RefreshIcon from "@mui/icons-material/Refresh";
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
import { deleteBreak, ensureSmokingLists, loadBreaks, resolveFlag, saveBreakChanges } from "../../utils/smoking/adminStore";
import type { SmokingBreak } from "../../utils/smoking/schema";

type Tab_ = "log" | "totals" | "areas" | "people" | "settings";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_REFRESH_MS = 30_000;

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

/**
 * "Updated 10:42 · refreshes every 30 s", or — when the last try failed — how
 * old the rows on screen are, so nobody reads a stale count as the live one.
 */
function RefreshStatus({ updatedAt, failed }: { updatedAt: Date | null; failed: boolean }) {
  if (!updatedAt) return null;
  const at = isoToMytInput(updatedAt.toISOString()).slice(11, 16);
  return (
    <Typography
      role="status"
      sx={{ fontSize: 12, whiteSpace: "nowrap", color: failed ? editorial.warning : editorial.muted, fontWeight: failed ? 700 : 400 }}
    >
      {failed ? `Couldn't refresh — showing ${at}` : `Updated ${at} · refreshes every 30 s`}
    </Typography>
  );
}
const mytDateToIsoStart = (dateStr: string) => mytInputToIso(`${dateStr}T00:00`);

export default function SmokingLogScreen() {
  const { access, spClient, userEmail, audit, appendAudit, toast } = usePortal();
  const [tab, setTab] = useState<Tab_>("log");

  const [range, setRange] = useState(() => defaultWeekRange(new Date()));
  const [breaks, setBreaks] = useState<SmokingBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Bumped to reload the same dates: by the Refresh button, or by the timer.
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // The dates the rows on screen belong to. A reload of those same dates is a
  // background refresh: the rows stay up and only get swapped when new ones land.
  const loadedRange = useRef("");
  const lastLoadMs = useRef(0);

  const [department, setDepartment] = useState("");
  const [company, setCompany] = useState("");
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
    const rangeKey = `${range.from}|${range.to}`;
    const background = loadedRange.current === rangeKey;
    (async () => {
      if (background) setRefreshing(true);
      else {
        setLoading(true);
        setLoadError("");
      }
      try {
        const token = await spClient.acquireToken();
        if (access.isAdmin && !background) await ensureSmokingLists(token);
        const rows = await loadBreaks(token, range.from, range.to);
        if (cancelled) return;
        setBreaks(rows);
        setUpdatedAt(new Date());
        setRefreshFailed(false);
        setLoadError("");
        loadedRange.current = rangeKey;
        lastLoadMs.current = Date.now();
      } catch (error) {
        if (cancelled) return;
        // A failed background refresh keeps the rows already on screen and
        // says how old they are, rather than blanking a page that was fine.
        if (background) {
          setRefreshFailed(true);
          return;
        }
        setBreaks([]);
        setLoadError(
          access.isAdmin
            ? error instanceof Error
              ? error.message
              : "Could not load the smoking log."
            : "OSHES hasn't set up the smoking log yet.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access.isAdmin, range.from, range.to, spClient, refreshTick]);

  const refresh = () => setRefreshTick((t) => t + 1);

  // Held while a dialog is open or a write is going through — swapping the rows
  // under someone mid-edit is how an edit lands on a stale copy — and off the
  // tabs that don't show breaks.
  const autoPaused = !!editTarget || !!resolveTarget || !!deleteTarget || busy || !(tab === "log" || tab === "totals");

  useEffect(() => {
    if (autoPaused) return;
    const tickIfDue = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadMs.current < AUTO_REFRESH_MS - 1000) return;
      setRefreshTick((t) => t + 1);
    };
    const timer = window.setInterval(tickIfDue, AUTO_REFRESH_MS);
    // Coming back to a tab that sat hidden catches up at once, not up to 30 s later.
    document.addEventListener("visibilitychange", tickIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tickIfDue);
    };
  }, [autoPaused]);

  // Recomputed per render rather than memoized: "now" has to move forward as
  // the clock does, not just when the loaded rows change.
  const now = new Date();

  const filters: BreakFilters = useMemo(
    () => ({ from: range.from, to: range.to, department, company, area, search, flaggedOnly }),
    [range, department, company, area, search, flaggedOnly],
  );
  // Not memoized: "now" is fresh every render, so a memo keyed on it would
  // never actually skip the recompute.
  const filtered = filterBreaks(breaks, filters, now);
  const outNow = currentlyOut(breaks, now);

  const departments = useMemo(
    () => [...new Set(breaks.map((b) => b.department).filter(Boolean))].sort(),
    [breaks],
  );
  const companies = useMemo(
    () => [...new Set(breaks.map((b) => b.company).filter(Boolean))].sort(),
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
      await saveBreakChanges(token, before, after);
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
          (tab === "log" || tab === "totals") && (
            <>
              <OnBreakButton outNow={outNow} />
              <RefreshStatus updatedAt={updatedAt} failed={refreshFailed} />
              <Button
                variant="outlined"
                onClick={refresh}
                disabled={refreshing || loading}
                startIcon={
                  <RefreshIcon
                    sx={{
                      animation: refreshing ? "smoking-refresh-spin 0.9s linear infinite" : "none",
                      "@keyframes smoking-refresh-spin": { to: { transform: "rotate(360deg)" } },
                      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                    }}
                  />
                }
                sx={{ minHeight: 40 }}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
              <Button variant="outlined" onClick={handleExport} sx={{ minHeight: 40 }}>
                Export to CSV
              </Button>
            </>
          )
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
        {access.isAdmin && <Tab value="settings" label="Settings" />}
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
              label="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              sx={{ width: { xs: "calc(50% - 6px)", sm: 170 } }}
            >
              <MenuItem value="">All companies</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
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
            <SmokingTotalsDashboard breaks={filtered} from={range.from} to={range.to} now={now} groupByDepartment={groupByDepartment} />
          )}
        </>
      )}

      {tab === "areas" && access.isAdmin && <SmokingAreasTab />}
      {tab === "people" && <SmokingPeopleTab />}
      {tab === "settings" && access.isAdmin && <SmokingSettingsTab />}

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

