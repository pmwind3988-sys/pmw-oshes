import { useState } from "react";
import { Alert, Dialog, Typography } from "@mui/material";
import { usePortal } from "../../contexts/PortalContext";
import { deleteSubmission } from "../../utils/portalActions";
import { MessageCard } from "../simple/MessageCard";
import type { PortalRecord } from "../../types";

/**
 * Delete a record and everything filed with it, after a plain yes / no.
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
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Any failure belongs to one record. Reset during render rather than in an
  // effect: closing renders null without unmounting, so an old error would
  // otherwise show in the next record's dialog.
  if (confirmFor !== (record?.reference ?? null)) {
    setConfirmFor(record?.reference ?? null);
    setError("");
  }

  if (!record) return null;

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
            <Typography component="span" sx={{ display: "block", color: "text.secondary" }}>
              This removes the form, its signatures and photos for everyone. It cannot be undone.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2, fontWeight: 700, textAlign: "left" }}>
                {error}
              </Alert>
            )}
          </>
        }
        primary={{
          label: busy ? "Deleting…" : "Yes, delete",
          tone: "danger",
          disabled: busy,
          onClick: () => void confirm(),
        }}
        secondary={{ label: "No, keep it", onClick: close }}
      />
    </Dialog>
  );
}
