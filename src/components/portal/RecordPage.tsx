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
import { Ban as BlockIcon, Check as CheckIcon, ChevronDown as ArrowDropDownIcon, Trash2 as DeleteForeverIcon } from "../ui/Icons";
import { usePortal } from "../../contexts/PortalContext";
import { initialsOf, normalizeEmail } from "../../utils/portalPeople";
import { regenerateSubmissionPdf, returnForInformation, signLayer } from "../../utils/portalActions";
import { canDeleteRecord, canWithdrawRecord, withdrawLabel } from "../../utils/portalRole";
import {
  attachmentDownloadMessage,
  downloadRecordPdf,
  downloadRecordPdfWithAttachments,
  recordAttachments,
} from "../../utils/portalPdf";
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
import { AnswersTab, TimelineTab, answerValueText, recordAnswerSections } from "./RecordDetail";
import type { PortalRecord } from "../../types";

/** Pictures are shown as tiles; anything else attached is reached from the PDF. */
const PICTURE_FILE = /\.(png|jpe?g|gif|webp|heic|bmp)$/i;

/** How many answers the "What was filed" summary shows before "Show all". */
const SUMMARY_ANSWERS = 6;

const CARD_SX = {
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: radius.sm,
  minWidth: 0,
} as const;

const CARD_HEADING_SX = {
  m: 0,
  px: 2.25,
  py: 1.5,
  borderBottom: 1,
  borderColor: "divider",
  fontSize: 14,
  fontWeight: 800,
} as const;

