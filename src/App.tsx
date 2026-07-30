import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  useMsal,
  useIsAuthenticated,
} from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import theme from "./theme";
import { loginRequest } from "./auth/msalConfig";
import { createSpClient, isSharePointForbiddenError } from "./utils/sharepointClient";
import {
  AUTH_RECOVERY_REQUIRED_EVENT,
  acquireAccessTokenSilentOrRedirect,
  clearAuthTimeoutReloginAttempt,
  hasAuthTimeoutReloginAttempted,
  isAuthTimeoutReloginRequiredError,
  markAuthTimeoutReloginAttempted,
  startFreshReauthentication,
} from "./utils/authRecovery";
import type { AuthRecoveryEventDetail } from "./utils/authRecovery";
import { SP_STATIC, loadConfig, filterVisibleLists, getMissingConfigs, generateMeta } from "./utils/spConfig";
import { getStoredAuthDecision, setStoredAuthDecision, clearStoredAuthDecision } from "./utils/authDecision";
import type { PageState, Submission, ApprovalLayer, DiscoveredList, ListMetaEntry, LoadedConfig, LayerConfig, LayerConfigItem, ApprovalLayerConfig, ApprovalLayerResult, EvaluationLayerResult, EvaluationDataEntry, HardDeleteSubmissionResult, SurveyJson } from "./types";
import { normalizeLayerStatus } from "./utils/statusConstants";
import { coerceFieldDisplayText, isPlaceholderDisplayValue } from "./utils/submissionDisplay";
import { isRejectedStatus, resolveWorkflowDisplayState } from "./utils/workflowStatus";

// Auth screens
import SignInScreen from "./components/auth/SignInScreen";
import GuestLanding from "./components/auth/GuestLanding";
import WrongTenantScreen from "./components/auth/WrongTenantScreen";
import RestrictedAccessScreen from "./components/auth/RestrictedAccessScreen";
import LoadingScreen, { type LoadingStep } from "./components/auth/LoadingScreen";
import ErrorScreen from "./components/auth/ErrorScreen";
import AdminGuard from "./components/auth/AdminGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import LazyRoute from "./components/LazyRoute";
import { DashboardProvider } from "./contexts/DashboardContext";



const APP_BG = "var(--app-bg, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%))";
const DASHBOARD_LIST_FETCH_CONCURRENCY = 4;
const AUTH_PROFILE_REAUTH_TIMEOUT_MS = 60000;
const INTERNAL_EMAIL_DOMAINS = String(import.meta.env.VITE_INTERNAL_EMAIL_DOMAINS || "pmw-group.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
type AuthProfileStatus = "unknown" | "loading" | "ready" | "restricted";
const AUTH_LOAD_STEP_ORDER = [
  "session",
  "site",
  "permissions",
  "lists",
  "submissions",
  "finalizing",
  "reauth",
] as const;
type AuthLoadStep = (typeof AUTH_LOAD_STEP_ORDER)[number];
type AuthErrorMode = "generic" | "reauth";
const AUTH_LOAD_STEP_TEXT: Record<AuthLoadStep, Pick<LoadingStep, "label" | "description">> = {
  session: {
    label: "Confirm Microsoft 365 session",
    description: "Checking the signed-in account and token state.",
  },
  site: {
    label: "Check SharePoint access",
    description: "Confirming this account can reach the configured OSHES SharePoint site.",
  },
  permissions: {
    label: "Load portal permissions",
    description: "Reading OSHES Forms Owner and Form Builder Superuser access.",
  },
  lists: {
    label: "Discover form lists",
    description: "Finding the form libraries this account can use.",
  },
  submissions: {
    label: "Fetch dashboard submissions",
    description: "Loading visible form responses and workflow status.",
  },
  finalizing: {
    label: "Finish portal setup",
    description: "Preparing the dashboard view.",
  },
  reauth: {
    label: "Refresh Microsoft sign-in",
    description: "Starting one fresh sign-in attempt after the timeout.",
  },
};

const DETAIL_PASSTHROUGH_FIELDS = new Set([
  "Created",
  "Modified",
  "PDPAConsent",
  "PDPANoticeVersion",
  "PDPAConsentAt",
  "RetentionUntil",
]);

const SUBMITTER_NAME_FIELD_KEYS = new Set([
  "applicant",
  "applicantname",
  "employee",
  "employeename",
  "fullname",
  "name",
  "personname",
  "requester",
  "requestername",
  "requestor",
  "requestorname",
  "staff",
  "staffname",
  "submittedbyname",
  "submittedname",
  "submittername",
]);

const SUBMITTER_IDENTITY_FIELD_KEYS = new Set([
  "submittedby",
  "submittedbyemail",
  "submitter",
  "submitteremail",
]);

function normalizeFieldKey(key: string): string {
  return key
    .replace(/_x[0-9a-f]{4}_/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function findDisplayTextByKey(raw: Record<string, unknown>, keys: Set<string>): string {
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.has(normalizeFieldKey(key))) continue;
    const text = coerceFieldDisplayText(value);
    if (!isPlaceholderDisplayValue(text)) return text;
  }
  return "";
}

function cleanIdentityText(value: string): string {
  const trimmed = value.trim();
  const lastPipeSegment = trimmed.includes("|") ? trimmed.split("|").pop() ?? trimmed : trimmed;
  return lastPipeSegment.replace(/^mailto:/i, "").trim();
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanIdentityText(value));
}

function resolveSubmittedByEmail(raw: Record<string, unknown>): string {
  const candidates = [
    raw.submittedByEmail,
    raw.SubmittedBy,
    raw.Submitted_x0020_By,
  ];

  for (const candidate of candidates) {
    const text = cleanIdentityText(coerceFieldDisplayText(candidate));
    if (!isPlaceholderDisplayValue(text) && isEmailLike(text)) return text;
  }

  return "";
}

function resolveCreatedByEmail(raw: Record<string, unknown>): string {
  const author = raw.Author as Record<string, unknown> | undefined;
  const email = cleanIdentityText(coerceFieldDisplayText(raw._authorEmail ?? author?.EMail ?? author?.Email));
  return !isPlaceholderDisplayValue(email) && isEmailLike(email) ? email : "";
}

