/**
 * EvaluationPage.tsx — Layer evaluation/approval interface.
 * Route: /eval/:token (public) or /eval/:formSlug/:responseId/:layerNumber (365)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../native/NativeForm";
import { parseForm, type NativeForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import "../native/native-form.css";

import { getLayerResponseData, updateLayerStatus, submitEvaluationData, getFormConfigByTitle, spGet, spPatch, readMatrixChildItems, triggerApprovalNotification } from "../utils/formBuilderSP";
import { buildLayerReviewLink, describeMissingReviewLink } from "../utils/layerReviewLink";
import { linkTokenField, mintLinkToken } from "../utils/linkToken";
import { appBaseUrl } from "../config/appBaseUrl";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import { SP_LAYER_STATUS, normalizeLayerStatus } from "../utils/statusConstants";
import { buildRejectedWorkflowPatch } from "../utils/workflowStatus";
import { buildSurveyJson } from "../utils/FormBuilderEngine";
import type { LayerConfigItem, EvaluationDataEntry, EvaluationLayerConfig, FormBuilderField } from "../types";
import DOMPurify from "dompurify";
import EvaluationSummary from "../components/builder/EvaluationSummary";
import { loginRequest } from "../auth/msalConfig";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { rowsToHtml, getDynamicMatrixFields } from "../utils/matrixData";
import { SignatureCapture } from "../utils/signatureCapture";
import { getSelectedCompany } from "../utils/companySelection";
import ReadOnlySubmissionPreview from "../components/builder/ReadOnlySubmissionPreview";
import Logo from "../components/Logo";
import { Box, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import {
  AlertTriangle as WarningIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  ShieldAlert as ShieldAlertIcon,
  X as CloseIcon,
} from "../components/ui/Icons";
import { editorial } from "../theme/editorial";
import LoadingScreen, { AUTH_FONT, authCardSx, authPageSx, authPill, authSoft } from "../components/auth/LoadingScreen";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { canActOnLayer, claimLayerEmail, layerRecipients } from "../utils/layerAssignees";
import { formatDisplayDateTime } from "../utils/displayDateTime";
import { REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { COMPANY } from "../config/company";
import { approverDisplayName } from "../utils/approverIdentity";
import { readSignerIdentity, stampLayerSigner, type SignerIdentity } from "../utils/layerSigner";
import {
  signOffLabel,
  signOffName,
  signOffPosition,
  signOffVerdictForLayer,
  signOffVerdictFromStatus,
} from "../utils/signOff";
import SignOffBlock from "../components/SignOffBlock";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";

// ── PDF Helper ─────────────────────────────────────────────────────────────
async function loadPdfAndGenerate(token: string, listTitle: string, responseItemId: number, formTitle: string, formStatus: string): Promise<void> {
  try {
    const cfg = await getFormConfigByTitle(token, formTitle);
    if (!cfg) return;

    const formVersion = (cfg as unknown as Record<string, unknown>).CurrentVersion as string || "1.0";

    const versionData = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
    ) as { value?: { SurveyJSON?: string }[] };

    const rawSurvey = versionData.value?.[0]?.SurveyJSON;
    if (!rawSurvey) return;

    const parsed = JSON.parse(rawSurvey) as Record<string, unknown>;
    const surveyContent = parsed.surveyJson || parsed;
    const versionMeta = typeof parsed.meta === "object" && parsed.meta !== null && !Array.isArray(parsed.meta)
      ? parsed.meta as Record<string, unknown>
      : {};

    const respItem = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`
    ) as Record<string, unknown>;

    const SYSTEM_FIELDS = new Set([
      'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
      'FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
      'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
      'Author','Editor','Created','Modified','ContentType','PermMask',
      'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
      'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
      'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
    ]);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(respItem)) {
      if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
        data[k] = v;
      }
    }

    const { generateAndStorePdf, buildPdfLayerResults } = await import("../utils/generateFormPdf");
    await generateAndStorePdf(token, listTitle, responseItemId, {
      surveyJson: surveyContent as PdfFormData["surveyJson"],
      responseData: data,
      layerResults: buildPdfLayerResults(respItem, 10, cfg.LayerConfig),
      meta: {
        submittedBy: (respItem.SubmittedBy as string) || "",
        submittedAt: (respItem.SubmittedAt as string) || "",
        formTitle,
        formVersion,
        formStatus,
      },
      isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : COMPANY.logoUrl,
    });
  } catch {
    /* PDF generation is best-effort after the workflow state is persisted. */
  }
}

type AuthState = "checking" | "authorized" | "unauthorized" | "error";
type ActionState = "idle" | "submitting" | "success" | "error";
type PublicPreviousLayerSummary = {
  layerNumber: number;
  type?: string;
  title?: string;
  description?: string;
  surveyElements?: Record<string, unknown>[];
};

// ── Styling ──
// Soft UI: one white sheet on the app ground, filled tiles instead of bordered
// boxes, pills for actions. Surfaces and text come from the shared PMW Editorial
// tokens so the page follows the appearance theme; the tints for status fills
// are the house values also used by the auth state screens.
const COLORS = {
  ground: editorial.appSurface,
  sheet: editorial.panel,
  tile: editorial.paper,
  chip: editorial.neutralWash,
  line: editorial.border,
  dashed: "#C8D2E1",
  textPrimary: editorial.ink,
  textSecond: editorial.muted,
  textMuted: editorial.softMuted,
  primary: editorial.pmwBlue,
  primaryPale: editorial.pmwBlueSoft,
  primaryInk: editorial.pmwBlueDark,
  green: editorial.success,
  greenPale: "#D5F0E1",
  greenInk: "#0E5233",
  red: editorial.error,
  redPale: "#FADBD8",
  redInk: "#8C1D18",
  amberPale: "#FCEFC7",
  amberInk: "#6B4A00",
};

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const NOT_ASSIGNED_MESSAGE = "This approval layer is not assigned to your account.";

/** Tints for the state screens and status pills: a 112px circle plus its glyph. */
const STATE_TONES = {
  primary: { bg: COLORS.primaryPale, fg: "#0B3B8C" },
  neutral: { bg: COLORS.chip, fg: "#3B4352" },
  success: { bg: COLORS.greenPale, fg: COLORS.greenInk },
  warning: { bg: COLORS.amberPale, fg: COLORS.amberInk },
  danger: { bg: COLORS.redPale, fg: COLORS.redInk },
} as const;
type StateTone = keyof typeof STATE_TONES;

