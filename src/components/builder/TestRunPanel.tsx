/**
 * TestRunPanel.tsx — one form's test runs and their checklists.
 *
 * Lists every `IsTest` row on the form's response list, newest first. Each
 * run's checklist is `TestRunLog` (written by the server) merged with what the
 * row itself says (`testRunProgress.ts`), because a signed-in run and a decision
 * made from the approvals workspace never reach the server-written trail.
 *
 * The last step — rendering the PDF — can only happen here, in the browser,
 * because `@react-pdf/renderer` has no server equivalent. Deletion goes through
 * `delete-test-runs`, which re-checks `IsTest` on the server; this panel's own
 * filter is a display convenience, never the security boundary.
 *
 * Ported from pmw-hrform's builder panel onto MUI, the dashboard's toolkit.
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useMsal } from "@azure/msal-react";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SharePointHttpError } from "../../utils/sharepointClient";
import { getFormConfigByTitle, spGet, toAbsoluteSharePointUrl } from "../../utils/formBuilderSP";
import { isTestRow } from "../../utils/testRun";
import { testRunSharePointScope } from "../../utils/testRunLaunch";
import { parseTestRunTrail, TEST_RUN_LOG_FIELD, type TestRunStep, type TestRunStepStatus } from "../../utils/testRunTrail";
import { isTestRunFinished, mergeTestRunSteps, testRunVerdict, type TestRunVerdict } from "../../utils/testRunProgress";
import { REFERENCE_NO_FIELD } from "../../utils/referenceNumber";
import type { PdfFormData } from "../../utils/FormPdfDocument";
import { COMPANY } from "../../config/company";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

interface TestRunPanelProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
}

interface TestRunRow {
  id: string;
  fields: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

async function callTestRunAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/submit-form", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status}).`);
  return data;
}

const PDF_SYSTEM_FIELDS = new Set([
  "Id", "ID", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus",
  "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask", "AuthorId", "EditorId",
  "SelectedBranch", "IsTest", "TestEmail", TEST_RUN_LOG_FIELD, REFERENCE_NO_FIELD,
]);

/** The PDF input for one run, for the browser-only render step. */
async function loadPdfDataForRow(token: string, listTitle: string, row: TestRunRow): Promise<PdfFormData> {
  const cfg = await getFormConfigByTitle(token, listTitle);
  if (!cfg) throw new Error("Could not find this form's configuration.");
  const respItem = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${row.id})`,
  ) as Record<string, unknown>;
  const formVersion = text(respItem.FormVersion) || cfg.CurrentVersion || "1.0";
  const versions = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`,
  ) as { value?: { SurveyJSON?: string }[] };
  const rawSurvey = versions.value?.[0]?.SurveyJSON;
  if (!rawSurvey) throw new Error("Could not load this form's published schema.");
  const parsed = JSON.parse(rawSurvey) as Record<string, unknown>;
  const versionMeta = isRecord(parsed.meta) ? parsed.meta : {};

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(respItem)) {
    if (!PDF_SYSTEM_FIELDS.has(key) && !/^L\d+_/.test(key) && !key.startsWith("odata.") && value !== null && value !== undefined) {
      data[key] = value;
    }
  }

  const { buildPdfLayerResults } = await import("../../utils/generateFormPdf");
  return {
    surveyJson: (parsed.surveyJson || parsed) as PdfFormData["surveyJson"],
    responseData: data,
    layerResults: buildPdfLayerResults(respItem, 10, cfg.LayerConfig),
    meta: {
      submittedBy: text(respItem.SubmittedBy),
      submittedAt: text(respItem.SubmittedAt),
      formTitle: listTitle,
      formVersion,
      formStatus: text(respItem.FormStatus) || text(respItem.Status),
      referenceNo: text(respItem[REFERENCE_NO_FIELD]) || undefined,
    },
    isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
    logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : COMPANY.logoUrl,
  };
}

const STEP_STYLE: Record<TestRunStepStatus, { colour: string; wash: string; symbol: string }> = {
  pass: { colour: editorial.success, wash: editorial.successWash, symbol: "✓" },
  warn: { colour: editorial.warning, wash: editorial.warningWash, symbol: "!" },
  fail: { colour: editorial.error, wash: editorial.errorWash, symbol: "✕" },
  skip: { colour: editorial.muted, wash: editorial.neutralWash, symbol: "–" },
  pending: { colour: editorial.pmwBlueDark, wash: editorial.blueWash, symbol: "…" },
};

