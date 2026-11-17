import { useState } from "react";
import { Alert, Dialog, TextField, Typography } from "@mui/material";
import { usePortal } from "../../contexts/PortalContext";
import { deleteSubmission } from "../../utils/portalActions";
import { canConfirmDelete } from "../../utils/portalRole";
import { MessageCard } from "../simple/MessageCard";
import type { PortalRecord } from "../../types";

/**
 * Delete a record and everything filed with it, behind a typed reference.
 *
 * This is the only action in the portal with nothing left to undo it from. The
 * copy says what goes and that it cannot come back. Shared by the record page
 * and the dashboard so the same irreversible write is never offered two ways.
 */
export default function DeleteRecordDialog({
  record,
  onClose,
  onDone,
}: {
  record: PortalRecord | null;
  onClose: () => void;
  /** Fired after the record is gone — the page uses it to leave itself. */
  onDone?: () => void;
}) {
  const { spClient, userName, userEmail, appendAudit, removeRecord, toast } = usePortal();
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

  const armed = canConfirmDelete(confirmText, record.reference);

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
    <Dialog open onClose={close} fullWidth maxWidth="sm" transitionDuration={120}>
      <MessageCard
        fullPage={false}
        mood="delete"
        title={`Delete ${record.reference}?`}
        body={
          <>
            <Typography component="span" sx={{ display: "block", mb: 2, color: "text.secondary" }}>
              This removes the form, its signatures and photos for everyone. It cannot be undone.
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
              <Alert severity="error" sx={{ mt: 2, fontWeight: 700, textAlign: "left" }}>
                {error}
              </Alert>
            )}
          </>
        }
        primary={{
          label: busy ? "Deleting…" : "Delete for everyone",
          tone: "danger",
          disabled: busy || !armed,
          onClick: () => void confirm(),
        }}
        secondary={{ label: "Keep it", onClick: close }}
      />
    </Dialog>
  );
}
