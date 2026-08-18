import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Drawer,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowDropDown as ArrowDropDownIcon,
  BlockOutlined as BlockIcon,
  Close as CloseIcon,
  DeleteForeverOutlined as DeleteForeverIcon,
} from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import ReferenceTag from "../ReferenceTag";
import { usePortal } from "../../contexts/PortalContext";
import { normalizeEmail } from "../../utils/portalPeople";
import {
  regenerateSubmissionPdf,
  returnForInformation,
  signLayer,
} from "../../utils/portalActions";
import { canDeleteRecord, canWithdrawRecord, withdrawLabel } from "../../utils/portalRole";
import { downloadRecordPdf } from "../../utils/portalPdf";
import { recordKey } from "../../utils/portalRecords";
import { SeverityPill, StatusPill } from "./PortalPills";
import WithdrawDialog from "./WithdrawDialog";
import DeleteRecordDialog from "./DeleteRecordDialog";
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
    appendAudit,
    toast,
    surveyJsonByForm,
    audit,
  } = portal;

  const [tab, setTab] = useState<TabId>("overview");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which PDF job is running, so the split control can say which one. */
  const [pdfBusy, setPdfBusy] = useState<"" | "download" | "regenerate">("");
  const [pdfMenu, setPdfMenu] = useState<HTMLElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  const isMine = Boolean(record) && record!.submitterEmail === email;
  // Rebuilding the stored PDF changes no answer and no signature — it reprints
  // what the record already says — so it is open to the people the record is
  // actually about: whoever filed it, whoever is holding it, and administrators.
  const canRegenerate = !readOnly && Boolean(record) && (access.isAdmin || isMyLayer || isMine);
  // Both gates come from the shared rule, so this drawer and the dashboard's
  // waiting table offer the same two actions on the same record.
  const canCancel = Boolean(record) && canWithdrawRecord(record!, access, userEmail);
  const canDelete = Boolean(record) && canDeleteRecord(access);

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

  const formSurveyJson = record ? surveyJsonByForm[record.listTitle] ?? record.submission.surveyJson ?? null : null;

  const handlePdf = async () => {
    if (!record || pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadRecordPdf(record, formSurveyJson, spClient);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate the PDF.");
    } finally {
      setPdfBusy("");
    }
  };

  const handleRegeneratePdf = async () => {
    if (!record || pdfBusy) return;
    setPdfBusy("regenerate");
    try {
      const result = await regenerateSubmissionPdf(actor, record, formSurveyJson);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not rebuild the PDF.");
    } finally {
      setPdfBusy("");
    }
  };

  const cancelLabel = record ? withdrawLabel(record, userEmail) : "Withdraw";
  const hasActions = canSign || canCancel || canDelete;

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

                {/* One control, two jobs: the press downloads what the record
                    says now, the arrow offers to rebuild the copy SharePoint is
                    storing. Keeping the rebuild behind the arrow is deliberate —
                    it deletes a file, and that is not what a stray click on
                    "Download" should do. */}
                <ButtonGroup variant={hasActions ? "text" : "outlined"} sx={{ alignItems: "stretch" }}>
                  <Button onClick={() => void handlePdf()} disabled={Boolean(pdfBusy)} sx={{ minHeight: 40 }}>
                    {pdfBusy === "download" ? "Preparing…" : "Download PDF"}
                  </Button>
                  {canRegenerate && (
                    <Button
                      aria-label="Other PDF actions"
                      aria-haspopup="menu"
                      aria-expanded={Boolean(pdfMenu)}
                      onClick={(event) => setPdfMenu(event.currentTarget)}
                      disabled={Boolean(pdfBusy)}
                      sx={{ minHeight: 40, minWidth: 34, px: 0.25 }}
                    >
                      <ArrowDropDownIcon fontSize="small" />
                    </Button>
                  )}
                </ButtonGroup>
                {pdfBusy === "regenerate" && (
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>Rebuilding the stored PDF…</Typography>
                )}

                {(canCancel || canDelete) && (
                  <Stack direction="row" spacing={1} sx={{ ml: "auto", alignItems: "center" }}>
                    {canCancel && (
                      <Button
                        variant="outlined"
                        onClick={() => setCancelOpen(true)}
                        disabled={busy}
                        startIcon={<BlockIcon fontSize="small" />}
                        sx={{ minHeight: 40, color: editorial.ink, borderColor: editorial.border }}
                      >
                        {cancelLabel}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        onClick={() => setDeleteOpen(true)}
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

      <Menu
        anchorEl={pdfMenu}
        open={Boolean(pdfMenu)}
        onClose={() => setPdfMenu(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 320 } } }}
      >
        <MenuItem
          onClick={() => {
            setPdfMenu(null);
            void handleRegeneratePdf();
          }}
        >
          <ListItemText
            primary="Re-generate PDF"
            secondary="Rebuilds it from the record as it stands and replaces the stored copy"
            slotProps={{
              primary: { sx: { fontSize: 13.5, fontWeight: 700 } },
              secondary: { sx: { fontSize: 11.5, whiteSpace: "normal" } },
            }}
          />
        </MenuItem>
      </Menu>

      <WithdrawDialog
        record={cancelOpen ? record : null}
        onClose={() => setCancelOpen(false)}
        onDone={closeDrawer}
      />

      <DeleteRecordDialog
        record={deleteOpen ? record : null}
        onClose={() => setDeleteOpen(false)}
        onDone={closeDrawer}
      />
    </>
  );
}
