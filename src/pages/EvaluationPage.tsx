/**
 * EvaluationPage.tsx — Layer evaluation/approval interface.
 * Route: /eval/:token (public) or /eval/:formSlug/:responseId/:layerNumber (365)
 */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { getLayerResponseData, updateLayerStatus, submitEvaluationData, getFormConfigByTitle, spGet, spPatch, readMatrixChildItems, triggerApprovalNotification } from "../utils/formBuilderSP";
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
import { rowsToHtml, getDynamicMatrixFields } from "../utils/DynamicMatrix";
import { registerSignaturePad, SignatureCapture } from "../utils/SignaturePad";
import { getSelectedCompany } from "../utils/companySelection";
import ReadOnlySubmissionPreview from "../components/builder/ReadOnlySubmissionPreview";
import Logo from "../components/Logo";
import LockIcon from "@mui/icons-material/Lock";
import WarningIcon from "@mui/icons-material/Warning";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";
registerSignaturePad();

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
      'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
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
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
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
const COLORS = {
  purple: "#0078D4", purpleLight: "#106EBE", purplePale: "#EAF5FC",
  bg: "linear-gradient(180deg, #EEF6FC 0%, #F7FAFD 48%, #F7F8FA 100%)", cardBg: "#FFFFFF", border: "#D6DCE5",
  textPrimary: "#101010", textSecond: "#5F646D", textMuted: "#747B86",
  green: "#107C10", greenPale: "#E3F1E3",
  red: "#C62828", redPale: "#F8E4E4",
  shadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 8px 20px rgba(26, 31, 43, 0.06)",
  shadowHover: "0 0 0 1px rgba(0, 120, 212, 0.18), 0 2px 4px -1px rgba(0, 120, 212, 0.12), 0 10px 24px rgba(26, 31, 43, 0.08)",
};

const sectionCard: React.CSSProperties = {
  background: COLORS.cardBg,
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
  boxShadow: COLORS.shadow,
};

const btnPrimary: React.CSSProperties = {
  padding: "12px 32px",
  minHeight: 44,
  borderRadius: 8,
  border: "none",
  background: COLORS.purple,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Segoe UI', system-ui, sans-serif",
};

const btnOutline: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  border: `1px solid ${COLORS.red}`,
  color: COLORS.red,
};

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

