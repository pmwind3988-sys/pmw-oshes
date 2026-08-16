/**
 * DirectoryImportDialog.tsx — bring the directory in from a spreadsheet.
 *
 * Two-step by design: the file is read and shown as a plan first, and nothing
 * is written until the admin has seen exactly how many people would be added,
 * how many changed, and which lines the tool could not read. An import that
 * applied itself immediately would be the most destructive button on the page.
 */
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import { editorial } from "../../theme/editorial";
import { downloadCsv } from "../../utils/csv";
import {
  directoryCsvTemplate,
  planDirectoryImport,
  type DirectoryImportAction,
  type DirectoryImportPlan,
} from "../../utils/approvalDirectoryCsv";
import type { ApprovalDirectoryRow } from "../../utils/approvalDirectorySchema";

export interface DirectoryImportProgress {
  done: number;
  total: number;
  failures: string[];
}

interface DirectoryImportDialogProps {
  open: boolean;
  rows: ApprovalDirectoryRow[];
  applying: boolean;
  progress: DirectoryImportProgress | null;
  onClose: () => void;
  onApply: (plan: DirectoryImportPlan) => void;
}

const ACTION_STYLE: Record<DirectoryImportAction, { label: string; color: string; background: string }> = {
  create: { label: "Add", color: editorial.success, background: "#EAF6EA" },
  update: { label: "Change", color: editorial.pmwBlueDark, background: editorial.blueWash },
  unchanged: { label: "No change", color: editorial.softMuted, background: editorial.paper },
  error: { label: "Skipped", color: editorial.error, background: "#FBE9E9" },
};

export default function DirectoryImportDialog({
  open,
  rows,
  applying,
  progress,
  onClose,
  onApply,
}: DirectoryImportDialogProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const plan = useMemo(() => (text ? planDirectoryImport(text, rows) : null), [text, rows]);
  const willWrite = plan ? plan.counts.create + plan.counts.update : 0;

  const reset = () => {
    setText("");
    setFileName("");
    setReadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError("");
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setReadError("That file could not be read. Save it as CSV from Excel and try again.");
    }
  };

  const handleClose = () => {
    if (applying) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, color: editorial.ink }}>Import people from a spreadsheet</DialogTitle>
      <DialogContent dividers>
        <Stack sx={{ gap: 2 }}>
          <Typography sx={{ fontSize: "0.85rem", color: editorial.muted }}>
            Save your spreadsheet as CSV and pick it below. It needs a column for the person's email and a
            column for who approves them; anything else is optional. Columns your file does not have are left
            exactly as they are, so a two-column file will not blank anybody's department.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1.5 }}>
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={applying}
              sx={{ textTransform: "none", fontWeight: 700 }}
            >
              {fileName || "Choose a CSV file"}
            </Button>
            <Button
              startIcon={<DownloadIcon />}
              onClick={() => downloadCsv(directoryCsvTemplate(), "approval-directory-template.csv")}
              sx={{ textTransform: "none" }}
            >
              Download a template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </Stack>

          {readError && <Alert severity="error">{readError}</Alert>}

          {plan?.fileProblems.map((problem) => (
            <Alert severity="error" key={problem}>{problem}</Alert>
          ))}

          {plan && plan.rows.length > 0 && (
            <>
              <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                {(Object.keys(ACTION_STYLE) as DirectoryImportAction[]).map((action) => (
                  <Chip
                    key={action}
                    size="small"
                    label={`${plan.counts[action]} ${ACTION_STYLE[action].label.toLowerCase()}`}
                    sx={{
                      fontWeight: 700,
                      color: ACTION_STYLE[action].color,
                      backgroundColor: ACTION_STYLE[action].background,
                    }}
                  />
                ))}
              </Stack>

              {plan.counts.error > 0 && (
                <Alert severity="warning">
                  {plan.counts.error} line{plan.counts.error === 1 ? "" : "s"} cannot be imported and will be
                  skipped. Everything else still goes in — fix those lines and import the file again.
                </Alert>
              )}

              <Box sx={{ maxHeight: 320, overflow: "auto", border: `1px solid ${editorial.border}`, borderRadius: "10px" }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>Line</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Person</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Approved by</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>What happens</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plan.rows.map((row) => (
                      <TableRow key={row.line}>
                        <TableCell sx={{ color: editorial.softMuted }}>{row.line}</TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                            {row.input.personName || row.input.personEmail || "(blank)"}
                          </Typography>
                          {row.input.personName && (
                            <Typography sx={{ fontSize: "0.7rem", color: editorial.softMuted }}>
                              {row.input.personEmail}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8rem" }}>
                          {row.input.approverEmail || <em style={{ color: editorial.softMuted }}>nobody</em>}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={ACTION_STYLE[row.action].label}
                            sx={{
                              fontWeight: 700,
                              color: ACTION_STYLE[row.action].color,
                              backgroundColor: ACTION_STYLE[row.action].background,
                            }}
                          />
                          <Typography sx={{ fontSize: "0.7rem", color: row.action === "error" ? editorial.error : editorial.softMuted, mt: 0.25 }}>
                            {row.problems.join(" ") || row.changedFields.join(", ")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}

          {progress && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={progress.total === 0 ? 100 : (progress.done / progress.total) * 100}
                sx={{ borderRadius: 1, height: 6 }}
              />
              <Typography sx={{ fontSize: "0.75rem", color: editorial.muted, mt: 0.75 }}>
                Saved {progress.done} of {progress.total}.
              </Typography>
              {progress.failures.length > 0 && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                    {progress.failures.map((failure) => <li key={failure}>{failure}</li>)}
                  </Stack>
                </Alert>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={applying} sx={{ textTransform: "none" }}>
          {progress && !applying ? "Close" : "Cancel"}
        </Button>
        <Button
          variant="contained"
          disabled={applying || willWrite === 0}
          onClick={() => plan && onApply(plan)}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {applying
            ? "Importing..."
            : willWrite === 0
              ? "Nothing to import"
              : `Import ${willWrite} row${willWrite === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
