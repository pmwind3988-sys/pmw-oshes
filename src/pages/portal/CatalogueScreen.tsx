import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { PORTAL_SLA_DEFAULT_DAYS } from "../../config/oshes";
import { usePortal } from "../../contexts/PortalContext";
import { severityCaptureLabel } from "../../utils/portalCatalogue";
import { addFormType, saveCatalogueSettings } from "../../utils/portalCatalogueWrite";
import { writeAuditEntry } from "../../utils/portalAudit";
import type { CatalogueEntry } from "../../types";

const DEFAULT_ROLES = [
  "Supervisor",
  "Safety Officer",
  "Ops Manager",
  "Site Lead",
  "Environment Lead",
  "Occupational Health",
];

/**
 * Form catalogue — the answer to "the form set must be configurable later".
 * Everything on this screen is data on the form's own LayerConfig, so nothing
 * downstream has to hard-code a form list.
 */
export default function CatalogueScreen() {
  const { catalogue, spClient, userName, userEmail, updateCatalogue, addCatalogueEntry, appendAudit, toast } = usePortal();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newLayers, setNewLayers] = useState("2");
  const [newSla, setNewSla] = useState(String(PORTAL_SLA_DEFAULT_DAYS));
  const [saving, setSaving] = useState(false);

  const actor = { spClient, actorName: userName || userEmail, actorEmail: userEmail };

  const persist = async (entry: CatalogueEntry, patch: Parameters<typeof saveCatalogueSettings>[2], optimistic: Partial<CatalogueEntry>) => {
    updateCatalogue(entry.listTitle, optimistic);
    try {
      await saveCatalogueSettings(spClient, entry, patch);
    } catch (error) {
      updateCatalogue(entry.listTitle, { slaDays: entry.slaDays, isPublic: entry.isPublic });
      toast(error instanceof Error ? error.message : "Could not save the catalogue change.");
    }
  };

  const togglePublic = (entry: CatalogueEntry) => {
    const isPublic = !entry.isPublic;
    void persist(entry, { isPublic }, { isPublic });
  };

  const setSla = (entry: CatalogueEntry, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    const slaDays = digits === "" ? 0 : Number(digits);
    updateCatalogue(entry.listTitle, { slaDays });
    if (slaDays > 0) void persist(entry, { slaDays }, { slaDays });
  };

  const confirmAdd = async () => {
    const name = newName.trim();
    if (!name) {
      toast("Give the form type a name first.");
      return;
    }
    setSaving(true);
    try {
      const layerCount = Math.max(1, Math.min(6, Number(newLayers) || 2));
      const entry = await addFormType(spClient, {
        name,
        code: newCode,
        layerCount,
        slaDays: Number(newSla) || PORTAL_SLA_DEFAULT_DAYS,
        roles: DEFAULT_ROLES,
      });
      addCatalogueEntry(entry);
      appendAudit(
        await writeAuditEntry(spClient, {
          reference: entry.code,
          who: actor.actorName,
          event: `Form type “${name}” added to the catalogue · ${layerCount} layers`,
        }),
      );
      setAddOpen(false);
      setNewName("");
      setNewCode("");
      setNewLayers("2");
      setNewSla(String(PORTAL_SLA_DEFAULT_DAYS));
      toast(`“${name}” added. It is internal-only until you publish a link.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add the form type.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            Form catalogue
          </Typography>
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
            the form set, its approval chain, per-layer SLA and public flag are data, not code
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => setAddOpen(true)} sx={{ minHeight: 40 }}>
          Add form type
        </Button>
      </Stack>

      <Box sx={{ backgroundColor: editorial.panel, border: editorialHairline, borderRadius: "14px", overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", minWidth: 940, borderCollapse: "collapse", fontSize: 13 }}>
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
              <Box component="th" sx={{ width: 64 }}>Code</Box>
              <Box component="th" sx={{ width: 230 }}>Form type</Box>
              <Box component="th">Approval chain</Box>
              <Box component="th" sx={{ width: 120 }}>SLA per layer</Box>
              <Box component="th" sx={{ width: 120 }}>Public link</Box>
              <Box component="th" sx={{ width: 120 }}>Severity field</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {catalogue.map((entry) => (
              <Box component="tr" key={entry.listTitle} sx={{ "& td": { px: 2, py: 1.25, borderBottom: editorialHairline, verticalAlign: "top" } }}>
                <Box component="td" sx={{ fontWeight: 800 }}>{entry.code}</Box>
                <Box component="td">
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: editorial.muted }}>
                    {entry.volume} in the last 30 days
                  </Typography>
                </Box>
                <Box component="td">
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                    {entry.chain.length === 0 ? (
                      <Typography sx={{ fontSize: 12, color: editorial.muted }}>No layers configured</Typography>
                    ) : (
                      entry.chain.map((role, index) => (
                        <Box
                          key={`${role}-${index}`}
                          component="span"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            px: 0.9,
                            py: 0.3,
                            borderRadius: "999px",
                            border: editorialHairline,
                            backgroundColor: editorial.blueSoft,
                          }}
                        >
                          {index + 1}. {role}
                        </Box>
                      ))
                    )}
                  </Stack>
                </Box>
                <Box component="td">
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                    <TextField
                      size="small"
                      value={entry.slaDays || ""}
                      onChange={(event) => setSla(entry, event.target.value)}
                      sx={{ width: 52, "& input": { textAlign: "center", fontVariantNumeric: "tabular-nums" } }}
                      slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": `SLA days for ${entry.name}` } }}
                    />
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>days</Typography>
                  </Stack>
                </Box>
                <Box component="td">
                  <Button
                    size="small"
                    onClick={() => togglePublic(entry)}
                    sx={{
                      minHeight: 32,
                      px: 1.25,
                      fontSize: 12,
                      color: entry.isPublic ? editorial.pmwBlueDark : editorial.muted,
                      backgroundColor: entry.isPublic ? editorial.blueWash : "transparent",
                      border: editorialHairline,
                    }}
                  >
                    {entry.isPublic ? "Public" : "Internal"}
                  </Button>
                </Box>
                <Box component="td" sx={{ color: editorial.muted }}>{severityCaptureLabel(entry.severityCapture)}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 3, maxWidth: "62ch" }}>
        SLA per layer is new data — it does not exist in the current catalogue schema. It is what makes “overdue”
        computable per form type instead of one global constant; unset types fall back to {PORTAL_SLA_DEFAULT_DAYS}{" "}
        working days.
      </Typography>

      <Dialog open={addOpen} onClose={saving ? undefined : () => setAddOpen(false)} fullWidth maxWidth="sm" transitionDuration={120}>
        <DialogTitle sx={{ fontWeight: 800 }}>Add a form type</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
            It appears in the catalogue, on the dashboard's inbound list, and — if public — in the QR picker.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Name"
              placeholder="e.g. Confined Space Entry"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              fullWidth
              autoFocus
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Code"
                placeholder="CSE"
                value={newCode}
                onChange={(event) => setNewCode(event.target.value.toUpperCase().slice(0, 4))}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Layers"
                value={newLayers}
                onChange={(event) => setNewLayers(event.target.value.replace(/[^0-9]/g, ""))}
                sx={{ flex: 1 }}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
              <TextField
                label="SLA (days)"
                value={newSla}
                onChange={(event) => setNewSla(event.target.value.replace(/[^0-9]/g, ""))}
                sx={{ flex: 1 }}
                slotProps={{ htmlInput: { inputMode: "numeric" } }}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setAddOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void confirmAdd()} disabled={saving}>
            Add form type
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
