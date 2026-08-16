/**
 * ApprovalDashboard.tsx — Admin view for pending form approvals
 * Route: /admin/submissions (legacy alias: /admin/approvals)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../../native/NativeForm";
import { parseForm, type NativeForm } from "../../native/schema";
import { useNativeForm } from "../../native/useNativeForm";
import "../../native/native-form.css";

import { spGet, spPatch, triggerApprovalNotification, getAllFormConfigs, getFormConfigByTitle, submitEvaluationData, updateLayerStatus, ensureWorkflowColumns, getSharePointChoices, getFilteredListChoices } from "../../utils/formBuilderSP";
import { SignatureCapture } from "../../utils/signatureCapture";
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
import { formatDisplayDateTimeLong } from "../../utils/displayDateTime";
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
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import LockIcon from "@mui/icons-material/Lock";
import DescriptionIcon from "@mui/icons-material/Description";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import DeleteIcon from "@mui/icons-material/Delete";
import ReplayIcon from "@mui/icons-material/Replay";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { editorial, editorialHairline } from "../../theme/editorial";
import {
  WorkspaceHeader,
  WorkspaceNotice,
  WorkspacePage,
  WorkspacePanelHeader,
  WorkspacePill,
  WorkspaceTag,
} from "./WorkspaceLayout";
import { workspacePanelSx, workspaceSurfaceSx } from "./workspaceStyles";
import { foldOtherAnswers } from "../../utils/surveyOtherAnswers";
import {
  canActOnLayer,
  claimLayerEmail,
  isFixedAssignee,
  isSharedAssigneeLayer,
  layerRecipients,
  routedAssigneeEmail,
  validFixedAssigneeEmails,
} from "../../utils/layerAssignees";
import { buildLayerReviewLink, describeMissingReviewLink } from "../../utils/layerReviewLink";
import type { WorkspaceTone } from "./WorkspaceLayout";
const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSIONS_PER_PAGE = 12;

/** SharePoint hands back site-relative PDF paths; links need the origin. */
function absolutePdfUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${new URL(SP_SITE_URL).origin}${url}`;
}

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
      'FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule',
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
  return formatDisplayDateTimeLong(d, d);
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

  if (isFixedAssignee(layer.assignee)) {
    // A shared layer routes to nobody — it stays blank until someone claims it —
    // so the roster is what has to be valid, not the (empty) routed address.
    if (layer.authMode === "365" && validFixedAssigneeEmails(layer.assignee).length === 0) {
      return { email: "", error: `${layerLabel} needs a valid assignee email before the workflow can start.` };
    }
    return { email: routedAssigneeEmail(layer.assignee) };
  }

  const email = valueToText(submittedData[stripFieldReference(layer.assignee.value)]);

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
  const [evalForm, setEvalForm] = useState<NativeForm | null>(null);
  const placeholderForm = useMemo(() => parseForm(null), []);
  const evalRuntime = useNativeForm(evalForm ?? placeholderForm);
  // Ready once every required question has an answer. A layer with no questions
  // leaves evalForm null, which the button reads as "nothing to fill in".
  const evalValid = evalForm === null || evalRuntime.answered >= evalRuntime.required;
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
    'FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData',
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
    setEvalForm(null);
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
            setEvalForm(null);
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
        const override = isSuperuser;
        setSelectedLayerAccess({
          // A layer naming several people is held by none of them until one acts,
          // so while L{n}_Email is blank any of them may pick it up.
          allowed: override || canActOnLayer(currentResolution.currentLayer, assignedEmail, accounts[0]?.username),
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
          setEvalForm(null);
          return;
        }

        if (currentResolution.currentLayer?.type === "evaluation") {
          setCurrentLayerType("evaluation");
          const evalElements = (currentResolution.currentLayer as EvaluationLayerConfig).surveyElements || [];
          setEvalForm(
            evalElements.length > 0
              ? parseForm(buildEvaluationSurveyJson(evalElements))
              : null,
          );
        } else {
          setCurrentLayerType("approval");
          setEvalForm(null);
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
    if (evalForm && !evalRuntime.validateAll().ok) return;

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

      const fields = evalForm ? foldOtherAnswers(evalRuntime.collect()) : {};

      await submitEvaluationData(token, listName, respId, currLayerNum, {
        confirmerEmail: accounts[0]?.username || "SYSTEM",
        confirmerName: accounts[0]?.name,
        fields,
      });

      await updateLayerStatus(token, listName, respId, currLayerNum, {
        status: SP_LAYER_STATUS.CONFIRMED,
        signedAt: now,
        // Claims a shared layer for whoever actually reviewed it.
        email: claimLayerEmail(currentLayerConfig ?? undefined, selectedLayerAccess?.assignedEmail, accounts[0]?.username),
      });

      // Patch FormStatus, CurrentLayer, Status to SP so the change persists on refresh
      const evalPatch: Record<string, unknown> = {
        Status: isFinal ? "Completed" : "In Review",
        FormStatus: isFinal ? "Completed" : "In Review",
        CurrentLayer: isFinal ? currLayerNum : nextLayerNum,
        CurrentApprovalLayer: isFinal ? currLayerNum : nextLayerNum,
      };
      await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`, evalPatch);

      let nextApproverEmails: string[] = [];
      let nextReviewLink: string | undefined;
      if (nextLayerConfig) {
        let storedNextEmail = "";
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})?$select=L${nextLayerNum}_Email`
          ) as Record<string, unknown>;
          storedNextEmail = valueToText(itemEmail[`L${nextLayerNum}_Email`]);
        } catch {
          storedNextEmail = "";
        }
        // A shared next layer is meant to stay blank until one of its people
        // claims it, so it is never resolved down to a single holder here.
        if (!storedNextEmail && !isSharedAssigneeLayer(nextLayerConfig.assignee)) {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayerConfig, submittedData);
          if (result.error) throw new Error(result.error);
          storedNextEmail = result.email;
          if (storedNextEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${respId})`,
              { [`L${nextLayerNum}_Email`]: storedNextEmail },
            );
          }
        }
        nextApproverEmails = layerRecipients(nextLayerConfig, storedNextEmail);
        if (nextLayerConfig.authMode === "365" && nextApproverEmails.length === 0) {
          throw new Error(`Layer ${nextLayerNum} has no valid assignee email. Fix the workflow before advancing.`);
        }
        // A public next layer is reached only by its own token — the mailbox it
        // is sent to forwards the link on to whoever actually signs.
        nextReviewLink = buildLayerReviewLink({
          baseUrl: window.location.origin,
          layer: nextLayerConfig,
          formSlug: valueToText(formConfig?.Slug),
          responseItemId: respId,
        });
        if (!nextReviewLink) throw new Error(describeMissingReviewLink(nextLayerConfig));
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
        nextApproverEmail: nextApproverEmails,
        ...(nextLayerConfig?.type ? { nextLayerType: nextLayerConfig.type } : {}),
        ...(nextLayerConfig?.layerNumber ? { nextLayerNumber: nextLayerConfig.layerNumber } : {}),
        ...(nextLayerConfig?.authMode ? { nextLayerAuthMode: nextLayerConfig.authMode } : {}),
        ...(nextLayerConfig?.type === "evaluation" ? { nextEmailSchedule: nextLayerConfig.emailSchedule } : {}),
        ...(nextReviewLink ? { reviewLink: nextReviewLink } : {}),
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
        // The branch's own first layer decides the link — a public one is
        // reachable only by its token, never by the admin workspace.
        const branchReviewLink = buildLayerReviewLink({
          baseUrl: window.location.origin,
          layer: bLayers[0],
          formSlug: valueToText(formConfig?.Slug),
          responseItemId: respId,
        });
        if (!branchReviewLink && bLayers[0]) throw new Error(describeMissingReviewLink(bLayers[0]));
        await triggerApprovalNotification(token, {
          formTitle: selectedItem.Title,
          submittedBy: selectedItem.SubmittedBy,
          responseItemId: selectedItem.Id,
          layer: firstLayerNumber,
          totalLayers: bLayers.length,
          action: "submit",
          nextApproverEmail: firstApproverEmail,
          ...(bLayers[0]?.type ? { nextLayerType: bLayers[0].type } : {}),
          ...(bLayers[0]?.authMode ? { nextLayerAuthMode: bLayers[0].authMode } : {}),
          ...(bLayers[0]?.type === "evaluation" ? { nextEmailSchedule: bLayers[0].emailSchedule } : {}),
          ...(branchReviewLink ? { reviewLink: branchReviewLink } : {}),
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

      let storedEmail = valueToText(rawItem[`L${currentLayerNumber}_Email`]);
      // A shared layer stays blank until someone claims it, so it is not pinned
      // to one holder here — the reminder goes to everyone named on it.
      if (!EMAIL_RE.test(storedEmail) && !isSharedAssigneeLayer(currentLayer.assignee)) {
        const resolved = await resolveLayerAssigneeEmail(token, currentLayer, rawItem);
        if (resolved.error) throw new Error(resolved.error);
        storedEmail = resolved.email;
        if (storedEmail) {
          await spPatch(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(item.Title)}')/items(${item.Id})`,
            { [`L${currentLayerNumber}_Email`]: storedEmail },
          );
        }
      }
      const recipient = layerRecipients(currentLayer, storedEmail);
      if (recipient.length === 0) {
        throw new Error(`Layer ${currentLayerNumber} has no valid evaluator email.`);
      }

      const cfg = await getFormConfigByTitle(token, item.Title) as FormConfig | null;
      const reviewLink = buildLayerReviewLink({
        baseUrl: window.location.origin,
        layer: currentLayer,
        formSlug: valueToText(cfg?.Slug),
        responseItemId: item.Id,
      });
      if (!reviewLink) throw new Error(describeMissingReviewLink(currentLayer));

      await triggerApprovalNotification(token, {
        formTitle: item.Title,
        submittedBy: item.SubmittedBy,
        responseItemId: item.Id,
        layer: currentLayerNumber,
        totalLayers: activeLayers.length || item.totalLayers || currentLayerNumber,
        action: "submit",
        nextApproverEmail: recipient,
        nextLayerType: currentLayer.type,
        nextLayerAuthMode: currentLayer.authMode,
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

      let storedEmail = valueToText(rawItem[`L${currentLayerNumber}_Email`]);
      // A shared layer stays blank until someone claims it — schedule for all of them.
      if (!EMAIL_RE.test(storedEmail) && !isSharedAssigneeLayer(currentLayer.assignee)) {
        const resolved = await resolveLayerAssigneeEmail(token, currentLayer, rawItem);
        if (resolved.error) throw new Error(resolved.error);
        storedEmail = resolved.email;
      }
      const recipientList = layerRecipients(currentLayer, storedEmail);
      if (recipientList.length === 0) throw new Error("The active evaluation layer has no valid evaluator email.");
      // The schedule log keeps one recipient string; the cron splits it on send.
      const recipient = recipientList.join("; ");

      const cfg = await getFormConfigByTitle(token, selectedItem.Title) as FormConfig | null;
      const reviewLink = buildLayerReviewLink({
        baseUrl: window.location.origin,
        layer: currentLayer,
        formSlug: valueToText(cfg?.Slug),
        responseItemId: selectedItem.Id,
      });
      if (!reviewLink) throw new Error(describeMissingReviewLink(currentLayer));
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
        setEvalForm(null);
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
      let nextApproverEmails: string[] = [];
      let nextReviewLink: string | undefined;
      if (!isFinal) {
        let storedNextEmail = "";
        try {
          const itemEmail = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})?$select=L${nextLayerNumber}_Email`
          ) as Record<string, unknown>;
          storedNextEmail = valueToText(itemEmail[`L${nextLayerNumber}_Email`]);
        } catch {
          storedNextEmail = "";
        }
        // A shared next layer is meant to stay blank until one of its people
        // claims it, so it is never resolved down to a single holder here.
        const nextIsShared = !!nextLayer && isSharedAssigneeLayer(nextLayer.assignee);
        if (!storedNextEmail && !nextIsShared) {
          const approvers = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(OSHES_LISTS.approvers)}')/items?$filter=FormTitle eq '${encodeURIComponent(selectedItem.Title)}' and LayerNumber eq ${nextLayerNumber}&$select=ApproverEmail&$top=1`
          ) as { value?: { ApproverEmail: string }[] };
          storedNextEmail = approvers.value?.[0]?.ApproverEmail || "";
        }
        if (!storedNextEmail && !nextIsShared && nextLayer) {
          const submittedData = responseData ?? (await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`
          ) as Record<string, unknown>);
          const result = await resolveLayerAssigneeEmail(token, nextLayer, submittedData);
          if (result.error) throw new Error(result.error);
          storedNextEmail = result.email;
          if (storedNextEmail) {
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items(${selectedItem.Id})`,
              { [`L${nextLayerNumber}_Email`]: storedNextEmail },
            );
          }
        }
        nextApproverEmails = layerRecipients(nextLayer, storedNextEmail);
        if (nextLayer?.authMode === "365" && nextApproverEmails.length === 0) {
          throw new Error(`Layer ${nextLayerNumber} has no valid assignee email. Fix the workflow before advancing.`);
        }
        // A public next layer is reached only by its own token — the mailbox it
        // is sent to forwards the link on to whoever actually signs.
        if (nextLayer) {
          nextReviewLink = buildLayerReviewLink({
            baseUrl: window.location.origin,
            layer: nextLayer,
            formSlug: valueToText(formConfig?.Slug),
            responseItemId: selectedItem.Id,
          });
          if (!nextReviewLink) throw new Error(describeMissingReviewLink(nextLayer));
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
      // Claims a shared layer for whoever actually approved it.
      const claimedBy = claimLayerEmail(currentLayerConfig ?? undefined, selectedLayerAccess?.assignedEmail, accounts[0]?.username);
      if (claimedBy) patchBody[`L${currentLayer}_Email`] = claimedBy;
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
        nextApproverEmail: nextApproverEmails,
        ...(nextLayer?.type ? { nextLayerType: nextLayer.type } : {}),
        ...(nextLayer?.layerNumber ? { nextLayerNumber: nextLayer.layerNumber } : {}),
        ...(nextLayer?.authMode ? { nextLayerAuthMode: nextLayer.authMode } : {}),
        ...(nextLayer?.type === "evaluation" ? { nextEmailSchedule: nextLayer.emailSchedule } : {}),
        ...(nextReviewLink ? { reviewLink: nextReviewLink } : {}),
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
    return <WorkspaceNotice title="Loading approvals..." message="Reading submissions and workflow layers from SharePoint." />;
  }

  if (adminChecked && (!isAdmin || !isSuperuser)) {
    return (
      <WorkspaceNotice
        tone="error"
        icon={<BlockIcon sx={{ fontSize: 28 }} />}
        title="Access denied"
        message="This workspace is limited to the OSHES admin group. Ask an administrator to add you if you need to review submissions."
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <WorkspaceNotice
        icon={<LockIcon sx={{ fontSize: 28 }} />}
        title="Sign in required"
        message="You must be signed in with your Microsoft 365 account to view approvals."
      />
    );
  }

  const listLabel = `${viewMode === "approvals" ? "Approval" : "Evaluation"} ${
    statusFilter === "evaluated" ? "evaluated" : statusFilter
  }`;
  const hasFilters = Boolean(titleFilter || submitterFilter || dateFrom || dateTo);

  return (
    <>
      <WorkspacePage>
        <WorkspaceHeader
          eyebrow="OSHES admin workspace"
          title="Submissions"
          subtitle="Review submissions, approvals, and evaluation layers. Signing a layer releases the item to the next one immediately."
          account={accounts[0]?.username || undefined}
          onSignOut={() => {
            clearStoredAuthDecision();
            instance.logoutRedirect({ postLogoutRedirectUri: window.location.href });
          }}
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {emailNotice && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {emailNotice}
          </Alert>
        )}

        {/* Category, then status within it — the two questions an admin asks in order. */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
          {(["approvals", "evaluations"] as const).map((mode) => {
            const modeCount = baseFilteredItems.filter((i) =>
              mode === "evaluations"
                ? itemCurrentTypes[getPendingItemKey(i)] === "evaluation"
                : itemCurrentTypes[getPendingItemKey(i)] !== "evaluation"
            ).length;
            return (
              <WorkspacePill
                key={mode}
                active={viewMode === mode}
                onClick={() => {
                  setViewMode(mode);
                  setStatusFilter("pending");
                }}
              >
                {mode === "approvals" ? "Approvals" : "Evaluations"} ({modeCount})
              </WorkspacePill>
            );
          })}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: "wrap", rowGap: 1 }}>
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
              <WorkspacePill key={tab} active={statusFilter === tab} onClick={() => setStatusFilter(tab)}>
                {tab === "evaluated" ? "Evaluated" : tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
              </WorkspacePill>
            );
          })}
        </Stack>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{ mb: 3, alignItems: { md: "center" }, flexWrap: "wrap", rowGap: 1.5 }}
        >
          <TextField
            size="small"
            placeholder="Filter by form title"
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
            sx={{ flex: "1 1 200px", minWidth: 0 }}
          />
          <TextField
            size="small"
            placeholder="Filter by submitter email"
            value={submitterFilter}
            onChange={(e) => setSubmitterFilter(e.target.value)}
            sx={{ flex: "1 1 200px", minWidth: 0 }}
          />
          <TextField
            size="small"
            type="date"
            label="From"
            slotProps={{ inputLabel: { shrink: true } }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            sx={{ flex: "0 0 auto" }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            slotProps={{ inputLabel: { shrink: true } }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            sx={{ flex: "0 0 auto" }}
          />
          {hasFilters && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setTitleFilter("");
                setSubmitterFilter("");
                setDateFrom("");
                setDateTo("");
              }}
              sx={{ color: editorial.muted, flex: "0 0 auto" }}
            >
              Clear
            </Button>
          )}
        </Stack>

        <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontSize: 19, fontWeight: 800, pb: 0.5 }}>Reject submission</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13, color: editorial.muted, mb: 2 }}>
              The reason is written to the layer record and shown to the submitter.
            </Typography>
            <TextField
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              multiline
              rows={4}
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              variant="outlined"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={!rejectionReason.trim() || actionLoading}
              onClick={() => {
                handleReject(rejectionReason);
                setShowRejectDialog(false);
                setRejectionReason("");
              }}
            >
              Confirm reject
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(deleteTarget)}
          onClose={() => {
            if (!deleteLoading) {
              setDeleteTarget(null);
              setDeleteConfirmText("");
            }
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ fontSize: 19, fontWeight: 800, pb: 0.5 }}>Delete submission permanently</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13, color: editorial.muted, mb: 2 }}>
              This removes the submission item and related managed files where possible. It cannot be undone.
            </Typography>
            {deleteTarget && (
              <Box sx={{ ...workspaceSurfaceSx, backgroundColor: editorial.paperSoft, p: 1.75, mb: 2.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{deleteTarget.Title}</Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                  Submitted by {deleteTarget.SubmittedBy || "Unknown"} on {formatDateTime(deleteTarget.SubmittedAt)}
                </Typography>
                <Typography sx={{ fontSize: 12, color: editorial.muted }}>Item ID: {deleteTarget.Id}</Typography>
              </Box>
            )}
            <TextField
              label="Type DELETE to confirm"
              slotProps={{ inputLabel: { shrink: true } }}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              disabled={deleteLoading}
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              variant="outlined"
              disabled={deleteLoading}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteSubmission}
              disabled={deleteConfirmText !== "DELETE" || deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogActions>
        </Dialog>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
            gap: 3,
            alignItems: "start",
          }}
        >
          {/* Items list */}
          <Box sx={workspacePanelSx}>
            <WorkspacePanelHeader label={`${listLabel} (${filteredItems.length})`} hint="Newest first" />
            <Box sx={{ maxHeight: 600, overflow: "auto" }}>
              {filteredItems.length === 0 ? (
                <Typography sx={{ p: 3, textAlign: "center", fontSize: 13, color: editorial.muted }}>
                  No submissions
                </Typography>
              ) : (
                pagedItems.map((item) => {
                  const itemKey = getPendingItemKey(item);
                  const currentLayerNumber = Math.max(item.CurrentLayer || 0, item.CurrentApprovalLayer || 0) || 1;
                  const emailStatus = getWorkflowEmailStatus(item.WorkflowEmailLog, currentLayerNumber);
                  const emailSchedule = getScheduledWorkflowEmail(item.WorkflowEmailSchedule, currentLayerNumber);
                  const hasPendingEmailSchedule = emailSchedule?.status === "scheduled";
                  const isEvaluationItem = itemCurrentTypes[itemKey] === "evaluation";
                  const selected = selectedItem?.Id === item.Id && selectedItem.Title === item.Title;
                  const itemStatus = getItemStatus(item);
                  const statusTone: WorkspaceTone =
                    itemStatus === "approved" ? "success" : itemStatus === "rejected" ? "error" : "warning";
                  const emailTone: WorkspaceTone = hasPendingEmailSchedule
                    ? "warning"
                    : emailStatus.status === "sent"
                      ? "success"
                      : emailStatus.status === "failed"
                        ? "error"
                        : emailSchedule
                          ? "warning"
                          : "neutral";
                  const emailLabel = hasPendingEmailSchedule
                    ? `Email scheduled ${formatDateTime(emailSchedule.dueAt)}`
                    : emailStatus.status === "sent"
                      ? "Evaluator email sent"
                      : emailStatus.status === "failed"
                        ? "Evaluator email failed"
                        : emailSchedule
                          ? `Email scheduled ${formatDateTime(emailSchedule.dueAt)}`
                          : "Evaluator email not sent";
                  const emailTitle = hasPendingEmailSchedule
                    ? `Scheduled for ${formatDateTime(emailSchedule.dueAt)}`
                    : emailStatus.status === "not_sent"
                      ? emailSchedule
                        ? `Scheduled for ${formatDateTime(emailSchedule.dueAt)}`
                        : "No evaluator email delivery has been recorded."
                      : `${emailStatus.recipient} • ${emailStatus.attempts} attempt${
                          emailStatus.attempts === 1 ? "" : "s"
                        } • ${formatDateTime(emailStatus.lastAttemptAt)}`;

                  return (
                    <Box
                      key={itemKey}
                      onClick={() => loadItemDetails(item)}
                      sx={{
                        p: 2,
                        borderBottom: editorialHairline,
                        cursor: "pointer",
                        borderLeft: `3px solid ${selected ? editorial.pmwBlue : "transparent"}`,
                        backgroundColor: selected ? editorial.blueWash : "transparent",
                        transition: "background-color 0.15s ease",
                        "&:hover": { backgroundColor: selected ? editorial.blueWash : editorial.blueSoft },
                      }}
                    >
                      <Stack direction="row" spacing={1.5} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.3 }}>{item.Title}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: editorial.muted, mt: 0.25 }}>
                            By {item.SubmittedBy} · {formatDateTime(item.SubmittedAt)}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: editorial.softMuted, mt: 0.25 }}>
                            v{item.FormVersion || "Legacy"} · {formatLayerProgress(item)}
                          </Typography>
                          {isEvaluationItem && (isAdmin || isSuperuser) && (
                            <Box sx={{ mt: 0.75 }}>
                              <WorkspaceTag tone={emailTone} title={emailTitle}>
                                {emailLabel}
                              </WorkspaceTag>
                            </Box>
                          )}
                        </Box>

                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
                          {item.PdfUrl && (
                            <Link
                              href={absolutePdfUrl(item.PdfUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              sx={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                px: 1,
                                py: 0.25,
                                borderRadius: "999px",
                                backgroundColor: editorial.blueWash,
                                color: editorial.pmwBlueDark,
                                textDecoration: "none",
                              }}
                            >
                              PDF
                            </Link>
                          )}
                          <WorkspaceTag tone={statusTone}>{getItemDisplayStatus(item)}</WorkspaceTag>
                          <Tooltip title="Delete submission permanently">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Delete ${item.Title} submission ${item.Id}`}
                                disabled={deleteLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(item);
                                  setDeleteConfirmText("");
                                }}
                                sx={{ color: editorial.error }}
                              >
                                <DeleteIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {(isAdmin || isSuperuser) && (
                            <Tooltip title={item.PdfUrl ? "Rebuild and replace PDF" : "Generate PDF"}>
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`${item.PdfUrl ? "Rebuild" : "Generate"} PDF for ${item.Title} submission ${item.Id}`}
                                  disabled={pdfRegeneratingItemKey === itemKey}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRegeneratePdf(item);
                                  }}
                                  sx={{ color: editorial.pmwBlueDark }}
                                >
                                  <DescriptionIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                          {isEvaluationItem && (isAdmin || isSuperuser) && (
                            <Tooltip title="Force resend evaluator email">
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={`Force resend evaluator email for ${item.Title} submission ${item.Id}`}
                                  disabled={resendingItemKey === itemKey}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleForceResend(item);
                                  }}
                                  sx={{ color: editorial.pmwBlueDark }}
                                >
                                  <ReplayIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })
              )}
            </Box>
            {filteredItems.length > SUBMISSIONS_PER_PAGE && (
              <Stack
                direction="row"
                spacing={1.5}
                sx={{ p: 1.5, borderTop: editorialHairline, alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography sx={{ fontSize: 12, color: editorial.muted, fontVariantNumeric: "tabular-nums" }}>
                  Showing {(listPage - 1) * SUBMISSIONS_PER_PAGE + 1}–
                  {Math.min(listPage * SUBMISSIONS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={listPage <= 1}
                    onClick={() => setListPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Typography sx={{ fontSize: 12, color: editorial.muted, fontVariantNumeric: "tabular-nums" }}>
                    Page {listPage} of {totalListPages}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={listPage >= totalListPages}
                    onClick={() => setListPage((page) => Math.min(totalListPages, page + 1))}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>

          {/* Detail panel */}
          <Box sx={workspacePanelSx}>
            {!selectedItem ? (
              <Typography sx={{ p: 6, textAlign: "center", fontSize: 13, color: editorial.muted }}>
                Select an item to review
              </Typography>
            ) : (
              <>
                <Box sx={{ p: 2, borderBottom: editorialHairline }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{selectedItem.Title}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: editorial.muted, mt: 0.5 }}>
                    Submitted by {selectedItem.SubmittedBy} · {formatDateTime(selectedItem.SubmittedAt)}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: editorial.softMuted, mt: 0.25 }}>
                    Form version: {selectedItem.FormVersion || "Legacy"}
                  </Typography>
                  {selectedCompany && (
                    <Typography sx={{ fontSize: 12, color: editorial.pmwBlueDark, fontWeight: 700, mt: 0.25 }}>
                      Company: {selectedCompany}
                    </Typography>
                  )}
                  {selectedItem.SelectedBranch && (
                    <Typography sx={{ fontSize: 12, color: editorial.pmwBlueDark, fontWeight: 700, mt: 0.25 }}>
                      Branch:{" "}
                      {(() => {
                        try {
                          const lc = formConfig?.LayerConfig ? JSON.parse(formConfig.LayerConfig) : null;
                          const selectedBranchKey = selectedItem.SelectedBranch.trim().toLowerCase();
                          const branch = lc?.manualBranches?.find((b: ManualBranch) =>
                            [b.name, b.label].some((candidate) => candidate.trim().toLowerCase() === selectedBranchKey)
                          );
                          return branch?.label || selectedItem.SelectedBranch;
                        } catch {
                          return selectedItem.SelectedBranch;
                        }
                      })()}
                    </Typography>
                  )}
                  {isSuperuser && selectedActiveLayers.length > 0 && (
                    <WorkflowAssignmentEditor
                      layers={selectedActiveLayers}
                      currentLayerNumber={
                        Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1
                      }
                      layerStates={completedLayers}
                      rawAssignments={selectedItem.WorkflowAssignmentData}
                      saving={assignmentSaving}
                      onSave={handleSaveWorkflowAssignment}
                    />
                  )}
                  {currentLayerType === "evaluation" && (isAdmin || isSuperuser) && (
                    <Box sx={{ ...workspaceSurfaceSx, backgroundColor: editorial.blueSoft, p: 1.75, mt: 1.75 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: editorial.pmwBlueDark }}>
                        Evaluator email controls
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.5 }}>
                        {(() => {
                          const layerNumber =
                            Math.max(selectedItem.CurrentLayer || 0, selectedItem.CurrentApprovalLayer || 0) || 1;
                          const delivery = getWorkflowEmailStatus(selectedItem.WorkflowEmailLog, layerNumber);
                          const schedule = getScheduledWorkflowEmail(selectedItem.WorkflowEmailSchedule, layerNumber);
                          if (schedule?.status === "scheduled") return `Scheduled for ${formatDateTime(schedule.dueAt)}.`;
                          if (delivery.status === "sent")
                            return `Sent to ${delivery.recipient} on ${formatDateTime(
                              delivery.sentAt || delivery.lastAttemptAt
                            )} (${delivery.attempts} attempt${delivery.attempts === 1 ? "" : "s"}).`;
                          if (delivery.status === "failed")
                            return `Last send failed on ${formatDateTime(delivery.lastAttemptAt)}.`;
                          if (schedule) return `Scheduled for ${formatDateTime(schedule.dueAt)}.`;
                          return "No evaluator email has been sent or scheduled.";
                        })()}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                        <TextField
                          size="small"
                          type="datetime-local"
                          value={customEmailDate}
                          slotProps={{ htmlInput: { min: toDateTimeLocalValue(new Date()) } }}
                          onChange={(event) => setCustomEmailDate(event.target.value)}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={scheduleSaving || !customEmailDate}
                          onClick={() => void handleSaveCustomEmailDate()}
                        >
                          {scheduleSaving ? "Saving..." : "Set custom date"}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          disabled={resendingItemKey === getPendingItemKey(selectedItem)}
                          onClick={() => void handleForceResend(selectedItem)}
                        >
                          Send now / resend
                        </Button>
                      </Stack>
                      <Typography sx={{ fontSize: 10.5, color: editorial.softMuted, mt: 1 }}>
                        Custom dates must be now or later. Send now works even after a successful delivery.
                      </Typography>
                    </Box>
                  )}
                </Box>

                {needsBranchSelection && getItemStatus(selectedItem) === "pending" ? (
                  <>
                    <Box sx={{ p: 2, maxHeight: 400, overflow: "auto" }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1.5 }}>Submitted form details</Typography>
                      <ReadOnlySubmissionPreview
                        surveyJson={surveyJson}
                        data={responseData}
                        accessToken={token}
                        fallbackData={responseData ?? undefined}
                        compact
                      />
                    </Box>
                    <Box sx={{ p: 3, textAlign: "center", borderTop: editorialHairline }}>
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: "50%",
                          backgroundColor: editorial.blueWash,
                          color: editorial.pmwBlueDark,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          mx: "auto",
                          mb: 2,
                        }}
                      >
                        <CallSplitIcon sx={{ fontSize: 26 }} />
                      </Box>
                      <Typography sx={{ fontSize: 17, fontWeight: 800 }}>Select branch</Typography>
                      <Typography sx={{ fontSize: 12.5, color: editorial.muted, mt: 0.5, mb: 2.5, maxWidth: 360, mx: "auto" }}>
                        Review the submitted form details, then assign the branch that should handle this
                        approval/evaluation flow.
                      </Typography>
                      <Stack spacing={1} sx={{ maxWidth: 280, mx: "auto" }}>
                        {availableBranches.map((branch) => (
                          <Button
                            key={branch.name}
                            variant="outlined"
                            disabled={branchLoading}
                            onClick={() => handleSelectBranch(branch.name)}
                            sx={{ minHeight: 44 }}
                          >
                            {branch.label || branch.name}
                          </Button>
                        ))}
                      </Stack>
                      {branchLoading && (
                        <Typography sx={{ mt: 1.5, fontSize: 11.5, color: editorial.muted }}>
                          Saving branch selection...
                        </Typography>
                      )}
                    </Box>
                  </>
                ) : selectedItemLocked ? (
                  <Box sx={{ p: 4, textAlign: "center" }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        backgroundColor: editorial.yellowSoft,
                        color: editorial.warning,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mx: "auto",
                        mb: 1.75,
                      }}
                    >
                      <LockIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Item locked</Typography>
                    <Typography sx={{ fontSize: 12.5, color: editorial.muted, mt: 0.75, lineHeight: 1.6, maxWidth: 360, mx: "auto" }}>
                      This layer is assigned to {selectedLayerAccess?.assignedEmail || "another approver"}. Only that
                      assignee can review or act on it unless a superuser overrides access.
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ p: 2, maxHeight: 400, overflow: "auto" }}>
                      <ReadOnlySubmissionPreview
                        surveyJson={surveyJson}
                        data={responseData}
                        accessToken={token}
                        fallbackData={responseData ?? undefined}
                        compact
                      />
                    </Box>

                    {/* Layer history: completed layers, for context on the decision */}
                    {Object.keys(completedLayers).length > 0 && (
                      <Box sx={{ px: 2, pb: 2, pt: 2, borderTop: editorialHairline }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1 }}>Layer history</Typography>
                        <Stack spacing={0.5}>
                          {Object.entries(completedLayers)
                            .sort(([a], [b]) => parseInt(a) - parseInt(b))
                            .map(([layerNum, layer]) => {
                              const isRejected = layer.status?.toLowerCase().includes("reject");
                              const isApproved =
                                layer.status?.toLowerCase().includes("approv") ||
                                layer.status?.toLowerCase().includes("confirm");
                              const dot = isRejected ? editorial.error : isApproved ? editorial.success : editorial.softMuted;
                              return (
                                <Stack
                                  key={layerNum}
                                  direction="row"
                                  spacing={1}
                                  sx={{
                                    alignItems: "center",
                                    px: 1.25,
                                    py: 0.75,
                                    borderRadius: "8px",
                                    fontSize: 12,
                                    flexWrap: "wrap",
                                    backgroundColor: isRejected
                                      ? "rgba(198, 40, 40, 0.08)"
                                      : isApproved
                                        ? "rgba(16, 124, 16, 0.08)"
                                        : "transparent",
                                  }}
                                >
                                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot, flexShrink: 0 }} />
                                  <Typography sx={{ fontSize: 12, fontWeight: 800, minWidth: 18 }}>L{layerNum}</Typography>
                                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: dot, minWidth: 80 }}>
                                    {layer.status || "Pending"}
                                  </Typography>
                                  {layer.email && (
                                    <Typography sx={{ fontSize: 12, color: editorial.muted }}>{layer.email}</Typography>
                                  )}
                                  {layer.rejection && (
                                    <Typography sx={{ fontSize: 12, color: editorial.error }}>— {layer.rejection}</Typography>
                                  )}
                                  {layer.signedAt && (
                                    <Typography sx={{ fontSize: 11.5, color: editorial.softMuted, ml: "auto" }}>
                                      {formatDateTime(layer.signedAt)}
                                    </Typography>
                                  )}
                                </Stack>
                              );
                            })}
                        </Stack>
                      </Box>
                    )}

                    {/* Evaluation form: editable, drawn by the native engine */}
                    {currentLayerType === "evaluation" &&
                      getItemStatus(selectedItem) === "pending" &&
                      !isCurrentLayerTerminal(selectedItem, completedLayers) &&
                      evalForm && (
                        <Box sx={{ px: 2, pb: 2, pt: 2, borderTop: editorialHairline }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1.5 }}>Evaluation form</Typography>
                          <NativeFormView runtime={evalRuntime} />
                        </Box>
                      )}

                    {currentLayerConfig?.type === "approval" &&
                      currentLayerConfig.confirmationType === "signature" &&
                      getItemStatus(selectedItem) === "pending" &&
                      !isCurrentLayerTerminal(selectedItem, completedLayers) && (
                        <Box sx={{ px: 2, pb: 2, pt: 2, borderTop: editorialHairline }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 1.25 }}>Approval signature</Typography>
                          <SignatureCapture value={approvalSignature} onChange={setApprovalSignature} disabled={actionLoading} />
                        </Box>
                      )}

                    <Divider />

                    <Stack direction="row" spacing={1.5} sx={{ p: 2, flexWrap: "wrap", rowGap: 1.5 }}>
                      {currentLayerType === "evaluation" &&
                      getItemStatus(selectedItem) === "pending" &&
                      !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                        <Button
                          variant="contained"
                          fullWidth
                          startIcon={<DescriptionIcon />}
                          onClick={handleEvaluationSubmit}
                          disabled={actionLoading || (!!evalForm && !evalValid)}
                          sx={{ minHeight: 44 }}
                        >
                          {actionLoading
                            ? "Submitting..."
                            : evalForm && !evalValid
                              ? "Fill required fields"
                              : "Submit evaluation"}
                        </Button>
                      ) : getItemStatus(selectedItem) === "pending" &&
                        !isCurrentLayerTerminal(selectedItem, completedLayers) ? (
                        <>
                          <Button
                            variant="contained"
                            color="success"
                            startIcon={<CheckIcon />}
                            onClick={handleApprove}
                            disabled={
                              actionLoading ||
                              (currentLayerConfig?.type === "approval" &&
                                currentLayerConfig.confirmationType === "signature" &&
                                !approvalSignature)
                            }
                            sx={{ flex: 1, minHeight: 44 }}
                          >
                            {currentLayerConfig?.type === "approval" &&
                            currentLayerConfig.confirmationType === "signature" &&
                            !approvalSignature
                              ? "Signature required"
                              : "Approve"}
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<CloseIcon />}
                            onClick={() => setShowRejectDialog(true)}
                            disabled={actionLoading}
                            sx={{ flex: 1, minHeight: 44 }}
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ flex: 1, alignItems: "center", justifyContent: "center", flexWrap: "wrap", rowGap: 1 }}
                        >
                          <Typography sx={{ fontSize: 13, color: editorial.muted }}>
                            {getItemDisplayStatus(selectedItem)} —{" "}
                            {selectedItem.PdfUrl ? (
                              <Link
                                href={absolutePdfUrl(selectedItem.PdfUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ fontWeight: 700 }}
                              >
                                View PDF
                              </Link>
                            ) : (
                              "No PDF available"
                            )}
                          </Typography>
                          {(isAdmin || isSuperuser) && (
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => void handleRegeneratePdf(selectedItem)}
                              disabled={pdfRegeneratingItemKey === getPendingItemKey(selectedItem)}
                            >
                              {pdfRegeneratingItemKey === getPendingItemKey(selectedItem) ? "Rebuilding..." : "Rebuild PDF"}
                            </Button>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </>
                )}
              </>
            )}
          </Box>
        </Box>
      </WorkspacePage>

      {/* Action confirmation — a full-page pause so the result is not missed. */}
      {actionSuccess && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            backgroundColor: "rgba(247, 250, 253, 0.94)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
          }}
        >
          <Box sx={{ textAlign: "center", maxWidth: 420 }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                mx: "auto",
                mb: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: editorial.white,
                backgroundColor: actionSuccess.type === "rejected" ? editorial.error : editorial.success,
              }}
            >
              {actionSuccess.type === "rejected" ? <CloseIcon sx={{ fontSize: 36 }} /> : <CheckIcon sx={{ fontSize: 36 }} />}
            </Box>
            <Typography
              sx={{
                fontSize: 21,
                fontWeight: 800,
                color: actionSuccess.type === "rejected" ? editorial.error : editorial.success,
              }}
            >
              {actionSuccessTitle}
            </Typography>
            <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 1 }}>{actionSuccess.message}</Typography>
            <Stack spacing={1.5} sx={{ mt: 3, alignItems: "center" }}>
              {actionSuccess.pdfUrl && (
                <Button
                  component="a"
                  href={absolutePdfUrl(actionSuccess.pdfUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="contained"
                  startIcon={<DescriptionIcon />}
                >
                  View PDF
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={() => {
                  setActionSuccess(null);
                  setSelectedItem(null);
                }}
              >
                Back to submissions
              </Button>
            </Stack>
          </Box>
        </Box>
      )}
    </>
  );
}
