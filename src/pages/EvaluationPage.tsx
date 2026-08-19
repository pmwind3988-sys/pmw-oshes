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
import LockIcon from "@mui/icons-material/Lock";
import WarningIcon from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { editorial, editorialShadow } from "../theme/editorial";
import { WorkspaceNotice } from "../components/builder/WorkspaceLayout";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { canActOnLayer, claimLayerEmail, layerRecipients } from "../utils/layerAssignees";
import { formatDisplayDateTime } from "../utils/displayDateTime";
import { REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { COMPANY } from "../config/company";

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
// Drawn from the shared PMW Editorial tokens rather than a private palette, so
// this page cannot drift from the approval workspace it hands off to. This
// route is reached from an email link and is often the only screen an approver
// ever sees, so it stands alone — no sidebar — but wears the same system.
const COLORS = {
  purple: editorial.pmwBlue,
  purpleDark: editorial.pmwBlueDark,
  purplePale: editorial.blueWash,
  cardBg: editorial.panel,
  border: editorial.border,
  textPrimary: editorial.ink,
  textSecond: editorial.muted,
  textMuted: editorial.softMuted,
  green: editorial.success,
  greenPale: "rgba(16, 124, 16, 0.10)",
  red: editorial.error,
  redPale: "rgba(198, 40, 40, 0.10)",
  shadow: editorialShadow,
};

/**
 * The reference number, styled to match `src/components/ReferenceTag.tsx`. This
 * page renders with plain inline styles rather than MUI, so the treatment is
 * repeated here instead of imported — keep the two in step.
 */
const referenceTag: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 8,
  background: editorial.blueWash,
  border: `1px solid ${editorial.pmwBlueSoft}`,
  color: editorial.pmwBlueDark,
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.02em",
  fontVariantNumeric: "tabular-nums",
  userSelect: "all",
};

