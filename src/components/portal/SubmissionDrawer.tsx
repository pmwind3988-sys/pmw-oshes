import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, DeleteForeverOutlined as DeleteForeverIcon } from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import ReferenceTag from "../ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { normalizeEmail } from "../../utils/portalPeople";
import {
  cancelSubmission,
  deleteSubmission,
  nudgeApprover,
  returnForInformation,
  signLayer,
} from "../../utils/portalActions";
import { downloadRecordPdf } from "../../utils/portalPdf";
import ReassignDialog from "./ReassignDialog";
import { recordKey } from "../../utils/portalRecords";
import { SeverityPill, StatusPill } from "./PortalPills";
import { AnswersTab, ApprovalsTab, OverviewTab, TimelineTab } from "./RecordDetail";

type TabId = "overview" | "answers" | "approvals" | "timeline";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "answers", label: "Answers" },
  { id: "approvals", label: "Approvals" },
  { id: "timeline", label: "Status timeline" },
];

/**
 * A small key figure in the header — the SLA state, or the wait.
 *
 * Rendered only when there is something true to put in it. The reference design
 * this follows carries a "Resolution SLA — Breached" card in the top right,
 * which is exactly right for a form that has an SLA and exactly wrong for one
 * that does not: an invented deadline reported as breached is worse than no
 * deadline reported at all.
 */
