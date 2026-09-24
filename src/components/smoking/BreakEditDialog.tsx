import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { validateEdit, type BreakEdit } from "../../utils/smoking/adminData";
import type { SmokingBreak } from "../../utils/smoking/schema";

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO instant → `YYYY-MM-DDTHH:mm` in Malaysian wall-clock time, for a `datetime-local` field. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helpers the screen and tests import directly
export function isoToMytInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + MYT_OFFSET_MS).toISOString().slice(0, 16);
}

/** The reverse: a `datetime-local` value, read as Malaysian wall-clock time, back to an ISO instant. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helpers the screen and tests import directly
export function mytInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

interface Draft {
  timeIn: string;
  timeOut: string;
  areaInName: string;
  areaOutName: string;
  fullName: string;
  department: string;
  position: string;
  company: string;
}

function draftOf(b: SmokingBreak): Draft {
  return {
    timeIn: isoToMytInput(b.timeIn),
    timeOut: isoToMytInput(b.timeOut),
    areaInName: b.areaInName,
    areaOutName: b.areaOutName,
    fullName: b.fullName,
    department: b.department,
    position: b.position,
    company: b.company,
  };
}

export default function BreakEditDialog({
  open,
  target,
  busy,
  onCancel,
  onSave,
}: {
  open: boolean;
  target: SmokingBreak | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (edit: BreakEdit) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState("");
  const [draftFor, setDraftFor] = useState<string | null>(null);

  // Reset the draft when a different break opens, without a render-cascading
  // effect: this is React's own "adjusting state on a prop change" pattern.
  const targetId = target?.id ?? null;
  if (draftFor !== targetId) {
    setDraftFor(targetId);
    setDraft(target ? draftOf(target) : null);
    setProblem("");
  }

  if (!draft) return null;
  const field = (key: keyof Draft, label: string, type = "text") => (
    <TextField
      label={label}
      type={type}
      value={draft[key]}
      fullWidth
      slotProps={type === "datetime-local" ? { inputLabel: { shrink: true } } : undefined}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
    />
  );

  const save = () => {
    const edit: BreakEdit = {
      timeIn: draft.timeIn ? mytInputToIso(draft.timeIn) : "",
      timeOut: draft.timeOut ? mytInputToIso(draft.timeOut) : null,
      areaInName: draft.areaInName.trim(),
      areaOutName: draft.areaOutName.trim(),
      fullName: draft.fullName,
      department: draft.department,
      position: draft.position,
      company: draft.company,
    };
    const message = validateEdit(edit);
    if (message) setProblem(message);
    else onSave(edit);
  };

  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Edit break</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {problem && <Alert severity="error">{problem}</Alert>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("timeIn", "Time in (MYT)", "datetime-local")}
            {field("timeOut", "Time out (MYT)", "datetime-local")}
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("areaInName", "Area in")}
            {field("areaOutName", "Area out")}
          </Stack>
          {field("fullName", "Name")}
          {field("department", "Department")}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {field("position", "Position")}
            {field("company", "Company")}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
