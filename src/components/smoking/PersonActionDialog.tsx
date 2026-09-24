import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

export type PersonAction = "block" | "unblock" | "remove";

export interface PersonActionTarget {
  fullName: string;
  email: string;
}

interface PersonActionPrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

// eslint-disable-next-line react-refresh/only-export-components -- pure helper the tests import directly, no separate file for one export
export function personActionPrompt(action: PersonAction, person: PersonActionTarget): PersonActionPrompt {
  const name = person.fullName || person.email;
  switch (action) {
    case "block":
      return {
        title: "Block person",
        message: `Block ${name} (${person.email})? They won't be able to scan in or out until unblocked. Their records stay.`,
        confirmLabel: "Yes, block",
      };
    case "unblock":
      return {
        title: "Unblock person",
        message: `Unblock ${name} (${person.email})?`,
        confirmLabel: "Yes, unblock",
      };
    case "remove":
      return {
        title: "Remove person",
        message: `Remove ${name} (${person.email}) from the smoking portal? Their break records stay in the log. If they scan again they will need to register again.`,
        confirmLabel: "Yes, remove",
      };
  }
}

/** One Yes/No dialog for all three admin actions on a registered person. No is the default focus. */
export default function PersonActionDialog({
  open,
  action,
  target,
  busy,
  onNo,
  onYes,
}: {
  open: boolean;
  action: PersonAction | null;
  target: PersonActionTarget | null;
  busy: boolean;
  onNo: () => void;
  onYes: () => void;
}) {
  const prompt = action && target ? personActionPrompt(action, target) : null;
  return (
    <Dialog open={open && !!prompt} onClose={busy ? undefined : onNo} maxWidth="xs" fullWidth>
      <DialogTitle>{prompt?.title ?? ""}</DialogTitle>
      <DialogContent>
        <DialogContentText>{prompt?.message ?? ""}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onNo} disabled={busy}>
          No
        </Button>
        <Button color={action === "unblock" ? "primary" : "error"} variant="contained" onClick={onYes} disabled={busy}>
          {prompt?.confirmLabel ?? ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
