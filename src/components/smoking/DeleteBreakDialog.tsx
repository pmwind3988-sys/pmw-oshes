import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { formatMalaysiaDateTime } from "../../utils/malaysiaTime";
import type { SmokingBreak } from "../../utils/smoking/schema";

// eslint-disable-next-line react-refresh/only-export-components -- pure helper the tests import directly, no separate file for one line
export function deletePrompt(target: SmokingBreak): string {
  return `Delete this break record for ${target.fullName || target.email}, ${formatMalaysiaDateTime(target.timeIn)}?`;
}

/** Permanent. No is the default so a stray Enter never deletes. */
export default function DeleteBreakDialog({
  open,
  target,
  busy,
  onNo,
  onYes,
}: {
  open: boolean;
  target: SmokingBreak | null;
  busy: boolean;
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <Dialog open={open && !!target} onClose={busy ? undefined : onNo} maxWidth="xs" fullWidth>
      <DialogTitle>Delete break record</DialogTitle>
      <DialogContent>
        <DialogContentText>{target ? deletePrompt(target) : ""}</DialogContentText>
        <DialogContentText sx={{ mt: 1 }}>This cannot be undone.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onNo} disabled={busy}>
          No
        </Button>
        <Button color="error" variant="contained" onClick={onYes} disabled={busy}>
          Yes, delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
