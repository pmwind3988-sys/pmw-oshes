import { useEffect, useState } from "react";
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { Callout, PageHeader, Widget } from "../Widget";
import { usePortal } from "../../contexts/PortalContext";
import { writeAuditEntry } from "../../utils/portalAudit";
import { loadScanLimits, saveScanLimits } from "../../utils/smoking/adminStore";
import { DEFAULT_SCAN_LIMITS, SCAN_LIMIT_MAX, formatSpan, type ScanLimits } from "../../utils/smoking/schema";
import { readSpanInput, toSpanInput, type SpanInput, type SpanUnit } from "./scanLimitInput";

type LimitKey = keyof ScanLimits;

const LIMITS: Array<{ key: LimitKey; label: string; help: string; zeroMeans: string }> = [
  {
    key: "ignoreRepeatSeconds",
    label: "Ignore repeat scans within",
    help: "A second scan this soon after scanning in or out is treated as a double tap. Nothing is recorded.",
    zeroMeans: "Off",
  },
  {
    key: "minBreakSeconds",
    label: "Minimum break length",
    help: "A break shorter than this is still recorded, but flagged for OSHES to check.",
    zeroMeans: "Off",
  },
  {
    key: "restSeconds",
    label: "Rest time between breaks",
    help: "A break started this soon after the last one ended is still recorded, but flagged for OSHES to check.",
    zeroMeans: "Off",
  },
];

const spanLabel = (seconds: number, zeroMeans: string) => (seconds ? formatSpan(seconds) : zeroMeans);

function toInputs(limits: ScanLimits): Record<LimitKey, SpanInput> {
  return {
    ignoreRepeatSeconds: toSpanInput(limits.ignoreRepeatSeconds),
    minBreakSeconds: toSpanInput(limits.minBreakSeconds),
    restSeconds: toSpanInput(limits.restSeconds),
  };
}

export default function SmokingSettingsTab() {
  const { access, spClient, userEmail, appendAudit, toast } = usePortal();
  const canWrite = access.isAdmin && !access.readOnly;

  const [rowId, setRowId] = useState("");
  const [saved, setSaved] = useState<ScanLimits>(DEFAULT_SCAN_LIMITS);
  const [inputs, setInputs] = useState<Record<LimitKey, SpanInput>>(() => toInputs(DEFAULT_SCAN_LIMITS));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await spClient.acquireToken();
        const stored = await loadScanLimits(token);
        if (cancelled) return;
        setRowId(stored.id);
        setSaved(stored.limits);
        setInputs(toInputs(stored.limits));
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load the smoking settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spClient]);

  const read = Object.fromEntries(
    LIMITS.map(({ key }) => [key, readSpanInput(inputs[key], SCAN_LIMIT_MAX[key])]),
  ) as Record<LimitKey, ReturnType<typeof readSpanInput>>;
  const valid = LIMITS.every(({ key }) => "seconds" in read[key]);
  const next: ScanLimits | null = valid
    ? {
        ignoreRepeatSeconds: (read.ignoreRepeatSeconds as { seconds: number }).seconds,
        minBreakSeconds: (read.minBreakSeconds as { seconds: number }).seconds,
        restSeconds: (read.restSeconds as { seconds: number }).seconds,
      }
    : null;
  const changes = next ? LIMITS.filter(({ key }) => next[key] !== saved[key]) : [];

  const setInput = (key: LimitKey, patch: Partial<SpanInput>) =>
    setInputs((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const handleSave = async () => {
    if (!next || changes.length === 0) return;
    setBusy(true);
    try {
      const token = await spClient.acquireToken();
      await saveScanLimits(token, rowId, next);
      if (!rowId) setRowId((await loadScanLimits(token)).id);
      const summary = changes
        .map(({ key, label, zeroMeans }) => `${label}: ${spanLabel(saved[key], zeroMeans)} → ${spanLabel(next[key], zeroMeans)}`)
        .join("; ");
      const entry = await writeAuditEntry(spClient, {
        reference: "SMK-SETTINGS",
        who: userEmail,
        event: `Smoking scan limits changed — ${summary}`,
      });
      appendAudit(entry);
      setSaved(next);
      setInputs(toInputs(next));
      toast("Settings saved. Scans use them within a minute.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Settings"
        subtitle="limits every scan is checked against"
        actions={
          canWrite && (
            <Button variant="contained" disabled={loading || busy || !valid || changes.length === 0} onClick={() => void handleSave()} sx={{ minHeight: 40 }}>
              Save
            </Button>
          )
        }
      />

      {loadError && (
        <Callout tone="error" sx={{ mb: 2 }}>
          {loadError}
        </Callout>
      )}

      <Widget bare>
        {loading ? (
          <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.25 }}>Loading…</Typography>
        ) : (
          <Stack divider={<Box sx={{ borderTop: `1px solid ${editorial.border}` }} />}>
            {LIMITS.map(({ key, label, help }) => {
              const problem = "error" in read[key] ? read[key].error : "";
              return (
                <Box
                  key={key}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr auto" },
                    gap: { xs: 1.5, sm: 3 },
                    alignItems: "center",
                    py: 2,
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: editorial.ink }}>{label}</Typography>
                    <Typography sx={{ fontSize: 13, color: editorial.muted, lineHeight: 1.5, mt: 0.25 }}>{help}</Typography>
                  </Box>
                  <Stack sx={{ flexDirection: "row", gap: 1, alignItems: "flex-start" }}>
                    <TextField
                      size="small"
                      label="Amount"
                      value={inputs[key].value}
                      disabled={!canWrite || busy}
                      onChange={(e) => setInput(key, { value: e.target.value })}
                      error={!!problem}
                      helperText={problem || " "}
                      slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": `${label} amount` } }}
                      sx={{ width: 110 }}
                    />
                    <TextField
                      select
                      size="small"
                      label="Unit"
                      value={inputs[key].unit}
                      disabled={!canWrite || busy}
                      onChange={(e) => setInput(key, { unit: e.target.value as SpanUnit })}
                      helperText=" "
                      sx={{ width: 130 }}
                    >
                      <MenuItem value="seconds">seconds</MenuItem>
                      <MenuItem value="minutes">minutes</MenuItem>
                    </TextField>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Widget>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 1.5, lineHeight: 1.5 }}>
        0 turns a limit off. A change reaches every scan within a minute and does not re-check breaks already recorded.
      </Typography>
    </Box>
  );
}