const VERDICT: Record<TestRunVerdict, { label: string; colour: string; wash: string }> = {
  passed: { label: "Passed", colour: editorial.success, wash: editorial.successWash },
  failed: { label: "Failed", colour: editorial.error, wash: editorial.errorWash },
  running: { label: "Running", colour: editorial.pmwBlueDark, wash: editorial.blueWash },
};

function StepLine({ step }: { step: TestRunStep }) {
  const style = STEP_STYLE[step.status];
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", py: 0.5 }}>
      <Box
        aria-label={step.status}
        sx={{
          flex: "none", width: 20, height: 20, borderRadius: radius.full, backgroundColor: style.wash, color: style.colour,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
        }}
      >
        {style.symbol}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.ink }}>{step.label}</Typography>
        {step.detail && <Typography sx={{ fontSize: 12, color: editorial.muted, wordBreak: "break-word" }}>{step.detail}</Typography>}
      </Box>
    </Stack>
  );
}

export default function TestRunPanel({ open, onClose, form }: TestRunPanelProps) {
  const { instance, accounts } = useMsal();
  const [rows, setRows] = useState<TestRunRow[]>([]);
  // Mounted only while open, so it starts out loading.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfErrorById, setPdfErrorById] = useState<Record<string, string>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const getDelegatedToken = () => acquireAccessTokenSilentOrRedirect(instance, {
    scopes: [testRunSharePointScope()],
    account: accounts[0],
  });

  useEffect(() => {
    if (!open || !form.Title) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [testRunSharePointScope()], account: accounts[0] });
        const items: TestRunRow[] = [];
        let nextUrl: string | null =
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(form.Title)}')/items?$filter=IsTest eq 'true'&$orderby=Id desc&$top=500`;
        for (let page = 0; nextUrl && page < 40; page++) {
          let data: { value?: Record<string, unknown>[]; "odata.nextLink"?: string };
          try {
            data = await spGet(token, nextUrl) as typeof data;
          } catch (e) {
            // A list that never ran a test has no IsTest column, and SharePoint
            // answers a filter on it with 400. That is "no runs", not an error.
            if (page === 0 && e instanceof SharePointHttpError && e.status === 400) break;
            throw e;
          }
          for (const fields of data.value || []) {
            const id = text(fields.Id ?? fields.ID);
            if (id && isTestRow(fields)) items.push({ id, fields });
          }
          nextUrl = data["odata.nextLink"] || null;
        }
        if (!cancelled) setRows(items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load test runs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, form.Title, reloadKey, instance, accounts]);

  const needSlug = () => {
    if (form.Slug) return false;
    setError("This form has no published link yet — publish it before managing test runs.");
    return true;
  };

  const deleteRuns = async (itemId?: string) => {
    if (needSlug()) return;
    setBusy(itemId ?? "all");
    setError("");
    try {
      const delegatedToken = await getDelegatedToken();
      const result = await callTestRunAction({ action: "delete-test-runs", slug: form.Slug, delegatedToken, ...(itemId ? { itemId } : {}) });
      const deleted = Array.isArray(result.deleted) ? (result.deleted as unknown[]).map(String) : [];
      setRows((prev) => prev.filter((row) => !deleted.includes(row.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete test runs.");
    } finally {
      setBusy(null);
    }
  };

  const renderPdf = async (row: TestRunRow) => {
    if (needSlug()) return;
    setBusy(`pdf:${row.id}`);
    setPdfErrorById((prev) => ({ ...prev, [row.id]: "" }));
    const record = async (step: Omit<TestRunStep, "at">) => {
      const delegatedToken = await getDelegatedToken();
      await callTestRunAction({ action: "record-test-run-step", slug: form.Slug, itemId: row.id, delegatedToken, step });
    };
    try {
      const token = await getDelegatedToken();
      const pdfData = await loadPdfDataForRow(token, form.Title, row);
      let bytes = 0;
      const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
      const pdfUrl = await generateAndStorePdf(token, form.Title, Number(row.id), pdfData, {
        onGeneratedBlob: (blob) => { bytes = blob.size; },
      });
      window.open(toAbsoluteSharePointUrl(pdfUrl), "_blank", "noopener,noreferrer");
      const step: Omit<TestRunStep, "at"> = { step: "pdf", label: "PDF rendered", status: "pass", order: 1100, detail: `${bytes} bytes` };
      await record(step);
      setRows((prev) => prev.map((candidate) => (
        candidate.id === row.id
          ? {
            ...candidate,
            fields: {
              ...candidate.fields,
              [TEST_RUN_LOG_FIELD]: JSON.stringify({ ...parseTestRunTrail(candidate.fields[TEST_RUN_LOG_FIELD]), pdf: { ...step, at: new Date().toISOString() } }),
            },
          }
          : candidate
      )));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not render the PDF.";
      setPdfErrorById((prev) => ({ ...prev, [row.id]: message }));
      await record({ step: "pdf", label: "PDF rendered", status: "fail", order: 1100, detail: message.slice(0, 400) }).catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { borderRadius: radius.lg } } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Test runs</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mb: 2 }}>
          Rehearsals of &ldquo;{form.Title}&rdquo;, newest first. They never appear in normal submission lists.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: radius.sm }}>{error}</Alert>}
        {loading && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 2 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 13, color: editorial.muted }}>Loading test runs…</Typography>
          </Stack>
        )}
        {!loading && rows.length === 0 && !error && (
          <Typography sx={{ fontSize: 13, color: editorial.muted, py: 2 }}>No test runs yet. Start one with &ldquo;Test workflow&rdquo;.</Typography>
        )}
        <Stack spacing={1.25}>
          {rows.map((row) => {
            const trail = parseTestRunTrail(row.fields[TEST_RUN_LOG_FIELD]);
            const verdict = VERDICT[testRunVerdict(trail, row.fields)];
            const expanded = expandedId === row.id;
            const finished = isTestRunFinished(trail, row.fields);
            const submittedAt = text(row.fields.SubmittedAt);
            return (
              <Box key={row.id} sx={{ border: `1px solid ${editorial.border}`, borderRadius: radius.md, overflow: "hidden" }}>
                <Stack
                  direction="row"
                  spacing={1.25}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  sx={{ alignItems: "center", p: 1.25, cursor: "pointer" }}
                >
                  <Chip size="small" label={verdict.label} sx={{ fontWeight: 800, color: verdict.colour, backgroundColor: verdict.wash }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: editorial.ink }}>
                      {text(row.fields[REFERENCE_NO_FIELD]) || `#${row.id}`}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                      {submittedAt ? new Date(submittedAt).toLocaleString() : "Unknown time"} · {text(row.fields.FormStatus) || text(row.fields.Status) || "Unknown"} · emails to {text(row.fields.TestEmail) || "—"}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy !== null}
                    onClick={(e) => { e.stopPropagation(); void deleteRuns(row.id); }}
                    sx={{ textTransform: "none", fontWeight: 700 }}
                  >
                    {busy === row.id ? "Deleting…" : "Delete"}
                  </Button>
                </Stack>
                {expanded && (
                  <Box sx={{ borderTop: `1px solid ${editorial.border}`, backgroundColor: editorial.paperSoft, px: 1.75, py: 1.25 }}>
                    {mergeTestRunSteps(trail, row.fields).map((step) => <StepLine key={step.step} step={step} />)}
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 1.25, pt: 1.25, borderTop: `1px dashed ${editorial.border}` }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!finished || busy !== null}
                        onClick={() => void renderPdf(row)}
                        sx={{ textTransform: "none", fontWeight: 800 }}
                      >
                        {busy === `pdf:${row.id}` ? "Rendering…" : trail.pdf ? "Render PDF again" : "Render PDF"}
                      </Button>
                      {!finished && <Typography sx={{ fontSize: 12, color: editorial.muted }}>Finish the workflow to render its PDF.</Typography>}
                      {pdfErrorById[row.id] && <Typography sx={{ fontSize: 12, color: editorial.error }}>{pdfErrorById[row.id]}</Typography>}
                    </Stack>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        {confirmAll ? (
          <>
            <Typography sx={{ fontSize: 13, color: editorial.error, fontWeight: 700, mr: "auto" }}>
              Delete {rows.length} test run{rows.length === 1 ? "" : "s"}? This cannot be undone.
            </Typography>
            <Button onClick={() => setConfirmAll(false)} sx={{ textTransform: "none", fontWeight: 700 }}>Keep them</Button>
            <Button
              color="error"
              variant="contained"
              disabled={busy !== null}
              onClick={() => { setConfirmAll(false); void deleteRuns(); }}
              sx={{ textTransform: "none", fontWeight: 800 }}
            >
              Delete all
            </Button>
          </>
        ) : (
          <>
            <Button
              color="error"
              disabled={busy !== null || rows.length === 0}
              onClick={() => setConfirmAll(true)}
              sx={{ textTransform: "none", fontWeight: 700, mr: "auto" }}
            >
              {busy === "all" ? "Clearing…" : "Clear all test runs"}
            </Button>
            <Button onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }} disabled={loading} sx={{ textTransform: "none", fontWeight: 700 }}>Refresh</Button>
            <Button variant="contained" onClick={onClose} sx={{ textTransform: "none", fontWeight: 800 }}>Close</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
