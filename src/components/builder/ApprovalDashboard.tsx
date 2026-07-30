/**
 * ApprovalDashboard.tsx — Admin view for pending form approvals
 * Route: /admin/submissions (legacy alias: /admin/approvals)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import { FlatLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { spGet, spPatch, triggerApprovalNotification, getAllFormConfigs, getFormConfigByTitle, submitEvaluationData, updateLayerStatus, ensureWorkflowColumns, getSharePointChoices, getFilteredListChoices } from "../../utils/formBuilderSP";
import { registerSignaturePad, SignatureCapture } from "../../utils/SignaturePad";
import { createSpClient } from "../../utils/sharepointClient";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { SP_STATIC } from "../../utils/spConfig";
import { SP_FORM_STATUS, SP_LAYER_STATUS } from "../../utils/statusConstants";
import { clearStoredAuthDecision } from "../../utils/authDecision";
import { enrichSurveyJsonChoices } from "../../utils/surveyChoiceEnrichment";
import { buildRejectedWorkflowPatch } from "../../utils/workflowStatus";
import { buildSurveyJson } from "../../utils/FormBuilderEngine";
import { formatLayerProgress, getActiveLayers, resolveCurrentLayer, resolveTotalLayerCount } from "./approvalDashboardLayerProgress";
import { getSelectedCompany } from "../../utils/companySelection";
import { getDepartmentApproverLookupConfig } from "../../utils/departmentApproverLookup";
import { getWorkflowEmailStatus } from "../../utils/workflowEmailLog";
import { OSHES_LISTS } from "../../config/oshes";
import {
  getScheduledWorkflowEmail,
  isValidFutureScheduleDate,
  setScheduledWorkflowEmail,
  updateScheduledWorkflowEmailRecipient,
} from "../../utils/workflowEmailSchedule";
import { setWorkflowAssignmentOverride } from "../../utils/workflowAssignmentData";
import ReadOnlySubmissionPreview from "./ReadOnlySubmissionPreview";
import WorkflowAssignmentEditor from "./WorkflowAssignmentEditor";
import type { PdfFormData } from "../../utils/FormPdfDocument";
import type { WorkflowAssignmentSaveInput } from "./WorkflowAssignmentEditor";
import type { LayerConfigSource } from "./approvalDashboardLayerProgress";
import type { LayerConfigItem, ManualBranch, EvaluationLayerConfig, Submission, FormBuilderField } from "../../types";
import BlockIcon from "@mui/icons-material/Block";
import LockIcon from "@mui/icons-material/Lock";
import DescriptionIcon from "@mui/icons-material/Description";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import ReplayIcon from "@mui/icons-material/Replay";
const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
registerSignaturePad();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSIONS_PER_PAGE = 12;

// Theme
const C = {
  purple: "#0078D4",
  purpleLight: "#106EBE",
  purplePale: "#E6F2FB",
  purpleMid: "#B4D5F0",
  bg: "#F9FAFB",
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  textPrimary: "#111827",
  textSecond: "#6B7280",
  textMuted: "#9CA3AF",
  green: "#059669",
  greenPale: "#D1FAE5",
  greenBorder: "#6EE7B7",
  red: "#DC2626",
  redPale: "#FEE2E2",
  amber: "#D97706",
  amberPale: "#FEF3C7",
};

interface PendingItem {
  Id: number;
  Title: string;
  SubmittedBy: string;
  SubmittedAt: string;
  Status: string;
  CurrentApprovalLayer: number;
  FormVersion: string;
  RawJSON: string;
  CurrentLayer?: number;
  FormStatus?: string;
  L1_Status?: string;
  PdfUrl?: string;
  EvaluationData?: string;
  WorkflowEmailLog?: string;
  WorkflowEmailSchedule?: string;
  WorkflowAssignmentData?: string;
  SelectedBranch?: string;
  totalLayers?: number;
}

function getPendingItemKey(item: Pick<PendingItem, "Title" | "Id">): string {
  return `${item.Title}::${item.Id}`;
}

interface FormConfig {
  Title: string;
  NumberOfApprovalLayer?: number;
  FormID?: string;
  LayerConfig?: string;
  [key: string]: unknown;
}

// ── PDF Helper ─────────────────────────────────────────────────────────────
async function loadPdfData(item: PendingItem, token: string): Promise<PdfFormData | null> {
  try {
    const cfg = await getFormConfigByTitle(token, item.Title);
    if (!cfg) return null;

    let formVersion = item.FormVersion || (cfg as unknown as Record<string, unknown>).CurrentVersion as string || "1.0";
    if (!formVersion) {
      try {
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion`
        ) as { FormVersion?: string };
        formVersion = respItem?.FormVersion || "1.0";
      } catch { /* keep fallback */ }
    }

    // Load survey JSON
    const versionData = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
    ) as { value?: { SurveyJSON?: string }[] };

    const rawSurvey = versionData.value?.[0]?.SurveyJSON;
    if (!rawSurvey) return null;
    const parsed = JSON.parse(rawSurvey);
    const surveyContent = parsed.surveyJson || parsed;
    const versionMeta = isRecord(parsed.meta) ? parsed.meta : {};

    // Load response data
    const respItem = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
    ) as Record<string, unknown>;

    const SYSTEM_FIELDS = new Set([
      'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
      'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
      'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
      'Author','Editor','Created','Modified','ContentType','PermMask',
      'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
      'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
      'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
      'SelectedBranch',
    ]);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(respItem)) {
      if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
        data[k] = v;
      }
    }

    const { buildPdfLayerResults } = await import("../../utils/generateFormPdf");
    return {
      surveyJson: surveyContent as PdfFormData["surveyJson"],
      responseData: data,
      layerResults: buildPdfLayerResults(respItem, 10, cfg.LayerConfig),
      meta: {
        submittedBy: item.SubmittedBy || "",
        submittedAt: item.SubmittedAt || "",
        formTitle: item.Title,
        formVersion,
        formStatus: "",
      },
      isoStandards: typeof versionMeta.isoStandards === "string" ? versionMeta.isoStandards : undefined,
      logoUrl: typeof versionMeta.logoUrl === "string" && versionMeta.logoUrl.trim() ? versionMeta.logoUrl : "/logo-128.png",
    };
  } catch {
    return null;
  }
}

// ── Status helpers ─────────────────────────────────────────────────────────
function getItemStatus(item: PendingItem): "pending" | "approved" | "rejected" {
  const s = (item.FormStatus || item.Status || "").toLowerCase();
  if (s.includes("reject") || s === "rejected") return "rejected";
  if (s === "approved" || s.includes("approved") || s === "completed" || s === "fully approved" || s.includes("confirmed")) return "approved";
  if (s === "submitted" || s === "in review" || s === "pending" || s === "") return "pending";
  return "pending";
}

function getItemDisplayStatus(item: PendingItem): string {
  const s = item.FormStatus || item.Status || "";
  if (!s) return "Pending";
  return s;
}