const SYSTEM_FIELDS = new Set([
  "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
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
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
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

function addCurrencyAdornment(host: HTMLElement, question: Record<string, unknown>): void {
  if (host.querySelector(".eval-currency-prefix")) return;
  const input = host.querySelector<HTMLInputElement>("input[type='number'], input");
  const inputWrap = input?.parentElement;
  if (!input || !inputWrap) return;
  const symbol = valueToText(question.currencySymbol) || (valueToText(question.currency) === "MYR" || !question.currency ? "RM" : valueToText(question.currency));
  inputWrap.style.position = "relative";
  input.style.paddingLeft = "48px";
  const prefix = document.createElement("span");
  prefix.className = "eval-currency-prefix";
  prefix.textContent = symbol;
  inputWrap.insertBefore(prefix, input);
}

function decorateEvaluationModel(model: Model): void {
  model.onAfterRenderQuestion.add((_sender, options) => {
    const question = options.question as unknown as Record<string, unknown> | undefined;
    const host = options.htmlElement as HTMLElement | undefined;
    if (!question || !host || !isCurrencyQuestion(question)) return;
    addCurrencyAdornment(host, question);
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
  const [evalSurveyModel, setEvalSurveyModel] = useState<Model | null>(null);
  const [evalValid, setEvalValid] = useState(true);
  const [currentLayerStatus, setCurrentLayerStatus] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [mediaSrcByField, setMediaSrcByField] = useState<Record<string, string | string[]>>({});
  const [logoUrl, setLogoUrl] = useState("");
  const [publicPreviousLayerSummaries, setPublicPreviousLayerSummaries] = useState<PublicPreviousLayerSummary[]>([]);

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
        const assignedEmail = String(data.responseFields[`L${displayLayerNumber}_Email`] || "").trim().toLowerCase();
        const signedInEmail = (userEmail || "").trim().toLowerCase();
        if (data.currentLayer?.authMode !== "public" && (!assignedEmail || assignedEmail !== signedInEmail)) {
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
    if (action === "confirm" && evalSurveyModel) {
      const valid = evalSurveyModel.validate();
      if (!valid) {
        setEvalValid(false);
        return;
      }
    }
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
            fields: evalSurveyModel ? evalSurveyModel.data : {},
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

      if (action === "reject") {
        await spPatch(token, itemUrl, buildRejectedWorkflowPatch(displayLayerNumber, effectiveTotalLayers, now, rejectionReason));
        await loadPdfAndGenerate(token, listTitle, respId, formTitle, "rejected");
      } else if (action === "confirm" && currentLayer?.type === "evaluation") {
        await submitEvaluationData(token, listTitle, respId, displayLayerNumber, {
          confirmerEmail: userEmail,
          confirmerName: accounts[0]?.name ?? undefined,
          fields: evalSurveyModel ? evalSurveyModel.data as Record<string, unknown> : {},
          signatureUrl: signatureData,
        });
        await updateLayerStatus(token, listTitle, respId, displayLayerNumber, {
          status: SP_LAYER_STATUS.CONFIRMED,
          signedAt: now,
          signature: signatureData || undefined,
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

      const nextApproverEmail = !isFinal ? valueToText(responseData?.[`L${nextLayerNumber}_Email`]) : "";
      await triggerApprovalNotification(token, {
        formTitle,
        submittedBy: valueToText(responseData?.SubmittedBy) || userEmail,
        responseItemId: respId,
        layer: displayLayerNumber,
        totalLayers: effectiveTotalLayers,
        action: action === "reject" ? "reject" : "approve",
        ...(nextApproverEmail ? { nextApproverEmail } : {}),
        ...(nextLayer?.type ? { nextLayerType: nextLayer.type } : {}),
        ...(nextLayer?.layerNumber ? { nextLayerNumber: nextLayer.layerNumber } : {}),
        ...(nextLayer?.type === "evaluation" ? { nextEmailSchedule: nextLayer.emailSchedule } : {}),
      });

      setActionState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit this decision.");
      setActionState("error");
    }
  }, [token, userEmail, evalSurveyModel, isPublic, routeToken, currentLayer, formTitle, signatureData, rejectionReason, responseId, displayLayerNumber, accounts, totalLayers, layerSequence, responseData]);

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

  useEffect(() => {
    if (currentLayer?.type !== "evaluation") {
      setEvalSurveyModel((prev) => { prev?.dispose(); return null; });
      setEvalValid(true);
      return;
    }

    const elements = (currentLayer as EvaluationLayerConfig).surveyElements || [];
    if (elements.length === 0) {
      setEvalSurveyModel((prev) => { prev?.dispose(); return null; });
      setEvalValid(false);
      return;
    }

    try {
      const model = new Model(buildEvaluationSurveyJson(elements, currentLayer.title || "Evaluation"));
      model.applyTheme(FlatLightPanelless);
      decorateEvaluationModel(model);
      const checkValid = () => { setEvalValid(!model.hasErrors()); };
      model.onValueChanged.add(checkValid);
      window.setTimeout(checkValid, 0);
      setEvalSurveyModel((prev) => { prev?.dispose(); return model; });
      return () => { model.dispose(); };
    } catch {
      setEvalSurveyModel((prev) => { prev?.dispose(); return null; });
      setEvalValid(false);
    }
  }, [currentLayer]);

  // ── Render ──
  if (authState === "checking" || loading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: COLORS.textMuted, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", border: `1px solid ${COLORS.border}`, boxShadow: COLORS.shadow }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><LockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <p style={{ color: COLORS.textSecond, fontSize: 13, marginBottom: 24 }}>You need to sign in with your Microsoft 365 account to access this evaluation.</p>
          <button onClick={() => instance.loginRedirect({ ...loginRequest })} style={btnPrimary}>Sign in with Microsoft 365</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, textAlign: "center", border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><WarningIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.red, marginBottom: 8 }}>Error</div>
          <p style={{ color: COLORS.textSecond, fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (actionState === "success") {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: COLORS.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, textAlign: "center", border: `1px solid ${COLORS.border}`, boxShadow: COLORS.shadow }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green, marginBottom: 8 }}>Submitted Successfully</div>
          <p style={{ color: COLORS.textSecond, fontSize: 13, marginBottom: 24 }}>
            Your response has been recorded. You may close this page.
          </p>
        </div>
      </div>
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
    <div className="eval-page" style={{ minHeight: "100vh", background: COLORS.bg, padding: "clamp(16px, 3vw, 32px) 16px" }}>
      <style>{`
        .eval-page { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .eval-page h1, .eval-page h2, .eval-page h3 { text-wrap: balance; }
        .eval-page p, .eval-page li, .eval-page span { text-wrap: pretty; }
        .eval-action-button { transition-property: transform, box-shadow, background-color, color; transition-duration: 150ms; transition-timing-function: cubic-bezier(0.2, 0, 0, 1); }
        .eval-action-button:active:not(:disabled) { transform: scale(0.96); }
        .eval-currency-prefix { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #5F646D; font-size: 13px; font-weight: 800; pointer-events: none; z-index: 1; font-variant-numeric: tabular-nums; }
        .eval-survey-wrap .sd-root-modern, .eval-survey-wrap .sd-container-modern { background: transparent !important; max-width: 100% !important; }
        .eval-survey-wrap .sd-row { display: flex !important; flex-wrap: wrap !important; }
        .eval-survey-wrap .sd-question { box-shadow: none !important; }
        @media (max-width: 640px) {
          .eval-meta-grid { grid-template-columns: 1fr !important; }
          .eval-header { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div className="eval-header" style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 18, alignItems: "center", background: COLORS.cardBg, borderRadius: 16, padding: "18px 20px", marginBottom: 20, boxShadow: COLORS.shadow }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: COLORS.purplePale, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" style={{ maxWidth: 54, maxHeight: 54, objectFit: "contain", outline: "1px solid rgba(0, 0, 0, 0.1)", outlineOffset: -1 }} />
            ) : (
              <Logo size={54} alt="PMW Logo" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.purple, textTransform: "uppercase", letterSpacing: 0, marginBottom: 4 }}>
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
            color: isLayerAlreadyComplete ? COLORS.green : COLORS.purple,
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
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 10, background: COLORS.greenPale, color: COLORS.textPrimary }}>
              <LockIcon style={{ fontSize: 20, color: COLORS.green, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>This layer is already completed</div>
                <div style={{ fontSize: 13, color: COLORS.textSecond, marginTop: 2 }}>
                  The submission cannot be approved, rejected, or evaluated again from this link.
                </div>
              </div>
            </div>
          ) : (
            <>
              {isEvaluation && (
                <div style={{ marginBottom: 16 }}>
                  {evalSurveyModel ? (
                    <div className="eval-survey-wrap approval-survey-preview">
                      <Survey model={evalSurveyModel} />
                    </div>
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
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, cursor: "pointer", minHeight: 40 }}>
                  <input
                    type="checkbox"
                    checked={checkboxApproved}
                    onChange={(e) => setCheckboxApproved(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: COLORS.purple }}
                  />
                  <span style={{ fontSize: 14, color: COLORS.textPrimary }}>I approve this submission</span>
                </label>
              )}

              {/* Rejection reason (always available for approval layers) */}
              {!isEvaluation && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted, marginBottom: 6 }}>
                    Rejection Reason <span style={{ fontWeight: 400, color: COLORS.textMuted }}>(optional)</span>
                  </div>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason if rejecting..."
                    style={{
                      width: "100%",
                      minHeight: 72,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 13,
                      fontFamily: "inherit",
                      resize: "vertical",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {isEvaluation ? (
                  <button
                    className="eval-action-button"
                    onClick={() => handleSubmit("confirm")}
                    style={{ ...btnPrimary, opacity: actionState === "submitting" || !evalSurveyModel || !evalValid ? 0.6 : 1 }}
                    disabled={actionState === "submitting" || !evalSurveyModel || !evalValid}
                  >
                    {actionState === "submitting" ? "Submitting..." : !evalValid ? "Fill required fields" : "Submit Evaluation"}
                  </button>
                ) : (
                  <>
                    <button
                      className="eval-action-button"
                      onClick={() => handleSubmit("approve")}
                      style={{ ...btnPrimary, opacity: actionState === "submitting" || (isCheckboxMode && !checkboxApproved) || (isSignatureRequired && !signatureData) ? 0.6 : 1 }}
                      disabled={actionState === "submitting" || (isCheckboxMode && !checkboxApproved) || (isSignatureRequired && !signatureData)}
                    >
                      {actionState === "submitting" ? "Submitting..." : isSignatureRequired && !signatureData ? "Signature required" : "Approve"}
                    </button>
                    <button className="eval-action-button" onClick={() => handleSubmit("reject")} style={btnOutline} disabled={actionState === "submitting"}>
                      Reject
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
