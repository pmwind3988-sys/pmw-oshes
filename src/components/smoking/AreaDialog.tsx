import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import type { SmokingArea } from "../../utils/smoking/schema";

export default function AreaDialog({
  open,
  area,
  busy,
  onCancel,
  onSave,
}: {
  open: boolean;
  area: SmokingArea | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset the field when a different area opens (or the dialog re-opens for
  // "add"), without a render-cascading effect — React's own "adjusting state
  // on a prop change" pattern, as ResolveFlagDialog uses for its note field.
  const key = open ? (area?.id ?? "new") : null;
  if (openedFor !== key) {
    setOpenedFor(key);
    setName(area?.name ?? "");
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{area ? "Rename area" : "Add smoking area"}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          sx={{ mt: 1 }}
          label="Area name"
          placeholder="e.g. Block A smoking area"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => onSave(name.trim())}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