const DT_SX = { fontWeight: 700, color: "text.secondary" } as const;

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
  const [showAllAnswers, setShowAllAnswers] = useState(false);
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
  const hasMoreActions = canCancel || canDelete;
  const cancelLabel = withdrawLabel(record, userEmail);
  const isEvaluation = record.chain[record.at]?.type === "evaluation";

  const trail = useMemo(() => audit.filter((entry) => entry.reference === record.reference), [audit, record.reference]);

  const formSurveyJson = surveyJsonByForm[record.listTitle] ?? record.submission.surveyJson ?? null;
  const sections = useMemo(
    () => recordAnswerSections(record, surveyJsonByForm[record.listTitle] ?? null),
    [record, surveyJsonByForm],
  );
  const answerFields = useMemo(() => sections.flatMap((section) => section.fields), [sections]);
  const attachments = useMemo(() => recordAttachments(record, formSurveyJson), [record, formSurveyJson]);
  const pictures = useMemo(() => attachments.filter((file) => PICTURE_FILE.test(file.name)), [attachments]);
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 1180, mx: "auto", minWidth: 0 }}>
      <Stack
        component="nav"
        aria-label="Breadcrumb"
        direction="row"
        sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center", fontSize: 13.5, fontWeight: 600, color: "text.secondary" }}
      >
        <Link component="button" type="button" underline="hover" color="inherit" onClick={() => setScreen("subs")} sx={{ fontWeight: 600, fontSize: 13.5 }}>
          Submissions
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          component="button"
          type="button"
          underline="hover"
          color="inherit"
          onClick={() => setScreen("subs", record.listTitle)}
          sx={{ fontWeight: 600, fontSize: 13.5 }}
        >
          {record.formName}
        </Link>
        <span aria-hidden="true">/</span>
        <Box component="span" aria-current="page" sx={{ color: "text.primary", fontWeight: 800 }}>
          {record.reference}
        </Box>
      </Stack>

      <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: "flex-start" }}>
        <Stack spacing={2.5} sx={{ flex: "1 1 0", minWidth: 0, width: "100%" }}>
          <Stack spacing={1.5}>
            <Typography component="h1" sx={{ fontSize: { xs: 21, sm: 26 }, fontWeight: 800, lineHeight: 1.25, wordBreak: "break-word" }}>
              {record.subject}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
              {/* One control, two jobs: the press downloads what the record says
                  now, the arrow offers to rebuild the copy SharePoint is storing.
                  Keeping the rebuild behind the arrow is deliberate: it deletes a
                  file, and that is not what a stray click on "Download" should do. */}
              <ButtonGroup variant="outlined">
                <Button onClick={() => void handlePdf()} disabled={Boolean(pdfBusy)} sx={{ minHeight: 40 }}>
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
                    sx={{ minHeight: 40, minWidth: 34, px: 0.25 }}
                  >
                    <ArrowDropDownIcon fontSize="small" />
                  </Button>
                )}
              </ButtonGroup>

              {canReassign && (
                <Button variant="outlined" onClick={() => setReassignOpen(true)} sx={{ minHeight: 40 }}>
                  Change who signs
                </Button>
              )}

              {hasMoreActions && (
                <IconButton
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(moreMenu)}
                  onClick={(event) => setMoreMenu(event.currentTarget)}
                  sx={{ width: 40, height: 40, border: 1, borderColor: "divider", borderRadius: radius.xs, fontSize: 18, fontWeight: 800 }}
                >
                  ⋯
                </IconButton>
              )}
            </Stack>
            {pdfBusy === "regenerate" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Rebuilding the stored PDF…</Typography>}
            {pdfBusy === "attachments" && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Adding the attachments…</Typography>}
          </Stack>

          <Box component="section" sx={{ ...CARD_SX, p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800 }}>
              What was filed
            </Typography>
            {answerFields.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No answers were stored against this submission.</Typography>
            ) : showAllAnswers ? (
              <AnswersTab record={record} surveyJson={surveyJsonByForm[record.listTitle] ?? null} />
            ) : (
              <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: "14px 28px" }}>
                {answerFields.slice(0, SUMMARY_ANSWERS).map((field) => (
                  <Box key={field.key} sx={{ minWidth: 0 }}>
                    <Typography component="dt" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                      {field.label}
                    </Typography>
                    <Typography component="dd" sx={{ m: "2px 0 0", fontSize: 14.5, fontWeight: 700, wordBreak: "break-word" }}>
                      {answerValueText(field)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            {answerFields.length > SUMMARY_ANSWERS && (
              <Button variant="text" onClick={() => setShowAllAnswers((open) => !open)} sx={{ alignSelf: "flex-start", minHeight: 36, fontWeight: 800 }}>
                {showAllAnswers ? "Show fewer answers" : `Show all ${answerFields.length} answers`}
              </Button>
            )}
            {pictures.length > 0 && (
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 1.25 }}>
                {pictures.map((file) => (
                  <Box
                    key={file.url}
                    sx={{
                      height: 88,
                      p: 1,
                      borderRadius: radius.xs,
                      bgcolor: TINTS.grey,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "text.secondary",
                      textAlign: "center",
                      overflow: "hidden",
                      wordBreak: "break-word",
                    }}
                  >
                    {file.name}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

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
                          · {step.roleLabel}
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

        <Stack spacing={2} sx={{ width: { xs: "100%", md: 340 }, flex: { md: "0 0 340px" }, maxWidth: { md: 420 }, minWidth: 0 }}>
          {canSign && (
            <>
              <TextField
                label={isEvaluation ? "Evaluation note" : "Note for the record"}
                placeholder="Optional for approval, required if you return it"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                multiline
                minRows={3}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={() => void handleSign()}
                  disabled={busy}
                  startIcon={<CheckIcon fontSize="small" />}
                  sx={{ flex: 1, minHeight: 44, fontWeight: 800 }}
                >
                  {isEvaluation ? "Evaluate and release" : "Approve and sign"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => void handleReturn()}
                  disabled={busy}
                  sx={{ minHeight: 44, px: 2.25, fontWeight: 800, color: "text.primary", borderColor: "text.primary", borderWidth: 1.5 }}
                >
                  Return
                </Button>
              </Stack>
            </>
          )}

          {readOnly && (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              Audit accounts cannot sign, chase or cancel. Everything here is a record of what others did.
            </Typography>
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
              <Box component="dt" sx={DT_SX}>With</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>
                {isMyLayer ? "You" : record.currentAssignee || "Nobody"}
              </Box>
              <Box component="dt" sx={DT_SX}>Filed by</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{record.submitter}</Box>
              <Box component="dt" sx={DT_SX}>Form</Box>
              <Box component="dd" sx={{ m: 0, fontWeight: 700 }}>{record.formName}</Box>
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

          {record.hasWorkflow && stepCount > 0 && (
            <Box component="section" sx={CARD_SX}>
              <Typography component="h2" sx={CARD_HEADING_SX}>
                Sign-off steps{" "}
                <Box component="span" sx={{ color: "text.secondary", fontWeight: 700 }}>
                  · {record.at + 1} of {stepCount}
                </Box>
              </Typography>
              <Stack component="ol" spacing={1.5} sx={{ m: 0, p: 2.25, listStyle: "none" }}>
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
                        <Typography sx={{ fontSize: 13.5, fontWeight: current ? 800 : 700, color: step.state === "pending" ? "text.secondary" : "text.primary" }}>
                          {step.roleLabel}
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
                          {step.who} · {step.statusText}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
            Filed {filedText} · Updated {updatedText}
          </Typography>
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
