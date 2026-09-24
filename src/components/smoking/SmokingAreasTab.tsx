import { useEffect, useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { Callout, DataCell, DataRow, DataTable, PageHeader, Widget, WidgetEmpty } from "../Widget";
import { Ban as RetireIcon, Pencil as RenameIcon, Plus as AddIcon, Printer as PrinterIcon, QrCode as QrIcon, RotateCcw as ReactivateIcon } from "../ui/Icons";
import { usePortal } from "../../contexts/PortalContext";
import { writeAuditEntry } from "../../utils/portalAudit";
import { uniqueAreaCode } from "../../utils/smoking/adminData";
import { createArea, loadAreas, updateArea } from "../../utils/smoking/adminStore";
import type { SmokingArea } from "../../utils/smoking/schema";
import AreaDialog from "./AreaDialog";
import AreaQrDialog from "./AreaQrDialog";
import { printSmokingPoster } from "./printSmokingPoster";

export default function SmokingAreasTab() {
  const { access, spClient, userEmail, appendAudit, toast } = usePortal();
  const canWrite = access.isAdmin && !access.readOnly;

  const [areas, setAreas] = useState<SmokingArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  const [dialogTarget, setDialogTarget] = useState<SmokingArea | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState<SmokingArea | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const token = await spClient.acquireToken();
        const rows = await loadAreas(token);
        if (!cancelled) setAreas(rows);
      } catch (error) {
        if (cancelled) return;
        setAreas([]);
        setLoadError(error instanceof Error ? error.message : "Could not load smoking areas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spClient]);

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

  const openAdd = () => {
    setDialogTarget(null);
    setDialogOpen(true);
  };
  const openRename = (area: SmokingArea) => {
    setDialogTarget(area);
    setDialogOpen(true);
  };

  const handleSave = (name: string) => {
    void runWrite(async () => {
      const token = await spClient.acquireToken();
      if (dialogTarget) {
        const before = dialogTarget;
        const after: SmokingArea = { ...before, name };
        await updateArea(token, after);
        const entry = await writeAuditEntry(spClient, {
          reference: `SMK-AREA-${after.code}`,
          who: userEmail,
          event: `Smoking area renamed — ${before.name} → ${after.name}`,
        });
        appendAudit(entry);
        setAreas((rows) => rows.map((a) => (a.id === after.id ? after : a)).sort(sortAreas));
        toast("Area renamed");
      } else {
        const code = uniqueAreaCode(areas.map((a) => a.code));
        await createArea(token, name, code);
        const entry = await writeAuditEntry(spClient, {
          reference: `SMK-AREA-${code}`,
          who: userEmail,
          event: `Smoking area added — ${name}`,
        });
        appendAudit(entry);
        const rows = await loadAreas(token);
        setAreas(rows);
        toast("Area added");
      }
      setDialogOpen(false);
    });
  };

  const handleToggleActive = (area: SmokingArea) => {
    void runWrite(async () => {
      const token = await spClient.acquireToken();
      const after: SmokingArea = { ...area, active: !area.active };
      await updateArea(token, after);
      const entry = await writeAuditEntry(spClient, {
        reference: `SMK-AREA-${area.code}`,
        who: userEmail,
        event: `Smoking area ${after.active ? "reactivated" : "retired"} — ${area.name}`,
      });
      appendAudit(entry);
      setAreas((rows) => rows.map((a) => (a.id === after.id ? after : a)).sort(sortAreas));
      toast(after.active ? "Area reactivated" : "Area retired");
    });
  };

  const handlePrint = (area: SmokingArea) => {
    printSmokingPoster(area).catch((error: unknown) =>
      toast(error instanceof Error ? error.message : "Could not open the poster to print."),
    );
  };

  return (
    <Box>
      <PageHeader
        title="Areas"
        subtitle="the smoking areas that scan-in and scan-out QR codes point to"
        actions={
          canWrite && (
            <Button variant="contained" startIcon={<AddIcon fontSize="small" />} onClick={openAdd} sx={{ minHeight: 40 }}>
              Add area
            </Button>
          )
        }
      />

      {loadError && (
        <Callout tone="error" sx={{ mb: 2 }}>
          {loadError}
        </Callout>
      )}

      {loading ? (
        <Widget bare>
          <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.25 }}>Loading…</Typography>
        </Widget>
      ) : areas.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>No smoking areas yet.</WidgetEmpty>
        </Widget>
      ) : (
        <DataTable
          minWidth={640}
          columns={[
            { key: "name", label: "Name" },
            { key: "code", label: "Code" },
            { key: "status", label: "Status" },
            { key: "actions", label: "", width: 170, align: "right" },
          ]}
        >
          {areas.map((area) => (
            <DataRow key={area.id}>
              <DataCell>{area.name}</DataCell>
              <DataCell muted nowrap>
                {area.code}
              </DataCell>
              <DataCell muted>{area.active ? "Active" : "Retired"}</DataCell>
              <DataCell align="right">
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                  <Tooltip title="Show QR">
                    <IconButton size="small" onClick={() => setQrTarget(area)} aria-label={`Show QR for ${area.name}`}>
                      <QrIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Print poster">
                    <IconButton size="small" onClick={() => handlePrint(area)} aria-label={`Print poster for ${area.name}`}>
                      <PrinterIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {canWrite && (
                    <>
                      <Tooltip title="Rename">
                        <IconButton size="small" onClick={() => openRename(area)} aria-label={`Rename ${area.name}`}>
                          <RenameIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={area.active ? "Retire" : "Reactivate"}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleActive(area)}
                          aria-label={area.active ? `Retire ${area.name}` : `Reactivate ${area.name}`}
                        >
                          {area.active ? <RetireIcon fontSize="small" /> : <ReactivateIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}

      <AreaDialog open={dialogOpen} area={dialogTarget} busy={busy} onCancel={() => setDialogOpen(false)} onSave={handleSave} />
      <AreaQrDialog open={!!qrTarget} area={qrTarget} onClose={() => setQrTarget(null)} />
    </Box>
  );
}

function sortAreas(a: SmokingArea, b: SmokingArea): number {
  return Number(b.active) - Number(a.active) || a.name.localeCompare(b.name);
}
