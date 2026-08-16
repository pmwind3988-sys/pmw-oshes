/**
 * DirectoryPersonDialog.tsx — add or edit one person in the Approval Directory.
 *
 * Deliberately shows the resulting reporting line while it is being typed. The
 * consequence of "who approves this person" is invisible in a form field and
 * obvious in a chain, and seeing it before saving is what stops a wrong
 * approver being discovered one stuck submission at a time.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { editorial } from "../../theme/editorial";
import { traceApprovalChain } from "../../utils/approvalDirectoryHealth";
import {
  EMPTY_APPROVAL_DIRECTORY_INPUT,
  validateApprovalDirectoryInput,
  type ApprovalDirectoryInput,
} from "../../utils/approvalDirectory";
import {
  directoryEmailKey,
  type ApprovalDirectoryRow,
  type DirectoryColumnMap,
} from "../../utils/approvalDirectorySchema";
import ChainTraceView from "./ChainTraceView";

interface DirectoryPersonDialogProps {
  open: boolean;
  /** The row being edited, or null when adding somebody new. */
  editing: ApprovalDirectoryRow | null;
  rows: ApprovalDirectoryRow[];
  /**
   * Which fields the list can actually hold. A field with no column is hidden
   * rather than shown and silently dropped on save. Null before the first read,
   * which shows everything.
   */
  columns: DirectoryColumnMap | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: ApprovalDirectoryInput, id?: number) => void;
}

const HELP: Record<string, string> = {
  personEmail: "Their work email. This is what a submission is matched on, so it has to be exact.",
  approverEmail: "Who signs off this person's forms. Leave empty if nobody is above them.",
  department: "Used when a form routes to a whole department's head rather than to this person's own approver.",
  position: "Their job title. A form set to 'Head of department' looks for the title you type here, such as HOD.",
  employeeId: "Their ID in whichever system HR keys off. Free text; nothing routes on it.",
};

export default function DirectoryPersonDialog({
  open,
  editing,
  rows,
  columns,
  saving,
  onClose,
  onSave,
}: DirectoryPersonDialogProps) {
  const [input, setInput] = useState<ApprovalDirectoryInput>(EMPTY_APPROVAL_DIRECTORY_INPUT);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setInput(editing
      ? {
        personEmail: editing.personEmail,
        personName: editing.personName,
        department: editing.department,
        position: editing.position,
        employeeId: editing.employeeId,
        approverEmail: editing.approverEmail,
        isActive: editing.isActive,
      }
      : EMPTY_APPROVAL_DIRECTORY_INPUT);
  }, [open, editing]);

  const problems = useMemo(
    () => validateApprovalDirectoryInput(input, rows, editing?.id),
    [input, rows, editing],
  );

  /** Every address already known, so an approver can be picked not typed. */
  const knownPeople = useMemo(
    () => rows
      .filter((row) => row.personEmail && directoryEmailKey(row.personEmail) !== directoryEmailKey(input.personEmail))
      .map((row) => row.personEmail),
    [rows, input.personEmail],
  );

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort(),
    [rows],
  );

  /**
   * The line as it would be after saving — the edited row substituted in, so
   * the preview reflects what is on screen rather than what is stored.
   */
  const preview = useMemo(() => {
    if (!input.personEmail.trim()) return null;
    const pending: ApprovalDirectoryRow = { ...input, id: editing?.id };
    const merged = [
      pending,
      ...rows.filter((row) => directoryEmailKey(row.personEmail) !== directoryEmailKey(input.personEmail)),
    ];
    return traceApprovalChain(merged, input.personEmail);
  }, [input, rows, editing]);

  /** Whether the list has somewhere to put this field at all. */
  const has = (key: keyof DirectoryColumnMap): boolean => !columns || !!columns[key];

  const field = (
    label: string,
    key: keyof ApprovalDirectoryInput,
    options?: { required?: boolean },
  ) => (
    <TextField
      label={label}
      required={options?.required}
      value={String(input[key])}
      onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
      helperText={HELP[key]}
      size="small"
      fullWidth
    />
  );

  const handleSave = () => {
    setTouched(true);
    if (problems.length > 0) return;
    onSave(input, editing?.id);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: editorial.ink }}>
        {editing ? "Edit person" : "Add a person"}
      </DialogTitle>
      <DialogContent dividers>
        <Stack sx={{ gap: 2, pt: 0.5 }}>
          <TextField
            label="Person's email"
            required
            value={input.personEmail}
            onChange={(event) => setInput((prev) => ({ ...prev, personEmail: event.target.value }))}
            helperText={HELP.personEmail}
            size="small"
            fullWidth
            // Changing the key of an existing row would orphan anybody pointing
            // at it, so it is fixed once saved.
            disabled={!!editing}
          />
          {has("personName") && field("Full name", "personName")}

          {(has("department") || has("position")) && (
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 2 }}>
              {has("department") && (
                <Autocomplete
                  freeSolo
                  options={departments}
                  value={input.department}
                  onInputChange={(_, value) => setInput((prev) => ({ ...prev, department: value }))}
                  fullWidth
                  renderInput={(params) => (
                    <TextField {...params} label="Department" size="small" helperText={HELP.department} />
                  )}
                />
              )}
              {has("position") && field("Position", "position")}
            </Stack>
          )}

          {has("employeeId") && field("Employee ID", "employeeId")}

          <Autocomplete
            freeSolo
            options={knownPeople}
            value={input.approverEmail}
            onInputChange={(_, value) => setInput((prev) => ({ ...prev, approverEmail: value }))}
            fullWidth
            renderInput={(params) => (
              <TextField {...params} label="Approved by" size="small" helperText={HELP.approverEmail} />
            )}
          />

          {has("isActive") && (
            <FormControlLabel
              control={(
                <Switch
                  checked={input.isActive}
                  onChange={(event) => setInput((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
              )}
              label={(
                <Typography sx={{ fontSize: "0.85rem" }}>
                  {input.isActive
                    ? "Active — submissions can route to and from this person"
                    : "Switched off — kept for history, but nothing new routes here"}
                </Typography>
              )}
            />
          )}

          {preview && (
            <Box sx={{ p: 1.5, borderRadius: "12px", border: `1px solid ${editorial.border}`, backgroundColor: editorial.paperSoft }}>
              <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: editorial.softMuted, mb: 1 }}>
                Where their forms would go
              </Typography>
              <ChainTraceView trace={preview} />
            </Box>
          )}

          {touched && problems.length > 0 && (
            <Alert severity="error">
              <Stack component="ul" sx={{ m: 0, pl: 2, gap: 0.5 }}>
                {problems.map((problem) => <li key={problem}>{problem}</li>)}
              </Stack>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Saving..." : editing ? "Save changes" : "Add person"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