const sectionCard: React.CSSProperties = {
  background: COLORS.cardBg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
  padding: 24,
  marginBottom: 20,
  boxShadow: COLORS.shadow,
};

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

          const res = await fetch(`/api/evaluate?token=${encodeURIComponent(routeToken || "")}&responseItemId=${itemId}`, {
            headers: {
              ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
            },
          });
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
          setError("This approval layer is not assigned to your account.");
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

      // Resolved before anything is written: a next layer nobody can open is a
      // broken workflow, and advancing into it strands the submission.
      const nextReviewLink = !isFinal && nextLayer
        ? buildLayerReviewLink({
            baseUrl: appBaseUrl(),
            layer: nextLayer,
            formSlug: formSlug || "",
            responseItemId: respId,
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
    return <WorkspaceNotice title="Loading..." message="Fetching this submission and its workflow layer." />;
  }

  if (authState === "unauthorized") {
    return (
      <WorkspaceNotice
        icon={<LockIcon sx={{ fontSize: 28 }} />}
        title="Sign in required"
        message="You need to sign in with your Microsoft 365 account to access this evaluation."
        action={
          <Button variant="contained" size="large" onClick={() => instance.loginRedirect({ ...loginRequest })}>
            Sign in with Microsoft 365
          </Button>
        }
      />
    );
  }

  if (error) {
    return (
      <WorkspaceNotice tone="error" icon={<WarningIcon sx={{ fontSize: 28 }} />} title="Error" message={error} />
    );
  }

  if (actionState === "success") {
    return (
      <WorkspaceNotice
        icon={<CheckCircleIcon sx={{ fontSize: 28, color: editorial.success }} />}
        title="Submitted successfully"
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

  return (
    <div className="eval-page" style={{ minHeight: "100dvh", padding: "clamp(16px, 3vw, 32px) 16px" }}>
      <style>{`
        .eval-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .eval-page h1, .eval-page h2, .eval-page h3 { text-wrap: balance; }
        .eval-page p, .eval-page li, .eval-page span { text-wrap: pretty; }
        @media (max-width: 640px) {
          .eval-meta-grid { grid-template-columns: 1fr !important; }
          .eval-header { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div className="eval-header" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 18, alignItems: "center", background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20, boxShadow: COLORS.shadow }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: COLORS.purplePale, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" style={{ maxWidth: 54, maxHeight: 54, objectFit: "contain", outline: "1px solid rgba(0, 0, 0, 0.1)", outlineOffset: -1 }} />
            ) : (
              <Logo size={54} alt="PMW Logo" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.purpleDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {isEvaluation ? "Evaluation Review" : "Approval Review"}
            </div>
            <h1 style={{ fontSize: "clamp(22px, 3vw, 32px)", lineHeight: 1.15, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
              {currentLayer?.title || formTitle || (isEvaluation ? "Evaluation" : "Approval")}
            </h1>
            <div style={{ fontSize: 13, color: COLORS.textSecond, marginTop: 8 }}>
              {formTitle || "Form"} / Layer {effectiveLayerNumber}
              {currentLayer?.description && <div style={{ marginTop: 4 }}>{currentLayer.description}</div>}
            </div>
          </div>
          <span style={{
            justifySelf: "start",
            fontSize: 12,
            fontWeight: 800,
            padding: "7px 12px",
            borderRadius: 999,
            color: isLayerAlreadyComplete ? COLORS.green : COLORS.purpleDark,
            background: isLayerAlreadyComplete ? COLORS.greenPale : COLORS.purplePale,
            fontVariantNumeric: "tabular-nums",
          }}>
            {currentLayerLabel}
          </span>
        </div>

        {/* Previous Layer Results */}
        {previousResults.length > 0 && (
          <div style={sectionCard}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecond, textTransform: "uppercase", letterSpacing: 0, marginBottom: 12 }}>
              Previous Layers
            </div>
            {previousResults.map((pr, i) => {
              const evalData = pr.evaluationData as EvaluationDataEntry | undefined;
              const previousLayerNumber = Number(pr.layerNumber);
              const publicSummary = publicPreviousLayerSummaries.find((summary) => Number(summary.layerNumber) === previousLayerNumber);
              const previousSurveyElements = publicSummary?.surveyElements || surveyElementsForLayer(layerSequence, previousLayerNumber);
              if (evalData?.status === "confirmed") {
                return (
                  <EvaluationSummary
                    key={i}
                    result={{
                      layerNumber: previousLayerNumber,
                      type: "evaluation",
                      status: "confirmed",
                      email: evalData.confirmerEmail || null,
                      confirmedAt: evalData.confirmedAt || null,
                      fields: evalData.fields || {},
                      notes: evalData.notes,
                    }}
                    layerTitle={publicSummary?.title || `Layer ${previousLayerNumber}`}
                    layerDescription={publicSummary?.description}
                    surveyElements={previousSurveyElements}
                  />
                );
              }
              return (
                <div key={i} style={{ background: COLORS.purplePale, borderRadius: 8, padding: "12px 16px", marginBottom: 10, fontSize: 13, color: COLORS.textPrimary }}>
                  Layer {previousLayerNumber}: <strong>{String(pr.status || "Completed")}</strong>
                  {pr.signedAt ? <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>- {formatDateTime(pr.signedAt)}</span> : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Submission Data Preview */}
        {responseData && (
          <div style={sectionCard}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
                  Submission Details
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecond }}>
                  Review the submitted data before completing this layer.
                </div>
              </div>
            </div>
            {!!responseData[REFERENCE_NO_FIELD] && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: COLORS.textSecond }}>
                  Reference no.
                </span>
                <span style={referenceTag}>{String(responseData[REFERENCE_NO_FIELD])}</span>
              </div>
            )}
            <div className="eval-meta-grid" style={{ fontSize: 13, color: COLORS.textSecond, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
              <div>Form ID: {String(responseData.FormID || responseData.formId || "—")}</div>
              {selectedCompany && <div>Company: {selectedCompany}</div>}
              <div>Submitted: {formatDateTime(responseData.SubmittedAt)}</div>
              <div>Version: {String(responseData.FormVersion || responseData.formVersion || "—")}</div>
            </div>

            <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
              <ReadOnlySubmissionPreview
                surveyJson={surveyJson}
                data={getSubmissionPreviewData(responseData)}
                accessToken={token}
                mediaSrcByField={mediaSrcByField}
                fallbackData={getSubmissionPreviewData(responseData)}
              />
            </div>

            {/* Matrix Tables — from child lists */}
            {!surveyJson && Object.keys(matrixTables).length > 0 && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.purple, marginBottom: 12 }}>
                  Matrix Tables
                </div>
                {Object.entries(matrixTables).map(([fieldName, entry]) => (
                  <div key={fieldName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>
                      {entry.columns[0]?.title || fieldName}
                    </div>
                    <div
                      style={{ overflow: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.html) }}
                    />
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                      {entry.rows.length} row{entry.rows.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Layer Action */}
        <div style={sectionCard}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
            {isEvaluation ? "Your Evaluation" : "Your Decision"}
          </div>

          {isLayerAlreadyComplete ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", p: 1.75, borderRadius: "10px", backgroundColor: COLORS.greenPale }}>
              <LockIcon sx={{ fontSize: 20, color: COLORS.green, mt: "1px" }} />
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 800 }}>This layer is already completed</Typography>
                <Typography sx={{ fontSize: 13, color: COLORS.textSecond, mt: 0.25 }}>
                  The submission cannot be approved, rejected, or evaluated again from this link.
                </Typography>
              </Box>
            </Stack>
          ) : (
            <>
              {isEvaluation && (
                <div style={{ marginBottom: 16 }}>
                  {evalForm ? (
                    <NativeFormView runtime={evalRuntime} />
                  ) : (
                    <div style={{ fontSize: 13, color: COLORS.red, background: COLORS.redPale, borderRadius: 8, padding: 12 }}>
                      This evaluation layer has no configured fields. Ask a form builder superuser to update the layer configuration.
                    </div>
                  )}
                </div>
              )}

              {isSignatureRequired && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
                    Signature
                  </div>
                  <SignatureCapture value={signatureData} onChange={setSignatureData} disabled={actionState === "submitting"} />
                </div>
              )}

              {isCheckboxMode && (
                <FormControlLabel
                  sx={{ mb: 2, minHeight: 44 }}
                  control={
                    <Checkbox checked={checkboxApproved} onChange={(e) => setCheckboxApproved(e.target.checked)} />
                  }
                  label={<Typography sx={{ fontSize: 14 }}>I approve this submission</Typography>}
                />
              )}

              {/* Rejection reason (always available for approval layers) */}
              {!isEvaluation && (
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Rejection reason (optional)"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason if rejecting..."
                  sx={{ mb: 2 }}
                />
              )}

              {/* Action buttons */}
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
                {isEvaluation ? (
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => handleSubmit("confirm")}
                    disabled={actionState === "submitting" || !evalForm || !evalValid}
                    sx={{ minHeight: 44 }}
                  >
                    {actionState === "submitting" ? "Submitting..." : !evalValid ? "Fill required fields" : "Submit evaluation"}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => handleSubmit("approve")}
                      disabled={
                        actionState === "submitting" ||
                        (isCheckboxMode && !checkboxApproved) ||
                        (isSignatureRequired && !signatureData)
                      }
                      sx={{ minHeight: 44 }}
                    >
                      {actionState === "submitting"
                        ? "Submitting..."
                        : isSignatureRequired && !signatureData
                          ? "Signature required"
                          : "Approve"}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="large"
                      onClick={() => handleSubmit("reject")}
                      disabled={actionState === "submitting"}
                      sx={{ minHeight: 44 }}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </Stack>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