/** The reference number: a monospace pill that never wraps. */
const referencePill: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 12px",
  borderRadius: 999,
  background: COLORS.chip,
  color: COLORS.textPrimary,
  fontFamily: MONO_FONT,
  fontSize: 14,
  fontWeight: 600,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  userSelect: "all",
};

function statusPillStyle(tone: StateTone): React.CSSProperties {
  const palette = STATE_TONES[tone];
  return {
    display: "inline-block",
    padding: "6px 14px",
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
}

const sectionHeading: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: COLORS.textPrimary,
  margin: 0,
};

const tileStyle: React.CSSProperties = {
  background: COLORS.tile,
  borderRadius: 20,
  padding: "14px 16px",
};

/** Pill buttons for the decision: the filled one is the primary action. */
const primaryPill: SxProps<Theme> = { ...authPill.filled, px: 3.5 };
const dangerPill: SxProps<Theme> = {
  ...authPill.filled,
  px: 3.5,
  backgroundColor: COLORS.redPale,
  color: COLORS.redInk,
  "&:hover": { backgroundColor: COLORS.redPale, boxShadow: "none", filter: "brightness(0.96)" },
  "&.Mui-disabled": { backgroundColor: COLORS.tile, color: COLORS.textMuted },
};

type JourneyKind = "done" | "rejected" | "pending" | "current";
const JOURNEY_NODE: Record<JourneyKind, React.CSSProperties> = {
  done: { background: COLORS.green, color: "#FFFFFF" },
  rejected: { background: COLORS.redPale, color: COLORS.redInk },
  pending: { background: COLORS.chip, color: COLORS.textSecond },
  current: { background: COLORS.primary, color: "#FFFFFF", boxShadow: `0 0 0 6px ${COLORS.primaryPale}` },
};

/** A round step in the approval journey: a check, a cross, or the layer number. */
function JourneyNode({ kind, layerNumber }: { kind: JourneyKind; layerNumber: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        zIndex: 1,
        width: 40,
        height: 40,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 14,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        ...JOURNEY_NODE[kind],
      }}
    >
      {kind === "done" ? <CheckIcon size={20} /> : kind === "rejected" ? <CloseIcon size={18} /> : layerNumber}
    </span>
  );
}

/**
 * A result screen: a 112px tinted circle with one glyph, a title, one sentence,
 * and at most one pill action. The same shape as the auth error screen.
 */
function StateScreen({
  tone,
  icon,
  title,
  message,
  children,
}: {
  tone: StateTone;
  icon: React.ReactNode;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const palette = STATE_TONES[tone];
  const isAlert = tone === "warning" || tone === "danger";
  return (
    <Box sx={authPageSx}>
      <Stack
        component="section"
        role={isAlert ? "alert" : "status"}
        spacing={3}
        sx={{ ...authCardSx, maxWidth: 480, alignItems: "center" }}
      >
        <Box
          sx={{
            width: 112,
            height: 112,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.bg,
            color: palette.fg,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Stack spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography
            component="h1"
            sx={{ fontFamily: AUTH_FONT, fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: authSoft.ink, textWrap: "balance" }}
          >
            {title}
          </Typography>
          {message && (
            <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: authSoft.muted, maxWidth: 380, overflowWrap: "anywhere", textWrap: "pretty" }}>
              {message}
            </Typography>
          )}
        </Stack>
        {children && <Stack spacing={1.25} sx={{ width: "100%", alignItems: "center" }}>{children}</Stack>}
      </Stack>
    </Box>
  );
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

const SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch",
]);

function isWorkflowField(key: string): boolean {
  return SYSTEM_FIELDS.has(key) || /^L\d+_/.test(key) || key.startsWith("odata.");
}

function getSubmissionPreviewData(fields: Record<string, unknown> | null): Record<string, unknown> {
  if (!fields) return {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isWorkflowField(key) || value === null || value === undefined || value === "") continue;
    data[key] = value;
  }
  return data;
}

function isTerminalLayerStatus(status: unknown): boolean {
  const normalized = normalizeLayerStatus(valueToText(status));
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized);
}

