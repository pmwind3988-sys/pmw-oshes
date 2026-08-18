import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { cancelSubmission } from "../../utils/portalActions";
import { withdrawLabel } from "../../utils/portalRole";
import type { PortalRecord } from "../../types";

/**
 * Withdraw (your own filing) or cancel (anyone else's). The record keeps its
 * reference and stays readable — it is marked, not removed — and the layer it
 * was sitting on is closed so nobody is chased for a signature that is no
 * longer wanted.
 *
 * Shared by the record drawer and the dashboard's waiting table: the copy here
 * is the promise the action makes, and two screens making different promises
 * about the same write is how a reader learns not to trust either.
 */
export default function WithdrawDialog({
  record,
  onClose,
  onDone,
}: {
  record: PortalRecord | null;
  onClose: () => void;
  /** Fired after the write lands — the drawer uses it to close itself. */
  onDone?: () => void;
}) {
  const { spClient, userName, userEmail, applyPatch, appendAudit, toast } = usePortal();
  const [reason, setReason] = useState("");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A new target starts on an empty reason: the note belongs to the record it
  // was typed for, and carrying it across would file it against the wrong one.
  // Derived during render rather than in an effect — closing the dialog renders
  // null but does not unmount it, so there is no unmount to reset the field.
  if (reasonFor !== (record?.reference ?? null)) {
    setReasonFor(record?.reference ?? null);
    setReason("");
  }

  if (!record) return null;

  const label = withdrawLabel(record, userEmail);

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await cancelSubmission(
        { spClient, actorName: userName || userEmail, actorEmail: userEmail },
        record,
        reason,
      );
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      onClose();
      onDone?.();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not withdraw this submission.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" transitionDuration={120}>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {label} {record.reference}?
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
          The record stays and keeps its reference — it is marked cancelled with your name against it, and it stays
          readable to everyone who can see it now.
          {record.hasWorkflow && !record.done
            ? ` The layer it is sitting on is closed, and ${record.currentAssignee || "the approver"} stops being asked to sign it — including the automatic reminders.`
            : ""}
          {" "}This cannot be undone from here.
        </Typography>
        <TextField
          label="Reason, for the record"
          placeholder="Duplicate of an earlier report"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          fullWidth
          autoFocus
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={busy}>
          Keep it open
        </Button>
        <Button variant="contained" onClick={() => void confirm()} disabled={busy}>
          {busy ? "Withdrawing…" : `Mark ${label === "Withdraw" ? "withdrawn" : "cancelled"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