function HeaderStat({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "alert" | "positive" }) {
  const colour = tone === "alert" ? editorial.error : tone === "positive" ? editorial.success : editorial.ink;
  return (
    <Box
      sx={{
        px: 1.5,
        py: 0.9,
        borderRadius: "12px",
        border: `1px solid ${tone === "alert" ? editorial.error : editorial.border}`,
        backgroundColor: tone === "alert" ? "rgba(198, 40, 40, 0.06)" : editorial.paper,
        flex: "none",
      }}
    >
      <Typography sx={{ fontSize: 10.5, color: editorial.muted, fontWeight: 700, lineHeight: 1.3 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: colour, lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Submission detail.
 *
 * Restructured from one long scroll into a record page with tabs: the facts
 * first, then the answers, the route, and the trail. The old drawer put six
 * fields and the whole approval chain in a single column and left the form's
 * actual answers out entirely — so the one thing a reviewer needed in order to
 * sign was the one thing the reviewing screen did not show.
 *
 * Actions stay gated twice over: by role, and by whether the current approval
 * layer belongs to you. You cannot chase yourself, and an audit account never
 * renders an action at all.
 */
export default function SubmissionDrawer() {
  const portal = usePortal();
  const {
    records,
    drawerRef,
    closeDrawer,
    access,
    userEmail,
    userName,
    spClient,
    applyPatch,
    removeRecord,
    appendAudit,
    toast,
    nudged,
    markNudged,
    surveyJsonByForm,
    audit,
  } = portal;

  const [tab, setTab] = useState<TabId>("overview");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const record = records.find((item) => recordKey(item) === drawerRef) ?? null;
  const open = Boolean(record);

  // Opening a different record starts at the top of it. Landing on "Answers"
  // because that is where you left the previous one is disorienting.
  useEffect(() => {
    if (drawerRef) setTab("overview");
  }, [drawerRef]);

  const email = normalizeEmail(userEmail);
  const readOnly = access.readOnly;
  const isMyLayer = Boolean(
    record && record.hasWorkflow && !record.done && !record.returned && record.currentAssigneeEmail === email,
  );
  const canSign = !readOnly && isMyLayer;
  // Nothing to chase on a form with no chain — there is no next approver.
  const canChaseThis =
    !readOnly && Boolean(record) && access.canChase && record!.hasWorkflow && !record!.done && !record!.returned && !isMyLayer;
  // Withdrawing your own filing is a property of having filed it, not of the
  // role label — an approver who reports a hazard may withdraw it too.
  const canCancel =
    !readOnly &&
    Boolean(record) &&
    !record!.done &&
    (access.isAdmin || (record!.submitterEmail === email && record!.at === 0));
  // Deletion is administrators only, and stays available on a settled record —
  // a wrongly filed report is usually noticed after it has been signed, and
  // "cancel it instead" is not an answer when the objection is that the photos
  // and signatures should not exist at all.
  const canDelete = !readOnly && access.isAdmin && Boolean(record);

  const trail = useMemo(
    () => (record ? audit.filter((entry) => entry.reference === record.reference) : []),
    [audit, record],
  );

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

  const closeDeleteDialog = () => {
    if (busy) return;
    setDeleteOpen(false);
    setDeleteConfirm("");
    setDeleteError("");
  };

  const handleDelete = async () => {
    if (!record) return;
    setBusy(true);
    setDeleteError("");
    try {
      const result = await deleteSubmission(actor, record);
      appendAudit(result.audit);
      // Order matters: the trail entry is appended before the record leaves,
      // so the drawer closing does not race the only remaining evidence.
      removeRecord(record);
      toast(result.toast);
      setDeleteOpen(false);
      setDeleteConfirm("");
      closeDrawer();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this submission.");
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

  const cancelLabel = record && record.submitterEmail === email ? "Withdraw" : "Cancel submission";
  const hasActions = canSign || canChaseThis || canCancel || canDelete;
  // Typing the reference is the gate. A record with signatures and photos
  // against it is worth more than one misplaced click, and this is the only
  // action in the portal with nothing left to undo it from.
  const deleteArmed = Boolean(record) && deleteConfirm.trim().toLowerCase() === record!.reference.toLowerCase();

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
              // Wider than the old drawer because the content is now two columns
              // on anything but a phone, where it takes the full width instead.
              width: { xs: "100vw", sm: "min(760px, 94vw)" },
              display: "flex",
              flexDirection: "column",
              backgroundColor: editorial.appSurface,
              "@media (prefers-reduced-motion: reduce)": { transition: "none !important" },
            },
          },
        }}
      >
        {record && (
          <>
            <Box
              sx={{
                flex: "none",
                px: { xs: 2, sm: 3 },
                pt: { xs: 2, sm: 2.5 },
                backgroundColor: editorial.panel,
                borderBottom: editorialHairline,
              }}
            >
              <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                    <ReferenceTag value={record.reference} size="md" />
                    <SeverityPill label={record.severity} tone={record.tone} />
                    <StatusPill status={record.status} />
                  </Stack>
                  <Typography
                    component="h2"
                    sx={{ fontSize: { xs: 21, sm: 26 }, fontWeight: 700, lineHeight: 1.2, mt: 0.75 }}
                  >
                    {record.subject}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.4 }}>
                    {record.formName} · {record.stage}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} sx={{ flex: "none", alignItems: "flex-start" }}>
                  {/* Only a record whose form declared an SLA carries one here. */}
                  {record.hasSla && !record.done && !record.returned && (
                    <HeaderStat
                      label={`${record.slaDays}-day SLA`}
                      value={record.overdue ? "Breached" : "On target"}
                      tone={record.overdue ? "alert" : "positive"}
                    />
                  )}
                  <IconButton onClick={closeDrawer} aria-label="Close" sx={{ mt: -0.5 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>

              <Tabs
                value={tab}
                onChange={(_, next: TabId) => setTab(next)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ mt: 1.5, minHeight: 42, "& .MuiTab-root": { minHeight: 42, fontSize: 13, fontWeight: 700 } }}
              >
                {TABS.map((entry) => (
                  <Tab
                    key={entry.id}
                    value={entry.id}
                    label={
                      entry.id === "timeline" && trail.length > 0 ? `${entry.label} (${trail.length})` : entry.label
                    }
                  />
                ))}
              </Tabs>
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
              <Box
                sx={{
                  backgroundColor: editorial.panel,
                  border: editorialHairline,
                  borderRadius: "14px",
                  p: { xs: 1.75, sm: 2.5 },
                }}
              >
                {tab === "overview" && <OverviewTab record={record} />}
                {tab === "answers" && (
                  <AnswersTab record={record} surveyJson={surveyJsonByForm[record.listTitle] ?? null} />
                )}
                {tab === "approvals" && <ApprovalsTab record={record} youEmail={email} />}
                {tab === "timeline" && <TimelineTab entries={trail} />}
              </Box>

              {canSign && (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    label={
                      record.workflowKind === "evaluation" || record.chain[record.at]?.type === "evaluation"
                        ? "Evaluation note"
                        : "Note for the record"
                    }
                    placeholder="Optional for approval, required if you return it"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    multiline
                    minRows={3}
                    fullWidth
                    sx={{ backgroundColor: editorial.panel }}
                  />
                </Box>
              )}

              {readOnly && (
                <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 2 }}>
                  Audit accounts cannot sign, chase or cancel. Everything above is a record of what others did.
                </Typography>
              )}
            </Box>

            {/* The action bar is pinned: on a long record the button you came to
                press must not be a scroll away from the evidence you read. */}
            <Box
              sx={{
                flex: "none",
                px: { xs: 2, sm: 3 },
                py: 1.5,
                backgroundColor: editorial.panel,
                borderTop: editorialHairline,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
                {canSign && (
                  <>
                    <Button variant="contained" onClick={() => void handleSign()} disabled={busy} sx={{ minHeight: 40 }}>
                      {record.chain[record.at]?.type === "evaluation" ? "Evaluate and release" : "Sign this layer"}
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

                <Button
                  variant={hasActions ? "text" : "outlined"}
                  onClick={() => void handlePdf()}
                  sx={{ minHeight: 40 }}
                >
                  Download PDF
                </Button>

                {(canCancel || canDelete) && (
                  <Stack direction="row" spacing={1} sx={{ ml: "auto", alignItems: "center" }}>
                    {canCancel && (
                      <Button onClick={() => setCancelOpen(true)} disabled={busy} sx={{ minHeight: 40, color: editorial.muted }}>
                        {cancelLabel}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        onClick={() => {
                          setDeleteError("");
                          setDeleteConfirm("");
                          setDeleteOpen(true);
                        }}
                        disabled={busy}
                        startIcon={<DeleteForeverIcon fontSize="small" />}
                        sx={{ minHeight: 40, color: editorial.error }}
                      >
                        Delete
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </Box>
          </>
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

      <Dialog
        open={deleteOpen}
        onClose={closeDeleteDialog}
        fullWidth
        maxWidth="sm"
        transitionDuration={120}
        slotProps={{ paper: { sx: { border: `1px solid rgba(198, 40, 40, 0.28)` } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: editorial.error, pb: 1 }}>
          Delete {record?.reference} and everything with it?
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
            {canCancel ? ` To keep the record and mark it void instead, close this and use “${cancelLabel}”.` : ""}
          </Typography>
          <TextField
            label={`Type ${record?.reference ?? "the reference"} to confirm`}
            placeholder={record?.reference ?? ""}
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            fullWidth
            autoFocus
            autoComplete="off"
          />
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2, fontWeight: 700 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={closeDeleteDialog} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteForeverIcon fontSize="small" />}
            onClick={() => void handleDelete()}
            disabled={busy || !deleteArmed}
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