function isTerminalFormStatus(status: unknown): boolean {
  const normalized = valueToText(status).toLowerCase().replace(/[\s_-]/g, "");
  return normalized === "completed" || normalized === "rejected" || normalized === "cancelled" || normalized === "fullyapproved";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDateTime(value: unknown): string {
  const text = valueToText(value);
  if (!text) return "-";
  return formatDisplayDateTime(text, text);
}

function buildEvaluationSurveyJson(elements: Record<string, unknown>[], title: string): Record<string, unknown> {
  const mapped = buildSurveyJson(elements as unknown as FormBuilderField[], {
    title,
    titleLocation: "hidden",
    showQuestionNumbers: "off",
  }) as unknown as Record<string, unknown>;
  return {
    ...mapped,
    showNavigationButtons: false,
    showQuestionNumbers: "off",
    titleLocation: "hidden",
  };
}

function isCurrencyQuestion(question: Record<string, unknown>): boolean {
  const name = valueToText(question.name);
  const title = valueToText(question.title);
  const inputType = valueToText(question.inputType);
  const type = typeof question.getType === "function" ? valueToText((question.getType as () => unknown)()) : valueToText(question.type);
  const format = valueToText(question.displayFormat || question.format).toLowerCase();
  if (type === "currency" || question.currency || question.currencySymbol || format === "currency") return true;
  return inputType === "number" && /\b(cost|amount|price|fee|claim|expense|budget|total|subtotal)\b/i.test(`${name} ${title}`);
}

function currencySymbolFor(question: Record<string, unknown>): string {
  const explicit = valueToText(question.currencySymbol);
  if (explicit) return explicit;
  const named = valueToText(question.currency);
  return !named || named === "MYR" ? "RM" : named;
}

/**
 * Marks money questions with the symbol they should be typed against.
 *
 * The SurveyJS build did this after every render by reaching into the DOM and
 * inserting a span next to the input. The native engine draws a question's
 * `prefix` itself, so the same result comes from saying so in the document —
 * which also means the symbol survives re-renders instead of being re-applied
 * after each one. The `currencySymbol` case needs no help; it is only the
 * name-based guess ("claim amount", "total cost") that has to be written down.
 */
function withCurrencyPrefixes(elements: Record<string, unknown>[]): Record<string, unknown>[] {
  return elements.map((element) => {
    const next = { ...element };
    if (Array.isArray(next.elements)) {
      next.elements = withCurrencyPrefixes(next.elements as Record<string, unknown>[]);
    }
    if (!next.prefix && isCurrencyQuestion(next)) next.prefix = currencySymbolFor(next);
    return next;
  });
}

function surveyElementsForLayer(layerSequence: LayerConfigItem[], layerNumber: unknown): Record<string, unknown>[] {
  const layer = layerSequence.find((entry) => entry.layerNumber === Number(layerNumber));
  return layer?.type === "evaluation" ? (layer as EvaluationLayerConfig).surveyElements || [] : [];
}

/** Today, as the sign-off prints a date that has not been recorded yet. */
function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Component ──
export default function EvaluationPage() {
  const { token: routeToken, formSlug, responseId, layerNumber } = useParams<{
    token: string;
    formSlug: string;
    responseId: string;
    layerNumber: string;
  }>();
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [currentLayer, setCurrentLayer] = useState<LayerConfigItem | null>(null);
  const [layerSequence, setLayerSequence] = useState<LayerConfigItem[]>([]);
  const [totalLayers, setTotalLayers] = useState(0);
  const [previousResults, setPreviousResults] = useState<Record<string, unknown>[]>([]);
  const [formTitle, setFormTitle] = useState("");
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [currentLayerStatus, setCurrentLayerStatus] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [mediaSrcByField, setMediaSrcByField] = useState<Record<string, string | string[]>>({});
  const [logoUrl, setLogoUrl] = useState("");
  const [publicPreviousLayerSummaries, setPublicPreviousLayerSummaries] = useState<PublicPreviousLayerSummary[]>([]);
  /** The signed-in reviewer's directory name and post, read once their token is in hand. */
  const [viewerSignOff, setViewerSignOff] = useState<SignerIdentity | null>(null);

  /**
   * The evaluation questions this layer asks, as a native document.
   *
   * Null when the layer is a plain approval (nothing to fill in) or when its
   * question list is empty, which the confirm button reads as "not ready".
   */
  const evalForm = useMemo<NativeForm | null>(() => {
    if (currentLayer?.type !== "evaluation") return null;
    const elements = (currentLayer as EvaluationLayerConfig).surveyElements || [];
    if (elements.length === 0) return null;
    try {
      return parseForm(
        buildEvaluationSurveyJson(withCurrencyPrefixes(elements), currentLayer.title || "Evaluation"),
      );
    } catch {
      return null;
    }
  }, [currentLayer]);

  const placeholderForm = useMemo(() => parseForm(null), []);
  const evalRuntime = useNativeForm(evalForm ?? placeholderForm);

  // A plain approval layer asks nothing, so it is ready as soon as it loads.
  // An evaluation layer is ready once every required question has an answer —
  // the button says which of the two it is rather than failing on click.
  const evalValid = currentLayer?.type !== "evaluation"
    ? true
    : evalForm !== null && evalRuntime.answered >= evalRuntime.required;

  const [actionState, setActionState] = useState<ActionState>("idle");
  /** The step the signed decision was sent on to; empty when there is none to name. */
  const [nextStepName, setNextStepName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [checkboxApproved, setCheckboxApproved] = useState(false);
  const [matrixTables, setMatrixTables] = useState<Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }>>({});

  const isPublic = !!routeToken;
  const displayLayerNumber = isPublic
    ? 1  // Will be resolved from token
    : parseInt(layerNumber || "0", 10);

  // ── Auth ──
  useEffect(() => {
    if (isPublic) {
      // Public mode — no auth needed, but need SP token for potential writes
      setAuthState("authorized");
      setUserEmail("SYSTEM");
      return;
    }
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) {
      setAuthState("unauthorized");
      setLoading(false);
      return;
    }
    const email = accounts[0]?.username || null;
    setUserEmail(email);
    const origin = new URL(SP_SITE_URL).origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then((accessToken) => { setToken(accessToken); setAuthState("authorized"); })
      .catch(() => { setAuthState("error"); setError("Failed to acquire token."); });
  }, [isPublic, isAuthenticated, inProgress, instance, accounts]);

  // Who is about to sign, so the page can print their post under the line
  // before they press anything. Signed-in only: a public link has no account
  // to name. Read from the Approval Directory, the same row the decision will
  // be stamped from (see utils/layerSigner.ts).
  useEffect(() => {
    if (isPublic || !token || !userEmail) return;
    let cancelled = false;
    readSignerIdentity(token, userEmail).then((identity) => {
      if (!cancelled) setViewerSignOff(identity);
    });
    return () => { cancelled = true; };
  }, [isPublic, token, userEmail]);

  // ── Load data ──
  useEffect(() => {
    if (authState !== "authorized") return;
    if (isPublic) {
      // Public: fetch filtered data from API
      const loadPublic = async () => {
        try {
          const params = new URLSearchParams(window.location.search);
          const itemId = params.get("item");
          if (!itemId) { setError("Missing response item ID."); setLoading(false); return; }
          // `k` binds this link to one submission. Sent as given — including not
          // at all, which is how a link issued before bindings existed asks the
          // server to mail its reviewer a fresh one.
          const linkToken = params.get("k") || "";

          const res = await fetch(
            `/api/evaluate?token=${encodeURIComponent(routeToken || "")}&responseItemId=${itemId}`
            + (linkToken ? `&k=${encodeURIComponent(linkToken)}` : ""),
            {
              headers: {
                ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
              },
            },
          );
          const json = await res.json();
          if (!json.success) { setError(json.error || "Failed to load data."); setLoading(false); return; }

          setFormTitle(json.data.formTitle);
          setResponseData(json.data.fields);
          setCurrentLayer({
            layerNumber: json.data.layerNumber,
            type: json.data.layerType,
            authMode: "public" as const,
            assignee: { type: "user" as const, value: "" },
            title: json.data.layerTitle,
            description: json.data.layerDescription,
            surveyElements: Array.isArray(json.data.surveyElements) ? json.data.surveyElements : [],
            confirmationLabel: json.data.confirmationLabel,
            confirmationType: json.data.confirmationType,
          } as LayerConfigItem);
          setTotalLayers(Number(json.data.totalLayers) || 0);
          setSurveyJson(json.data.surveyJson || null);
          setLogoUrl(valueToText(json.data.logoUrl));
          setPublicPreviousLayerSummaries(Array.isArray(json.data.previousLayerSummaries) ? json.data.previousLayerSummaries as PublicPreviousLayerSummary[] : []);
          setMediaSrcByField(typeof json.data.mediaSrcByField === "object" && json.data.mediaSrcByField !== null ? json.data.mediaSrcByField : {});
          setCurrentLayerStatus(valueToText(json.data.layerStatus || json.data.fields?.[`L${json.data.layerNumber}_Status`]));
          setFormStatus(valueToText(json.data.formStatus || json.data.fields?.FormStatus));

          // Build previous results from the filtered fields
          const prev: Record<string, unknown>[] = [];
          let visibleEvaluationData: Record<string, EvaluationDataEntry> = {};
          if (typeof json.data.fields?.EvaluationData === "string") {
            try {
              visibleEvaluationData = JSON.parse(json.data.fields.EvaluationData) as Record<string, EvaluationDataEntry>;
            } catch {
              visibleEvaluationData = {};
            }
          }
          if (json.data.totalLayers > 0) {
            for (let n = 1; n < json.data.layerNumber; n++) {
              prev.push({
                layerNumber: n,
                status: json.data.fields[`L${n}_Status`] || null,
                email: json.data.fields[`L${n}_Email`] || null,
                actedBy: json.data.fields[`L${n}_ActedBy`] || null,
                actedByName: json.data.fields[`L${n}_ActedByName`] || null,
                actedByPosition: json.data.fields[`L${n}_ActedByPosition`] || null,
                signedAt: json.data.fields[`L${n}_SignedAt`] || null,
                evaluationData: visibleEvaluationData[String(n)],
              });
            }
          }
          setPreviousResults(prev);
          setLoading(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load evaluation data.");
          setLoading(false);
        }
      };
      loadPublic();
      return; // Skip the 365 load path
    }
    if (!formSlug || !responseId || !displayLayerNumber) {
      setError("Invalid URL parameters.");
      setLoading(false);
      return;
    }

    const load = async () => {
      if (!token) return;
      try {
        // Resolve formTitle from slug
        const slugData = await fetchWithAuthRecovery(`${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(formSlug)}'&$select=Title,LayerConfig&$top=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
        });
        const slugJson = await slugData.json();
        const resolvedTitle = slugJson.value?.[0]?.Title;
        if (!resolvedTitle) { setError("Form not found."); setLoading(false); return; }
        setFormTitle(resolvedTitle);

        const data = await getLayerResponseData(token, resolvedTitle, parseInt(responseId, 10), displayLayerNumber);
        if (!data) { setError("Could not load evaluation data."); setLoading(false); return; }
        // A layer naming several people is held by none of them until one acts,
        // so while L{n}_Email is blank any of them may open it.
        if (
          data.currentLayer?.authMode !== "public" &&
          !canActOnLayer(data.currentLayer, data.responseFields[`L${displayLayerNumber}_Email`], userEmail)
        ) {
          setError(NOT_ASSIGNED_MESSAGE);
          setLoading(false);
          return;
        }
        setResponseData(data.responseFields);
        setCurrentLayer(data.currentLayer || null);
        setLayerSequence(data.layerConfig);
        setTotalLayers(data.layerConfig.length || displayLayerNumber);
        setPreviousResults(data.previousResults);
        setCurrentLayerStatus(valueToText(data.responseFields[`L${displayLayerNumber}_Status`]));
        setFormStatus(valueToText(data.responseFields.FormStatus || data.responseFields.Status));

        // Load matrix child list data for dynamicmatrix fields
        const itemFormVersion = data.responseFields.FormVersion as string | undefined;
        if (itemFormVersion) {
          const versionData = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(resolvedTitle)}' and FormVersion eq '${encodeURIComponent(itemFormVersion)}'&$select=SurveyJSON&$top=1`
          ) as { value?: { SurveyJSON?: string }[] };
          const rawSurvey = versionData.value?.[0]?.SurveyJSON;
          if (rawSurvey) {
            const parsed = JSON.parse(rawSurvey) as Record<string, unknown>;
            setSurveyJson(parsed.surveyJson || parsed);
            const meta = isRecord(parsed.meta) ? parsed.meta : {};
            setLogoUrl(valueToText(meta.logoUrl));
          }
          loadMatrixChildData(token, resolvedTitle, parseInt(responseId, 10), itemFormVersion);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data.");
      }
      setLoading(false);
    };
    load();
  }, [authState, isPublic, formSlug, responseId, displayLayerNumber, token, userEmail]);

  const assertSignedInLayerCanSubmit = async (listTitle: string, respId: number, layer: number): Promise<void> => {
    if (!token) throw new Error("Missing SharePoint token.");
    const item = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${respId})?$select=Id,Status,FormStatus,CurrentLayer,CurrentApprovalLayer,L${layer}_Status`
    ) as Record<string, unknown>;
    const latestStatus = item[`L${layer}_Status`];
    const latestCurrentLayer = Number(item.CurrentLayer || item.CurrentApprovalLayer || 0);

    if (isTerminalFormStatus(item.FormStatus || item.Status) || isTerminalLayerStatus(latestStatus)) {
      throw new Error("This layer has already been completed. Refresh the submissions page to see the latest status.");
    }
    if (latestCurrentLayer && latestCurrentLayer !== layer) {
      throw new Error("This link is no longer active because the submission has moved to another layer.");
    }
  };

  // ── Submit action ──
  const handleSubmit = useCallback(async (action: "approve" | "reject" | "confirm") => {
    if (!userEmail) return;
    if (action === "confirm" && evalForm && !evalRuntime.validateAll().ok) return;
    setActionState("submitting");
    try {
      if (isPublic) {
        const params = new URLSearchParams(window.location.search);
        const itemId = Number(params.get("item"));
        // Acting is held to the same binding as looking, so the link's `k` is
        // handed back with the decision.
        const linkToken = params.get("k") || "";
        if (!routeToken || !itemId || !currentLayer) throw new Error("This evaluation link is missing required details.");
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
          },
          body: JSON.stringify({
            token: routeToken,
            formTitle,
            responseItemId: itemId,
            linkToken,
            layerNumber: currentLayer.layerNumber,
            action,
            fields: evalForm ? foldOtherAnswers(evalRuntime.collect()) : {},
            signature: signatureData || undefined,
            rejection: rejectionReason || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to submit this decision.");
        }
        setActionState("success");
        return;
      }

      if (!token) return;
      const listTitle = formTitle; // list is named after form title
      const respId = parseInt(responseId || "0", 10);
      await assertSignedInLayerCanSubmit(listTitle, respId, displayLayerNumber);
      const now = new Date().toISOString();
      const effectiveTotalLayers = totalLayers || displayLayerNumber;
      const sortedLayers = [...layerSequence].sort((a, b) => a.layerNumber - b.layerNumber);
      const currentLayerIndex = sortedLayers.findIndex((layer) => layer.layerNumber === displayLayerNumber);
      const nextLayer = currentLayerIndex >= 0
        ? sortedLayers[currentLayerIndex + 1]
        : sortedLayers.find((layer) => layer.layerNumber > displayLayerNumber);
      const isFinal = !nextLayer && displayLayerNumber >= effectiveTotalLayers;
      const nextLayerNumber = nextLayer?.layerNumber ?? displayLayerNumber + 1;
      const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${respId})`;
      // The name Azure gave the account, for a signer with no directory row.
      // An address handed back as the display name is not a name.
      const signerFallbackName = approverDisplayName(accounts[0]?.name, "");

      // Resolved before anything is written: a next layer nobody can open is a
      // broken workflow, and advancing into it strands the submission.
      // The next reviewer's link is bound to this submission, and the binding
      // is written before the link is built so the record can never be waiting
      // at a public layer that has no token for it.
      let nextLinkToken = "";
      if (!isFinal && String(nextLayer?.authMode || "") === "public" && String(nextLayer?.publicToken || "").trim()) {
        nextLinkToken = mintLinkToken();
        await spPatch(token, itemUrl, { [linkTokenField(nextLayerNumber)]: nextLinkToken });
      }
      const nextReviewLink = !isFinal && nextLayer
        ? buildLayerReviewLink({
            baseUrl: appBaseUrl(),
            layer: nextLayer,
            formSlug: formSlug || "",
            responseItemId: respId,
            linkToken: nextLinkToken,
          })
        : undefined;
      if (!isFinal && nextLayer && !nextReviewLink) {
        throw new Error(describeMissingReviewLink(nextLayer));
      }

      if (action === "reject") {
        const rejectedBy = claimLayerEmail(currentLayer ?? undefined, responseData?.[`L${displayLayerNumber}_Email`], userEmail);
        await spPatch(token, itemUrl, {
          ...buildRejectedWorkflowPatch(displayLayerNumber, effectiveTotalLayers, now, rejectionReason),
          // A rejection closes the layer too — record who turned it down.
          ...(rejectedBy ? { [`L${displayLayerNumber}_Email`]: rejectedBy } : {}),
        });
        // Rejections are signed too: who, and in which post.
        await stampLayerSigner(token, itemUrl, displayLayerNumber, userEmail, signerFallbackName);
        await loadPdfAndGenerate(token, listTitle, respId, formTitle, "rejected");
      } else if (action === "confirm" && currentLayer?.type === "evaluation") {
        await submitEvaluationData(token, listTitle, respId, displayLayerNumber, {
          confirmerEmail: userEmail,
          confirmerName: accounts[0]?.name ?? undefined,
          fields: evalForm ? foldOtherAnswers(evalRuntime.collect()) : {},
          signatureUrl: signatureData,
        });
        await updateLayerStatus(token, listTitle, respId, displayLayerNumber, {
          status: SP_LAYER_STATUS.CONFIRMED,
          signedAt: now,
          signature: signatureData || undefined,
          // Claims a shared layer for whoever actually reviewed it.
          email: claimLayerEmail(currentLayer ?? undefined, responseData?.[`L${displayLayerNumber}_Email`], userEmail),
        });
        await stampLayerSigner(token, itemUrl, displayLayerNumber, userEmail, signerFallbackName);
        await spPatch(token, itemUrl, {
          Status: isFinal ? "Completed" : "In Review",
          FormStatus: isFinal ? "Completed" : "In Review",
          CurrentLayer: isFinal ? displayLayerNumber : nextLayerNumber,
          CurrentApprovalLayer: isFinal ? displayLayerNumber : nextLayerNumber,
        });
        if (isFinal) {
          await loadPdfAndGenerate(token, listTitle, respId, formTitle, "completed");
        }
      } else if (action === "approve") {
        await updateLayerStatus(token, listTitle, respId, displayLayerNumber, {
          status: SP_LAYER_STATUS.APPROVED,
          signedAt: now,
          signature: signatureData || undefined,
          // Claims a shared layer for whoever actually approved it.
          email: claimLayerEmail(currentLayer ?? undefined, responseData?.[`L${displayLayerNumber}_Email`], userEmail),
        });
        // Stamped before the PDF below is drawn, so the record names its signer.
        await stampLayerSigner(token, itemUrl, displayLayerNumber, userEmail, signerFallbackName);
        await spPatch(token, itemUrl, {
          Status: isFinal ? "Approved" : `Approved Layer ${displayLayerNumber}`,
          FormStatus: isFinal ? "Completed" : "In Review",
          CurrentLayer: isFinal ? displayLayerNumber : nextLayerNumber,
          CurrentApprovalLayer: isFinal ? displayLayerNumber : nextLayerNumber,
        });
        if (isFinal) {
          await loadPdfAndGenerate(token, listTitle, respId, formTitle, "completed");
        }
      }

      // A shared next layer has no holder yet, so everyone named on it is told.
      const nextApproverEmail = !isFinal
        ? layerRecipients(nextLayer, responseData?.[`L${nextLayerNumber}_Email`])
        : [];
      await triggerApprovalNotification(token, {
        formTitle,
        submittedBy: valueToText(responseData?.SubmittedBy) || userEmail,
        responseItemId: respId,
        layer: displayLayerNumber,
        totalLayers: effectiveTotalLayers,
        action: action === "reject" ? "reject" : "approve",
        ...(nextApproverEmail.length > 0 ? { nextApproverEmail } : {}),
        ...(nextLayer?.type ? { nextLayerType: nextLayer.type } : {}),
        ...(nextLayer?.layerNumber ? { nextLayerNumber: nextLayer.layerNumber } : {}),
        ...(nextLayer?.authMode ? { nextLayerAuthMode: nextLayer.authMode } : {}),
        ...(nextLayer?.type === "evaluation" ? { nextEmailSchedule: nextLayer.emailSchedule } : {}),
        ...(nextReviewLink ? { reviewLink: nextReviewLink } : {}),
      });

      // Only a signed decision names where it went; a rejection just closes the layer.
      setNextStepName(action !== "reject" && !isFinal ? (nextLayer?.title || "").trim() : "");
      setActionState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit this decision.");
      setActionState("error");
    }
  }, [token, userEmail, evalForm, evalRuntime, isPublic, routeToken, currentLayer, formTitle, formSlug, signatureData, rejectionReason, responseId, displayLayerNumber, accounts, totalLayers, layerSequence, responseData]);

  /** Load matrix child list data for dynamicmatrix fields and enrich responseData */
  const loadMatrixChildData = async (
    tkn: string,
    resolvedTitle: string,
    respId: number,
    formVersion: string
  ) => {
    try {
      // Load the version's SurveyJSON to detect dynamicmatrix fields
      const versionData = await spGet(
        tkn,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(resolvedTitle)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
      ) as { value?: { SurveyJSON?: string }[] };

      const rawSurvey = versionData.value?.[0]?.SurveyJSON;
      if (!rawSurvey) return;

      const parsed = JSON.parse(rawSurvey);
      const surveyDef = parsed.surveyJson || parsed;
      const matrixFields = getDynamicMatrixFields(surveyDef);

      if (matrixFields.length === 0) return;

      const tables: Record<string, { columns: MatrixColumnDef[]; rows: Record<string, unknown>[]; html: string }> = {};
      for (const mf of matrixFields) {
        const safeName = mf.name.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
        const childListName = `${resolvedTitle} Matrix ${safeName}`;

        try {
          const rows = await readMatrixChildItems(tkn, childListName, respId);
          if (rows.length > 0) {
            const cols = mf.columns as MatrixColumnDef[];
            tables[mf.name] = {
              columns: cols,
              rows,
              html: rowsToHtml(mf.columns, rows),
            };
          }
        } catch {
          // Child list not found — skip this field
        }
      }

      setMatrixTables(tables);

      // Enrich responseData with matrix data in SurveyJS-compatible format
      if (Object.keys(tables).length > 0) {
        setResponseData((prev) => {
          if (!prev) return prev;
          const enriched = { ...prev };
          for (const [fieldName, entry] of Object.entries(tables)) {
            enriched[fieldName] = {
              rows: entry.rows,
              html: entry.html,
              json: JSON.stringify(entry.rows),
            };
          }
          return enriched;
        });
      }
    } catch {
      // Silently fail — matrix data is non-critical
    }
  };

  // ── Render ──
  if (authState === "checking" || loading) {
    return <LoadingScreen status="Fetching this submission and its workflow layer." />;
  }

  if (authState === "unauthorized") {
    return (
      <StateScreen
        tone="primary"
        icon={<LockIcon size={48} />}
        title="Sign in required"
        message="You need to sign in with your Microsoft 365 account to access this evaluation."
      >
        <Button
          variant="contained"
          onClick={() => instance.loginRedirect({ ...loginRequest })}
          sx={{ ...primaryPill, width: "100%" }}
        >
          Sign in with Microsoft 365
        </Button>
      </StateScreen>
    );
  }

  if (error) {
    if (error === NOT_ASSIGNED_MESSAGE) {
      return (
        <StateScreen tone="neutral" icon={<ShieldAlertIcon size={48} />} title="This layer isn't yours" message={error} />
      );
    }
    return (
      <StateScreen
        tone="warning"
        icon={<WarningIcon size={48} />}
        title={isPublic ? "This link can't be used" : "Something went wrong"}
        message={error}
      >
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ ...primaryPill, width: "100%" }}>
          Try again
        </Button>
      </StateScreen>
    );
  }

  if (actionState === "success") {
    return (
      <StateScreen
        tone="success"
        icon={<CheckCircleIcon size={52} />}
        title={nextStepName ? `Signed — sent to ${nextStepName}` : "Your decision is recorded"}
        message="Your response has been recorded. You may close this page."
      />
    );
  }

  const isEvaluation = currentLayer?.type === "evaluation";
  const isSignatureRequired = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "signature";
  const isCheckboxMode = currentLayer?.type === "approval" && (currentLayer as unknown as Record<string, unknown>).confirmationType === "checkbox";
  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const isLayerAlreadyComplete = isTerminalLayerStatus(currentLayerStatus) || isTerminalFormStatus(formStatus);
  const currentLayerLabel = currentLayerStatus || (isLayerAlreadyComplete ? "Completed" : "Pending");
  const effectiveLayerNumber = currentLayer?.layerNumber || displayLayerNumber;
  // Who is signing, the way the foot of a paper form reads: what they are doing,
  // their name, their post. The directory name wins over Azure's display name,
  // so the page prints what the record will be stamped with; the post falls
  // back to the layer title. A public link has no signed-in account to name.
  const signedInApprover = isPublic ? "" : approverDisplayName(accounts[0]?.name, userEmail);
  const approverRoleLabel = currentLayer?.title || `Layer ${effectiveLayerNumber}`;
  const signerName = isPublic ? "" : viewerSignOff?.name || signedInApprover;
  const signerPosition = signOffPosition(viewerSignOff?.position, approverRoleLabel);
  const pendingVerdict = signOffVerdictForLayer(currentLayer?.type);
  // A short description doubles as the caption above the name ("Endorsed By");
  // a long one is subtitle material and would read as a sentence there.
  const layerDescription = currentLayer?.description?.trim() || "";
  const customSignOffLabel = layerDescription.length > 0 && layerDescription.length <= 30 ? layerDescription : undefined;
  // Once decided, the sign-off already on the record — for a link opened later.
  const recordedVerdict = signOffVerdictFromStatus(currentLayerStatus);
  const recordedSignerName = responseData
    ? signOffName(
      responseData[`L${effectiveLayerNumber}_ActedByName`],
      responseData[`L${effectiveLayerNumber}_ActedBy`] || responseData[`L${effectiveLayerNumber}_Email`],
    )
    : "";
  const referenceNo = responseData && responseData[REFERENCE_NO_FIELD] ? String(responseData[REFERENCE_NO_FIELD]) : "";
  const layerStateTone: StateTone = isLayerAlreadyComplete
    ? (recordedVerdict === "rejected" ? "danger" : "success")
    : "primary";
  const metaTiles: { label: string; value: string }[] = [
    { label: "Form ID", value: String(responseData?.FormID || responseData?.formId || "—") },
    ...(selectedCompany ? [{ label: "Company", value: selectedCompany }] : []),
    { label: "Submitted", value: formatDateTime(responseData?.SubmittedAt) },
    { label: "Version", value: String(responseData?.FormVersion || responseData?.formVersion || "—") },
  ];

  return (
    <div
      className="eval-page"
      style={{
        minHeight: "100dvh",
        background: COLORS.ground,
        padding: "clamp(12px, 3vw, 28px) 16px",
        boxSizing: "border-box",
        fontFamily: AUTH_FONT,
        color: COLORS.textPrimary,
      }}
    >
      <style>{`
        .eval-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .eval-page h1, .eval-page h2, .eval-page h3 { text-wrap: balance; }
        .eval-page p, .eval-page li, .eval-page span { text-wrap: pretty; }
        .eval-page button:focus-visible, .eval-page input:focus-visible, .eval-page textarea:focus-visible {
          outline: 3px solid ${authSoft.focus}; outline-offset: 2px;
        }
        @media (max-width: 640px) {
          .eval-meta-grid { grid-template-columns: 1fr !important; }
          .eval-sheet { padding: 22px 18px !important; border-radius: 28px !important; }
        }
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div
          className="eval-sheet"
          style={{
            background: COLORS.sheet,
            borderRadius: 32,
            padding: "clamp(22px, 4vw, 36px)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          {/* Header */}
          <header style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: COLORS.tile,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" style={{ width: 40, height: 40, objectFit: "contain" }} />
              ) : (
                <Logo size={40} alt="PMW Logo" />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecond }}>
                {isEvaluation ? "Evaluation review" : "Approval review"}
              </div>
              <h1
                style={{
                  fontSize: "clamp(26px, 3.4vw, 30px)",
                  lineHeight: 1.15,
                  fontWeight: 800,
                  color: COLORS.textPrimary,
                  margin: "4px 0 0",
                  overflowWrap: "anywhere",
                }}
              >
                {formTitle || currentLayer?.title || (isEvaluation ? "Evaluation" : "Approval")}
              </h1>
              <div style={{ fontSize: 14, color: COLORS.textSecond, marginTop: 6 }}>
                {currentLayer?.title ? `${currentLayer.title} · ` : ""}Layer {effectiveLayerNumber}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12 }}>
                {referenceNo && <span style={referencePill}>{referenceNo}</span>}
                <span style={statusPillStyle(isLayerAlreadyComplete ? "success" : "primary")}>{currentLayerLabel}</span>
              </div>
            </div>
          </header>

          {currentLayer?.description && (
            <div style={{ fontSize: 15, lineHeight: 1.55, color: COLORS.textSecond, marginTop: -12 }}>
              {currentLayer.description}
            </div>
          )}

          {/* Previous layers: the approval journey as joined round steps */}
          {previousResults.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 style={sectionHeading}>Previous layers</h2>
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {previousResults.map((pr, i) => {
                  const evalData = pr.evaluationData as EvaluationDataEntry | undefined;
                  const previousLayerNumber = Number(pr.layerNumber);
                  const publicSummary = publicPreviousLayerSummaries.find((summary) => Number(summary.layerNumber) === previousLayerNumber);
                  const previousSurveyElements = publicSummary?.surveyElements || surveyElementsForLayer(layerSequence, previousLayerNumber);
                  const previousTitle = publicSummary?.title || valueToText(pr.title) || `Layer ${previousLayerNumber}`;
                  const previousVerdict = signOffVerdictFromStatus(pr.status);
                  const previousSignerName = signOffName(
                    pr.actedByName || evalData?.confirmerName,
                    pr.actedBy || evalData?.confirmerEmail || pr.email,
                  );
                  const previousSignOff = previousVerdict && previousSignerName ? (
                    <div style={{ marginTop: 12 }}>
                      <SignOffBlock
                        compact
                        align="start"
                        verdict={previousVerdict}
                        label={signOffLabel(previousVerdict)}
                        name={previousSignerName}
                        position={signOffPosition(pr.actedByPosition, previousTitle)}
                        date={formatDateTime(pr.signedAt || evalData?.confirmedAt)}
                      />
                    </div>
                  ) : null;
                  const kind: JourneyKind = previousVerdict === "rejected"
                    ? "rejected"
                    : (previousVerdict || isTerminalLayerStatus(pr.status))
                      ? "done"
                      : "pending";
                  return (
                    <li
                      key={i}
                      style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: 14, paddingBottom: 18 }}
                    >
                      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            top: 46,
                            bottom: -18,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 4,
                            borderRadius: 999,
                            background: kind === "done" ? COLORS.green : COLORS.line,
                          }}
                        />
                        <JourneyNode kind={kind} layerNumber={previousLayerNumber} />
                      </div>
                      <div style={{ minWidth: 0, paddingTop: 8 }}>
                        {evalData?.status === "confirmed" ? (
                          <EvaluationSummary
                            result={{
                              layerNumber: previousLayerNumber,
                              type: "evaluation",
                              status: "confirmed",
                              email: evalData.confirmerEmail || null,
                              confirmedAt: evalData.confirmedAt || null,
                              fields: evalData.fields || {},
                              notes: evalData.notes,
                            }}
                            layerTitle={previousTitle}
                            layerDescription={publicSummary?.description}
                            surveyElements={previousSurveyElements}
                            footer={previousSignOff}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>{previousTitle}</div>
                            <div style={{ fontSize: 14, color: COLORS.textSecond, marginTop: 2 }}>
                              {String(pr.status || "Completed")}
                              {pr.signedAt && !previousSignOff ? ` · ${formatDateTime(pr.signedAt)}` : ""}
                            </div>
                            {previousSignOff}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
                <li style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: 14 }}>
                  <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                    <JourneyNode kind="current" layerNumber={effectiveLayerNumber} />
                  </div>
                  <div style={{ minWidth: 0, paddingTop: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
                      {currentLayer?.title || `Layer ${effectiveLayerNumber}`}
                    </div>
                    <div style={{ fontSize: 14, color: COLORS.textSecond, marginTop: 2 }}>
                      {isLayerAlreadyComplete ? currentLayerLabel : "Waiting for your decision"}
                    </div>
                  </div>
                </li>
              </ol>
            </section>
          )}

          {/* Submission details: soft tiles, no bordered tables */}
          {responseData && (
            <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <h2 style={sectionHeading}>Submission details</h2>
                <div style={{ fontSize: 14, color: COLORS.textSecond, marginTop: 4 }}>
                  Review the submitted data before completing this layer.
                </div>
              </div>
              <div
                className="eval-meta-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, fontVariantNumeric: "tabular-nums" }}
              >
                {metaTiles.map((tile) => (
                  <div key={tile.label} style={tileStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecond }}>{tile.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary, marginTop: 2, overflowWrap: "anywhere" }}>
                      {tile.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: COLORS.tile, borderRadius: 24, padding: 18 }}>
                <ReadOnlySubmissionPreview
                  surveyJson={surveyJson}
                  data={getSubmissionPreviewData(responseData)}
                  accessToken={token}
                  mediaSrcByField={mediaSrcByField}
                  fallbackData={getSubmissionPreviewData(responseData)}
                />
              </div>

              {/* Matrix tables — from child lists */}
              {!surveyJson && Object.keys(matrixTables).length > 0 && (
                <div style={{ background: COLORS.tile, borderRadius: 24, padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.primaryInk }}>Matrix tables</div>
                  {Object.entries(matrixTables).map(([fieldName, entry]) => (
                    <div key={fieldName} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecond }}>
                        {entry.columns[0]?.title || fieldName}
                      </div>
                      <div
                        style={{ overflow: "auto", background: COLORS.sheet, borderRadius: 16, padding: 4 }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                      />
                      <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                        {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Decision */}
          <section style={{ background: COLORS.tile, borderRadius: 24, padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
            <h2 style={sectionHeading}>{isEvaluation ? "Your evaluation" : "Your decision"}</h2>

            {isLayerAlreadyComplete ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
                <div
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: STATE_TONES[layerStateTone].bg,
                    color: STATE_TONES[layerStateTone].fg,
                  }}
                >
                  {layerStateTone === "danger" ? <CloseIcon size={48} /> : layerStateTone === "success" ? <CheckIcon size={48} /> : <LockIcon size={48} />}
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: COLORS.textPrimary }}>
                  This layer is already completed
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.55, color: COLORS.textSecond, maxWidth: 420 }}>
                  The submission cannot be approved, rejected, or evaluated again from this link.
                </div>
                {recordedVerdict && recordedSignerName && responseData && (
                  <div style={{ width: "100%", background: COLORS.sheet, borderRadius: 18, padding: 18, boxSizing: "border-box" }}>
                    <SignOffBlock
                      verdict={recordedVerdict}
                      label={signOffLabel(recordedVerdict, customSignOffLabel)}
                      name={recordedSignerName}
                      position={signOffPosition(responseData[`L${effectiveLayerNumber}_ActedByPosition`], approverRoleLabel)}
                      date={formatDateTime(responseData[`L${effectiveLayerNumber}_SignedAt`])}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                {isEvaluation && (
                  evalForm ? (
                    <NativeFormView runtime={evalRuntime} />
                  ) : (
                    <div style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.redInk, background: COLORS.redPale, borderRadius: 16, padding: 14 }}>
                      This evaluation layer has no configured fields. Ask a form builder superuser to update the layer configuration.
                    </div>
                  )
                )}

                {isSignatureRequired && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecond }}>Signature</div>
                    <div style={{ background: COLORS.sheet, border: `2px dashed ${COLORS.dashed}`, borderRadius: 18, padding: 12, boxSizing: "border-box" }}>
                      <SignatureCapture value={signatureData} onChange={setSignatureData} disabled={actionState === "submitting"} />
                    </div>
                  </div>
                )}

                {isCheckboxMode && (
                  <FormControlLabel
                    sx={{ minHeight: 44, m: 0 }}
                    control={
                      <Checkbox checked={checkboxApproved} onChange={(e) => setCheckboxApproved(e.target.checked)} />
                    }
                    label={<Typography sx={{ fontSize: 15 }}>I approve this submission</Typography>}
                  />
                )}

                {/* Rejection reason (always available for approval layers) */}
                {!isEvaluation && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label htmlFor="eval-rejection-reason" style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecond }}>
                      Rejection reason (optional)
                    </label>
                    <TextField
                      id="eval-rejection-reason"
                      fullWidth
                      multiline
                      minRows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Enter reason if rejecting..."
                      sx={{
                        "& .MuiOutlinedInput-root": { backgroundColor: COLORS.sheet, borderRadius: "16px", fontSize: 15 },
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
                      }}
                    />
                  </div>
                )}

                {/* Who is signing, the way the foot of a paper form reads. A
                    rejection goes on record under the same name and post, as
                    "Rejected By". */}
                {signerName && (
                  <div style={{ background: COLORS.sheet, borderRadius: 18, padding: 18, boxSizing: "border-box" }}>
                    <SignOffBlock
                      verdict={pendingVerdict}
                      label={signOffLabel(pendingVerdict, customSignOffLabel)}
                      name={signerName}
                      position={signerPosition}
                      date={todayLabel()}
                      signature={isSignatureRequired ? signatureData : null}
                    />
                  </div>
                )}

                {/* Action pills */}
                <Stack direction="row" spacing={1.25} sx={{ flexWrap: "wrap", rowGap: 1.25 }}>
                  {isEvaluation ? (
                    <Button
                      variant="contained"
                      onClick={() => handleSubmit("confirm")}
                      disabled={actionState === "submitting" || !evalForm || !evalValid}
                      sx={primaryPill}
                    >
                      {actionState === "submitting" ? "Submitting..." : !evalValid ? "Fill required fields" : "Submit evaluation"}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="contained"
                        onClick={() => handleSubmit("approve")}
                        disabled={
                          actionState === "submitting" ||
                          (isCheckboxMode && !checkboxApproved) ||
                          (isSignatureRequired && !signatureData)
                        }
                        sx={primaryPill}
                      >
                        {actionState === "submitting"
                          ? "Submitting..."
                          : isSignatureRequired && !signatureData
                            ? "Signature required"
                            : "Approve"}
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => handleSubmit("reject")}
                        disabled={actionState === "submitting"}
                        sx={dangerPill}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </Stack>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
