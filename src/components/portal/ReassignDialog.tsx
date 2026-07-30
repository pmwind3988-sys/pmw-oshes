import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { reassignLayer } from "../../utils/portalActions";
import { displayName, normalizeEmail } from "../../utils/portalPeople";
import type { PortalRecord } from "../../types";

interface Candidate {
  email: string;
  name: string;
  role: string;
  load: number;
}

/**
 * Reassign the current layer. Candidates are the people who already hold layers
 * somewhere in the catalogue, shown with their current load — you should be able
 * to see that you are not simply moving the jam sideways.
 */
export default function ReassignDialog({ record, onClose }: { record: PortalRecord | null; onClose: () => void }) {
  const { records, catalogue, directory, spClient, userName, userEmail, applyPatch, appendAudit, toast } = usePortal();
  const [pick, setPick] = useState("");
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo<Candidate[]>(() => {
    const load = new Map<string, number>();
    for (const item of records) {
      if (item.done || item.returned || !item.currentAssigneeEmail) continue;
      load.set(item.currentAssigneeEmail, (load.get(item.currentAssigneeEmail) ?? 0) + 1);
    }

    const seen = new Map<string, Candidate>();
    for (const entry of catalogue) {
      for (const layer of entry.layers) {
        if (layer.assignee.type !== "user") continue;
        const email = normalizeEmail(layer.assignee.value);
        if (!email || email === record?.currentAssigneeEmail || seen.has(email)) continue;
        seen.set(email, {
          email,
          name: displayName(email, directory),
          role: layer.roleLabel ?? layer.title ?? entry.name,
          load: load.get(email) ?? 0,
        });
      }
    }

    return [...seen.values()].sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
  }, [records, catalogue, directory, record?.currentAssigneeEmail]);

  // Default to the lightest-loaded candidate whenever the dialog targets a new record.
  if (pickedFor !== (record?.reference ?? null)) {
    setPickedFor(record?.reference ?? null);
    setPick(candidates[0]?.email ?? "");
  }

  if (!record) return null;

  const confirm = async () => {
    const chosen = candidates.find((candidate) => candidate.email === pick);
    if (!chosen) {
      toast("Pick who the layer moves to.");
      return;
    }
    setSaving(true);
    try {
      const result = await reassignLayer(
        { spClient, actorName: userName || userEmail, actorEmail: userEmail },
        record,
        chosen.email,
        chosen.name,
      );
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not reassign the layer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" transitionDuration={120}>
      <DialogTitle sx={{ fontWeight: 800 }}>Reassign {record.reference}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
          {record.layerLabel} moves to a different approver. The original approver is told why, and the age on this layer
          keeps running.
        </Typography>

        {candidates.length === 0 ? (
          <Typography variant="body2" sx={{ color: editorial.muted }}>
            No other approver is configured on any form type yet. Add one in the form builder first.
          </Typography>
        ) : (
          <RadioGroup value={pick} onChange={(event) => setPick(event.target.value)}>
            {candidates.map((candidate) => (
              <FormControlLabel
                key={candidate.email}
                value={candidate.email}
                control={<Radio />}
                sx={{ alignItems: "center", minHeight: 44, m: 0 }}
                label={
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{candidate.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                      {candidate.role} · {candidate.load} open
                    </Typography>
                  </Box>
                }
              />
            ))}
          </RadioGroup>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Keep as is
        </Button>
        <Button variant="contained" onClick={() => void confirm()} disabled={saving || candidates.length === 0}>
          Reassign
        </Button>
      </DialogActions>
    </Dialog>
  );
}
