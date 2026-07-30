import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { canChase, isReadOnlyRole } from "../../utils/portalRole";
import { normalizeEmail } from "../../utils/portalPeople";
import { cancelSubmission, nudgeApprover, returnForInformation, signLayer } from "../../utils/portalActions";
import { downloadRecordPdf } from "../../utils/portalPdf";
import type { PortalRecord } from "../../types";
import ReassignDialog from "./ReassignDialog";

function FieldGrid({ record }: { record: PortalRecord }) {
  const fields = [
    { label: "Filed", value: record.filedLabel },
    { label: "Source", value: record.source },
    { label: "Location", value: record.location || "Not given" },
    { label: "Reported by", value: record.submitter },
    { label: "Severity", value: record.severity || "Not captured on this form" },
    { label: "Photos", value: record.photos === 0 ? "None" : `${record.photos} attached` },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 1.75,
        py: 2,
        my: 2,
        borderTop: editorialHairline,
        borderBottom: editorialHairline,
      }}
    >
      {fields.map((field) => (
        <Box key={field.label}>
          <Typography sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: editorial.muted, fontWeight: 800 }}>
            {field.label}
          </Typography>
          <Typography sx={{ fontSize: 13.5 }}>{field.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function ApprovalChain({ record }: { record: PortalRecord }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 1.5 }}>Approval chain</Typography>
      <Stack>
        {record.chain.map((step, index) => {
          const last = index === record.chain.length - 1;
          const filled = step.state === "signed";
          const ringed = step.state !== "pending";
          return (
            <Stack key={`${step.layerNumber}-${step.roleLabel}`} direction="row" spacing={1.5} sx={{ alignItems: "stretch" }}>
              <Stack sx={{ alignItems: "center", flex: "none", width: 12 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    mt: 0.5,
                    flex: "none",
                    border: `1px solid ${ringed ? editorial.pmwBlue : editorial.border}`,
                    backgroundColor: filled ? editorial.pmwBlue : "transparent",
                  }}
                />
                {!last && <Box sx={{ flex: 1, width: "1px", backgroundColor: editorial.border, my: 0.5 }} />}
              </Stack>
              <Box sx={{ pb: last ? 0 : 2, minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{step.who}</Typography>
                  <Typography sx={{ fontSize: 11, color: editorial.muted }}>{step.roleLabel}</Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: step.state === "current" ? editorial.pmwBlueDark : editorial.muted,
                    }}
                  >
                    {step.statusText}
                  </Typography>
                </Stack>
                <Typography sx={{ fontSize: 11, color: editorial.muted }}>{step.subText}</Typography>
                {step.note && (
                  <Typography
                    sx={{
                      fontSize: 12,
                      mt: 0.75,
                      pl: 1.25,
                      borderLeft: `2px solid ${editorial.border}`,
                      color: editorial.ink,
                    }}
                  >
                    {step.note}
                  </Typography>
                )}
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Submission detail drawer.
 *
 * Actions are gated twice over: by role, and by whether the current approval
 * layer belongs to you. You cannot chase yourself, and an audit account never
 * renders an action at all.
 */
export default function SubmissionDrawer() {
  const portal = usePortal();
  const { records, drawerRef, closeDrawer, role, userEmail, userName, spClient, applyPatch, appendAudit, toast, nudged, markNudged, surveyJsonByForm } = portal;

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const record = records.find((item) => item.reference === drawerRef) ?? null;
  const open = Boolean(record);

  const email = normalizeEmail(userEmail);
  const readOnly = isReadOnlyRole(role);
  const isMyLayer = Boolean(record && !record.done && !record.returned && record.currentAssigneeEmail === email);
  const canSign = !readOnly && isMyLayer;
  const canChaseThis = !readOnly && Boolean(record) && canChase(role) && !record!.done && !record!.returned && !isMyLayer;
  const canCancel =
    !readOnly &&
    Boolean(record) &&
    !record!.done &&
    (role === "admin" || (role === "submitter" && record!.submitterEmail === email && record!.at === 0));

  const actor = { spClient, actorName: userName || userEmail, actorEmail: userEmail };

  const handleSign = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const result = await signLayer(actor, record, note.trim());
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      setNote("");
      closeDrawer();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not sign this layer.");
    } finally {
      setBusy(false);
    }
  };

  const handleReturn = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const result = await returnForInformation(actor, record, note);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      setNote("");
      closeDrawer();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not return this submission.");
    } finally {
      setBusy(false);
    }
  };

  const handleNudge = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const result = await nudgeApprover(actor, record);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      markNudged(record.reference);
      toast(result.toast);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the reminder.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const result = await cancelSubmission(actor, record, cancelReason);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
      setCancelOpen(false);
      setCancelReason("");
      closeDrawer();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not cancel this submission.");
    } finally {
      setBusy(false);
    }
  };

  const handlePdf = async () => {
    if (!record) return;
    try {
      await downloadRecordPdf(record, surveyJsonByForm[record.listTitle] ?? record.submission.surveyJson ?? null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate the PDF.");
    }
  };

  const cancelLabel = role === "submitter" ? "Withdraw" : "Cancel submission";

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={closeDrawer}
        transitionDuration={{ enter: 180, exit: 140 }}
        slotProps={{
          backdrop: { sx: { backgroundColor: "rgba(16, 16, 16, 0.42)" } },
          paper: {
            sx: {
              width: "min(580px, 94vw)",
              p: 2.5,
              "@media (prefers-reduced-motion: reduce)": { transition: "none !important" },
            },
          },
        }}
      >
        {record && (
          <Box>
            <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: editorial.muted, fontWeight: 800 }}>
                  {record.reference} · {record.formName}
                </Typography>
                <Typography component="h2" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, mt: 0.5 }}>
                  {record.subject}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    mt: 0.5,
                    color: record.overdue ? editorial.error : editorial.muted,
                    fontWeight: record.overdue ? 800 : 400,
                  }}
                >
                  {record.done || record.returned ? record.status : `${record.stage} · ${record.slaNote}`}
                </Typography>
              </Box>
              <IconButton onClick={closeDrawer} aria-label="Close">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>

            <FieldGrid record={record} />
            <ApprovalChain record={record} />

            {canSign && (
              <Box sx={{ mt: 2.5 }}>
                <TextField
                  label={role === "evaluator" ? "Evaluation note" : "Note for the record"}
                  placeholder="Optional for approval, required if you return it"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                />
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mt: 2.5, alignItems: "center" }}>
              {canSign && (
                <>
                  <Button variant="contained" onClick={() => void handleSign()} disabled={busy} sx={{ minHeight: 40 }}>
                    {role === "evaluator" ? "Evaluate and release" : "Sign this layer"}
                  </Button>
                  <Button variant="outlined" onClick={() => void handleReturn()} disabled={busy} sx={{ minHeight: 40 }}>
                    Return for more information
                  </Button>
                </>
              )}

              {canChaseThis && (
                <>
                  <Button
                    variant="outlined"
                    onClick={() => void handleNudge()}
                    disabled={busy || Boolean(nudged[record.reference])}
                    sx={{ minHeight: 40 }}
                  >
                    {nudged[record.reference] ? "Nudged" : "Nudge approver"}
                  </Button>
                  <Button variant="outlined" onClick={() => setReassignOpen(true)} disabled={busy} sx={{ minHeight: 40 }}>
                    Reassign layer
                  </Button>
                </>
              )}

              <Button variant="outlined" onClick={() => void handlePdf()} sx={{ minHeight: 40 }}>
                Download PDF
              </Button>

              {canCancel && (
                <Button
                  onClick={() => setCancelOpen(true)}
                  disabled={busy}
                  sx={{ minHeight: 40, ml: "auto", color: editorial.muted }}
                >
                  {cancelLabel}
                </Button>
              )}
            </Stack>

            {readOnly && (
              <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 2, pt: 2, borderTop: editorialHairline }}>
                Audit accounts cannot sign, chase or cancel. Everything above is a record of what others did.
              </Typography>
            )}
          </Box>
        )}
      </Drawer>

      {reassignOpen && record && <ReassignDialog record={record} onClose={() => setReassignOpen(false)} />}

      <Dialog open={cancelOpen} onClose={busy ? undefined : () => setCancelOpen(false)} fullWidth maxWidth="sm" transitionDuration={120}>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {cancelLabel} {record?.reference}?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: editorial.muted, mb: 2 }}>
            The record stays and keeps its reference — it is marked cancelled with your name against it. Anyone already
            in the chain is told. This cannot be undone from here.
          </Typography>
          <TextField
            label="Reason, for the record"
            placeholder="Duplicate of an earlier report"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setCancelOpen(false)} disabled={busy}>
            Keep it open
          </Button>
          <Button variant="contained" onClick={() => void handleCancel()} disabled={busy}>
            Mark cancelled
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export { FieldGrid, ApprovalChain };
