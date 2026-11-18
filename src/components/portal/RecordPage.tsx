import { useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  Ban as BlockIcon,
  Check as CheckIcon,
  ChevronDown,
  FileText,
  ImageIcon,
  Trash2 as DeleteForeverIcon,
  UserCog,
} from "../ui/Icons";
import { usePortal } from "../../contexts/PortalContext";
import { initialsOf, normalizeEmail } from "../../utils/portalPeople";
import { regenerateSubmissionPdf, returnForInformation, signLayer } from "../../utils/portalActions";
import { canDeleteRecord, canWithdrawRecord, withdrawLabel } from "../../utils/portalRole";
import { statusTone, toneColors } from "../../utils/portalWork";
import {
  attachmentDownloadMessage,
  downloadRecordPdf,
  downloadRecordPdfWithAttachments,
  recordAttachments,
} from "../../utils/portalPdf";
import { absoluteAttachmentUrl } from "../../utils/fileAttachments";
import { displayLabel, formDisplayName, isMeaningfulSubject, stepCaption } from "../../utils/recordDisplay";
import { recordKey } from "../../utils/portalRecords";
import { formatDisplayDayMonthTime } from "../../utils/displayDateTime";
import { DEFAULT_PDF_STYLE, PDF_STYLE_LABELS, type PdfStyle } from "../../utils/pdfStyle";
import { radius } from "../../theme/surfaces";
import { SUN, TINTS } from "../../theme/simple";
import { MessageCard } from "../simple/MessageCard";
import { StatusPill } from "./PortalPills";
import WithdrawDialog from "./WithdrawDialog";
import DeleteRecordDialog from "./DeleteRecordDialog";
import ReassignDialog from "./ReassignDialog";
import { AnswerTable, TimelineTab, answerValueText, recordAnswerSections } from "./RecordDetail";
import type { PortalRecord } from "../../types";

/** Pictures get a picture icon in the files list; anything else gets the file icon. */
const PICTURE_FILE = /\.(png|jpe?g|gif|webp|heic|bmp)$/i;

/** An answer longer than this, or with a line break in it, takes the whole row of its card. */
const WIDE_ANSWER_CHARS = 80;

const CARD_SX = {
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: radius.lg,
  minWidth: 0,
} as const;

const CARD_HEADING_SX = {
  m: 0,
  px: 2.25,
  py: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  fontSize: 15,
  fontWeight: 800,
} as const;

const DT_SX = { fontWeight: 700, color: "text.secondary" } as const;

/** Every header button: 40px, the xs radius, plain words rather than a pill. */
const HEADER_BUTTON_SX = {
  minHeight: 40,
  height: 40,
  px: 2,
  borderRadius: radius.xs,
  textTransform: "none",
  fontSize: 14,
  fontWeight: 800,
} as const;

const NEUTRAL_BUTTON_SX = { ...HEADER_BUTTON_SX, color: "text.primary", borderColor: "divider" } as const;

/**
 * One submission, as a page.
 *
 * Reached from a list or a link. The record is looked up in the set the portal
 * already holds, so one that was deleted, or is not visible to this account,
 * says so rather than showing a stale copy.
 */
export default function RecordPage() {
  const { records, drawerRef, setScreen } = usePortal();
  const record = records.find((item) => recordKey(item) === drawerRef) ?? null;

  if (!record) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <MessageCard
          fullPage={false}
          mood="notfound"
          title="We cannot find that"
          body="It may have been deleted, or you may not have access."
          primary={{ label: "Back to submissions", onClick: () => setScreen("subs") }}
        />
      </Box>
    );
  }

  return <RecordView record={record} />;
}

/**
 * The record's page: the layout here, and the actions this account may take.
 *
 * What this account may do is decided by the same gates as before (PortalAccess,
 * canWithdrawRecord, canDeleteRecord), and the writes are unchanged. Only where
 * they are drawn has moved.
 */