function resolveSubmitterName(raw: Record<string, unknown>): string {
  const directName = findDisplayTextByKey(raw, SUBMITTER_NAME_FIELD_KEYS);
  if (!isPlaceholderDisplayValue(directName)) return cleanIdentityText(directName);

  const identityName = findDisplayTextByKey(raw, SUBMITTER_IDENTITY_FIELD_KEYS);
  if (!isPlaceholderDisplayValue(identityName) && !isEmailLike(identityName)) {
    return cleanIdentityText(identityName);
  }

  return "";
}

function resolveCreatedByName(raw: Record<string, unknown>): string {
  const author = raw.Author as Record<string, unknown> | undefined;
  const authorName = coerceFieldDisplayText(author?.Title ?? author?.Name ?? author?.DisplayName);
  if (!isPlaceholderDisplayValue(authorName)) return cleanIdentityText(authorName);

  const authorEmail = cleanIdentityText(coerceFieldDisplayText(raw._authorEmail ?? author?.EMail ?? author?.Email));
  if (!isPlaceholderDisplayValue(authorEmail)) return authorEmail;

  return "";
}

function resolveSubmissionTitle(rawTitle: unknown, submitterName: string, submittedByEmail: string, createdByName: string, createdByEmail: string): string {
  const title = coerceFieldDisplayText(rawTitle);
  if (!isPlaceholderDisplayValue(title)) return title;

  if (!isPlaceholderDisplayValue(submitterName)) return submitterName;
  if (!isPlaceholderDisplayValue(submittedByEmail)) return submittedByEmail;
  if (!isPlaceholderDisplayValue(createdByName)) return createdByName;
  if (!isPlaceholderDisplayValue(createdByEmail)) return createdByEmail;
  return "Untitled";
}

function resolveSelectedBranch(raw: Record<string, unknown>): string {
  return (
    coerceFieldDisplayText(raw.SelectedBranch) ||
    coerceFieldDisplayText(raw.Selected_x0020_Branch) ||
    coerceFieldDisplayText(raw.selectedBranch)
  );
}

function getActiveLayerConfig(cfg: LayerConfig | null, selectedBranch: string): LayerConfigItem[] {
  const manualBranches = cfg?.manualBranches ?? [];
  if (manualBranches.length > 0) {
    const normalizedBranch = selectedBranch.trim().toLowerCase();
    if (!normalizedBranch) return [];
    return (
      manualBranches.find((branch) =>
        [branch.name, branch.label].some((candidate) => candidate.trim().toLowerCase() === normalizedBranch)
      )?.layers ?? []
    );
  }

  return cfg?.layers ?? [];
}

function resolveSubmissionSurveyJson(
  listTitle: string,
  formVersion: string,
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>,
): SurveyJson | null {
  const formVersions = surveyJsonByFormVersion?.[listTitle];
  if (!formVersions) return null;

  return formVersions[formVersion] ?? Object.values(formVersions).find((surveyJson): surveyJson is SurveyJson => surveyJson !== null) ?? null;
}

function buildAuthLoadingSteps(activeStep: AuthLoadStep, errorStep: AuthLoadStep | null = null): LoadingStep[] {
  const activeIndex = AUTH_LOAD_STEP_ORDER.indexOf(activeStep);

  return AUTH_LOAD_STEP_ORDER.map((step, index) => {
    let status: LoadingStep["status"] = "pending";

    if (errorStep === step) {
      status = "error";
    } else if (index < activeIndex) {
      status = "complete";
    } else if (index === activeIndex) {
      status = "active";
    }

    return {
      ...AUTH_LOAD_STEP_TEXT[step],
      status,
    };
  });
}

const loadDynamicFormPage = () => import("./pages/DynamicFormPage");
const loadApprovalDashboard = () => import("./components/builder/ApprovalDashboard");
const loadResponseViewer = () => import("./components/builder/ResponseViewer");
const loadAdminHomePage = () => import("./pages/AdminHomePage");
const loadEvaluationPage = () => import("./pages/EvaluationPage");
const loadPrivacyNoticePage = () => import("./pages/PrivacyNoticePage");
const loadPublicReportPage = () => import("./pages/PublicReportPage");
const PortalContainer = lazy(() => import("./components/portal/PortalContainer"));

function isPublicRoutePath(pathname: string): boolean {
  return (
    pathname === "/privacy" ||
    pathname === "/report" ||
    pathname === "/track" ||
    pathname.startsWith("/form/") ||
    pathname.startsWith("/eval/")
  );
}

function getAccountKey(account: AccountInfo | null): string {
  if (!account) return "";
  return account.homeAccountId || account.localAccountId || account.username || "";
}

function getAccountClaim(account: AccountInfo | null, key: string): string {
  const claims = account?.idTokenClaims;
  if (!claims || typeof claims !== "object" || !(key in claims)) return "";
  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function normalizeAccountEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const loginName = trimmed.includes("|") ? trimmed.split("|").pop() || trimmed : trimmed;
  return loginName.replace(/^mailto:/, "");
}

function getAccountEmailCandidates(account: AccountInfo | null): string[] {
  const candidates = new Set<string>();
  for (const value of [
    account?.username,
    getAccountClaim(account, "preferred_username"),
    getAccountClaim(account, "email"),
    getAccountClaim(account, "upn"),
  ]) {
    if (!value) continue;
    const normalized = normalizeAccountEmail(value);
    if (normalized) candidates.add(normalized);
  }
  return [...candidates];
}

function isInternalAccount(account: AccountInfo | null): boolean {
  if (INTERNAL_EMAIL_DOMAINS.length === 0) return false;
  return getAccountEmailCandidates(account).some((email) => {
    if (email.includes("#ext#")) return false;
    const atIndex = email.lastIndexOf("@");
    if (atIndex === -1) return false;
    return INTERNAL_EMAIL_DOMAINS.includes(email.slice(atIndex + 1));
  });
}