function formatDateTime(d: string | undefined | null): string {
  if (!d) return "N/A";
  try {
    const dt = new Date(d);
    return dt.toLocaleString("en-MY", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    }).replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
  } catch {
    return d;
  }
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAbsoluteSharePointUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  if (!url.startsWith("/")) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (isRecord(value)) {
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = value[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function parseMaybeJsonRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractImageUrl(value: unknown): string {
  if (typeof value === "string") {
    const parsed = parseMaybeJsonRecord(value);
    if (parsed) return extractImageUrl(parsed);
    return toAbsoluteSharePointUrl(value);
  }
  if (!isRecord(value)) return "";
  for (const key of ["Url", "url", "serverRelativeUrl", "ServerRelativeUrl"]) {
    const next = value[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function normalizeDateInputValue(value: unknown, inputType: string): unknown {
  const text = valueToText(value);
  if (!text) return value;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;

  if (inputType === "date") {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  if (inputType === "time") {
    return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  }
  if (inputType === "datetime-local") {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  }
  return text;
}

function walkSurveyElements(surveyJson: unknown, visit: (element: Record<string, unknown>) => void): void {
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages : [];
  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      visit(element);
      walk(element.elements);
      walk(element.templateElements);
    }
  };
  for (const page of pages) {
    if (isRecord(page)) walk(page.elements);
  }
}

function normalizeResponseDataForSurvey(
  surveyJson: unknown,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...data };
  walkSurveyElements(surveyJson, (element) => {
    const name = typeof element.name === "string" ? element.name : "";
    if (!name || !(name in normalized)) return;
    const type = typeof element.type === "string" ? element.type : "";
    const inputType = typeof element.inputType === "string" ? element.inputType : "";

    if (type === "signaturepad") {
      normalized[name] = extractImageUrl(normalized[name]);
      return;
    }
    if (type === "text" && ["date", "datetime-local", "time"].includes(inputType)) {
      normalized[name] = normalizeDateInputValue(normalized[name], inputType);
    }
  });
  return normalized;
}

function buildEvaluationSurveyJson(elements: Record<string, unknown>[]): Record<string, unknown> {
  const mapped = buildSurveyJson(elements as unknown as FormBuilderField[], {
    title: "Evaluation",
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

function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

function normalizeEmailAddress(value: unknown): string {
  return valueToText(value).toLowerCase();
}

async function resolveDepartmentApproverEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  if (layer.assignee.type !== "department-approver") return { email: "", name: "" };

  const layerLabel = layer.title || `Layer ${layer.layerNumber}`;
  const departmentField = layer.assignee.value.trim();
  const department = valueToText(submittedData[departmentField]);
  if (!departmentField) {
    throw new Error(`${layerLabel} needs a department field before the workflow can start.`);
  }
  if (!department) {
    throw new Error(`${layerLabel} needs a department value before the workflow can start.`);
  }

  const config = getDepartmentApproverLookupConfig(layer.assignee);
  const params = new URLSearchParams();
  const filters = [`${config.departmentColumn} eq '${department.replace(/'/g, "''")}'`];
  if (config.roleColumn && config.roleValue) {
    filters.push(`${config.roleColumn} eq '${config.roleValue.replace(/'/g, "''")}'`);
  }
  params.set("$filter", filters.join(" and "));
  params.set("$select", [config.departmentColumn, config.emailColumn, config.nameColumn].join(","));
  params.set("$top", "2");

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(config.listName)}')/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };
  const matches = data.value ?? [];
  if (matches.length === 0) {
    throw new Error(`${layerLabel} could not find ${config.roleValue || "an approver"} for department "${department}".`);
  }
  if (matches.length > 1) {
    throw new Error(`${layerLabel} found more than one ${config.roleValue || "approver"} for department "${department}".`);
  }

  const email = valueToText(matches[0][config.emailColumn]);
  if (!EMAIL_RE.test(email)) {
    throw new Error(`${layerLabel} found an invalid approver email for department "${department}".`);
  }
  return {
    email,
    name: valueToText(matches[0][config.nameColumn]),
  };
}

async function resolveLayerAssigneeEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; error?: string }> {
  const layerLabel = layer.title || `Layer ${layer.layerNumber}`;
  if (layer.assignee.type === "department-approver") {
    try {
      const resolved = await resolveDepartmentApproverEmail(token, layer, submittedData);
      return { email: resolved.email };
    } catch (error) {
      return {
        email: "",
        error: error instanceof Error ? error.message : `${layerLabel} could not resolve the department approver.`,
      };
    }
  }

  const email = layer.assignee.type === "user"
    ? layer.assignee.value.trim()
    : valueToText(submittedData[stripFieldReference(layer.assignee.value)]);

  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    return {
      email,
      error: `${layerLabel} needs a valid assignee email before the workflow can start.`,
    };
  }

  if (email && !EMAIL_RE.test(email)) {
    return {
      email,
      error: `${layerLabel} resolved to "${email}", which is not a valid email address.`,
    };
  }

  return { email };
}

function getNextWorkflowLayer(layers: LayerConfigItem[] | null | undefined, currentLayerNumber: number): LayerConfigItem | undefined {
  if (!layers?.length) return undefined;
  const sorted = [...layers].sort((a, b) => a.layerNumber - b.layerNumber);
  const currentIndex = sorted.findIndex((layer) => layer.layerNumber === currentLayerNumber);
  if (currentIndex === -1) {
    return sorted.find((layer) => layer.layerNumber > currentLayerNumber);
  }
  return sorted[currentIndex + 1];
}

/** Check if the current layer (based on selectedItem's CurrentLayer) already has a terminal status */
function isCurrentLayerTerminal(item: PendingItem, completedLayers: Record<number, { status: string }>): boolean {
  const clNum = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0) || 1;
  const clStatus = completedLayers[clNum]?.status || "";
  return ["Confirmed", "Approved", "Rejected", "Cancelled", "Skipped"].includes(clStatus);
}

function isTerminalWorkflowStatus(status: unknown): boolean {
  const normalized = valueToText(status).toLowerCase().replace(/[\s_-]/g, "");
  return ["approved", "confirmed", "rejected", "cancelled", "skipped", "completed", "fullyapproved"].includes(normalized) || normalized.includes("reject");
}

async function assertSubmissionLayerCanAct(token: string, item: PendingItem, layerNumber: number): Promise<Record<string, unknown>> {
  const latest = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=Id,Status,FormStatus,CurrentLayer,CurrentApprovalLayer,L${layerNumber}_Status`
  ) as Record<string, unknown>;
  const latestCurrentLayer = Number(latest.CurrentLayer || latest.CurrentApprovalLayer || 0);

  if (isTerminalWorkflowStatus(latest.FormStatus || latest.Status) || isTerminalWorkflowStatus(latest[`L${layerNumber}_Status`])) {
    throw new Error("This layer has already been completed. Refresh submissions to see the latest status.");
  }
  if (latestCurrentLayer && latestCurrentLayer !== layerNumber) {
    throw new Error("This submission has moved to another layer and cannot be acted on here.");
  }

  return latest;
}

export default function ApprovalDashboard() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => { document.title = "Submissions — PMW OSHES"; }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [surveyJson, setSurveyJson] = useState<unknown>(null);
  const [responseData, setResponseData] = useState<Record<string, unknown> | null>(null);
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "evaluated">("pending");
  const [titleFilter, setTitleFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"approvals" | "evaluations">("approvals");
  const [listPage, setListPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [itemCurrentTypes, setItemCurrentTypes] = useState<Record<string, "approval" | "evaluation">>({});
  const formLayerConfigsRef = useRef<Record<string, LayerConfigSource>>({});
  const itemLayerConfigsRef = useRef<Record<string, LayerConfigSource>>({});
  const [needsBranchSelection, setNeedsBranchSelection] = useState(false);
  const [availableBranches, setAvailableBranches] = useState<ManualBranch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PendingItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [resendingItemKey, setResendingItemKey] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const [customEmailDate, setCustomEmailDate] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [selectedActiveLayers, setSelectedActiveLayers] = useState<LayerConfigItem[]>([]);
  const [pdfRegeneratingItemKey, setPdfRegeneratingItemKey] = useState("");
  const [currentLayerType, setCurrentLayerType] = useState<"approval" | "evaluation" | null>(null);
  const [currentLayerConfig, setCurrentLayerConfig] = useState<LayerConfigItem | null>(null);
  const [approvalSignature, setApprovalSignature] = useState<string | null>(null);
  const [evalSurveyModel, setEvalSurveyModel] = useState<Model | null>(null);
  const [evalValid, setEvalValid] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<{
    type: "approved" | "rejected" | "confirmed";
    message: string;
    pdfUrl?: string;
  } | null>(null);
  const [completedLayers, setCompletedLayers] = useState<Record<number, { status: string; email?: string; signedAt?: string; rejection?: string; signature?: string; type?: string }>>({});
  const [selectedLayerAccess, setSelectedLayerAccess] = useState<{
    allowed: boolean;
    assignedEmail: string;
    currentLayerNumber: number;
    override: boolean;
  } | null>(null);


  const baseFilteredItems = useMemo(() => {
    let items = pendingItems;

    if (titleFilter.trim()) {
      const q = titleFilter.trim().toLowerCase();
      items = items.filter(i => i.Title.toLowerCase().includes(q));
    }

    if (submitterFilter.trim()) {
      const q = submitterFilter.trim().toLowerCase();
      items = items.filter(i => i.SubmittedBy.toLowerCase().includes(q));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      items = items.filter(i => i.SubmittedAt && new Date(i.SubmittedAt) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999); // end of day
      items = items.filter(i => i.SubmittedAt && new Date(i.SubmittedAt) <= to);
    }

    return [...items].sort((a, b) => {
      const bTime = b.SubmittedAt ? new Date(b.SubmittedAt).getTime() : 0;
      const aTime = a.SubmittedAt ? new Date(a.SubmittedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.Id - a.Id;
    });
  }, [pendingItems, titleFilter, submitterFilter, dateFrom, dateTo]);

  const categoryItems = useMemo(() => {
    return baseFilteredItems.filter(i =>
      viewMode === "evaluations" ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation" : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation"
    );
  }, [baseFilteredItems, itemCurrentTypes, viewMode]);

  const filteredItems = useMemo(() => {
    let items = categoryItems;

    if (statusFilter === "pending") {
      items = items.filter(i => getItemStatus(i) === "pending");
    } else if (statusFilter === "approved") {
      items = items.filter(i => getItemStatus(i) === "approved");
    } else if (statusFilter === "rejected") {
      items = items.filter(i => getItemStatus(i) === "rejected");
    } else if (statusFilter === "evaluated") {
      items = items.filter(i => getItemStatus(i) !== "pending");
    }

    return items;
  }, [categoryItems, statusFilter]);

  const totalListPages = Math.max(1, Math.ceil(filteredItems.length / SUBMISSIONS_PER_PAGE));
  const pagedItems = filteredItems.slice((listPage - 1) * SUBMISSIONS_PER_PAGE, listPage * SUBMISSIONS_PER_PAGE);

  useEffect(() => {
    setListPage(1);
  }, [viewMode, statusFilter, titleFilter, submitterFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (listPage > totalListPages) setListPage(totalListPages);
  }, [listPage, totalListPages]);

  // Admin access check (defense-in-depth backup for AdminGuard route wrapper)
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    const client = createSpClient(instance, accounts);
    client.isGroupMember(SP_STATIC.adminGroup)
      .then((admin) => {
        setIsAdmin(admin);
        setIsSuperuser(admin);
        setAdminChecked(true);
        if (!admin) setLoading(false);
      })
      .catch(() => {
        setIsAdmin(false);
        setIsSuperuser(false);
        setAdminChecked(true);
      });
  }, [isAuthenticated, inProgress, instance, accounts]);

  // Get token
  useEffect(() => {
    if (!adminChecked || !isAdmin || !isSuperuser) return;
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;

    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] })
      .then(setToken)
      .catch(() => setError("Failed to acquire token"));
  }, [adminChecked, isAdmin, isSuperuser, isAuthenticated, inProgress, instance, accounts]);

  // Load all items (pending, approved, rejected)
  useEffect(() => {
    if (!adminChecked || !isAdmin || !isSuperuser) return;
    if (!token) return;

    const loadData = async () => {
      try {
        const forms = await getAllFormConfigs(token);

        // Build form layer config map for item type resolution
        const formLayerConfigMap: Record<string, LayerConfigSource> = {};
        for (const form of forms ?? []) {
          try {
            const lc = form.LayerConfig ? JSON.parse(form.LayerConfig) : null;
            const layers: LayerConfigItem[] = lc?.layers ?? [];
            const branches: ManualBranch[] = (lc?.manualBranches ?? []) as ManualBranch[];
            formLayerConfigMap[form.Title] = { layers, manualBranches: branches };
          } catch {
            formLayerConfigMap[form.Title] = { layers: [] };
          }
        }
        formLayerConfigsRef.current = formLayerConfigMap;

        // Load version-specific LayerConfig from Web Form Versions
        const versionLayerMap: Record<string, LayerConfigSource> = {};
        try {
          const allVersions = await spGet(token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$select=FormTitle,FormVersion,SurveyJSON&$top=500`
          ) as { value?: { FormTitle: string; FormVersion: string; SurveyJSON: string }[] };
          for (const v of allVersions?.value ?? []) {
            try {
              const parsed = JSON.parse(v.SurveyJSON);
              if (parsed.layerConfig) {
                const key = `${v.FormTitle}__${v.FormVersion}`;
                versionLayerMap[key] = parsed.layerConfig;
              }
            } catch { /* skip unparseable */ }
          }
        } catch { /* version list may not exist */ }

        const allItems: PendingItem[] = [];
        const nextItemTypes: Record<string, "approval" | "evaluation"> = {};
        const nextItemLayerConfigs: Record<string, LayerConfigSource> = {};
        for (const form of forms ?? []) {
          const hasApprovalLayers = (form.NumberOfApprovalLayer ?? 0) > 0;
          let hasEvalLayer = false;
          let hasBranches = false;
          if (form.LayerConfig) {
            try {
              const lc = JSON.parse(form.LayerConfig);
              hasEvalLayer = lc.layers?.some((l: { type: string }) => l.type === "evaluation") ?? false;
              hasBranches = (lc.manualBranches?.length ?? 0) > 0;
              if (hasBranches && !hasEvalLayer) {
                hasEvalLayer = (lc.manualBranches as ManualBranch[]).some(
                  (b) => b.layers?.some((l) => l.type === "evaluation")
                );
              }
            } catch {
              /* Invalid LayerConfig JSON — treat as no layers */
            }
          }
          // Branch-only forms store layers under manualBranches, not the main sequence.
          if (!hasApprovalLayers && !hasEvalLayer && !hasBranches) continue;

          const listName = form.Title;
          try {
            const items = await (async () => {
              // Query tiers: try progressively fewer custom columns.
              // SharePoint returns 400 if ANY selected column doesn't exist on the list.
              const attachWorkflowEmailLogs = async (itemsToUpdate: PendingItem[]): Promise<void> => {
                try {
                  const emailData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,WorkflowEmailLog&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; WorkflowEmailLog?: string }[] };
                  const emailMap = new Map(
                    (emailData.value ?? [])
                      .filter((current) => !!current.WorkflowEmailLog)
                      .map((current) => [current.Id, current.WorkflowEmailLog as string]),
                  );
                  for (const current of itemsToUpdate) {
                    const workflowEmailLog = emailMap.get(current.Id);
                    if (workflowEmailLog) current.WorkflowEmailLog = workflowEmailLog;
                  }
                } catch {
                  // Column may not exist on older lists until the first delivery attempt.
                }
              };
              const attachWorkflowEmailSchedules = async (itemsToUpdate: PendingItem[]): Promise<void> => {
                try {
                  const scheduleData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,WorkflowEmailSchedule&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; WorkflowEmailSchedule?: string }[] };
                  const scheduleMap = new Map(
                    (scheduleData.value ?? [])
                      .filter((current) => !!current.WorkflowEmailSchedule)
                      .map((current) => [current.Id, current.WorkflowEmailSchedule as string]),
                  );
                  for (const current of itemsToUpdate) {
                    const workflowEmailSchedule = scheduleMap.get(current.Id);
                    if (workflowEmailSchedule) current.WorkflowEmailSchedule = workflowEmailSchedule;
                  }
                } catch {
                  // Column may not exist on older lists until scheduling is configured.
                }
              };

              // Tier 1: core columns only (no CurrentLayer/SelectedBranch — may not exist on older lists)
              const tier1 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status,FormStatus,L1_Status,PdfUrl&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier1) {
                // Fetch optional columns separately — any may not exist on older lists
                // CurrentLayer
                try {
                  const clData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,CurrentLayer&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; CurrentLayer?: number }[] };
                  if (clData.value) {
                    const clMap: Record<number, number> = {};
                    for (const c of clData.value) {
                      if (c.CurrentLayer !== undefined && c.CurrentLayer !== null) clMap[c.Id] = c.CurrentLayer;
                    }
                    for (const t1 of tier1.value || []) {
                      if (clMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).CurrentLayer = clMap[t1.Id];
                    }
                  }
                } catch { /* column may not exist */ }
                // CurrentApprovalLayer
                try {
                  const calData = await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,CurrentApprovalLayer&$orderby=Created desc&$top=100`
                  ) as { value?: { Id: number; CurrentApprovalLayer?: number }[] };
                  if (calData.value) {
                    const calMap: Record<number, number> = {};
                    for (const c of calData.value) {
                      if (c.CurrentApprovalLayer !== undefined && c.CurrentApprovalLayer !== null) calMap[c.Id] = c.CurrentApprovalLayer;
                    }
                    for (const t1 of tier1.value || []) {
                      if (calMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).CurrentApprovalLayer = calMap[t1.Id];
                    }
                  }
                } catch { /* column may not exist */ }
                await attachWorkflowEmailLogs(tier1.value || []);
                await attachWorkflowEmailSchedules(tier1.value || []);
                // SelectedBranch (only if the form has manual branches)
                if (hasBranches) {
                  try {
                    const sbData = await spGet(token,
                      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,SelectedBranch&$orderby=Created desc&$top=100`
                    ) as { value?: { Id: number; SelectedBranch?: string }[] };
                    if (sbData.value) {
                      const sbMap: Record<number, string> = {};
                      for (const c of sbData.value) {
                        if (c.SelectedBranch) sbMap[c.Id] = c.SelectedBranch;
                      }
                      for (const t1 of tier1.value || []) {
                        if (sbMap[t1.Id] !== undefined) (t1 as unknown as Record<string, unknown>).SelectedBranch = sbMap[t1.Id];
                      }
                    }
                  } catch { /* column may not exist */ }
                }
                return tier1;
              }

              // Tier 2: without PdfUrl, CurrentLayer
              const tier2 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status,FormStatus,L1_Status&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier2) {
                await attachWorkflowEmailLogs(tier2.value || []);
                await attachWorkflowEmailSchedules(tier2.value || []);
                return tier2;
              }

              // Tier 3: without FormStatus too
              const tier3 = await (async () => {
                try {
                  return await spGet(token,
                    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,SubmittedBy,SubmittedAt,FormVersion,Status&$orderby=Created desc&$top=100`
                  ) as { value?: PendingItem[] };
                } catch { return null; }
              })();
              if (tier3) {
                const tier3Items = (tier3.value || []).map((item: PendingItem) => ({
                  ...item, FormStatus: '', CurrentLayer: 0, L1_Status: '',
                })) as PendingItem[];
                await attachWorkflowEmailLogs(tier3Items);
                await attachWorkflowEmailSchedules(tier3Items);
                return { value: tier3Items };
              }

              // Tier 4: without Status too (ancient list)
              const basic = await spGet(token,
                `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$select=Id,Title,Author/Name,Created&$expand=Author&$orderby=Created desc&$top=100`
              ) as { value?: Array<{ Id: number; Title?: string; Author?: { Name?: string }; Created?: string }> };

              const basicItems = (basic.value || []).map((item) => ({
                  Id: item.Id, Title: form.Title,
                  SubmittedBy: item.Author?.Name || '',
                  SubmittedAt: item.Created || '',
                  FormVersion: '', FormStatus: '', Status: '', CurrentLayer: 0, L1_Status: '',
                })) as PendingItem[];
              await attachWorkflowEmailLogs(basicItems);
              await attachWorkflowEmailSchedules(basicItems);
              return { value: basicItems };
            })();

            if (items.value) {
              for (const item of items.value) {
                // Compute effective layers first so we can set totalLayers before pushing
                const versionKey = `${form.Title}__${item.FormVersion}`;
                const versionLc = versionLayerMap[versionKey];
                const baseLc = versionLc || formLayerConfigMap[form.Title];
                const totalLayers = resolveTotalLayerCount(baseLc, item.SelectedBranch, form.NumberOfApprovalLayer);

                // Set totalLayers on the item BEFORE pushing (spread creates a copy)
                if (totalLayers > 0) {
                  (item as unknown as Record<string, unknown>).totalLayers = totalLayers;
                }

                allItems.push({ ...item, Title: form.Title });

                const current = resolveCurrentLayer(baseLc, item).currentLayer;
                const itemKey = getPendingItemKey({ ...item, Title: form.Title });
                nextItemTypes[itemKey] = current?.type === "evaluation" ? "evaluation" : "approval";
                if (baseLc) nextItemLayerConfigs[itemKey] = baseLc;
              }
            }
          } catch {
          }
        }

        setPendingItems(allItems);
        setItemCurrentTypes(nextItemTypes);
        itemLayerConfigsRef.current = nextItemLayerConfigs;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [adminChecked, isAdmin, isSuperuser, token]);

  // ── System columns to exclude from response data ──────────────────────
  const SYSTEM_FIELDS = new Set([
    'Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer',
    'FormVersion','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
    'WorkflowAssignmentData',
    'WorkflowEmailLog',
    'WorkflowEmailSchedule',
    'PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil',
    'Author','Editor','Created','Modified','ContentType','PermMask',
    'L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature',
    'L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature',
    'L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature',
    'SelectedBranch',
  ]);

  // Load selected item details
  const loadItemDetails = useCallback(async (item: PendingItem) => {
    if (!token) return;

    setSelectedItem(item);
    setSurveyJson(null);
    setResponseData(null);
    setCurrentLayerType(null);
    setCurrentLayerConfig(null);
    setApprovalSignature(null);
    setEvalSurveyModel(null);
    setEvalValid(true);
    setCompletedLayers({});
    setSelectedActiveLayers([]);
    setSelectedLayerAccess(null);
    setCustomEmailDate("");

    try {
      // Get form config
      const cfg = await getFormConfigByTitle(token, item.Title) as FormConfig | null;
      setFormConfig(cfg);

      // Determine if manual branch selection is needed
      let pendingBranch = false;
      let masterLayerCfg: { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] } | null = null;
      if (cfg?.LayerConfig) {
        try {
          masterLayerCfg = JSON.parse(cfg.LayerConfig) as { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] };
          const lcBranches = (masterLayerCfg.manualBranches || []) as ManualBranch[];
          if (lcBranches.length > 0 && !item.SelectedBranch) {
            pendingBranch = true;
            setNeedsBranchSelection(true);
            setAvailableBranches(lcBranches);
            setCurrentLayerType(null);
            setEvalSurveyModel(null);
          } else {
            setNeedsBranchSelection(false);
            setAvailableBranches([]);
          }
        } catch { setNeedsBranchSelection(false); }
      } else { setNeedsBranchSelection(false); setAvailableBranches([]); }

      // Load submitted form details before any workflow decision. Branch selection needs
      // the same read-only context as approval/evaluation actions.
      if (cfg) {
        // Resolve FormVersion
        let formVersion = item.FormVersion;
        if (!formVersion) {
          try {
            const respItem = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=FormVersion`
            ) as { FormVersion?: string };
            formVersion = respItem?.FormVersion || (cfg.CurrentVersion as string) || '1.0';
          } catch {
            formVersion = (cfg.CurrentVersion as string) || '1.0';
          }
        }

        // Get survey JSON from versions
        const versionData = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title)}' and FormVersion eq '${encodeURIComponent(formVersion)}'&$select=SurveyJSON&$top=1`
        ) as { value?: { SurveyJSON?: string }[] };

        const rawSurvey = versionData.value?.[0]?.SurveyJSON;
        let versionParsed: Record<string, unknown> | null = null;
        let surveyContentForPreview: unknown = null;
        if (rawSurvey) {
          versionParsed = JSON.parse(rawSurvey) as Record<string, unknown>;
          const surveyContent = versionParsed.surveyJson || versionParsed;
          surveyContentForPreview = isRecord(surveyContent)
            ? await enrichSurveyJsonChoices(surveyContent, {
              getSharePointChoices: (list, column) => getSharePointChoices(list, column, token),
              getFilteredListChoices: (list, valueColumn, filterColumn, filterValue) =>
                getFilteredListChoices(list, valueColumn, token, filterColumn, filterValue),
            })
            : surveyContent;
          setSurveyJson(surveyContentForPreview);
        }

        // Resolve LayerConfig: version-specific first, then current Master Form
        let versionLayerCfg: { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] } | null = null;
        if (versionParsed?.layerConfig) {
          versionLayerCfg = versionParsed.layerConfig as { layers?: LayerConfigItem[]; manualBranches?: ManualBranch[] };
        }

        // Load response item data (submitted field values)
        const respItem = await spGet(
          token,
          `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
        ) as Record<string, unknown>;
        const detailItem: PendingItem = {
          ...item,
          CurrentLayer: Number(respItem.CurrentLayer) || item.CurrentLayer || 0,
          CurrentApprovalLayer: Number(respItem.CurrentApprovalLayer) || item.CurrentApprovalLayer || 0,
          SelectedBranch: valueToText(respItem.SelectedBranch) || item.SelectedBranch,
          L1_Status: valueToText(respItem.L1_Status) || item.L1_Status,
          FormStatus: valueToText(respItem.FormStatus) || item.FormStatus,
          Status: valueToText(respItem.Status) || item.Status,
          WorkflowEmailLog: valueToText(respItem.WorkflowEmailLog) || item.WorkflowEmailLog,
          WorkflowEmailSchedule: valueToText(respItem.WorkflowEmailSchedule) || item.WorkflowEmailSchedule,
          WorkflowAssignmentData: valueToText(respItem.WorkflowAssignmentData) || item.WorkflowAssignmentData,
        };
        setSelectedItem(detailItem);
        if (masterLayerCfg?.manualBranches?.length && detailItem.SelectedBranch && pendingBranch) {
          pendingBranch = false;
          setNeedsBranchSelection(false);
          setAvailableBranches([]);
        }

        // Filter out system columns, keep only survey question data
        const data: Record<string, unknown> = {};
        const layerHistory: Record<number, { status: string; email?: string; signedAt?: string; rejection?: string; signature?: string; type?: string }> = {};
        for (const [k, v] of Object.entries(respItem)) {
          if (!SYSTEM_FIELDS.has(k) && !/^L\d+_/.test(k) && v !== null && v !== undefined) {
            data[k] = v;
          }
          // Extract L{n}_Status, L{n}_Email, etc. for layer history display
          // Only create entries for non-null values to avoid phantom layers from SP columns that exist but are empty
          const layerMatch = k.match(/^L(\d+)_(Status|Email|SignedAt|Rejection|Signature)$/);
          if (layerMatch && v) {
            const ln = parseInt(layerMatch[1], 10);
            const suffix = layerMatch[2].toLowerCase() as "status" | "email" | "signedat" | "rejection" | "signature";
            if (!layerHistory[ln]) layerHistory[ln] = { status: "" };
            if (suffix === "status") layerHistory[ln].status = v as string;
            else if (suffix === "email") layerHistory[ln].email = v as string;
            else if (suffix === "signedat") layerHistory[ln].signedAt = v as string;
            else if (suffix === "rejection") layerHistory[ln].rejection = v as string;
            else if (suffix === "signature") layerHistory[ln].signature = v as string;
          }
        }
        setResponseData(surveyContentForPreview ? normalizeResponseDataForSurvey(surveyContentForPreview, data) : data);
        setCompletedLayers(layerHistory);

        const activeConfig = versionLayerCfg || masterLayerCfg || formLayerConfigsRef.current[item.Title];
        const currentResolution = resolveCurrentLayer(activeConfig, detailItem);
        setSelectedActiveLayers(currentResolution.activeLayers);
        setCurrentLayerConfig(currentResolution.currentLayer ?? null);
        const currentLayerNumber = currentResolution.currentLayerNumber;
        const assignedEmail = normalizeEmailAddress(respItem[`L${currentLayerNumber}_Email`]);
        const signedInEmail = normalizeEmailAddress(accounts[0]?.username);
        const override = isSuperuser;
        setSelectedLayerAccess({
          allowed: override || (!!assignedEmail && assignedEmail === signedInEmail),
          assignedEmail,
          currentLayerNumber,
          override,
        });

        // ── Correct stale FormStatus for old items ────────────────────
        // Before the evaluation-persistence fix, handleEvaluationSubmit never updated
        // FormStatus on SP. Detect this case and correct it.
        const rawFormStatus = (detailItem.FormStatus || detailItem.Status || "") as string;
        if (rawFormStatus === "In Review" || rawFormStatus === "Submitted" || !rawFormStatus) {
          const formLc = formLayerConfigsRef.current[item.Title];
          if (formLc) {
            let activeLayers = formLc.layers || [];
            if (formLc.manualBranches?.length && detailItem.SelectedBranch) {
              const branch = getActiveLayers(formLc, detailItem.SelectedBranch);
              if (branch.length) activeLayers = branch;
            }
            const totalLayers = activeLayers.length;
            if (totalLayers > 0) {
              const allDone = Array.from({ length: totalLayers }, (_, i) => i + 1)
                .every(n => {
                  const s = layerHistory[n]?.status || "";
                  return ["Confirmed", "Approved", "Rejected", "Cancelled", "Skipped"].includes(s);
                });
              if (allDone) {
                const hasReject = Array.from({ length: totalLayers }, (_, i) => i + 1)
                  .some(n => (layerHistory[n]?.status || "").toLowerCase().includes("reject"));
                const correctedStatus = hasReject ? "Rejected" : "Completed";
                // Patch SP to fix the stale status
                try {
                  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`, {
                    Status: correctedStatus,
                    FormStatus: correctedStatus,
                  });
                  } catch {
                    /* Patch failure is non-critical */
                  }
                // Update local state
                setPendingItems((prev) => prev.map(i =>
                  i.Id === item.Id ? { ...i, FormStatus: correctedStatus, Status: correctedStatus } : i
                ));
                // Replace selectedItem ref so the detail panel reflects the fix immediately
                setSelectedItem((prev) =>
                  prev?.Id === item.Id ? { ...prev, FormStatus: correctedStatus, Status: correctedStatus } as PendingItem : prev
                );
              }
            }
          }
        }

        if (pendingBranch) {
          setCurrentLayerType(null);
          setCurrentLayerConfig(null);
          setEvalSurveyModel(null);
          return;
        }

        if (currentResolution.currentLayer?.type === "evaluation") {
          setCurrentLayerType("evaluation");
          const evalElements = (currentResolution.currentLayer as EvaluationLayerConfig).surveyElements || [];
          if (evalElements.length > 0) {
            const m = new Model(buildEvaluationSurveyJson(evalElements) as object);
            m.applyTheme(FlatLightPanelless);
            const checkValid = () => { setEvalValid(!m.hasErrors()); };
            m.onValueChanged.add(checkValid);
            setTimeout(checkValid, 0);
            setEvalSurveyModel((prev) => { prev?.dispose(); return m; });
          } else {
            setEvalSurveyModel(null);
            setEvalValid(false);
          }
        } else {
          setCurrentLayerType("approval");
          setEvalSurveyModel(null);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, accounts, isSuperuser]);

  // Handle evaluation submit
  const handleEvaluationSubmit = async () => {
    if (!token || !selectedItem || !formConfig) return;
    if (selectedLayerAccess && !selectedLayerAccess.allowed) {
      setError("This item is locked because the current layer is assigned to another approver.");
      return;
    }
    // Validate required fields before submitting
    if (evalSurveyModel) {
      const valid = evalSurveyModel.validate();
      if (!valid) { setEvalValid(false); return; }
    }

    setActionLoading(true);
    try {
      const listName = selectedItem.Title;
      const respId = selectedItem.Id;
      const currLayerNum = Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
      await assertSubmissionLayerCanAct(token, selectedItem, currLayerNum);
      const now = new Date().toISOString();

      // Compute total layers from config (same pattern as handleApprove)
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || 0;
      const nextLayerConfig = getNextWorkflowLayer(branchLayers, currLayerNum);
      const nextLayerNum = nextLayerConfig?.layerNumber ?? currLayerNum + 1;
      const isFinal = !nextLayerConfig && currLayerNum >= totalLayers;

      const fields = evalSurveyModel ? evalSurveyModel.data as Record<string, unknown> : {};

      await submitEvaluationData(token, listName, respId, currLayerNum, {
        confirmerEmail: accounts[0]?.username || "SYSTEM",
        confirmerName: accounts[0]?.name,
        fields,
      });

      await updateLayerStatus(token, listName, respId, currLayerNum, {
        status: SP_LAYER_STATUS.CONFIRMED,
        signedAt: now,
      });

      // Patch FormStatus, CurrentLayer, Status to SP so the change persists on refresh
      const evalPatch: Record<string, unknown> = {
        Status: isFinal ? "Completed" : "In Review",
        FormStatus: isFinal ? "Completed" : "In Review",
        CurrentLayer: isFinal ? currLayerNum : nextLayerNum,
        CurrentApprovalLayer: isFinal ? currLayerNum : nextLayerNum,
      };
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`, evalPatch);

      let nextApproverEmail = "";
      if (nextLayerConfig) {
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})?$select=L${nextLayerNum}_Email`
          ) as Record<string, unknown>;
          nextApproverEmail = valueToText(itemEmail[`L${nextLayerNum}_Email`]);
        } catch {
          nextApproverEmail = "";
        }
        if (!nextApproverEmail) {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayerConfig, submittedData);
          if (result.error) throw new Error(result.error);
          nextApproverEmail = result.email;
          if (nextApproverEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`,
              { [`L${nextLayerNum}_Email`]: nextApproverEmail },
            );
          }
        }
        if (nextLayerConfig.authMode === "365" && !EMAIL_RE.test(nextApproverEmail)) {
          throw new Error(`Layer ${nextLayerNum} has no valid assignee email. Fix the workflow before advancing.`);
        }
      }

      let pdfUrl: string | undefined;
      if (isFinal) {
        try {
          const pdfData = await loadPdfData(selectedItem, token);
          if (pdfData) {
            pdfData.meta.formStatus = "completed";
            const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
            pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
          }
        } catch {
          // Keep the workflow moving even if PDF generation is unavailable.
        }
      }

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currLayerNum,
        totalLayers,
        action: "approve",
        nextApproverEmail,
        ...(nextLayerConfig?.type ? { nextLayerType: nextLayerConfig.type } : {}),
        ...(nextLayerConfig?.layerNumber ? { nextLayerNumber: nextLayerConfig.layerNumber } : {}),
        ...(nextLayerConfig?.type === "evaluation" ? { nextEmailSchedule: nextLayerConfig.emailSchedule } : {}),
        pdfUrl,
      });

      // Update local state — advance CurrentLayer so item type re-computes correctly
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: isFinal ? "Completed" : "In Review", FormStatus: isFinal ? "Completed" : "In Review",
              CurrentLayer: isFinal ? currLayerNum : nextLayerNum, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));

      // If advancing to a new layer with a different type, update itemCurrentTypes
      if (nextLayerConfig) {
        setItemCurrentTypes((prev) => ({ ...prev, [getPendingItemKey(selectedItem)]: nextLayerConfig.type }));
      }

      setActionSuccess({
        type: "confirmed",
        message: isFinal ? "The evaluation was submitted and the form is complete." : "The evaluation was submitted.",
        pdfUrl,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle branch selection
  const handleSelectBranch = async (branchName: string) => {
    if (!token || !selectedItem || !formConfig) return;
    setBranchLoading(true);
    try {
      const listName = selectedItem.Title;
      const respId = selectedItem.Id;
      const patchUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`;

      let bLayers: LayerConfigItem[] = [];
      if (formConfig.LayerConfig) {
        try {
          const lc = JSON.parse(formConfig.LayerConfig);
          const branch = (lc.manualBranches as ManualBranch[] | undefined)?.find((b) => b.name === branchName);
          bLayers = branch?.layers ?? lc.layers ?? [];
        } catch { /* keep empty */ }
      }
      if (bLayers.length === 0) {
        throw new Error("Selected branch has no approval or evaluation layers.");
      }

      const submittedData = responseData ?? (await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`
      ) as Record<string, unknown>);
      const resolvedEmails: Record<number, string> = {};
      const assigneeErrors: string[] = [];
      for (const layer of bLayers) {
        const result = await resolveLayerAssigneeEmail(token, layer, submittedData);
        if (result.error) assigneeErrors.push(result.error);
        if (result.email) resolvedEmails[layer.layerNumber] = result.email;
      }
      if (assigneeErrors.length > 0) {
        throw new Error(`Cannot start branch: ${assigneeErrors.join(" ")}`);
      }
      const firstLayerNumber = bLayers[0]?.layerNumber ?? 1;
      const maxLayerNumber = Math.max(...bLayers.map((layer) => layer.layerNumber), firstLayerNumber);

      const patchBody: Record<string, unknown> = {
        SelectedBranch: branchName,
        FormStatus: SP_FORM_STATUS.IN_REVIEW,
        Status: SP_FORM_STATUS.IN_REVIEW,
        CurrentLayer: firstLayerNumber,
        CurrentApprovalLayer: firstLayerNumber,
      };
      for (const layer of bLayers) {
        patchBody[`L${layer.layerNumber}_Status`] = SP_LAYER_STATUS.PENDING;
        if (resolvedEmails[layer.layerNumber]) {
          patchBody[`L${layer.layerNumber}_Email`] = resolvedEmails[layer.layerNumber];
        }
      }

      await ensureWorkflowColumns(token, listName, maxLayerNumber);
      // SharePoint needs a moment after adding columns before they can be written
      await new Promise((r) => setTimeout(r, 1500));
      await spPatch(token, patchUrl, patchBody);

      const firstApproverEmail = resolvedEmails[firstLayerNumber] || "";
      if (firstApproverEmail) {
        await triggerApprovalNotification(token, {
          formTitle: selectedItem.Title,
          submittedBy: selectedItem.SubmittedBy,
          responseItemId: selectedItem.Id,
          layer: firstLayerNumber,
          totalLayers: bLayers.length,
          action: "submit",
          nextApproverEmail: firstApproverEmail,
          ...(bLayers[0]?.type ? { nextLayerType: bLayers[0].type } : {}),
          ...(bLayers[0]?.type === "evaluation" ? { nextEmailSchedule: bLayers[0].emailSchedule } : {}),
          reviewLink: `${window.location.origin}/admin/submissions?form=${encodeURIComponent(listName)}&item=${respId}`,
        });
      }

      const updatedItem: PendingItem = {
        ...selectedItem,
        SelectedBranch: branchName,
        FormStatus: SP_FORM_STATUS.IN_REVIEW,
        Status: SP_FORM_STATUS.IN_REVIEW,
        CurrentLayer: firstLayerNumber,
        CurrentApprovalLayer: firstLayerNumber,
        L1_Status: firstLayerNumber === 1 ? SP_LAYER_STATUS.PENDING : selectedItem.L1_Status,
      };
      setPendingItems((prev) => prev.map((i) => i.Id === selectedItem.Id ? updatedItem : i));
      await loadItemDetails(updatedItem);
    } catch (e) { setError((e as Error).message); }
    finally { setBranchLoading(false); }
  };

  const handleForceResend = async (item: PendingItem) => {
    if (!token || !isSuperuser) return;
    const itemKey = getPendingItemKey(item);
    setResendingItemKey(itemKey);
    setEmailNotice("");
    setError("");
    try {
      const rawItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`
      ) as Record<string, unknown>;
      const currentLayerNumber = Number(rawItem.CurrentLayer || rawItem.CurrentApprovalLayer || item.CurrentLayer || item.CurrentApprovalLayer || 0);
      const configSource = itemLayerConfigsRef.current[itemKey] || formLayerConfigsRef.current[item.Title];
      const activeLayers = getActiveLayers(configSource, valueToText(rawItem.SelectedBranch) || item.SelectedBranch);
      const currentLayer = activeLayers.find((layer) => layer.layerNumber === currentLayerNumber);
      if (!currentLayer) throw new Error(`Layer ${currentLayerNumber} is not available in the workflow configuration.`);

      let recipient = valueToText(rawItem[`L${currentLayerNumber}_Email`]);
      if (!EMAIL_RE.test(recipient)) {
        const resolved = await resolveLayerAssigneeEmail(token, currentLayer, rawItem);
        if (resolved.error) throw new Error(resolved.error);
        recipient = resolved.email;
        if (recipient) {
          await spPatch(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`,
            { [`L${currentLayerNumber}_Email`]: recipient },
          );
        }
      }
      if (!EMAIL_RE.test(recipient)) {
        throw new Error(`Layer ${currentLayerNumber} has no valid evaluator email.`);
      }

      const cfg = await getFormConfigByTitle(token, item.Title) as FormConfig | null;
      const publicToken = currentLayer.publicToken || "";
      const formSlug = valueToText(cfg?.Slug);
      const reviewLink = currentLayer.authMode === "public" && publicToken
        ? `${window.location.origin}/eval/${encodeURIComponent(publicToken)}?item=${item.Id}`
        : `${window.location.origin}/eval/${encodeURIComponent(formSlug)}/${item.Id}/${currentLayerNumber}`;

      await triggerApprovalNotification(token, {
        formTitle: item.Title,
        submittedBy: item.SubmittedBy,
        responseItemId: item.Id,
        layer: currentLayerNumber,
        totalLayers: activeLayers.length || item.totalLayers || currentLayerNumber,
        action: "submit",
        nextApproverEmail: recipient,
        nextLayerType: currentLayer.type,
        reviewLink,
        responseListTitle: item.Title,
        throwOnEmailError: true,
      });

      const refreshed = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})?$select=WorkflowEmailLog,WorkflowEmailSchedule`
      ) as { WorkflowEmailLog?: string; WorkflowEmailSchedule?: string };
      const workflowEmailLog = valueToText(refreshed.WorkflowEmailLog);
      const workflowEmailSchedule = valueToText(refreshed.WorkflowEmailSchedule);
      setPendingItems((previous) => previous.map((current) =>
        getPendingItemKey(current) === itemKey
          ? { ...current, WorkflowEmailLog: workflowEmailLog, WorkflowEmailSchedule: workflowEmailSchedule }
          : current
      ));
      setSelectedItem((current) =>
        current && getPendingItemKey(current) === itemKey
          ? { ...current, WorkflowEmailLog: workflowEmailLog, WorkflowEmailSchedule: workflowEmailSchedule }
          : current
      );
      setEmailNotice(`Evaluator email sent again to ${recipient}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resend the evaluator email.");
    } finally {
      setResendingItemKey("");
    }
  };

  const handleSaveWorkflowAssignment = async (input: WorkflowAssignmentSaveInput) => {
    if (!token || !selectedItem || !isSuperuser) return;
    const email = input.email.trim();
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid approver or evaluator email address.");
      return;
    }

    setAssignmentSaving(true);
    setError("");
    setEmailNotice("");
    try {
      const itemKey = getPendingItemKey(selectedItem);
      const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(selectedItem.Title)}')/items(${selectedItem.Id})`;
      const rawItem = await spGet(token, itemUrl) as Record<string, unknown>;
      const currentLayerNumber = Number(
        rawItem.CurrentLayer
        || rawItem.CurrentApprovalLayer
        || selectedItem.CurrentLayer
        || selectedItem.CurrentApprovalLayer
        || 0,
      );
      if (input.layer < currentLayerNumber) {
        throw new Error("Completed or earlier workflow layers cannot be reassigned.");
      }
      if (isTerminalWorkflowStatus(rawItem[`L${input.layer}_Status`])) {
        throw new Error(`Layer ${input.layer} is already complete and cannot be reassigned.`);
      }

      const targetLayer = selectedActiveLayers.find((layer) => layer.layerNumber === input.layer);
      if (!targetLayer) {
        throw new Error(`Layer ${input.layer} is not available in this submission's workflow.`);
      }

      const updatedAt = new Date().toISOString();
      const updatedBy = accounts[0]?.username || accounts[0]?.name || "SYSTEM";
      const assignmentData = setWorkflowAssignmentOverride(rawItem.WorkflowAssignmentData, {
        ...input,
        email,
        updatedAt,
        updatedBy,
        previous: {
          email: valueToText(rawItem[`L${input.layer}_Email`]) || email,
          source: "resolved",
          updatedBy: "SYSTEM",
          updatedAt: selectedItem.SubmittedAt || updatedAt,
        },
      });
      const patchBody: Record<string, unknown> = {
        [`L${input.layer}_Email`]: email,
        WorkflowAssignmentData: JSON.stringify(assignmentData),
      };
      if (getScheduledWorkflowEmail(rawItem.WorkflowEmailSchedule, input.layer)) {
        patchBody.WorkflowEmailSchedule = JSON.stringify(updateScheduledWorkflowEmailRecipient(
          rawItem.WorkflowEmailSchedule,
          input.layer,
          email,
          updatedAt,
        ));
      }

      const maximumLayerNumber = Math.max(
        input.layer,
        ...selectedActiveLayers.map((layer) => layer.layerNumber),
      );
      await ensureWorkflowColumns(token, selectedItem.Title, maximumLayerNumber);
      await spPatch(token, itemUrl, patchBody);

      const serializedAssignments = JSON.stringify(assignmentData);
      const serializedSchedule = typeof patchBody.WorkflowEmailSchedule === "string"
        ? patchBody.WorkflowEmailSchedule
        : selectedItem.WorkflowEmailSchedule;
      setCompletedLayers((previous) => ({
        ...previous,
        [input.layer]: {
          ...(previous[input.layer] || { status: "" }),
          email,
        },
      }));
      setPendingItems((previous) => previous.map((current) =>
        getPendingItemKey(current) === itemKey
          ? {
            ...current,
            WorkflowAssignmentData: serializedAssignments,
            WorkflowEmailSchedule: serializedSchedule,
          }
          : current
      ));
      setSelectedItem((current) =>
        current && getPendingItemKey(current) === itemKey
          ? {
            ...current,
            WorkflowAssignmentData: serializedAssignments,
            WorkflowEmailSchedule: serializedSchedule,
          }
          : current
      );
      if (input.layer === currentLayerNumber) {
        setSelectedLayerAccess((previous) => previous ? {
          ...previous,
          assignedEmail: email.toLowerCase(),
          allowed: true,
          override: true,
        } : previous);
      }
      setEmailNotice(
        `Layer ${input.layer} ${targetLayer.type === "evaluation" ? "evaluator" : "approver"} updated for this submission only.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update this workflow assignment.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleSaveCustomEmailDate = async () => {
    if (!token || !selectedItem || !isSuperuser) return;
    if (!isValidFutureScheduleDate(customEmailDate)) {
      setError("Evaluator email date must be now or later.");
      return;
    }
    setScheduleSaving(true);
    setError("");
    setEmailNotice("");
    try {
      const itemKey = getPendingItemKey(selectedItem);
      const rawItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(selectedItem.Title)}')/items(${selectedItem.Id})`
      ) as Record<string, unknown>;
      const currentLayerNumber = Number(rawItem.CurrentLayer || rawItem.CurrentApprovalLayer || selectedItem.CurrentLayer || selectedItem.CurrentApprovalLayer || 0);
      const configSource = itemLayerConfigsRef.current[itemKey] || formLayerConfigsRef.current[selectedItem.Title];
      const activeLayers = getActiveLayers(configSource, valueToText(rawItem.SelectedBranch) || selectedItem.SelectedBranch);
      const currentLayer = activeLayers.find((layer) => layer.layerNumber === currentLayerNumber);
      if (!currentLayer || currentLayer.type !== "evaluation") {
        throw new Error("Only the active evaluation layer can be scheduled.");
      }

      let recipient = valueToText(rawItem[`L${currentLayerNumber}_Email`]);
      if (!EMAIL_RE.test(recipient)) {
        const resolved = await resolveLayerAssigneeEmail(token, currentLayer, rawItem);
        if (resolved.error) throw new Error(resolved.error);
        recipient = resolved.email;
      }
      if (!EMAIL_RE.test(recipient)) throw new Error("The active evaluation layer has no valid evaluator email.");

      const cfg = await getFormConfigByTitle(token, selectedItem.Title) as FormConfig | null;
      const publicToken = currentLayer.publicToken || "";
      const formSlug = valueToText(cfg?.Slug);
      const reviewLink = currentLayer.authMode === "public" && publicToken
        ? `${window.location.origin}/eval/${encodeURIComponent(publicToken)}?item=${selectedItem.Id}`
        : `${window.location.origin}/eval/${encodeURIComponent(formSlug)}/${selectedItem.Id}/${currentLayerNumber}`;
      const updatedAt = new Date().toISOString();
      const schedule = setScheduledWorkflowEmail(rawItem.WorkflowEmailSchedule, {
        layer: currentLayerNumber,
        recipient,
        dueAt: new Date(customEmailDate).toISOString(),
        status: "scheduled",
        updatedAt,
        layerType: "evaluation",
        totalLayers: activeLayers.length || selectedItem.totalLayers || currentLayerNumber,
        reviewLink,
        submittedBy: selectedItem.SubmittedBy,
      });
      await ensureWorkflowColumns(token, selectedItem.Title, activeLayers.length || currentLayerNumber);
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(selectedItem.Title)}')/items(${selectedItem.Id})`,
        {
          [`L${currentLayerNumber}_Email`]: recipient,
          WorkflowEmailSchedule: JSON.stringify(schedule),
        },
      );
      const serialized = JSON.stringify(schedule);
      setPendingItems((previous) => previous.map((current) =>
        getPendingItemKey(current) === itemKey
          ? { ...current, WorkflowEmailSchedule: serialized }
          : current
      ));
      setSelectedItem((current) => current ? { ...current, WorkflowEmailSchedule: serialized } : current);
      setEmailNotice(`Evaluator email scheduled for ${formatDateTime(new Date(customEmailDate).toISOString())}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not schedule the evaluator email.");
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleRegeneratePdf = async (item: PendingItem) => {
    if (!token || !isSuperuser) return;
    const itemKey = getPendingItemKey(item);
    setPdfRegeneratingItemKey(itemKey);
    setError("");
    setEmailNotice("");
    try {
      const pdfData = await loadPdfData(item, token);
      if (!pdfData) throw new Error("Could not load the submission data needed to rebuild the PDF.");
      pdfData.meta.formStatus = item.FormStatus || item.Status || "submitted";
      const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
      const pdfUrl = await generateAndStorePdf(token, item.Title, item.Id, pdfData, {
        replaceExistingPdfUrl: item.PdfUrl,
      });
      setPendingItems((previous) => previous.map((current) =>
        getPendingItemKey(current) === itemKey ? { ...current, PdfUrl: pdfUrl } : current
      ));
      setSelectedItem((current) =>
        current && getPendingItemKey(current) === itemKey ? { ...current, PdfUrl: pdfUrl } : current
      );
      setEmailNotice("PDF rebuilt and replaced successfully.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not rebuild the PDF.");
    } finally {
      setPdfRegeneratingItemKey("");
    }
  };

  const handleDeleteSubmission = async () => {
    if (!token || !deleteTarget) return;

    setDeleteLoading(true);
    setError("");
    try {
      const rawItem = await spGet(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(deleteTarget.Title)}')/items(${deleteTarget.Id})`
      ) as Record<string, unknown>;

      const submissionData: Record<string, unknown> = {};
      const layerNumbers = new Set<number>();
      for (const [key, value] of Object.entries(rawItem)) {
        if (!SYSTEM_FIELDS.has(key) && value !== null && value !== undefined) {
          submissionData[key] = value;
        }
        const layerMatch = key.match(/^L(\d+)_(Status|Email|SignedAt|Rejection|Signature)$/);
        if (layerMatch) layerNumbers.add(parseInt(layerMatch[1], 10));
      }
      const totalLayers = deleteTarget.totalLayers || Math.max(deleteTarget.CurrentLayer || 0, deleteTarget.CurrentApprovalLayer || 0, layerNumbers.size);
      for (let n = 1; n <= totalLayers; n++) layerNumbers.add(n);

      const layers: Submission["layers"] = Array.from(layerNumbers)
        .sort((a, b) => a - b)
        .map((layerNumber) => ({
          status: valueToText(rawItem[`L${layerNumber}_Status`]),
          outcome: undefined,
          email: valueToText(rawItem[`L${layerNumber}_Email`]) || null,
          signedAt: valueToText(rawItem[`L${layerNumber}_SignedAt`]) || null,
          rejectionReason: valueToText(rawItem[`L${layerNumber}_Rejection`]) || null,
          signature: valueToText(rawItem[`L${layerNumber}_Signature`]) || null,
        }));

      const client = createSpClient(instance, accounts);
      const result = await client.hardDeleteSubmission({
        id: String(deleteTarget.Id),
        submissionId: String(deleteTarget.Id),
        listTitle: deleteTarget.Title,
        formId: valueToText(rawItem.FormID),
        formVersion: deleteTarget.FormVersion || valueToText(rawItem.FormVersion),
        title: deleteTarget.Title,
        submittedByEmail: deleteTarget.SubmittedBy || valueToText(rawItem.SubmittedBy),
        submittedAt: deleteTarget.SubmittedAt || valueToText(rawItem.SubmittedAt) || null,
        formStatus: deleteTarget.FormStatus || deleteTarget.Status || valueToText(rawItem.FormStatus) || null,
        totalLayers,
        layers,
        meta: { icon: "", color: "", pale: "", category: "" },
        submissionData,
        currentLayer: deleteTarget.CurrentLayer,
        selectedBranch: deleteTarget.SelectedBranch,
      });

      setPendingItems((prev) => prev.filter((item) => !(item.Id === deleteTarget.Id && item.Title === deleteTarget.Title)));
      setItemCurrentTypes((prev) => {
        const next = { ...prev };
        delete next[getPendingItemKey(deleteTarget)];
        return next;
      });
      if (selectedItem?.Id === deleteTarget.Id && selectedItem.Title === deleteTarget.Title) {
        setSelectedItem(null);
        setSurveyJson(null);
        setResponseData(null);
        setEvalSurveyModel(null);
        setCompletedLayers({});
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      if (result.warnings.length > 0) {
        setError(`Submission deleted. Cleanup warnings: ${result.warnings.join(" ")}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle approve
  const handleApprove = async () => {
    if (!token || !selectedItem || !formConfig) return;
    if (selectedLayerAccess && !selectedLayerAccess.allowed) {
      setError("This item is locked because the current layer is assigned to another approver.");
      return;
    }

    setActionLoading(true);
    try {
      const requiresSignature = currentLayerConfig?.type === "approval" && currentLayerConfig.confirmationType === "signature";
      if (requiresSignature && !approvalSignature) {
        throw new Error("A signature is required before approving this layer.");
      }
      const currentLayer = Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
      await assertSubmissionLayerCanAct(token, selectedItem, currentLayer);
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || 1;
      const listName = selectedItem.Title; // list is named after form title
      const nextLayer = getNextWorkflowLayer(branchLayers, currentLayer);
      const nextLayerNumber = nextLayer?.layerNumber ?? currentLayer + 1;
      const isFinal = !nextLayer && currentLayer >= totalLayers;

      // Get next approver email
      let nextApproverEmail = "";
      if (!isFinal) {
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})?$select=L${nextLayerNumber}_Email`
          ) as Record<string, unknown>;
          nextApproverEmail = valueToText(itemEmail[`L${nextLayerNumber}_Email`]);
        } catch {
          nextApproverEmail = "";
        }
        if (!nextApproverEmail) {
          const approvers = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(OSHES_LISTS.approvers)}')/items?$filter=FormTitle eq '${encodeURIComponent(selectedItem.Title)}' and LayerNumber eq ${nextLayerNumber}&$select=ApproverEmail&$top=1`
          ) as { value?: { ApproverEmail: string }[] };
          nextApproverEmail = approvers.value?.[0]?.ApproverEmail || "";
        }
        if (!nextApproverEmail && nextLayer) {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayer, submittedData);
          if (result.error) throw new Error(result.error);
          nextApproverEmail = result.email;
          if (nextApproverEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
              { [`L${nextLayerNumber}_Email`]: nextApproverEmail },
            );
          }
        }
        if (nextLayer?.authMode === "365" && !EMAIL_RE.test(nextApproverEmail)) {
          throw new Error(`Layer ${nextLayerNumber} has no valid assignee email. Fix the workflow before advancing.`);
        }
      }

      // Update status (legacy + enhanced columns)
      const newStatus = isFinal ? "Approved" : `Approved Layer ${currentLayer}`;
      const patchBody: Record<string, unknown> = {
        Status: newStatus,
        CurrentApprovalLayer: isFinal ? currentLayer : nextLayerNumber,
        CurrentLayer: isFinal ? currentLayer : nextLayerNumber, // Keep in sync
        FormStatus: isFinal ? "Completed" : "In Review",
      };
      // Also update enhanced L{n}_Status so the PDF reflects the correct status
      patchBody[`L${currentLayer}_Status`] = SP_LAYER_STATUS.APPROVED;
      patchBody[`L${currentLayer}_SignedAt`] = new Date().toISOString();
      if (approvalSignature) patchBody[`L${currentLayer}_Signature`] = approvalSignature;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        patchBody,
      );

      // For terminal states, generate PDF first so we can include the link in the email
      let pdfUrl: string | undefined;
      if (currentLayer >= totalLayers) {
        try {
          const pdfData = await loadPdfData(selectedItem, token);
          if (pdfData) {
            pdfData.meta.formStatus = "completed";
            const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
            pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
          }
        } catch {
          // Keep the workflow moving even if PDF generation is unavailable.
        }
      }

      // Send notification (with PDF link for terminal states)
      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currentLayer,
        totalLayers,
        action: "approve",
        nextApproverEmail,
        ...(nextLayer?.type ? { nextLayerType: nextLayer.type } : {}),
        ...(nextLayer?.layerNumber ? { nextLayerNumber: nextLayer.layerNumber } : {}),
        ...(nextLayer?.type === "evaluation" ? { nextEmailSchedule: nextLayer.emailSchedule } : {}),
        pdfUrl,
      });

      // Update local list (keep item with new status instead of removing)
      const itemFormStatus = isFinal ? "Completed" : "In Review";
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: newStatus, FormStatus: itemFormStatus, CurrentLayer: isFinal ? currentLayer : nextLayerNumber, CurrentApprovalLayer: isFinal ? currentLayer : nextLayerNumber, L1_Status: i.L1_Status || SP_LAYER_STATUS.APPROVED, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));
      setSelectedItem(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reject
  const handleReject = async (reason: string) => {
    if (!token || !selectedItem || !formConfig) return;
    if (selectedLayerAccess && !selectedLayerAccess.allowed) {
      setError("This item is locked because the current layer is assigned to another approver.");
      return;
    }

    setActionLoading(true);
    try {
      const listName = selectedItem.Title; // list is named after form title

      const currentLayer = selectedItem.CurrentApprovalLayer || selectedItem.CurrentLayer || 1;
      await assertSubmissionLayerCanAct(token, selectedItem, currentLayer);
      let branchLayers: LayerConfigItem[] | null = null;
      if (formConfig.LayerConfig) {
        try { const lc = JSON.parse(formConfig.LayerConfig); branchLayers = getActiveLayers(lc, selectedItem.SelectedBranch); } catch {
          /* Invalid JSON — keep null */
        }
      }
      const totalLayers = branchLayers?.length || formConfig.NumberOfApprovalLayer || selectedItem.totalLayers || currentLayer;
      await spPatch(
        token,
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
        buildRejectedWorkflowPatch(currentLayer, totalLayers, new Date().toISOString(), reason),
      );

      // Generate PDF after writing all terminal layer statuses so the chain is accurate.
      let pdfUrl: string | undefined;
      try {
        const pdfData = await loadPdfData(selectedItem, token);
        if (pdfData) {
          pdfData.meta.formStatus = "rejected";
          const { generateAndStorePdf } = await import("../../utils/generateFormPdf");
          pdfUrl = await generateAndStorePdf(token, selectedItem.Title, selectedItem.Id, pdfData);
        }
      } catch {
        // Keep the workflow moving even if PDF generation is unavailable.
      }

      await triggerApprovalNotification(token, {
        formTitle: selectedItem.Title,
        submittedBy: selectedItem.SubmittedBy,
        responseItemId: selectedItem.Id,
        layer: currentLayer,
        totalLayers,
        action: "reject",
        pdfUrl,
      });

      // Update local list (keep item with new status)
      setPendingItems((prev) => prev.map((i) =>
        i.Id === selectedItem.Id
          ? { ...i, Status: "Rejected", FormStatus: "Rejected", CurrentLayer: currentLayer, CurrentApprovalLayer: currentLayer, PdfUrl: pdfUrl || i.PdfUrl }
          : i
      ));
      setSelectedItem(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const selectedCompany = getSelectedCompany(responseData, surveyJson);
  const selectedItemLocked = !!selectedItem && !needsBranchSelection && selectedLayerAccess?.allowed === false;
  const actionSuccessTitle = actionSuccess
    ? actionSuccess.type === "rejected"
      ? "Submission rejected"
      : actionSuccess.type === "approved"
        ? "Approval recorded"
        : "Evaluation submitted"
    : "";

  if (loading || !adminChecked) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textMuted }}>Loading approvals...</div>
      </div>
    );
  }

  if (adminChecked && (!isAdmin || !isSuperuser)) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><BlockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.red, marginBottom: 8 }}>Access Denied</div>
          <div style={{ color: C.textSecond }}>You need OSHES Forms Owner and Form Builder Superuser permissions to view this page.</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 40, textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><LockIcon style={{ fontSize: 40 }} /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>Sign in required</div>
          <div style={{ color: C.textSecond }}>You must be signed in to view approvals.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Auth banner — topmost */}
        <div style={{ background: C.greenPale, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg,${C.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {((accounts[0]?.username?.[0] || "?").toUpperCase())}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Signed in</div>
            <div style={{ fontSize: 11, color: C.textSecond }}>{accounts[0]?.username || "—"}</div>
          </div>
          <button onClick={() => { clearStoredAuthDecision(); instance.logoutRedirect({ postLogoutRedirectUri: window.location.href }); }}
            style={{ fontSize: 11, color: C.textSecond, background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>
            Sign out
          </button>
        </div>

        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, margin: 0 }}>Submissions</h1>
          <p style={{ color: C.textSecond, marginTop: 4 }}>Review submissions, approvals, and evaluation layers</p>
        </header>

        {error && (
          <div style={{ background: C.redPale, border: "1px solid #FCA5A5", borderRadius: 8, padding: 12, color: C.red, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {emailNotice && (
          <div style={{ background: C.greenPale, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: 12, color: "#065F46", marginBottom: 16 }}>
            {emailNotice}
          </div>
        )}

        {/* Category tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["approvals", "evaluations"] as const).map((mode) => {
            const modeCount = baseFilteredItems.filter(i =>
              mode === "evaluations" ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation" : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation"
            ).length;
            return (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setStatusFilter("pending"); }}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                  background: viewMode === mode ? C.purple : "#fff",
                  color: viewMode === mode ? "#fff" : C.textSecond,
                  boxShadow: viewMode === mode ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {mode === "approvals" ? "Approvals" : "Evaluations"} ({modeCount})
              </button>
            );
          })}
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(viewMode === "evaluations"
            ? (["pending", "evaluated"] as const)
            : (["pending", "approved", "rejected"] as const)
          ).map((tab) => {
            const count = categoryItems.filter((item) => {
              if (tab === "pending") return getItemStatus(item) === "pending";
              if (tab === "approved") return getItemStatus(item) === "approved";
              if (tab === "rejected") return getItemStatus(item) === "rejected";
              return getItemStatus(item) !== "pending";
            }).length;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: statusFilter === tab ? C.purple : "#fff",
                  color: statusFilter === tab ? "#fff" : C.textSecond,
                  boxShadow: statusFilter === tab ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {tab === "evaluated" ? "Evaluated" : tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Filter by form title..."
            value={titleFilter}
            onChange={e => setTitleFilter(e.target.value)}
            style={{
              flex: "1 1 180px", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.textPrimary, outline: "none", minWidth: 0,
            }}
          />
          <input
            type="text"
            placeholder="Filter by submitter email..."
            value={submitterFilter}
            onChange={e => setSubmitterFilter(e.target.value)}
            style={{
              flex: "1 1 180px", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.textPrimary, outline: "none", minWidth: 0,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.textPrimary, outline: "none",
              }}
            />
            <span style={{ fontSize: 12, color: C.textMuted }}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.textPrimary, outline: "none",
              }}
            />
          </div>
          {(titleFilter || submitterFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setTitleFilter(""); setSubmitterFilter(""); setDateFrom(""); setDateTo(""); }}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Reject Reason Dialog */}
        {showRejectDialog && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => setShowRejectDialog(false)}
          >
            <div
              style={{
                background: C.cardBg, borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw",
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Reject Submission</div>
              <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 16 }}>
                Provide a reason for rejecting this submission.
              </div>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={4}
                autoFocus
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                  fontSize: 13, color: C.textPrimary, resize: "vertical", outline: "none",
                  fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowRejectDialog(false); setRejectionReason(""); }}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: C.textSecond, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleReject(rejectionReason);
                    setShowRejectDialog(false);
                    setRejectionReason("");
                  }}
                  disabled={!rejectionReason.trim() || actionLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: rejectionReason.trim() && !actionLoading ? C.red : C.border,
                    color: rejectionReason.trim() && !actionLoading ? "#fff" : C.textMuted,
                    fontSize: 13, fontWeight: 600, cursor: rejectionReason.trim() && !actionLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)", zIndex: 1000,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteConfirmText(""); } }}
          >
            <div
              style={{
                background: C.cardBg, borderRadius: 14, padding: 24, width: 460, maxWidth: "90vw",
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.redPale, color: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DeleteIcon style={{ fontSize: 18 }} />
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Delete Submission Permanently</div>
                  <div style={{ fontSize: 12, color: C.textSecond }}>This removes the submission item and related managed files where possible.</div>
                </div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, margin: "14px 0", fontSize: 12, color: C.textSecond }}>
                <div style={{ fontWeight: 700, color: C.textPrimary }}>{deleteTarget.Title}</div>
                <div>Submitted by {deleteTarget.SubmittedBy || "Unknown"} on {formatDateTime(deleteTarget.SubmittedAt)}</div>
                <div>Item ID: {deleteTarget.Id}</div>
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>
                Type DELETE to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                disabled={deleteLoading}
                autoFocus
                style={{
                  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                  border: `1px solid ${C.border}`, fontSize: 13, color: C.textPrimary, outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
                  disabled={deleteLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "#fff", color: C.textSecond, fontSize: 13, fontWeight: 600,
                    cursor: deleteLoading ? "not-allowed" : "pointer", opacity: deleteLoading ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubmission}
                  disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                  style={{
                    padding: "9px 18px", borderRadius: 8, border: "none",
                    background: deleteConfirmText === "DELETE" && !deleteLoading ? C.red : C.border,
                    color: deleteConfirmText === "DELETE" && !deleteLoading ? "#fff" : C.textMuted,
                    fontSize: 13, fontWeight: 600,
                    cursor: deleteConfirmText === "DELETE" && !deleteLoading ? "pointer" : "not-allowed",
                  }}
                >
                  {deleteLoading ? "Deleting..." : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Items + Detail Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Items List */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, background: C.purplePale, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontWeight: 600, color: C.purple }}>
                {viewMode === "approvals" ? "Approval" : "Evaluation"} {statusFilter === "evaluated" ? "Evaluated" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} ({filteredItems.length})
              </span>
              <span style={{ fontSize: 11, color: C.textSecond }}>
                Newest first
              </span>
            </div>
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.textMuted }}>No submissions</div>
              ) : (
                pagedItems.map((item) => {
                  const itemKey = getPendingItemKey(item);
                  const currentLayerNumber = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0) || 1;
                  const emailStatus = getWorkflowEmailStatus(item.WorkflowEmailLog, currentLayerNumber);
                  const emailSchedule = getScheduledWorkflowEmail(item.WorkflowEmailSchedule, currentLayerNumber);
                  const hasPendingEmailSchedule = emailSchedule?.status === "scheduled";
                  const isEvaluationItem = itemCurrentTypes[itemKey] === "evaluation";
                  return (
                  <div
                    key={getPendingItemKey(item)}
                    onClick={() => loadItemDetails(item)}
                    style={{
                      padding: 16,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                      background: selectedItem?.Id === item.Id && selectedItem.Title === item.Title ? C.purplePale : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{item.Title}</div>
                        <div style={{ fontSize: 13, color: C.textSecond }}>
                          By {item.SubmittedBy} • {formatDateTime(item.SubmittedAt)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          v{item.FormVersion || "Legacy"}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                          {formatLayerProgress(item)}
                        </div>
                        {isEvaluationItem && (isAdmin || isSuperuser) && (
                          <div
                            title={hasPendingEmailSchedule
                              ? `Scheduled for ${formatDateTime(emailSchedule.dueAt)}`
                              : emailStatus.status === "not_sent"
                              ? emailSchedule
                                ? `Scheduled for ${formatDateTime(emailSchedule.dueAt)}`
                                : "No evaluator email delivery has been recorded."
                              : `${emailStatus.recipient} • ${emailStatus.attempts} attempt${emailStatus.attempts === 1 ? "" : "s"} • ${formatDateTime(emailStatus.lastAttemptAt)}`}
                            style={{
                              display: "inline-flex", alignItems: "center", marginTop: 6,
                              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                              background: hasPendingEmailSchedule ? C.amberPale
                                : emailStatus.status === "sent" ? C.greenPale
                                : emailStatus.status === "failed" ? C.redPale
                                  : emailSchedule ? C.amberPale : "#F3F4F6",
                              color: hasPendingEmailSchedule ? "#92400E"
                                : emailStatus.status === "sent" ? "#065F46"
                                : emailStatus.status === "failed" ? "#991B1B"
                                  : emailSchedule ? "#92400E" : C.textSecond,
                            }}
                          >
                            {hasPendingEmailSchedule ? `Email scheduled ${formatDateTime(emailSchedule.dueAt)}`
                              : emailStatus.status === "sent" ? "Evaluator email sent"
                              : emailStatus.status === "failed" ? "Evaluator email failed"
                                : emailSchedule ? `Email scheduled ${formatDateTime(emailSchedule.dueAt)}`
                                  : "Evaluator email not sent"}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {item.PdfUrl && (
                          <a
                            href={item.PdfUrl.startsWith("http") ? item.PdfUrl : `${new URL(SP_SITE_URL).origin}${item.PdfUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 8,
                              background: C.purplePale, color: C.purple, textDecoration: "none",
                            }}
                          >
                            PDF
                          </a>
                        )}
                        <span
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                            background: getItemStatus(item) === "approved" ? C.greenPale
                              : getItemStatus(item) === "rejected" ? C.redPale : C.amberPale,
                            color: getItemStatus(item) === "approved" ? "#065F46"
                              : getItemStatus(item) === "rejected" ? "#991B1B" : "#92400E",
                          }}
                        >
                          {getItemDisplayStatus(item)}
                        </span>
                        <button
                          title="Delete submission permanently"
                          aria-label={`Delete ${item.Title} submission ${item.Id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(item);
                            setDeleteConfirmText("");
                          }}
                          disabled={deleteLoading}
                          style={{
                            width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.redPale}`,
                            background: "#fff", color: C.red, display: "inline-flex", alignItems: "center", justifyContent: "center",
                            cursor: deleteLoading ? "not-allowed" : "pointer", opacity: deleteLoading ? 0.55 : 1,
                          }}
                        >
                          <DeleteIcon style={{ fontSize: 15 }} />
                        </button>
                        {(isAdmin || isSuperuser) && (
                          <button
                            title={item.PdfUrl ? "Rebuild and replace PDF" : "Generate PDF"}
                            aria-label={`${item.PdfUrl ? "Rebuild" : "Generate"} PDF for ${item.Title} submission ${item.Id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRegeneratePdf(item);
                            }}
                            disabled={pdfRegeneratingItemKey === itemKey}
                            style={{
                              width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.purpleMid}`,
                              background: "#fff", color: C.purple, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              cursor: pdfRegeneratingItemKey === itemKey ? "not-allowed" : "pointer",
                              opacity: pdfRegeneratingItemKey === itemKey ? 0.55 : 1,
                            }}
                          >
                            <DescriptionIcon style={{ fontSize: 15 }} />
                          </button>
                        )}
                        {isEvaluationItem && (isAdmin || isSuperuser) && (
                          <button
                            title="Force resend evaluator email"
                            aria-label={`Force resend evaluator email for ${item.Title} submission ${item.Id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleForceResend(item);
                            }}
                            disabled={resendingItemKey === itemKey}
                            style={{
                              width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.purpleMid}`,
                              background: "#fff", color: C.purple, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              cursor: resendingItemKey === itemKey ? "not-allowed" : "pointer",
                              opacity: resendingItemKey === itemKey ? 0.55 : 1,
                            }}
                          >
                            <ReplayIcon style={{ fontSize: 15 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
            {filteredItems.length > SUBMISSIONS_PER_PAGE && (
              <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.textSecond }}>
                  Showing {(listPage - 1) * SUBMISSIONS_PER_PAGE + 1}-{Math.min(listPage * SUBMISSIONS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => setListPage((page) => Math.max(1, page - 1))}
                    disabled={listPage <= 1}
                    style={{
                      padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                      background: "#fff", color: listPage <= 1 ? C.textMuted : C.textSecond,
                      fontSize: 12, fontWeight: 600, cursor: listPage <= 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 12, color: C.textSecond }}>Page {listPage} of {totalListPages}</span>
                  <button
                    onClick={() => setListPage((page) => Math.min(totalListPages, page + 1))}
                    disabled={listPage >= totalListPages}
                    style={{
                      padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                      background: "#fff", color: listPage >= totalListPages ? C.textMuted : C.textSecond,
                      fontSize: 12, fontWeight: 600, cursor: listPage >= totalListPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div style={{ background: C.cardBg, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {!selectedItem ? (
              <div style={{ padding: 48, textAlign: "center", color: C.textMuted }}>Select an item to review</div>
            ) : (
              <>
                <div style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 600, color: C.textPrimary }}>{selectedItem.Title}</div>
                  <div style={{ fontSize: 13, color: C.textSecond, marginTop: 4 }}>
                    Submitted by {selectedItem.SubmittedBy} • {formatDateTime(selectedItem.SubmittedAt)}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    Form Version: {selectedItem.FormVersion || "Legacy"}
                  </div>
                  {selectedCompany && (
                    <div style={{ fontSize: 12, color: C.purple, marginTop: 2, fontWeight: 600 }}>
                      Company: {selectedCompany}
                    </div>
                  )}
                  {selectedItem.SelectedBranch && (
                    <div style={{ fontSize: 12, color: C.purple, marginTop: 2, fontWeight: 500 }}>
                      Branch: {(() => { try {
                        const lc = formConfig?.LayerConfig ? JSON.parse(formConfig.LayerConfig) : null;
                        const selectedBranchKey = selectedItem.SelectedBranch.trim().toLowerCase();
                        const branch = lc?.manualBranches?.find((b: ManualBranch) =>
                          [b.name, b.label].some((candidate) => candidate.trim().toLowerCase() === selectedBranchKey)
                        );
                        return branch?.label || selectedItem.SelectedBranch;
                      } catch { return selectedItem.SelectedBranch; }})()}
                    </div>
                  )}
                  {isSuperuser && selectedActiveLayers.length > 0 && (
                    <WorkflowAssignmentEditor
                      layers={selectedActiveLayers}
                      currentLayerNumber={Math.max(
                        selectedItem.CurrentLayer || 0,
                        selectedItem.CurrentApprovalLayer || 0,
                      ) || 1}
                      layerStates={completedLayers}
                      rawAssignments={selectedItem.WorkflowAssignmentData}
                      saving={assignmentSaving}
                      onSave={handleSaveWorkflowAssignment}
                    />
                  )}
                  {currentLayerType === "evaluation" && (isAdmin || isSuperuser) && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 9, border: `1px solid ${C.purpleMid}`, background: C.purplePale }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>Evaluator email controls</div>
                      <div style={{ fontSize: 11, color: C.textSecond, marginTop: 3 }}>
                        {(() => {
                          const layerNumber = Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
                          const delivery = getWorkflowEmailStatus(selectedItem.WorkflowEmailLog, layerNumber);
                          const schedule = getScheduledWorkflowEmail(selectedItem.WorkflowEmailSchedule, layerNumber);
                          if (schedule?.status === "scheduled") return `Scheduled for ${formatDateTime(schedule.dueAt)}.`;
                          if (delivery.status === "sent") return `Sent to ${delivery.recipient} on ${formatDateTime(delivery.sentAt || delivery.lastAttemptAt)} (${delivery.attempts} attempt${delivery.attempts === 1 ? "" : "s"}).`;
                          if (delivery.status === "failed") return `Last send failed on ${formatDateTime(delivery.lastAttemptAt)}.`;
                          if (schedule) return `Scheduled for ${formatDateTime(schedule.dueAt)}.`;
                          return "No evaluator email has been sent or scheduled.";
                        })()}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
                        <input
                          type="datetime-local"
                          value={customEmailDate}
                          min={toDateTimeLocalValue(new Date())}
                          onChange={(event) => setCustomEmailDate(event.target.value)}
                          style={{ padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 11, background: "#fff" }}
                        />
                        <button
                          onClick={() => void handleSaveCustomEmailDate()}
                          disabled={scheduleSaving || !customEmailDate}
                          style={{
                            padding: "7px 11px", borderRadius: 7, border: `1px solid ${C.purpleMid}`,
                            background: "#fff", color: C.purple, fontSize: 11, fontWeight: 700,
                            cursor: scheduleSaving || !customEmailDate ? "not-allowed" : "pointer",
                            opacity: scheduleSaving || !customEmailDate ? 0.55 : 1,
                          }}
                        >
                          {scheduleSaving ? "Saving..." : "Set custom date"}
                        </button>
                        <button
                          onClick={() => void handleForceResend(selectedItem)}
                          disabled={resendingItemKey === getPendingItemKey(selectedItem)}
                          style={{
                            padding: "7px 11px", borderRadius: 7, border: "none",
                            background: C.purple, color: "#fff", fontSize: 11, fontWeight: 700,
                            cursor: resendingItemKey === getPendingItemKey(selectedItem) ? "not-allowed" : "pointer",
                            opacity: resendingItemKey === getPendingItemKey(selectedItem) ? 0.55 : 1,
                          }}
                        >
                          Send now / resend
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 5 }}>
                        Custom dates must be now or later. Send now works even after a successful delivery.
                      </div>
                    </div>
                  )}
                </div>

                {needsBranchSelection && getItemStatus(selectedItem) === "pending" ? (
                  <>
                    <div style={{ padding: 16, maxHeight: 400, overflow: "auto" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>
                        Submitted Form Details
                      </div>
                      <ReadOnlySubmissionPreview
                        surveyJson={surveyJson}
                        data={responseData}
                        accessToken={token}
                        fallbackData={responseData ?? undefined}
                        compact
                      />
                    </div>
                    <div style={{ padding: 24, textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.purplePale, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>⑂</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>Select Branch</div>
                      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
                        Review the submitted form details, then assign the branch that should handle this approval/evaluation flow.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 260, margin: "0 auto" }}>
                        {availableBranches.map((branch) => (
                          <button key={branch.name} onClick={() => handleSelectBranch(branch.name)} disabled={branchLoading}
                            style={{ padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.purpleMid}`, background: C.cardBg, cursor: branchLoading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: C.purple, fontFamily: "inherit", opacity: branchLoading ? 0.6 : 1 }}
                            onMouseEnter={e => { if (!branchLoading) { e.currentTarget.style.borderColor = C.purple; e.currentTarget.style.background = C.purplePale; }}}
                            onMouseLeave={e => { if (!branchLoading) { e.currentTarget.style.borderColor = C.purpleMid; e.currentTarget.style.background = C.cardBg; }}}>
                            {branch.label || branch.name}
                          </button>
                        ))}
                      </div>
                      {branchLoading && <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted }}>Saving branch selection...</div>}
                    </div>
                  </>
                ) : (
                  <>
                {selectedItemLocked ? (
                  <div style={{ padding: 32, textAlign: "center" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.amberPale, color: C.amber, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                      <LockIcon style={{ fontSize: 24 }} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>Item Locked</div>
                    <div style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
                      This layer is assigned to {selectedLayerAccess?.assignedEmail || "another approver"}. Only that assignee can review or act on it unless a superuser overrides access.
                    </div>
                  </div>
                ) : (
                  <>
                <div style={{ padding: 16, maxHeight: 400, overflow: "auto" }}>
                  <ReadOnlySubmissionPreview
                    surveyJson={surveyJson}
                    data={responseData}
                    accessToken={token}
                    fallbackData={responseData ?? undefined}
                    compact
                  />
                </div>

                {/* Layer History: show completed layers for context */}
                {Object.keys(completedLayers).length > 0 && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 8 }}>Layer History</div>
                    {Object.entries(completedLayers)
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([layerNum, layer]) => {
                        const isRejected = layer.status?.toLowerCase().includes("reject");
                        const isApproved = layer.status?.toLowerCase().includes("approv") || layer.status?.toLowerCase().includes("confirm");
                        return (
                          <div key={layerNum} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 4,
                            borderRadius: 8, fontSize: 12,
                            background: isRejected ? C.redPale : isApproved ? C.greenPale : "transparent",
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: isRejected ? C.red : isApproved ? C.green : C.textMuted,
                            }} />
                            <span style={{ fontWeight: 600, color: C.textPrimary, minWidth: 16 }}>
                              L{layerNum}
                            </span>
                            <span style={{ color: isRejected ? C.red : isApproved ? "#065F46" : C.textMuted, fontWeight: 500, minWidth: 80 }}>
                              {layer.status || "Pending"}
                            </span>
                            {layer.email && (
                              <span style={{ color: C.textSecond }}>{layer.email}</span>
                            )}
                            {layer.rejection && (
                              <span style={{ color: C.red, marginLeft: 4 }}>— {layer.rejection}</span>
                            )}
                            {layer.signedAt && (
                              <span style={{ color: C.textMuted, marginLeft: "auto" }}>
                                {formatDateTime(layer.signedAt)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Evaluation Form: editable SurveyJS for evaluation layers */}
                {currentLayerType === "evaluation" && getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) && evalSurveyModel && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>
                      Evaluation Form
                    </div>
                    <div className="approval-survey-preview">
                      <Survey model={evalSurveyModel} />
                    </div>
                  </div>
                )}

                {currentLayerConfig?.type === "approval" &&
                  currentLayerConfig.confirmationType === "signature" &&
                  getItemStatus(selectedItem) === "pending" &&
                  !isCurrentLayerTerminal(selectedItem, completedLayers) && (
                    <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 10 }}>
                        Approval signature
                      </div>
                      <SignatureCapture value={approvalSignature} onChange={setApprovalSignature} disabled={actionLoading} />
                    </div>
                  )}

                <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12 }}>
                  {currentLayerType === "evaluation" && getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                    <button onClick={handleEvaluationSubmit} disabled={actionLoading || (!!evalSurveyModel && !evalValid)}
                      style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "none",
                        background: (!evalSurveyModel || evalValid) ? C.purple : C.border, color: "#fff", fontWeight: 600,
                        cursor: (actionLoading || (!!evalSurveyModel && !evalValid)) ? "not-allowed" : "pointer", opacity: (actionLoading || (!!evalSurveyModel && !evalValid)) ? 0.6 : 1 }}>
                      {actionLoading ? "Submitting..." : evalSurveyModel && !evalValid ? "Fill required fields" : <><DescriptionIcon style={{ fontSize: 14, marginRight: 4 }} /> Submit Evaluation</>}
                    </button>
                  ) : getItemStatus(selectedItem) === "pending" && !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                    <>
                      <button onClick={handleApprove} disabled={actionLoading || (currentLayerConfig?.type === "approval" && currentLayerConfig.confirmationType === "signature" && !approvalSignature)}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "none",
                          background: C.green, color: "#fff", fontWeight: 600,
                          cursor: actionLoading || (currentLayerConfig?.type === "approval" && currentLayerConfig.confirmationType === "signature" && !approvalSignature) ? "not-allowed" : "pointer",
                          opacity: actionLoading || (currentLayerConfig?.type === "approval" && currentLayerConfig.confirmationType === "signature" && !approvalSignature) ? 0.6 : 1 }}>
                        {currentLayerConfig?.type === "approval" && currentLayerConfig.confirmationType === "signature" && !approvalSignature ? "Signature required" : "✓ Approve"}
                      </button>
                      <button onClick={() => setShowRejectDialog(true)} disabled={actionLoading}
                        style={{ flex: 1, padding: "12px 16px", borderRadius: 8,
                          border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontWeight: 600,
                          cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.6 : 1 }}>
                        <CloseIcon style={{ fontSize: 14, marginRight: 4 }} /> Reject
                      </button>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", color: C.textMuted, fontSize: 13 }}>
                      <span>
                        {getItemDisplayStatus(selectedItem)} — {selectedItem.PdfUrl ? (
                          <a href={selectedItem.PdfUrl.startsWith("http") ? selectedItem.PdfUrl : `${new URL(SP_SITE_URL).origin}${selectedItem.PdfUrl}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: C.purple, fontWeight: 600 }}>View PDF</a>
                        ) : "No PDF available"}
                      </span>
                      {(isAdmin || isSuperuser) && (
                        <button
                          onClick={() => void handleRegeneratePdf(selectedItem)}
                          disabled={pdfRegeneratingItemKey === getPendingItemKey(selectedItem)}
                          style={{
                            padding: "7px 11px", borderRadius: 7, border: `1px solid ${C.purpleMid}`,
                            background: "#fff", color: C.purple, fontSize: 11, fontWeight: 700,
                            cursor: pdfRegeneratingItemKey === getPendingItemKey(selectedItem) ? "not-allowed" : "pointer",
                            opacity: pdfRegeneratingItemKey === getPendingItemKey(selectedItem) ? 0.55 : 1,
                          }}
                        >
                          {pdfRegeneratingItemKey === getPendingItemKey(selectedItem) ? "Rebuilding..." : "Rebuild PDF"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                  </>
                )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Success Animation Overlay ── */}
      {actionSuccess && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: actionSuccess.type === "rejected" ? C.red : C.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <span style={{ fontSize: 36, color: "#fff", fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
              {actionSuccess.type === "rejected" ? <CloseIcon style={{ fontSize: 36 }} /> : <CheckIcon style={{ fontSize: 36 }} />}
            </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: actionSuccess.type === "rejected" ? C.red : C.green }}>{actionSuccessTitle}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, fontWeight: 500 }}>{actionSuccess.message}</div>
            {actionSuccess.pdfUrl && (
              <a href={actionSuccess.pdfUrl.startsWith("http") ? actionSuccess.pdfUrl : `${new URL(SP_SITE_URL).origin}${actionSuccess.pdfUrl}`}
                target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 16, padding: "8px 20px", borderRadius: 8, background: C.purple, color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                <DescriptionIcon style={{ fontSize: 14, marginRight: 4 }} /> View PDF
              </a>
            )}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => { setActionSuccess(null); setSelectedItem(null); }}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.textSecond, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Back to Approvals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