function RecordView({ record }: { record: PortalRecord }) {
  const {
    access,
    userEmail,
    userName,
    spClient,
    applyPatch,
    appendAudit,
    toast,
    closeDrawer,
    setScreen,
    surveyJsonByForm,
    audit,
  } = usePortal();

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which PDF job is running, so the split control can say which one. */
  const [pdfBusy, setPdfBusy] = useState<"" | "download" | "attachments" | "regenerate">("");
  const [pdfMenu, setPdfMenu] = useState<HTMLElement | null>(null);
  const [moreMenu, setMoreMenu] = useState<HTMLElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [activity, setActivity] = useState<"all" | "notes" | "history">("all");
  /** Answer sections the reader has folded away. Every section starts open. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** Every PDF is drawn in the classic layout unless an administrator picks the new one here. */
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>(DEFAULT_PDF_STYLE);

  const email = normalizeEmail(userEmail);
  const readOnly = access.readOnly;
  const isMyLayer = Boolean(record.hasWorkflow && !record.done && !record.returned && record.currentAssigneeEmail === email);
  const canSign = !readOnly && isMyLayer;
  const isMine = record.submitterEmail === email;
  // Rebuilding the stored PDF changes no answer and no signature. It reprints
  // what the record already says, so it is open to the people the record is
  // actually about: whoever filed it, whoever is holding it, and administrators.
  const canRegenerate = !readOnly && (access.isAdmin || isMyLayer || isMine);
  // Both gates come from the shared rule, so this page and the dashboard's
  // waiting table offer the same two actions on the same record.
  const canCancel = canWithdrawRecord(record, access, userEmail);
  const canDelete = canDeleteRecord(access);
  // Only a record with a live approval layer has someone to move: reassigning a
  // record with no approval step, or one that was returned, would write a layer
  // that is not the current one.
  const canReassign = access.canChase && record.hasWorkflow && !record.done && !record.returned;
  const hasMoreActions = canReassign || canCancel || canDelete;
  const cancelLabel = withdrawLabel(record, userEmail);
  const isEvaluation = record.chain[record.at]?.type === "evaluation";

  const trail = useMemo(() => audit.filter((entry) => entry.reference === record.reference), [audit, record.reference]);

  const formSurveyJson = surveyJsonByForm[record.listTitle] ?? record.submission.surveyJson ?? null;
  const sections = useMemo(
    () => recordAnswerSections(record, surveyJsonByForm[record.listTitle] ?? null),
    [record, surveyJsonByForm],
  );
  const attachments = useMemo(() => recordAttachments(record, formSurveyJson), [record, formSurveyJson]);
  const notes = useMemo(() => record.chain.filter((step) => step.note.trim() !== ""), [record.chain]);

  const actor = { spClient, actorName: userName || userEmail, actorEmail: userEmail };

  const handleSign = async () => {
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

  // Administrators only: it fetches every attached file, which can be large,
  // and the plain download already links each one.
  const canDownloadWithAttachments = access.isAdmin && Boolean(spClient);
  const canChooseStyle = access.isAdmin;
  const styleFor: PdfStyle = canChooseStyle ? pdfStyle : DEFAULT_PDF_STYLE;

  const handlePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy("download");
    try {
      await downloadRecordPdf(record, formSurveyJson, spClient, styleFor);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not generate the PDF.");
    } finally {
      setPdfBusy("");
    }
  };

  const handlePdfWithAttachments = async () => {
    if (pdfBusy || !spClient) return;
    setPdfBusy("attachments");
    try {
      toast(attachmentDownloadMessage(await downloadRecordPdfWithAttachments(record, formSurveyJson, spClient, styleFor)));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not build the PDF with attachments.");
    } finally {
      setPdfBusy("");
    }
  };

  const handleRegeneratePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy("regenerate");
    try {
      const result = await regenerateSubmissionPdf(actor, record, formSurveyJson, styleFor);
      applyPatch(record, result.fields);
      appendAudit(result.audit);
      toast(result.toast);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not rebuild the PDF.");
    } finally {
      setPdfBusy("");
    }
  };

  const filedText = record.filedAt ? formatDisplayDayMonthTime(record.filedAt) : "—";
  const updatedText = trail[0]?.whenLabel ?? record.filedLabel;
  const stepCount = record.chain.length;
  const signedCount = record.chain.filter((step) => step.state === "signed").length;
  const hasSteps = record.hasWorkflow && stepCount > 0;
  const showStepInMeta = hasSteps && !record.done;
  const metaLine = [
    `Filed by ${record.submitter}`,
    filedText,
    showStepInMeta ? `Step ${record.at + 1} of ${stepCount}` : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");
  const lozenge = toneColors[statusTone(record.status)];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 1180, mx: "auto", minWidth: 0 }}>
      <Box component="section" aria-label="Record summary" sx={{ ...CARD_SX, p: { xs: 2.5, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 }}>
        <Stack
          component="nav"
          aria-label="Breadcrumb"
          direction="row"
          sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center", fontSize: 13, fontWeight: 600, color: "text.secondary" }}
        >
          <Link component="button" type="button" underline="hover" color="inherit" onClick={() => setScreen("subs")} sx={{ fontWeight: 600, fontSize: 13 }}>
            Submissions
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            component="button"
            type="button"
            underline="hover"
            color="inherit"
            onClick={() => setScreen("subs", record.listTitle)}
            sx={{ fontWeight: 600, fontSize: 13 }}
          >
            {formDisplayName(record)}
          </Link>
          <span aria-hidden="true">/</span>
          <Box component="span" aria-current="page" sx={{ color: "text.primary", fontWeight: 700 }}>
            {record.reference}
          </Box>
        </Stack>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box sx={{ minWidth: 0, flex: "1 1 320px" }}>
            <Typography
              sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
            >
              {formDisplayName(record)}
            </Typography>
            <Typography component="h1" sx={{ mt: 0.5, fontSize: { xs: 22, sm: 26 }, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
              {record.reference}
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  ml: 1.25,
                  px: 1,
                  py: 0.25,
                  borderRadius: radius.tag,
                  bgcolor: lozenge.bg,
                  color: lozenge.fg,
                  fontSize: 12.5,
                  fontWeight: 700,
                  verticalAlign: "middle",
                  whiteSpace: "nowrap",
                }}
              >
                {record.status}
              </Box>
            </Typography>
            {isMeaningfulSubject(record) && (
              <Typography sx={{ mt: 0.75, fontSize: 16, color: "text.primary", wordBreak: "break-word" }}>{record.subject}</Typography>
            )}
            <Typography sx={{ mt: 0.75, fontSize: 13.5, color: "text.secondary" }}>{metaLine}</Typography>
          </Box>

          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center", justifyContent: "flex-end", ml: "auto" }}>
            {canSign && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => void handleSign()}
                  disabled={busy}
                  startIcon={<CheckIcon fontSize="small" />}
                  sx={{ ...HEADER_BUTTON_SX }}
                >
                  {isEvaluation ? "Evaluate and release" : "Approve and sign"}
                </Button>
                <Button variant="outlined" onClick={() => void handleReturn()} disabled={busy} sx={{ ...NEUTRAL_BUTTON_SX }}>
                  Return
                </Button>
              </>
            )}

            {/* One control, two jobs: the press downloads what the record says
                now, the arrow offers to rebuild the copy SharePoint is storing.
                Keeping the rebuild behind the arrow is deliberate: it deletes a
                file, and that is not what a stray click on "Download" should do. */}
            <ButtonGroup variant="outlined">
              <Button onClick={() => void handlePdf()} disabled={Boolean(pdfBusy)} sx={{ ...NEUTRAL_BUTTON_SX }}>
                {pdfBusy === "download" || pdfBusy === "attachments"
                  ? "Preparing…"
                  : styleFor === "soft"
                    ? "Download PDF · new design"
                    : "Download PDF"}
              </Button>
              {(canRegenerate || canDownloadWithAttachments || canChooseStyle) && (
                <Button
                  aria-label="Other PDF actions"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(pdfMenu)}
                  onClick={(event) => setPdfMenu(event.currentTarget)}
                  disabled={Boolean(pdfBusy)}
                  sx={{ ...NEUTRAL_BUTTON_SX, px: 0.5, minWidth: 34 }}
                >
                  <ChevronDown size={16} />
                </Button>
              )}
            </ButtonGroup>

            {hasMoreActions && (
              <IconButton
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={Boolean(moreMenu)}
                onClick={(event) => setMoreMenu(event.currentTarget)}
                sx={{ width: 40, height: 40, border: 1, borderColor: "divider", borderRadius: radius.xs, color: "text.primary", fontSize: 18, fontWeight: 800 }}
              >
                ⋯
              </IconButton>
            )}
          </Stack>
        </Box>

        {canSign && (
          <TextField
            label={isEvaluation ? "Evaluation note" : "Note for the record"}
            placeholder="Optional for approval, required if you return it"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        )}

        {readOnly && (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
            Audit accounts cannot sign, chase or cancel. Everything here is a record of what others did.
          </Typography>
        )}
        {pdfBusy === "regenerate" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Rebuilding the stored PDF…</Typography>}
        {pdfBusy === "attachments" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Adding the attachments…</Typography>}
      </Box>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2.5, alignItems: "flex-start" }}>
        <Stack spacing={2.5} sx={{ flex: { md: "999 1 560px" }, minWidth: 0, width: "100%" }}>
          {sections.length === 0 && (
            <Box component="section" sx={CARD_SX}>
              <Typography component="h2" sx={CARD_HEADING_SX}>
                Answers
              </Typography>
              <Typography sx={{ px: 2.25, py: 2, fontSize: 13, color: "text.secondary" }}>
                No answers were stored against this submission.
              </Typography>
            </Box>
          )}

          {sections.map((section) => {
            const open = !collapsed[section.id];
            const bodyId = `record-section-${section.id}`;
            return (
              <Box component="section" key={section.id} sx={CARD_SX}>
                <Box component="h2" sx={{ m: 0 }}>
                  <Button
                    fullWidth
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setCollapsed((current) => ({ ...current, [section.id]: open }))}
                    endIcon={<ChevronDown size={18} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.16s ease" }} />}
                    sx={{
                      justifyContent: "space-between",
                      textAlign: "left",
                      px: 2.25,
                      py: 1.5,
                      borderRadius: 0,
                      borderBottom: open ? 1 : 0,
                      borderColor: "divider",
                      color: "text.primary",
                      textTransform: "none",
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    {section.title}
                  </Button>
                </Box>
                {open && (
                  <Box
                    id={bodyId}
                    component="dl"
                    sx={{
                      m: 0,
                      p: 2.25,
                      display: "grid",
                      gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
                      gap: "16px 28px",
                    }}
                  >
                    {section.fields.map((field) => {
                      if (field.kind === "matrix") {
                        return (
                          <Box key={field.key} sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
                            <AnswerTable field={field} />
                          </Box>
                        );
                      }
                      const value = answerValueText(field);
                      const wide = value.length > WIDE_ANSWER_CHARS || value.includes("\n");
                      return (
                        <Box key={field.key} sx={{ minWidth: 0, gridColumn: wide ? "1 / -1" : undefined }}>
                          <Typography component="dt" sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary" }}>
                            {field.label}
                          </Typography>
                          <Typography
                            component="dd"
                            sx={{ m: "2px 0 0", fontSize: 15, fontWeight: 600, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                          >
                            {value}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}

          {attachments.length > 0 && (
            <Box component="section" sx={CARD_SX}>
              <Typography component="h2" sx={CARD_HEADING_SX}>
                Files and photos ({attachments.length})
              </Typography>
              <Stack component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                {attachments.map((file, index) => {
                  const picture = PICTURE_FILE.test(file.name);
                  return (
                    <Box
                      component="li"
                      key={`${index}-${file.url}`}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        px: 2.25,
                        py: 1.25,
                        borderTop: index === 0 ? 0 : 1,
                        borderColor: "divider",
                      }}
                    >
                      <Box
                        aria-hidden="true"
                        sx={{
                          flex: "none",
                          width: 32,
                          height: 32,
                          borderRadius: radius.xs,
                          bgcolor: picture ? TINTS.blue : TINTS.grey,
                          color: "text.primary",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {picture ? <ImageIcon size={16} /> : <FileText size={16} />}
                      </Box>
                      <Typography
                        title={file.name}
                        sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {file.name}
                      </Typography>
                      <Link
                        href={absoluteAttachmentUrl(file.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${file.name}`}
                        underline="hover"
                        sx={{ flex: "none", fontSize: 13.5, fontWeight: 700 }}
                      >
                        Open
                      </Link>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Box component="section" sx={{ ...CARD_SX, px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
            <Typography component="h2" sx={{ pt: 2, pb: 1, fontSize: 15, fontWeight: 800 }}>
              Activity
            </Typography>
            <Tabs
              value={activity}
              onChange={(_, next: "all" | "notes" | "history") => setActivity(next)}
              sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider", mb: 2, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 700, fontSize: 13.5 } }}
            >
              <Tab value="all" label="All" />
              <Tab value="notes" label={notes.length > 0 ? `Notes (${notes.length})` : "Notes"} />
              <Tab value="history" label="History" />
            </Tabs>

            {activity !== "history" && (
              <Stack component="ol" spacing={2} sx={{ m: 0, p: 0, mb: activity === "all" ? 2.5 : 0, listStyle: "none" }}>
                {notes.length === 0 && (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    No notes yet. Return reasons and evaluation notes appear here.
                  </Typography>
                )}
                {notes.map((step) => (
                  <Box component="li" key={`${step.layerNumber}-${step.roleLabel}`} sx={{ display: "flex", gap: 1.5 }}>
                    <Box
                      aria-hidden="true"
                      sx={{
                        flex: "none",
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        bgcolor: "background.default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11.5,
                        fontWeight: 800,
                      }}
                    >
                      {initialsOf(step.who)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5 }}>
                        <strong>{step.who}</strong>{" "}
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}>
                          · {displayLabel(step.roleLabel)}
                        </Box>
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 14, fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {step.note}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}

            {activity !== "notes" && <TimelineTab entries={trail} />}
          </Box>
        </Stack>

        <Stack spacing={2.5} sx={{ width: "100%", flex: { md: "1 1 320px" }, maxWidth: { md: 400 }, minWidth: 0 }}>
          {hasSteps && (
            <Box component="section" sx={CARD_SX}>
              <Typography component="h2" sx={CARD_HEADING_SX}>
                Progress · {signedCount} of {stepCount}
              </Typography>
              <Stack component="ol" spacing={1.75} sx={{ m: 0, p: 2.25, listStyle: "none" }}>
                {record.chain.map((step) => {
                  const signed = step.state === "signed";
                  const current = step.state === "current";
                  return (
                    <Box component="li" key={`${step.layerNumber}-${step.roleLabel}`} sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box
                        aria-hidden="true"
                        sx={{
                          flex: "none",
                          width: 28,
                          height: 28,
                          boxSizing: "border-box",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 800,
                          ...(signed
                            ? { bgcolor: "success.main", color: "success.contrastText" }
                            : current
                              ? { bgcolor: SUN, border: 2, borderColor: "text.primary", color: "text.primary" }
                              : { border: 2, borderColor: "divider", color: "text.secondary" }),
                        }}
                      >
                        {signed ? <CheckIcon size={14} strokeWidth={3.4} /> : step.layerNumber}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{ fontSize: 14, fontWeight: current ? 800 : 700, color: step.state === "pending" ? "text.secondary" : "text.primary" }}
                        >
                          {displayLabel(step.roleLabel)}
                        </Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary" }}>{stepCaption(step)}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Box component="section" sx={CARD_SX}>
            <Typography component="h2" sx={CARD_HEADING_SX}>
              Details
            </Typography>
            <Box
              component="dl"
              sx={{ m: 0, px: 2.25, py: 1.75, display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: "12px", alignItems: "center", fontSize: 13.5 }}
            >
              <Box component="dt" sx={DT_SX}>Status</Box>
              <Box component="dd" sx={{ m: 0 }}>
                <StatusPill status={record.status} />
              </Box>
              {/* Only a record still moving through a chain has someone it is waiting on. */}
              {record.hasWorkflow && !record.done && (
                <>
                  <Box component="dt" sx={DT_SX}>Waiting on</Box>
                  <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>
                    {isMyLayer ? "You" : record.currentAssignee || "Nobody"}
                  </Box>
                </>
              )}
              <Box component="dt" sx={DT_SX}>Filed by</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{record.submitter}</Box>
              <Box component="dt" sx={DT_SX}>Form</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{formDisplayName(record)}</Box>
              <Box component="dt" sx={DT_SX}>Reference</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{record.reference}</Box>
              <Box component="dt" sx={DT_SX}>Filed</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{filedText}</Box>
              {/* Only a record whose form declared an SLA has a deadline to show. */}
              {record.hasSla && (
                <>
                  <Box component="dt" sx={DT_SX}>Due</Box>
                  <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{record.slaNote || "—"}</Box>
                </>
              )}
            </Box>
          </Box>

          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>Updated {updatedText}</Typography>
        </Stack>
      </Box>

      <Menu
        anchorEl={pdfMenu}
        open={Boolean(pdfMenu)}
        onClose={() => setPdfMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 320 } } }}
      >
        {canDownloadWithAttachments && (
          <MenuItem
            disabled={attachments.length === 0}
            onClick={() => {
              setPdfMenu(null);
              void handlePdfWithAttachments();
            }}
          >
            <ListItemText
              primary="Download PDF with attachments"
              secondary={
                attachments.length === 0
                  ? "Nothing is attached to this record"
                  : `The record, then its ${attachments.length} attached ${attachments.length === 1 ? "file" : "files"} on the pages after it`
              }
              slotProps={{
                primary: { sx: { fontSize: 13.5, fontWeight: 700 } },
                secondary: { sx: { fontSize: 11.5, whiteSpace: "normal" } },
              }}
            />
          </MenuItem>
        )}
        {canRegenerate && (
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
        )}
        {canChooseStyle && [
          <Divider key="style-divider" />,
          <ListSubheader key="style-heading" sx={{ fontSize: 12, fontWeight: 700, lineHeight: "32px", bgcolor: "transparent" }}>
            PDF design
          </ListSubheader>,
          ...(["classic", "soft"] as const).map((style) => (
            <MenuItem key={style} selected={pdfStyle === style} onClick={() => setPdfStyle(style)} role="menuitemradio" aria-checked={pdfStyle === style}>
              <ListItemIcon sx={{ minWidth: 28 }}>{pdfStyle === style ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
              <ListItemText
                primary={style === DEFAULT_PDF_STYLE ? `${PDF_STYLE_LABELS[style].title} (default)` : PDF_STYLE_LABELS[style].title}
                secondary={PDF_STYLE_LABELS[style].detail}
                slotProps={{
                  primary: { sx: { fontSize: 13.5, fontWeight: 700 } },
                  secondary: { sx: { fontSize: 11.5, whiteSpace: "normal" } },
                }}
              />
            </MenuItem>
          )),
        ]}
      </Menu>

      <Menu
        anchorEl={moreMenu}
        open={Boolean(moreMenu)}
        onClose={() => setMoreMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {canReassign && (
          <MenuItem
            disabled={busy}
            onClick={() => {
              setMoreMenu(null);
              setReassignOpen(true);
            }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <UserCog size={18} />
            </ListItemIcon>
            Change who signs
          </MenuItem>
        )}
        {canReassign && (canCancel || canDelete) && <Divider />}
        {canCancel && (
          <MenuItem
            disabled={busy}
            onClick={() => {
              setMoreMenu(null);
              setCancelOpen(true);
            }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>
              <BlockIcon fontSize="small" />
            </ListItemIcon>
            {cancelLabel}
          </MenuItem>
        )}
        {canCancel && canDelete && <Divider />}
        {canDelete && (
          <MenuItem
            disabled={busy}
            onClick={() => {
              setMoreMenu(null);
              setDeleteOpen(true);
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon sx={{ minWidth: 30, color: "inherit" }}>
              <DeleteForeverIcon fontSize="small" />
            </ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>

      <ReassignDialog record={reassignOpen ? record : null} onClose={() => setReassignOpen(false)} />

      <WithdrawDialog record={cancelOpen ? record : null} onClose={() => setCancelOpen(false)} onDone={closeDrawer} />

      <DeleteRecordDialog record={deleteOpen ? record : null} onClose={() => setDeleteOpen(false)} onDone={closeDrawer} />
    </Box>
  );
}
