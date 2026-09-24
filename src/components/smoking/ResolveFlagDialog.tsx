import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import type { SmokingBreak } from "../../utils/smoking/schema";

export default function ResolveFlagDialog({
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
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);

  // Reset the note when a different break opens, without a render-cascading
  // effect: this is React's own "adjusting state on a prop change" pattern.
  const targetId = target?.id ?? null;
  if (noteFor !== targetId) {
    setNoteFor(targetId);
    setNote("");
  }

  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Resolve flag</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The times stay as recorded. Your note and name are kept with the break.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Note"
          placeholder="e.g. Forgot to scan out, confirmed about 10 min"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy || !note.trim()} onClick={() => onSave(note)}>
          Resolve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