function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b/.test(message) || message.toLowerCase().includes("unauthorized");
}

function normalizeStatus(status: string | null): string {
  if (!status) return "pending";
  const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "fullyapproved" || normalized === "completed") return "fullyapproved";
  if (normalized === "approved") return "approved";
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("progress") || normalized.includes("review")) return "inprogress";
  return "pending";
}

function buildConfiguredListFallback(allowedTitles: Set<string>): DiscoveredList[] {
  return [...allowedTitles]
    .sort((a, b) => a.localeCompare(b))
    .map((title) => ({
      title,
      id: "",
      itemCount: 0,
      created: "",
      hidden: false,
      baseTemplate: 100,
      baseType: 0,
      isCatalog: false,
      isSiteAssetsLibrary: false,
      isApplicationList: false,
      isSystemList: false,
      noCrawl: false,
    }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function mapSubmission(
  raw: Record<string, unknown>,
  listTitle: string,
  listMetaMap: Record<string, ListMetaEntry>,
  layerConfigs?: Record<string, LayerConfig | null>,
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>,
): Submission {
  const id = String(raw.Id || "");
  const formId =
    coerceFieldDisplayText(raw.FormID) ||
    coerceFieldDisplayText(raw.FormId) ||
    coerceFieldDisplayText(raw.formId);
  const formVersion = coerceFieldDisplayText(raw.FormVersion) || "1";
  let formStatus = raw.FormStatus ? String(raw.FormStatus) : null;
  const submittedByEmail = resolveSubmittedByEmail(raw);
  const submitterName = resolveSubmitterName(raw);
  const createdByName = resolveCreatedByName(raw);
  const createdByEmail = resolveCreatedByEmail(raw);
  const title = resolveSubmissionTitle(raw.Title, submitterName, submittedByEmail, createdByName, createdByEmail);
  const submittedAt = raw.SubmittedAt ? String(raw.SubmittedAt) : null;
  const modifiedAt = raw.Modified ? String(raw.Modified) : null;
  const rawCurrentLayerValue = raw.CurrentLayer !== undefined && raw.CurrentLayer !== null && raw.CurrentLayer !== ""
    ? raw.CurrentLayer
    : raw.CurrentApprovalLayer;
  let currentLayer = rawCurrentLayerValue !== undefined && rawCurrentLayerValue !== null && rawCurrentLayerValue !== ""
    ? Number(rawCurrentLayerValue) || 0
    : 0;
  const selectedBranch = resolveSelectedBranch(raw);
  const surveyJson = resolveSubmissionSurveyJson(listTitle, formVersion, surveyJsonByFormVersion);

  const cfg = layerConfigs?.[listTitle] ?? null;
  const layersConfig = getActiveLayerConfig(cfg, selectedBranch);
  const hasManualBranches = (cfg?.manualBranches?.length ?? 0) > 0;

  let totalLayers = layersConfig.length;
  if (!totalLayers && !hasManualBranches) {
    totalLayers = 1;
    if (raw.L2_Email) totalLayers = 2;
    if (raw.L3_Email) totalLayers = 3;
  }

  const layers: (ApprovalLayer | null)[] = [];
  const enhancedLayers: (ApprovalLayerResult | EvaluationLayerResult | null)[] = [];
  const layerStatusValues: (string | null)[] = [];

  if (layersConfig.length > 0) {
    for (let i = 0; i < layersConfig.length; i++) {
      const lc = layersConfig[i];
      const n = lc.layerNumber;
      const statusVal = raw[`L${n}_Status`] ? String(raw[`L${n}_Status`]) : null;
      const emailVal = raw[`L${n}_Email`] ? String(raw[`L${n}_Email`]) : null;
      const signedAtVal = raw[`L${n}_SignedAt`] ? String(raw[`L${n}_SignedAt`]) : null;
      const rejectionVal = raw[`L${n}_Rejection`] ? String(raw[`L${n}_Rejection`]) : null;
      const signatureVal = raw[`L${n}_Signature`] ? String(raw[`L${n}_Signature`]) : null;
      const canonicalStatus = normalizeLayerStatus(statusVal);
      const rejectionDisplay = rejectionVal || (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal : null);
      layerStatusValues[i] = statusVal;

      layers.push({
        status: canonicalStatus,
        outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
        email: emailVal,
        signedAt: signedAtVal,
        rejectionReason: rejectionDisplay,
        signature: signatureVal,
      });

      if (lc.type === "evaluation") {
        let evalData: EvaluationDataEntry | null = null;
        const rawEvalData = raw.EvaluationData as string | undefined;
        if (rawEvalData) {
          try {
            const allEvalData = JSON.parse(rawEvalData) as Record<number, EvaluationDataEntry>;
            evalData = allEvalData[n] ?? null;
          } catch {
            /* Invalid JSON — no eval data */
          }
        }
        enhancedLayers.push({
          layerNumber: n,
          type: "evaluation",
          status: canonicalStatus,
          email: emailVal,
          confirmedAt: evalData?.confirmedAt ?? null,
          fields: evalData?.fields ?? {},
          notes: evalData?.notes ?? (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal ?? undefined : undefined),
        });
      } else {
        enhancedLayers.push({
          layerNumber: n,
          type: "approval",
          status: canonicalStatus,
          outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionDisplay,
          signature: signatureVal,
          confirmedVia: (lc as ApprovalLayerConfig).confirmationType ?? "signature",
        });
      }
    }
  } else {
    // Legacy path — old L1-L3 loop
    for (let i = 1; i <= 3; i++) {
      const statusVal = raw[`L${i}_Status`] ? String(raw[`L${i}_Status`]) : null;
      const emailVal = raw[`L${i}_Email`] ? String(raw[`L${i}_Email`]) : null;
      const signedAtVal = raw[`L${i}_SignedAt`] ? String(raw[`L${i}_SignedAt`]) : null;
      const rejectionVal = raw[`L${i}_Rejection`] ? String(raw[`L${i}_Rejection`]) : null;
      const signatureVal = raw[`L${i}_Signature`] ? String(raw[`L${i}_Signature`]) : null;
      const canonicalStatus = normalizeLayerStatus(statusVal);
      const rejectionDisplay = rejectionVal || (isRejectedStatus(statusVal) && statusVal !== "Rejected" ? statusVal : null);
      layerStatusValues[i - 1] = statusVal;
      if (i > totalLayers && (statusVal || emailVal || signedAtVal || rejectionVal || signatureVal)) {
        totalLayers = i;
      }
      if (statusVal || emailVal) {
        layers.push({
          status: canonicalStatus,
          outcome: canonicalStatus === "approved" ? "approved" : canonicalStatus === "rejected" ? "rejected" : undefined,
          email: emailVal,
          signedAt: signedAtVal,
          rejectionReason: rejectionDisplay,
          signature: signatureVal,
        });
      }
    }
  }

  const displayState = resolveWorkflowDisplayState({
    formStatus,
    currentLayer,
    totalLayers,
    layerStatuses: layerStatusValues,
  });
  formStatus = displayState.formStatus;
  currentLayer = displayState.currentLayer;

  // Filter internal fields
  const submissionData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const isDashboardInternalField =
      key.startsWith("odata.") ||
      /^L[1-9]_/.test(key) ||
      key === "FormStatus" ||
      key === "CurrentLayer" ||
      key === "EvaluationData" ||
      key === "WorkflowEmailLog" ||
      key === "WorkflowEmailSchedule" ||
      key === "WorkflowAssignmentData" ||
      key === "FormId" ||
      key === "FormID" ||
      key === "FormVersion" ||
      key === "Title" ||
      key === "Id" ||
      key === "_authorEmail" ||
      key === "Author" ||
      key === "SubmittedAt" ||
      key === "Modified" ||
      key === "SubmittedBy" ||
      key === "Submitted_x0020_By" ||
      key === "SelectedBranch" ||
      key === "Selected_x0020_Branch" ||
      key === "PDPAConsent" ||
      key === "PDPANoticeVersion" ||
      key === "PDPAConsentAt" ||
      key === "RetentionUntil" ||
      key === "AuthorId";

    if (isDashboardInternalField && !DETAIL_PASSTHROUGH_FIELDS.has(key)) {
      continue;
    }
    submissionData[key] = value;
  }

  return {
    id,
    submissionId: id,
    listTitle,
    formId,
    formVersion,
    title,
    submittedByEmail,
    submitterName,
    createdByName,
    createdByEmail,
    submittedAt,
    modifiedAt,
    formStatus,
    totalLayers,
    layers: layers.filter(Boolean) as ApprovalLayer[],
    meta: listMetaMap[listTitle] ?? generateMeta(listTitle),
    submissionData,
    currentLayer,
    selectedBranch,
    enhancedLayers: enhancedLayers.length > 0 ? enhancedLayers : undefined,
    layerConfig: cfg,
    surveyJson,
    workflowAssignmentRaw: raw.WorkflowAssignmentData ? String(raw.WorkflowAssignmentData) : null,
    workflowEmailScheduleRaw: raw.WorkflowEmailSchedule ? String(raw.WorkflowEmailSchedule) : null,
    evaluationDataRaw: raw.EvaluationData ? String(raw.EvaluationData) : null,
  };
}

/** Catch-all route fallback that redirects in an effect (not during render),
 *  preventing race conditions with user-initiated navigations. */
function CatchAllRedirect({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => { nav(to, { replace: true }); }, [nav, to]);
  return null;
}

export default function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const accountKey = getAccountKey(activeAccount);

  const [pageState, setPageState] = useState<PageState>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const userEmail = activeAccount?.username || "";
  const [isAdmin, setIsAdmin] = useState(false);
  /** Read-only OSHES group. Members see everything and can act on nothing. */
  const [isAuditor, setIsAuditor] = useState(false);
  const [authProfileStatus, setAuthProfileStatus] = useState<AuthProfileStatus>("unknown");

  // Dashboard data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [visibleLists, setVisibleLists] = useState<DiscoveredList[]>([]);
  const [loadedConfig, setLoadedConfig] = useState<LoadedConfig | null>(null);
  const [missingConfigs, setMissingConfigs] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<Submission | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState("Initializing...");
  const [authLoadStep, setAuthLoadStep] = useState<AuthLoadStep>("session");
  const [authErrorMode, setAuthErrorMode] = useState<AuthErrorMode>("generic");
  const [authErrorStep, setAuthErrorStep] = useState<AuthLoadStep | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [submitterFilter, setSubmitterFilter] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isPublicRoute = isPublicRoutePath(currentPath);
  const authProfileAccountRef = useRef("");
  const authProfileLoadingRef = useRef(false);
  const postAuthRedirectRef = useRef(false);
  const reauthRedirectInProgressRef = useRef(false);
  const authProfileReady = Boolean(accountKey) && authProfileStatus === "ready" && authProfileAccountRef.current === accountKey;
  const authProfileRestricted = Boolean(accountKey) && authProfileStatus === "restricted" && authProfileAccountRef.current === accountKey;

  useEffect(() => {
    if (accounts.length > 0 && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [instance, accounts]);

  useEffect(() => {
    if (authProfileAccountRef.current === accountKey) return;

    authProfileAccountRef.current = accountKey;
    setAuthProfileStatus("unknown");
    setIsAdmin(false);
    setIsAuditor(false);
    setSubmissions([]);
    setVisibleLists([]);
    setLoadedConfig(null);
    setMissingConfigs([]);
    setDetailItem(null);
    setAuthLoadStep("session");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    authProfileLoadingRef.current = false;
    reauthRedirectInProgressRef.current = false;
    postAuthRedirectRef.current = false;
  }, [accountKey]);

  // Auth state machine.
  useEffect(() => {
    if (inProgress !== "none") return;

    // After the initial auth flow completes, ignore subsequent MSAL
    // inProgress transitions (e.g. from token refreshes triggered
    // by app pages) to prevent redirecting
    // the user away from their current page.
    if (isAuthenticated && activeAccount) {
      if (isPublicRoute || authProfileReady) {
        setPageState("ready");
      } else if (authProfileRestricted) {
        setPageState("restricted");
      } else {
        setPageState("loading");
      }
      return;
    }

    if (isPublicRoute) {
      setPageState("guest");
      return;
    }

    // Check for redirect result first before deciding page state
    const decision = getStoredAuthDecision();
    if (decision === "guest") {
      setPageState("guest");
    } else {
      setPageState("choice");
    }
  }, [isAuthenticated, inProgress, accountKey, isPublicRoute, authProfileReady, authProfileRestricted]);

  useEffect(() => {
    if (!isAuthenticated || inProgress !== "none" || !activeAccount) return;

    const account = activeAccount;

    let validating = false;
    const validateActiveSession = () => {
      if (validating || document.visibilityState === "hidden") return;
      validating = true;
      void acquireAccessTokenSilentOrRedirect(instance, {
        scopes: loginRequest.scopes,
        account,
      })
        .catch(() => {
          // Non-auth token errors are handled by the request that needs the token.
        })
        .finally(() => {
          validating = false;
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateActiveSession();
      }
    };

    window.addEventListener("focus", validateActiveSession);
    window.addEventListener("pageshow", validateActiveSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", validateActiveSession);
      window.removeEventListener("pageshow", validateActiveSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, inProgress, instance, accountKey]);

  useEffect(() => {
    const handleAuthRecoveryRequired = (event: Event) => {
      if (!isAuthenticated || !activeAccount || inProgress !== "none") return;
      if (authProfileLoadingRef.current) return;
      if (reauthRedirectInProgressRef.current) return;

      const detail = event instanceof CustomEvent
        ? event.detail as AuthRecoveryEventDetail | undefined
        : undefined;

      if (hasAuthTimeoutReloginAttempted()) {
        setErrorMsg("The automatic re-login did not finish. Please re-login or sign out to recover your Microsoft 365 session.");
        setAuthErrorMode("reauth");
        setAuthErrorStep("reauth");
        setAuthProfileStatus("unknown");
        setPageState("error");
        return;
      }

      markAuthTimeoutReloginAttempted();
      reauthRedirectInProgressRef.current = true;
      setAuthErrorMode("reauth");
      setAuthErrorStep(null);
      setAuthLoadStep("reauth");
      setLoadProgress(90);
      setLoadStatus(detail?.message || "Microsoft 365 session expired. Reconnecting...");
      setPageState("loading");

      void startFreshReauthentication(instance, loginRequest.scopes, activeAccount).catch((error: unknown) => {
        reauthRedirectInProgressRef.current = false;
        setErrorMsg(error instanceof Error ? error.message : "Could not restart sign-in.");
        setAuthErrorStep("reauth");
        setAuthProfileStatus("unknown");
        setPageState("error");
      });
    };

    window.addEventListener(AUTH_RECOVERY_REQUIRED_EVENT, handleAuthRecoveryRequired);
    return () => window.removeEventListener(AUTH_RECOVERY_REQUIRED_EVENT, handleAuthRecoveryRequired);
  }, [isAuthenticated, inProgress, instance, accountKey]);

  
  useEffect(() => {
    if (pageState !== "loading" || !isAuthenticated || isPublicRoute || !activeAccount || inProgress !== "none") return;
    if (reauthRedirectInProgressRef.current) return;
    if (authProfileLoadingRef.current) return;
    if (authProfileReady) {
      setPageState("ready");
      return;
    }
    if (authProfileRestricted) {
      setPageState("restricted");
      return;
    }

    const account = activeAccount;
    const accountIsInternal = isInternalAccount(account);
    const email = account.username || "";

    let cancelled = false;
    authProfileLoadingRef.current = true;
    setAuthProfileStatus("loading");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setAuthLoadStep("session");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    const spClient = createSpClient(instance, [account]);
    const finishProfileLoad = () => {
      authProfileLoadingRef.current = false;
      window.clearTimeout(reauthTimeoutId);
    };
    const showReauthenticationError = (message: string) => {
      finishProfileLoad();
      setErrorMsg(message);
      setAuthErrorMode("reauth");
      setAuthErrorStep("reauth");
      setAuthProfileStatus("unknown");
      setPageState("error");
    };
    const redirectToFreshSignIn = () => {
      window.clearTimeout(reauthTimeoutId);
      setAuthLoadStep("reauth");
      setLoadProgress((current) => Math.max(current, 85));
      if (hasAuthTimeoutReloginAttempted()) {
        showReauthenticationError("The automatic re-login did not finish before the session timed out again. Please re-login to refresh your Microsoft 365 session.");
        return;
      }

      markAuthTimeoutReloginAttempted();
      setLoadStatus("Authentication timed out. Starting a fresh Microsoft 365 sign-in...");
      void startFreshReauthentication(instance, loginRequest.scopes, account).catch((error: unknown) => {
        if (cancelled) return;
        showReauthenticationError(error instanceof Error ? error.message : "Could not restart sign-in.");
      });
    };
    const reauthTimeoutId = window.setTimeout(() => {
      if (!cancelled && authProfileLoadingRef.current) {
        redirectToFreshSignIn();
      }
    }, AUTH_PROFILE_REAUTH_TIMEOUT_MS);

    async function fetchData() {
      try {
        setAuthLoadStep(accountIsInternal ? "session" : "site");
        setLoadStatus(accountIsInternal ? "Preparing PMW account access..." : "Checking SharePoint site access...");
        setLoadProgress(10);
        if (!accountIsInternal) {
          await spClient.ensureSiteAccess();
          if (cancelled) return;
        }

        setAuthLoadStep("permissions");
        setLoadStatus("Loading permissions and form configuration...");
        setLoadProgress(20);
        const [adminResult, auditorResult, config] = await Promise.all([
          spClient.isGroupMember(SP_STATIC.adminGroup),
          spClient.isGroupMember(SP_STATIC.auditorGroup).catch(() => false),
          loadConfig(spClient),
        ]);
        if (cancelled) return;

        let allLists: DiscoveredList[];
        try {
          setAuthLoadStep("lists");
          setLoadStatus("Discovering SharePoint form lists...");
          allLists = await spClient.discoverLists();
        } catch (error) {
          if (!isSharePointForbiddenError(error)) {
            throw error;
          }
          allLists = buildConfiguredListFallback(config.allowedTitles);
        }
        if (cancelled) return;

        setIsAdmin(adminResult);
        setIsAuditor(auditorResult);
        setLoadedConfig(config);
        setLoadProgress(50);

        // Build map of list → set of emails that should see submissions (including layer assignees)
        const assigneeVisibilityMap: Record<string, Set<string>> = {};
        for (const [title, cfg] of Object.entries(config.layerConfigs || {})) {
          if (!cfg?.layers) continue;
          for (const layer of cfg.layers) {
            if (layer.assignee.type === "user" && layer.assignee.value) {
              if (!assigneeVisibilityMap[title]) assigneeVisibilityMap[title] = new Set();
              assigneeVisibilityMap[title].add(layer.assignee.value.toLowerCase());
            }
          }
        }

        // Step 4: Filter visible lists
        const visible = filterVisibleLists(allLists, adminResult, config.allowedTitles);
        setVisibleLists(visible);

        const listMetaMap: Record<string, ListMetaEntry> = { ...config.listMetaMap };
        for (const list of visible) {
          if (!listMetaMap[list.title]) {
            listMetaMap[list.title] = generateMeta(list.title);
          }
        }

        // Step 5: Fetch submissions
        const totalLists = visible.length;
        setAuthLoadStep("submissions");
        setLoadStatus(
          totalLists > 0
            ? `Fetching submissions from ${totalLists} list${totalLists !== 1 ? "s" : ""}...`
            : "No lists to fetch from."
        );

        let completedLists = 0;
        const submissionsByList = await mapWithConcurrency(
          visible,
          DASHBOARD_LIST_FETCH_CONCURRENCY,
          async (list) => {
            setLoadStatus(`Fetching submissions from "${list.title}"...`);

            try {
              const items = await spClient.queryList(list.title, {
                select: "*",
                orderby: "Created desc",
                top: adminResult || auditorResult ? 5000 : 1000,
              });
              return items.map((item) => mapSubmission(item, list.title, listMetaMap, config.layerConfigs, config.surveyJsonByFormVersion));
            } catch {
              return [] as Submission[];
            } finally {
              completedLists += 1;
              setLoadProgress(50 + Math.round((completedLists / Math.max(totalLists, 1)) * 45));
              setLoadStatus(`Fetched ${completedLists}/${totalLists} list${totalLists !== 1 ? "s" : ""}...`);
            }
          },
        );
        const allSubmissions = submissionsByList.flat();
        if (cancelled) return;

        // Step 6: Finalize
        setAuthLoadStep("finalizing");
        setLoadStatus("Finalizing...");
        setLoadProgress(98);

        const visibleTitles = new Set(visible.map((l) => l.title));
        let finalSubmissions = allSubmissions.filter((s) => visibleTitles.has(s.listTitle));
        // Auditors are read-only but see everything — that is the whole point of the role.
        if (!adminResult && !auditorResult && email) {
          const lowerEmail = email.toLowerCase();
          finalSubmissions = finalSubmissions.filter((s) => {
            // User's own submissions
            if (s.submittedByEmail.toLowerCase() === lowerEmail) return true;
            if (s.createdByEmail?.toLowerCase() === lowerEmail) return true;
            // Submissions where user is a layer assignee
            const assignees = assigneeVisibilityMap[s.listTitle];
            if (assignees?.has(lowerEmail)) return true;
            return false;
          });
        }

        setSubmissions(finalSubmissions);
        setMissingConfigs(getMissingConfigs(visible, config.layerConfig));
        setLoadProgress(100);
        setLoadStatus("Ready.");
        clearAuthTimeoutReloginAttempt();
        setAuthErrorMode("generic");
        setAuthErrorStep(null);
        reauthRedirectInProgressRef.current = false;
        authProfileAccountRef.current = accountKey;
        finishProfileLoad();
        setAuthProfileStatus("ready");
        setPageState("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        if (isAuthTimeoutReloginRequiredError(err)) {
          showReauthenticationError(err instanceof Error ? err.message : "Please re-login to refresh your Microsoft 365 session.");
          return;
        }
        if (isUnauthorizedError(err)) {
          redirectToFreshSignIn();
          return;
        }
        if (isSharePointForbiddenError(err)) {
          finishProfileLoad();
          setErrorMsg("");
          if (accountIsInternal) {
            setErrorMsg("SharePoint returned 403 while loading OSHES data. Confirm that this account can open the configured SharePoint site and lists.");
            setAuthErrorMode("generic");
            setAuthErrorStep(null);
            setAuthProfileStatus("unknown");
            setPageState("error");
            return;
          }
          authProfileAccountRef.current = accountKey;
          setAuthProfileStatus("restricted");
          setPageState("restricted");
          return;
        }
        const message = err instanceof Error ? err.message : "Unknown error occurred";
        finishProfileLoad();
        setErrorMsg(message);
        setAuthErrorMode("generic");
        setAuthErrorStep(null);
        setAuthProfileStatus("unknown");
        setPageState("error");
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      finishProfileLoad();
    };
  }, [pageState, isAuthenticated, isPublicRoute, authProfileReady, authProfileRestricted, inProgress, instance, accountKey]);

  // Navigate to preserved route after successful login.
  useEffect(() => {
    if (
      pageState === "ready" &&
      isAuthenticated &&
      authProfileReady &&
      !isPublicRoute &&
      !postAuthRedirectRef.current
    ) {
      postAuthRedirectRef.current = true;
      try {
        const redirectPath = sessionStorage.getItem("pmw_post_login_redirect");
        if (redirectPath) {
          sessionStorage.removeItem("pmw_post_login_redirect");
          // Root or legacy adminhomepage → the role-scoped portal
          if (redirectPath === "/" || redirectPath === "/adminhomepage") {
            navigate("/portal", { replace: true });
          } else {
            navigate(redirectPath);
          }
        } else if (currentPath === "/" || currentPath === "/adminhomepage") {
          // No stored redirect — the portal resolves the role and its landing screen
          navigate("/portal", { replace: true });
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [pageState, isAuthenticated, authProfileReady, isPublicRoute, navigate, isAdmin, currentPath]);

  useEffect(() => {
    if (pageState === "ready" && authProfileReady && isAdmin && currentPath === "/user/dashboard") {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [pageState, authProfileReady, isAdmin, currentPath, navigate]);

  /** Re-run the profile load, so a fresh filing shows up without a full reload. */
  const handleRefreshSubmissions = useCallback(() => {
    setAuthProfileStatus("unknown");
    authProfileAccountRef.current = "";
    setPageState("loading");
  }, []);

  const handleLogin = () => {
    // Check if login already in progress
    if (inProgress !== "none") {
      return;
    }
    
    setStoredAuthDecision("msal");
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;

    // Preserve current route for post-login redirect
    try {
      sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    } catch {
      // May fail if storage is inaccessible
    }

    // Clear MSAL sessionStorage cache to remove stale interaction state
    // This is the key fix for interaction_in_progress error
    try {
      sessionStorage.removeItem("msal.interaction.status");
      sessionStorage.removeItem("msal.login.error");
    } catch {
      // May fail if storage is inaccessible
    }
    
    instance.loginRedirect(loginRequest);
  };

  const handleSwitchAccount = useCallback(() => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    instance.logoutPopup().catch(() => {
      instance.logoutRedirect();
    });
    clearStoredAuthDecision();
    setTimeout(() => {
      instance.loginRedirect(loginRequest);
    }, 100);
  }, [instance]);

  const handleSignOut = useCallback(() => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    instance.logoutRedirect();
    clearStoredAuthDecision();
  }, [instance]);

  const handleForgetChoice = () => {
    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = false;
    clearStoredAuthDecision();
    setPageState("choice");
  };

  const handleGenericRetry = () => {
    reauthRedirectInProgressRef.current = false;
    setAuthProfileStatus("unknown");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    setAuthLoadStep("session");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setPageState("loading");
  };

  const handleRelogin = () => {
    if (inProgress !== "none") {
      setAuthLoadStep("reauth");
      setLoadProgress((current) => Math.max(current, 85));
      setLoadStatus("Microsoft 365 sign-in is already in progress...");
      setPageState("loading");
      return;
    }

    clearAuthTimeoutReloginAttempt();
    reauthRedirectInProgressRef.current = true;
    setAuthErrorMode("reauth");
    setAuthErrorStep(null);
    setAuthLoadStep("reauth");
    setLoadProgress(90);
    setLoadStatus("Opening Microsoft 365 sign-in...");
    setPageState("loading");

    void startFreshReauthentication(instance, loginRequest.scopes, activeAccount ?? undefined).catch((error: unknown) => {
      reauthRedirectInProgressRef.current = false;
      setErrorMsg(error instanceof Error ? error.message : "Could not restart sign-in.");
      setAuthErrorStep("reauth");
      setAuthProfileStatus("unknown");
      setPageState("error");
    });
  };

  const handleRestrictedRetry = () => {
    reauthRedirectInProgressRef.current = false;
    setAuthProfileStatus("unknown");
    setAuthErrorMode("generic");
    setAuthErrorStep(null);
    setAuthLoadStep("session");
    setLoadProgress(0);
    setLoadStatus("Initializing...");
    setPageState("loading");
  };

  // Filter + sort logic
  const filteredSubmissions = submissions.filter((item) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !item.title.toLowerCase().includes(searchLower) &&
        !item.formId.toLowerCase().includes(searchLower) &&
        !item.submissionId.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (listFilter && item.listTitle !== listFilter) return false;
    if (statusFilter !== "all" && normalizeStatus(item.formStatus) !== statusFilter.toLowerCase()) return false;
    if (submitterFilter) {
      const submitterLower = submitterFilter.toLowerCase();
      const submitterCandidates = [
        item.submittedByEmail,
        item.submitterName ?? "",
        item.createdByName ?? "",
        item.createdByEmail ?? "",
      ];
      if (!submitterCandidates.some((candidate) => candidate.toLowerCase().includes(submitterLower))) return false;
    }
    return true;
  });

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (a.submittedAt || "").localeCompare(b.submittedAt || "");
      case "status":
        return normalizeStatus(a.formStatus).localeCompare(normalizeStatus(b.formStatus));
      case "list":
        return a.listTitle.localeCompare(b.listTitle);
      default: // newest
        return (b.submittedAt || "").localeCompare(a.submittedAt || "");
    }
  });

  const listMetaMap = { ...loadedConfig?.listMetaMap };
  for (const list of visibleLists) {
    if (!listMetaMap[list.title]) {
      listMetaMap[list.title] = generateMeta(list.title);
    }
  }

  const hasFilters = !!(search || listFilter || statusFilter !== "all" || submitterFilter);

  // One client instance for the portal, so its effects do not re-run every render.
  const portalSpClient = useMemo(
    () => createSpClient(instance, activeAccount ? [activeAccount] : accounts),
    [instance, accountKey, accounts.length], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function handleHardDeleteSubmission(item: Submission): Promise<HardDeleteSubmissionResult> {
    if (!isAdmin) {
      throw new Error("Only OSHES Forms Owners can delete submissions.");
    }

    const account = activeAccount ?? accounts[0] ?? null;
    if (!account) {
      throw new Error("No signed-in account is available for SharePoint deletion.");
    }

    const spClient = createSpClient(instance, [account]);
    const result = await spClient.hardDeleteSubmission(item);

    setSubmissions((current) =>
      current.filter((submission) => !(submission.listTitle === item.listTitle && submission.id === item.id))
    );
    setDetailItem((current) =>
      current?.listTitle === item.listTitle && current.id === item.id ? null : current
    );

    return result;
  }

  // ---- Render ----

  if (!isPublicRoute && pageState === "wrong_tenant") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <WrongTenantScreen userEmail={userEmail} onLogout={handleSignOut} onSwitch={handleSwitchAccount} />
      </ThemeProvider>
    );
  }

  if (!isPublicRoute && pageState === "restricted") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RestrictedAccessScreen
          userEmail={userEmail}
          onRetry={handleRestrictedRetry}
          onSwitch={handleSwitchAccount}
          onSignOut={handleSignOut}
        />
      </ThemeProvider>
    );
  }

  if (pageState === "error" && (!isPublicRoute || authErrorMode === "reauth")) {
    const isReauthError = authErrorMode === "reauth";

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorScreen
          errorMsg={errorMsg}
          onRetry={isReauthError ? handleRelogin : handleGenericRetry}
          onSignOut={handleSignOut}
          title={isReauthError ? "Re-login needed" : undefined}
          primaryActionLabel={isReauthError ? "Re-login" : undefined}
          primaryActionIcon={isReauthError ? "login" : undefined}
          recoverySteps={isReauthError ? buildAuthLoadingSteps("reauth", authErrorStep ?? "reauth") : undefined}
        />
      </ThemeProvider>
    );
  }

  const privateRouteNeedsProfile = isAuthenticated && !isPublicRoute && !authProfileReady;
  if (
    (!isPublicRoute && (pageState === "checking" || pageState === "loading" || privateRouteNeedsProfile)) ||
    (isPublicRoute && pageState === "loading" && authErrorMode === "reauth")
  ) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoadingScreen
          userEmail={userEmail || undefined}
          progress={loadProgress}
          status={loadStatus}
          steps={buildAuthLoadingSteps(authLoadStep)}
        />
      </ThemeProvider>
    );
  }

  const showAuthGate = !isAuthenticated && !isPublicRoute;

  if (showAuthGate && pageState === "choice") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SignInScreen
          onLogin={handleLogin}
          onReportSomething={() => navigate("/report")}
          onTrackReport={() => navigate("/track")}
        />
      </ThemeProvider>
    );
  }

  if (showAuthGate && pageState === "guest") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GuestLanding onLogin={handleLogin} onForgetChoice={handleForgetChoice} />
      </ThemeProvider>
    );
  }

  // ---- Portal (ready state) ----
  const portalInner = (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen status="Loading your dashboard..." />}>
        <PortalContainer
          userEmail={userEmail}
          isAdmin={isAdmin}
          isAuditor={isAuditor}
          submissions={submissions}
          visibleLists={visibleLists}
          loadedConfig={loadedConfig}
          spClient={portalSpClient}
          onSignOut={handleSignOut}
          onSwitchAccount={handleSwitchAccount}
          onRefresh={handleRefreshSubmissions}
        />
      </Suspense>
    </ErrorBoundary>
  );

  // ---- Legacy full dashboard, kept for admin power tools ----
  const adminDashboardInner = (
    <ErrorBoundary>
      <DashboardProvider
        userEmail={userEmail}
        isAdmin={isAdmin}
        submissions={submissions}
        visibleLists={visibleLists}
        listMetaMap={listMetaMap}
        missingConfigs={missingConfigs}
        hasFilters={hasFilters}
        detailItem={detailItem}
        setDetailItem={setDetailItem}
        search={search}
        setSearch={setSearch}
        listFilter={listFilter}
        setListFilter={setListFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        submitterFilter={submitterFilter}
        setSubmitterFilter={setSubmitterFilter}
        sortedSubmissions={sortedSubmissions}
        onSignOut={handleSignOut}
        onSwitchAccount={handleSwitchAccount}
        onHardDeleteSubmission={handleHardDeleteSubmission}
      >
        <LazyRoute load={loadAdminHomePage} fallback={<LoadingScreen status="Loading dashboard..." />} />
      </DashboardProvider>
    </ErrorBoundary>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Routes>
          <Route
            path="/privacy"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadPrivacyNoticePage} fallback={<LoadingScreen status="Loading page..." />} />
              </ErrorBoundary>
            }
          />
          <Route
            path="/report"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadPublicReportPage} fallback={<LoadingScreen status="Loading the form..." />} />
              </ErrorBoundary>
            }
          />
          <Route
            path="/track"
            element={
              <ErrorBoundary>
                <LazyRoute load={loadPublicReportPage} fallback={<LoadingScreen status="Loading tracking..." />} />
              </ErrorBoundary>
            }
          />
          <Route path="/portal" element={portalInner} />
          <Route
            path="/form/:formId"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadDynamicFormPage} fallback={<LoadingScreen status="Loading form..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/submissions"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadApprovalDashboard} fallback={<LoadingScreen status="Loading submissions..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadApprovalDashboard} fallback={<LoadingScreen status="Loading approvals..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/responses/:formTitle"
            element={
              <AdminGuard isAdmin={isAdmin}>
                <ErrorBoundary>
                  <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                    <LazyRoute load={loadResponseViewer} fallback={<LoadingScreen status="Loading responses..." />} />
                  </Box>
                </ErrorBoundary>
              </AdminGuard>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <AdminGuard isAdmin={isAdmin}>
                {adminDashboardInner}
              </AdminGuard>
            }
          />
          <Route
            path="/user/dashboard"
            element={
              <ErrorBoundary>
                {adminDashboardInner}
              </ErrorBoundary>
            }
          />
          <Route
            path="/eval/:token"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadEvaluationPage} fallback={<LoadingScreen status="Loading evaluation..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="/eval/:formSlug/:responseId/:layerNumber"
            element={
              <ErrorBoundary>
                <Box sx={{ minHeight: "100vh", background: APP_BG }}>
                  <LazyRoute load={loadEvaluationPage} fallback={<LoadingScreen status="Loading evaluation..." />} />
                </Box>
              </ErrorBoundary>
            }
          />
          <Route
            path="*"
            element={
              pageState === "ready" ? <CatchAllRedirect to="/portal" /> : portalInner
            }
          />
        </Routes>

      </ErrorBoundary>
    </ThemeProvider>
  );
}
