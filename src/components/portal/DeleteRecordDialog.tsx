import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { editorial } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { deleteSubmission } from "../../utils/portalActions";
import { canWithdrawRecord, withdrawLabel } from "../../utils/portalRole";
import type { PortalRecord } from "../../types";

/**
 * Delete a record and everything filed with it, behind a typed reference.
 *
 * This is the only action in the portal with nothing left to undo it from, so
 * the dialog spends its space on what will be gone rather than on reassurance,
 * and it names the reversible neighbour where one is available. Shared with the
 * record drawer so the dashboard cannot offer a quieter-sounding version of the
 * same irreversible write.
 */
export default function DeleteRecordDialog({
  record,
  onClose,
  onDone,
}: {
  record: PortalRecord | null;
  onClose: () => void;
  /** Fired after the record is gone — the drawer uses it to close itself. */
  onDone?: () => void;
}) {
  const { access, spClient, userName, userEmail, appendAudit, removeRecord, toast } = usePortal();
  const [confirmText, setConfirmText] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The typed reference and any failure belong to one record. Derived during
  // render rather than in an effect: closing renders null without unmounting,
  // so a half-typed reference would otherwise be waiting in the next record's
  // dialog — one keystroke from arming a delete nobody meant to arm.
  if (confirmFor !== (record?.reference ?? null)) {
    setConfirmFor(record?.reference ?? null);
    setConfirmText("");
    setError("");
  }

  if (!record) return null;

  const canWithdraw = canWithdrawRecord(record, access, userEmail);
  // Typing the reference is the gate. A record with signatures and photos
  // against it is worth more than one misplaced click.
  const armed = confirmText.trim().toLowerCase() === record.reference.toLowerCase();

  const close = () => {
    if (busy) return;
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await deleteSubmission(
        { spClient, actorName: userName || userEmail, actorEmail: userEmail },
        record,
      );
      appendAudit(result.audit);
      // Order matters: the trail entry is appended before the record leaves, so
      // the row disappearing does not race the only remaining evidence.
      removeRecord(record);
      toast(result.toast);
      onClose();
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this submission.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      fullWidth
      maxWidth="sm"
      transitionDuration={120}
      slotProps={{ paper: { sx: { border: `1px solid rgba(198, 40, 40, 0.28)` } } }}
    >
      <DialogTitle sx={{ fontWeight: 800, color: editorial.error, pb: 1 }}>
        Delete {record.reference} and everything with it?
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, mb: 1 }}>
          This deletes the whole record, not just the row:
        </Typography>
        <Box component="ul" sx={{ m: 0, mb: 2, pl: 2.5, color: editorial.muted, fontSize: 13.5, lineHeight: 1.9 }}>
          <li>every answer filed on the form, and the SharePoint item holding them</li>
          <li>every signature image from the approval chain</li>
          <li>every photo and uploaded attachment in this form's library</li>
          <li>any PDF generated from it, and any table rows filed with it</li>
        </Box>
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
          Nothing in the portal brings it back. The reference keeps one line in the audit trail — that you deleted it,
          and when — and that line is all that will be left.
          {canWithdraw ? ` To keep the record and mark it void instead, close this and use “${withdrawLabel(record, userEmail)}”.` : ""}
        </Typography>
        <TextField
          label={`Type ${record.reference} to confirm`}
          placeholder={record.reference}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          fullWidth
          autoFocus
          autoComplete="off"
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2, fontWeight: 700 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="outlined" onClick={close} disabled={busy}>
          Keep it
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForeverIcon fontSize="small" />}
          onClick={() => void confirm()}
          disabled={busy || !armed}
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
