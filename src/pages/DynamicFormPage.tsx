/**
 * DynamicFormPage.tsx - Public form renderer
 * Route: /form/:formId
 */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import NativeFormView from "../native/NativeForm";
import { parseForm, type NativeForm } from "../native/schema";
import { useNativeForm } from "../native/useNativeForm";
import "../native/native-form.css";

import { fileQuestions, uniqueUploadFileName, uploadStamp } from "../utils/fileAttachments";
import { uploadPublicAttachments } from "../utils/publicFileUpload";
import { answerColumnName, isReservedColumnName } from "../utils/reservedColumns";
import { sampleAnswersFor } from "../utils/testRunLaunch";
import { getLatestFormBySlug, getFormVersion, spGet, spPost, spPatch, spDelete, spPatchUrlField, triggerApprovalNotification, getSharePointChoices, getFilteredListChoices, uploadSignatureImage, getFormConfigByTitle, writeMatrixChildItems, ensureMatrixChildList, readMatrixChildItems, uploadFileToDocLib, ensureDocLibrary, ensurePdpaColumns, ensureWorkflowColumns, ensureReferenceNoColumn, toAbsoluteSharePointUrl, getSharePointColumnResolvers, ensureColumnsHoldLongText, SP_TEXT_COLUMN_MAX, coerceForColumnKind, unsavableAnswerReason, ensureColumns, SP_FIELD_KIND } from "../utils/formBuilderSP";
import { SharePointHttpError, isSharePointAccessDeniedError } from "../utils/sharepointClient";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import type { DocumentControlHeader, LayerConfig, LayerConfigItem } from "../types";
import { SP_LAYER_STATUS, SP_FORM_STATUS } from "../utils/statusConstants";
import { getDepartmentApproverLookupConfig } from "../utils/departmentApproverLookup";
import { isFixedAssignee, layerRecipients, routedAssigneeEmail, validFixedAssigneeEmails } from "../utils/layerAssignees";
import { buildLayerReviewLink } from "../utils/layerReviewLink";
import { linkTokenField, mintLinkToken } from "../utils/linkToken";
import { appBaseUrl } from "../config/appBaseUrl";
import { resolveEvaluationSubmitterRouting } from "../utils/evaluationSubmitterRouting";
import { loginRequest } from "../auth/msalConfig";
import { clearStoredAuthDecision } from "../utils/authDecision";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import { Share as IosShareIcon, Lock as LockIcon, Clock as ClockIcon, CalendarDays as CalendarIcon, Search as SearchIcon, Hourglass as HourglassIcon, RefreshCw as RefreshIcon } from "../components/ui/Icons";
import Logo from "../components/Logo";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { getPdpaRetentionUntil, PDPA_CONSENT_LABEL, PDPA_NOTICE_VERSION, PDPA_SUMMARY } from "../utils/pdpa";
import { PREFILLED_QR_PARAM, cloneAndApplyPrefilledQr, decodePrefilledQrPayload, type PrefilledQrPayload } from "../utils/prefilledQr";
import { findLocationField } from "../utils/formFieldHints";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { toSharePointMalaysiaDateTime } from "../utils/sharepointDateTime";
import { OSHES_LISTS } from "../config/oshes";
import { parseReferenceNumberConfig, REFERENCE_NO_FIELD } from "../utils/referenceNumber";
import { COMPANY } from "../config/company";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";
const CONFIGURED_SENDER_EMAIL = (
  import.meta.env.VITE_OSHES_FORM_EMAIL_FROM_ADDRESS ||
  import.meta.env.VITE_EMAIL_FROM_ADDRESS ||
  ""
).trim().toLowerCase();
// Paper/manual sentinel mailbox — a layer assigned to this address is handled on
// paper (no online reviewer). Kept separate from the email "from" mailbox above.
const CONFIGURED_MANUAL_PAPER_EMAIL = (
  import.meta.env.VITE_OSHES_MANUAL_PAPER_ADDRESS || ""
).trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columns the pmw-hrform builder adds to response lists but which may be absent on
// a list provisioned by an older builder. A submission must not fail because of one.
// Columns a submission tolerates being absent. ReferenceNo is here because a
// list provisioned before reference numbers existed has no such column, and a
// respondent should not be blocked on a schema gap.
const OPTIONAL_SIGNED_IN_SUBMISSION_COLUMNS = new Set(["FormStatus", "CurrentLayer", "PublishKey", REFERENCE_NO_FIELD]);

/**
 * Claims this submission's reference from the server.
 *
 * Signed-in submissions write their own list item, so without this call two
 * people submitting at once would compute the same "next" number.
 * `/api/next-reference` is the only thing that hands numbers out; guests never
 * come through here because `api/submit-form.ts` allocates on their behalf.
 *
 * Failure is propagated rather than swallowed: the reference is the ID the
 * record is filed, searched and chased under, so a submission saved without one
 * is worse than a submission the respondent is asked to retry.
 */
/**
 * @param testTicket A test run's ticket: the server verifies it and, if it is
 *   genuine, draws the number from the form's TEST- series instead.
 */
async function claimReferenceNumber(listTitle: string, testTicket = ""): Promise<string> {
  const res = await fetch("/api/next-reference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
    body: JSON.stringify({ listTitle, ...(testTicket ? { testTicket } : {}) }),
  });
  const data = await res.json().catch(() => ({})) as { enabled?: boolean; referenceNo?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not assign a reference number (${res.status}).`);
  }
  return data.enabled && typeof data.referenceNo === "string" ? data.referenceNo : "";
}

function isOptionalSignedInSubmissionColumn(fieldName: string): boolean {
  return (
    OPTIONAL_SIGNED_IN_SUBMISSION_COLUMNS.has(fieldName) ||
    fieldName.endsWith("_Response") ||
    fieldName.endsWith("_Json") ||
    fieldName.endsWith("_RowIds")
  );
}

function mapBodyToSharePointColumnKeys(
  body: Record<string, unknown>,
  resolveColumnKey: (fieldName: string) => string | null,
  listTitle: string,
  isMultiValueColumn: (fieldName: string) => boolean = () => false,
  columnKind: (fieldName: string) => number | undefined = () => undefined,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(body)) {
    const columnKey = resolveColumnKey(fieldName);
    if (!columnKey) {
      if (isOptionalSignedInSubmissionColumn(fieldName)) continue;
      throw new Error(`The form field "${fieldName}" is not provisioned in "${listTitle}". Please republish the form before trying again.`);
    }
    // A MultiChoice column wants the array itself; anything else (a multi-file
    // list landing in a Text column) still travels as JSON text.
    const kind = columnKind(fieldName);
    const shaped = coerceForColumnKind(
      Array.isArray(value) && !isMultiValueColumn(fieldName) ? JSON.stringify(value) : value,
      kind,
    );
    // Said here, by name, rather than left to SharePoint, whose refusal names
    // neither the question nor the answer.
    const reason = unsavableAnswerReason(shaped, kind);
    if (reason) {
      const shown = typeof shaped === "string" ? shaped : JSON.stringify(shaped);
      throw new Error(`The answer to "${fieldName}" ("${shown.slice(0, 80)}") cannot be saved: ${reason}. The form and its SharePoint list disagree about this question; ask an OSHES admin to republish the form.`);
    }
    mapped[columnKey] = shaped;
  }
  return mapped;
}

function documentHeaderFromMeta(meta: Record<string, unknown> | undefined, formId: string, formVersion: string): Required<DocumentControlHeader> {
  const raw = meta?.documentHeader;
  const header = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as DocumentControlHeader
    : {};
  return {
    documentNumber: header.documentNumber || formId,
    issueNumber: header.issueNumber || "",
    effectiveDate: header.effectiveDate || "",
    revisionNumber: header.revisionNumber || formVersion,
    revisionDate: header.revisionDate || "",
  };
}

function isExpiredPublishProfile(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && Date.parse(value) <= Date.now();
}

type LoadedFormData = {
  formConfig: Record<string, unknown>;
  surveyJson: Record<string, unknown>;
  meta: Record<string, unknown>;
};

/**
 * JSON.stringify with object keys emitted in sorted order, so two structurally
 * identical objects built by different code paths compare equal. The public
 * endpoint and the direct SharePoint read assemble formConfig in a different key
 * order, which a plain stringify would report as a difference.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function loadedFormDataEquals(a: LoadedFormData, b: LoadedFormData): boolean {
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false; // circular or otherwise unserialisable — treat as changed
  }
}

/**
 * A reload normally resolves to exactly the same published form — a guest read
 * followed by the signed-in read once MSAL settles, say. Swapping in an equal but
 * newly allocated object there re-derives the document control header and rebuilds the
 * SurveyJS model, so the header blanks out and anything already typed is lost. Keep
 * the existing object unless the content actually changed.
 */
function applyLoadedFormData(
  setFormData: Dispatch<SetStateAction<LoadedFormData | null>>,
  next: LoadedFormData,
): void {
  setFormData(prev => (prev && loadedFormDataEquals(prev, next) ? prev : next));
}

function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

function submittedValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function collectSharePointDateTimeFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const root = surveyJson && typeof surveyJson === "object" && !Array.isArray(surveyJson)
    ? surveyJson as Record<string, unknown>
    : {};
  const pages = Array.isArray(root.pages) ? root.pages : [];

  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!element || typeof element !== "object" || Array.isArray(element)) continue;
      const record = element as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const type = typeof record.type === "string" ? record.type : "";
      const inputType = typeof record.inputType === "string" ? record.inputType : "";
      if (name && (type === "date" || type === "datetime" || (type === "text" && (inputType === "date" || inputType === "datetime-local")))) {
        names.add(name);
      }
      walk(record.elements);
      walk(record.templateElements);
    }
  };

  for (const page of pages) {
    if (page && typeof page === "object" && !Array.isArray(page)) {
      walk((page as Record<string, unknown>).elements);
    }
  }
  return names;
}

function normalizeSharePointDateTimeFields(
  raw: Record<string, unknown>,
  surveyJson: unknown,
): void {
  for (const fieldName of collectSharePointDateTimeFieldNames(surveyJson)) {
    if (!(fieldName in raw)) continue;
    const normalized = toSharePointMalaysiaDateTime(raw[fieldName]);
    if (normalized) raw[fieldName] = normalized;
  }
}

interface UploadCandidate {
  content: string;
  name?: string;
}

interface UrlFieldPatch {
  fieldName: string;
  url: string;
  description: string;
}

function uploadCandidateFromValue(value: unknown): UploadCandidate | null {
  if (typeof value === "string" && value.trim().startsWith("data:")) {
    return { content: value.trim() };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = record.content ?? record.data ?? record.fileContent;
    if (typeof content === "string" && content.trim().startsWith("data:")) {
      return {
        content: content.trim(),
        name: submittedValueToString(record.name) || submittedValueToString(record.fileName) || undefined,
      };
    }
  }
  return null;
}

function uploadFileName(fieldName: string, candidate: UploadCandidate, index = 0): string {
  // Stamped even when the file kept its own name: every upload for a form goes
  // into one library, and a second "quote.pdf" used to replace the first.
  const stamp = uploadStamp(Date.now(), index);
  if (candidate.name?.trim()) return uniqueUploadFileName(candidate.name, stamp);
  const mimeMatch = candidate.content.match(/^data:([^;,]+)[;,]/);
  const ext = (mimeMatch ? mimeMatch[1].split('/').pop() || 'bin' : 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  return uniqueUploadFileName(`${fieldName}.${ext}`, stamp);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read generated PDF."));
    reader.readAsDataURL(blob);
  });
}

function safePdfFileName(title: string, id: number): string {
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "manual-workflow";
  return `${safeTitle}_submission_${id}_manual.pdf`;
}

function resolveLayerEmail(layer: LayerConfigItem, submittedData: Record<string, unknown>): string {
  const label = layer.title || `Layer ${layer.layerNumber}`;

  if (isFixedAssignee(layer.assignee)) {
    // A layer naming several people is left unassigned — whoever acts claims it —
    // so the roster is what has to be valid here, not the (empty) routed address.
    if (layer.authMode === "365" && validFixedAssigneeEmails(layer.assignee).length === 0) {
      throw new Error(`${label} needs a valid assignee email before this form can be submitted.`);
    }
    return routedAssigneeEmail(layer.assignee);
  }

  const email = submittedValueToString(submittedData[stripFieldReference(layer.assignee.value)]).trim();
  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    throw new Error(`${label} needs a valid assignee email before this form can be submitted.`);
  }
  return email;
}

function manualPaperStatusForLayer(layer: LayerConfigItem): string {
  return layer.type === "evaluation" ? "Manual Evaluation Required" : "Manual Approval Required";
}

function shouldUseManualPaperForSender(layer: LayerConfigItem, email: string): boolean {
  return layer.manualPaperWhenSenderEmail !== false &&
    !!CONFIGURED_MANUAL_PAPER_EMAIL &&
    email.trim().toLowerCase() === CONFIGURED_MANUAL_PAPER_EMAIL;
}

async function resolveDepartmentApproverEmail(
  token: string,
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  if (layer.assignee.type !== "department-approver") {
    return { email: resolveLayerEmail(layer, submittedData), name: "" };
  }

  const label = layer.title || `Layer ${layer.layerNumber}`;
  const departmentField = layer.assignee.value.trim();
  const department = submittedValueToString(submittedData[departmentField]);
  if (!departmentField) {
    throw new Error(`${label} needs a department field before this form can be submitted.`);
  }
  if (!department) {
    throw new Error(`${label} needs a department value before this form can be submitted.`);
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
    throw new Error(`${label} could not find ${config.roleValue || "an approver"} for department "${department}".`);
  }
  if (matches.length > 1) {
    throw new Error(`${label} found more than one ${config.roleValue || "approver"} for department "${department}".`);
  }

  const email = submittedValueToString(matches[0][config.emailColumn]);
  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    throw new Error(`${label} found an invalid approver email for department "${department}".`);
  }

  return {
    email,
    name: submittedValueToString(matches[0][config.nameColumn]),
  };
}

async function resolveLayerAssignee(
  layer: LayerConfigItem,
  submittedData: Record<string, unknown>,
  token: string | null,
): Promise<{ email: string; name: string }> {
  if (layer.assignee.type === "department-approver") {
    if (!token) {
      throw new Error("Department approver lookup needs a SharePoint token or server-side submission.");
    }
    return resolveDepartmentApproverEmail(token, layer, submittedData);
  }
  return { email: resolveLayerEmail(layer, submittedData), name: "" };
}
const APP_FONT_FAMILY = "'Figtree',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO_FONT_FAMILY = "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace";

// Theme tokens. Soft UI palette: ground, white sheets, filled inputs, one blue
// primary. Dark mode keeps the same roles with its own values.
const LIGHT = {
  purple: "#1A5FD0", purpleLight: "#174FB0", purplePale: "#D9E5FB", purpleMid: "#C9DAF8", purpleDark: "#0B3B8C",
  onPrimary: "#FFFFFF", focus: "#9DBDF5",
  bg: "#EEF2F8", cardBg: "#FFFFFF", offWhite: "#F5F7FB", chip: "#EDF0F5", border: "#E3E8F0",
  textPrimary: "#161B24", textSecond: "#586174", textMuted: "#586174",
  green: "#2E9D6A", greenPale: "#D5F0E1", greenText: "#0E5233", greenBorder: "#2E9D6A",
  red: "#B3261E", redPale: "#FADBD8", amber: "#6B4A00", amberPale: "#FCEFC7",
  shadow: "0 1px 3px rgba(22,27,36,0.08)", shadowLg: "0 10px 40px rgba(22,27,36,0.06)", shadowFab: "0 6px 16px rgba(26,95,208,0.28)",
};

const DARK = {
  ...LIGHT, purple: "#7AA7F0", purpleLight: "#9DBDF5", purplePale: "#1B2E4D", purpleMid: "#2F4A75", purpleDark: "#C9DAF8",
  onPrimary: "#0B1220", focus: "#4F7FD0",
  bg: "#101923", cardBg: "#17212B", offWhite: "#111B25", chip: "#243140", border: "#2F3B47",
  textPrimary: "#F8FAFC", textSecond: "#CBD5E1", textMuted: "#94A3B8",
  green: "#3DBE85", greenPale: "#052e16", greenText: "#86EFAC", greenBorder: "#166534",
  red: "#F2A29C", redPale: "#3b0707", amber: "#F5C36B", amberPale: "#2d1b00",
  shadow: "0 1px 3px rgba(0,0,0,.4)", shadowLg: "0 8px 40px rgba(0,0,0,.5)", shadowFab: "0 6px 16px rgba(0,0,0,.4)",
};

const globalCss = (t: typeof LIGHT) => `
  @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;font-family:${APP_FONT_FAMILY}!important}
  body{font-family:${APP_FONT_FAMILY};background:${t.bg};color:${t.textPrimary};transition:background .3s,color .3s}
  .dfp-mono{font-family:${MONO_FONT_FAMILY}!important;font-variant-numeric:tabular-nums}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes dfpPop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}
  .dfp-spin{animation:spin .9s linear infinite}
  .dfp-pop{animation:dfpPop .5s cubic-bezier(.16,1,.3,1) both}
  .dfp-pill{transition:background-color .2s ease,filter .2s ease,transform .12s ease;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .dfp-pill:hover{filter:brightness(.96)}
  .dfp-pill:active{transform:scale(.97)}
  a.dfp-pill{text-decoration:none}
  .dfp-link:hover{text-decoration:underline}
  button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid ${t.focus};outline-offset:2px}
  .dfp-header{flex-wrap:nowrap}
  .dfp-banner-logo img{max-height:48px!important}
  .dfp-doc-control{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid ${t.border};border-bottom:1px solid ${t.border};background:${t.cardBg}}
  .dfp-doc-cell{min-height:42px;padding:7px 8px;border-right:1px solid ${t.border};display:flex;align-items:center;justify-content:center;gap:4px;text-align:center;font-size:12px;color:${t.textPrimary};line-height:1.35}
  .dfp-doc-cell:last-child{border-right:none}
  .dfp-doc-label{font-weight:700}
  .dfp-doc-value{font-weight:600;color:${t.textSecond}}
  .dfp-company-option span{text-wrap:pretty}
  @media(max-width:768px){
    .dfp-banner-logo{width:116px!important}
    .dfp-banner-row{flex-direction:column!important}
    .dfp-banner-logo{border-right:none!important;border-bottom:inherit;padding:10px 12px!important;width:100%!important;min-height:64px}
    .dfp-banner-logo img{max-height:40px!important}
    .dfp-banner-info{font-size:12px!important;padding:10px 12px!important}
    .dfp-company-option{flex-basis:100%!important}
    .dfp-doc-control{grid-template-columns:1fr}
    .dfp-doc-cell{border-right:none;border-bottom:1px solid ${t.border};justify-content:flex-start;text-align:left;padding:8px 12px}
    .dfp-doc-cell:last-child{border-bottom:none}
  }
  @media(max-width:640px){
    .dfp-header{padding:0 12px!important;min-height:52px!important}
    .dfp-header-left{gap:6px!important}
    .dfp-title{font-size:14px!important;max-width:140px}
    .dfp-user-name{display:none}
    .dfp-badge{font-size:11px!important;padding:2px 8px!important}
    .dfp-header-right{gap:6px!important}
    .dfp-version{display:none}
    .dfp-content{padding:20px 16px 72px!important}
  }
  @media(max-width:480px){
    .dfp-title{max-width:100px}
    .dfp-banner-logo img{max-height:34px!important}
    .dfp-state-card{padding:32px 22px!important}
  }
  @media (prefers-reduced-motion: reduce){
    .dfp-spin,.dfp-pop{animation:none!important}
    .dfp-pill{transition:none!important}
  }
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-thumb{background:${t.purpleMid};border-radius:10px}
`;

/** Button looks: one filled per view, the rest tonal or ghost. Pills throughout. */
const pillBase = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  minHeight: 52, padding: "0 28px", borderRadius: 999, border: "none",
  fontFamily: APP_FONT_FAMILY, fontSize: 16, fontWeight: 700, lineHeight: 1.2,
  whiteSpace: "nowrap" as const, textDecoration: "none",
};
const pillFilled = (t: typeof LIGHT) => ({ ...pillBase, background: t.purple, color: t.onPrimary });
const pillTonal = (t: typeof LIGHT) => ({ ...pillBase, background: t.purplePale, color: t.purple });
const pillGhost = (t: typeof LIGHT) => ({ ...pillBase, background: t.chip, color: t.textSecond });

/**
 * Which failure a load error is. Matched on the message the loaders throw:
 * a closed or expired form has its own honest title; a missing one is not
 * found; anything else (network, API) is a plain failure to load.
 */
export function formErrorKind(message: string): "closed" | "expired" | "notFound" | "failed" {
  const text = message.toLowerCase();
  if (text.includes("turned off")) return "closed";
  if (text.includes("expired")) return "expired";
  if (text.includes("no form slug") || text.includes("not found") || text.includes("404")) return "notFound";
  return "failed";
}

/** A spinning arc in the house ring style. Still for reduced motion users. */
const Spinner = ({ size = 30, t }: { size?: number; t: typeof LIGHT }) => (
  <svg className="dfp-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flexShrink: 0, display: "block" }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke={t.purpleMid} strokeWidth="3" />
    <circle cx="12" cy="12" r="9" fill="none" stroke={t.purple} strokeWidth="3" strokeLinecap="round" strokeDasharray="14 57" />
  </svg>
);

const MsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
    <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
    <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
    <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
  </svg>
);

const ScrollProgress = ({ t }: { t: typeof LIGHT }) => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setPct(total > 0 ? Math.min(100, (el.scrollTop / total) * 100) : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <div style={{ position: "fixed", top: 4, left: 12, right: 12, height: 4, zIndex: 9999, pointerEvents: "none", borderRadius: 999 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: t.purple, transition: "width .1s linear", borderRadius: 999 }} />
    </div>
  );
};

/** The centred white card every state screen uses: one icon, a title, one sentence, pill actions. */
function StateCard({
  t, tone, icon, title, body, actions, role,
}: {
  t: typeof LIGHT;
  tone: "amber" | "neutral" | "primary";
  icon: ReactNode;
  title: string;
  body: ReactNode;
  actions: ReactNode;
  role?: "alert";
}) {
  const palette = tone === "amber"
    ? { background: t.amberPale, color: t.amber }
    : tone === "primary"
      ? { background: t.purplePale, color: t.purple }
      : { background: t.chip, color: t.textSecond };
  return (
    <div style={{ minHeight: "100dvh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: APP_FONT_FAMILY }}>
      <style>{globalCss(t)}</style>
      <section
        role={role}
        className="dfp-state-card"
        style={{
          width: "100%", maxWidth: 480, background: t.cardBg, borderRadius: 32, boxShadow: t.shadowLg,
          padding: "40px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
          animation: "fadeUp .3s ease",
        }}
      >
        <div aria-hidden="true" style={{ width: 112, height: 112, borderRadius: 999, background: palette.background, color: palette.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25, color: t.textPrimary, textWrap: "balance" } as CSSProperties}>{title}</h1>
          <div style={{ fontSize: 16, lineHeight: 1.55, color: t.textSecond, maxWidth: 380, overflowWrap: "anywhere", textWrap: "pretty" } as CSSProperties}>{body}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
          {actions}
        </div>
      </section>
    </div>
  );
}

function BackToHomeLink({ t }: { t: typeof LIGHT }) {
  return (
    <a href="/" className="dfp-pill" style={{ ...pillGhost(t), width: "100%" }}>Back to home</a>
  );
}

const SuccessScreen = ({ formTitle, referenceNo, onReset, t, isTestRun, testEmailDisplay, testRunReview }: { formTitle: string; referenceNo: string; onReset: () => void; t: typeof LIGHT; isTestRun?: boolean; testEmailDisplay?: string; testRunReview?: { href: string; label: string } | null }) => {
  const [referenceCopied, setReferenceCopied] = useState(false);
  useEffect(() => {
    if (!referenceCopied) return;
    const timer = window.setTimeout(() => setReferenceCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [referenceCopied]);
  const copyReference = () => {
    navigator.clipboard?.writeText(referenceNo).then(() => setReferenceCopied(true)).catch(() => {});
  };

  return (
    <div style={{ textAlign: "center", padding: "40px 12px 24px", animation: "fadeUp .3s ease", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {isTestRun && (
        <div role="status" style={{ maxWidth: 440, width: "100%", margin: "0 auto 24px", padding: "10px 16px", background: t.amberPale, color: t.amber, borderRadius: 16, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
          Test run: this was a rehearsal, not a real submission. Every email it sends goes only to {testEmailDisplay || "the nominated test address"}.
        </div>
      )}
      <div className="dfp-pop" aria-hidden="true" style={{ width: 112, height: 112, borderRadius: 999, background: t.green, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: t.textPrimary, marginBottom: 10, lineHeight: 1.2 }}>Submitted</h1>
      <p style={{ color: t.textSecond, fontSize: 16, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>Your response for <strong style={{ color: t.textPrimary }}>{formTitle}</strong> has been recorded.</p>
      {referenceNo && (
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              className="dfp-mono"
              style={{ background: t.chip, color: t.textPrimary, borderRadius: 999, padding: "12px 22px", fontSize: 20, fontWeight: 500, letterSpacing: "0.02em", whiteSpace: "nowrap", userSelect: "all" }}
            >
              {referenceNo}
            </span>
            <button type="button" onClick={copyReference} className="dfp-pill" style={{ ...pillGhost(t), minHeight: 44, padding: "0 18px", fontSize: 14, color: referenceCopied ? t.greenText : t.textSecond, background: referenceCopied ? t.greenPale : t.chip }}>
              {referenceCopied ? <><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>Copied</> : <><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy</>}
            </button>
          </div>
          <p style={{ color: t.textSecond, fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: 0 }}>Keep this number — you can check progress at /track</p>
          <a href={`/track?ref=${encodeURIComponent(referenceNo)}`} className="dfp-pill" style={pillTonal(t)}>Track this report</a>
        </div>
      )}
      {isTestRun && testRunReview && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <a href={testRunReview.href} className="dfp-pill" style={pillFilled(t)}>
            {testRunReview.label}
          </a>
          <div style={{ fontSize: 13, color: t.textSecond }}>A signed-in step opens only for whoever it is assigned to.</div>
        </div>
      )}
      <button type="button" onClick={onReset} className="dfp-pill" style={{ ...pillGhost(t), marginTop: 28 }}>Submit another response</button>
    </div>
  );
};

const PrivateGate = ({ formTitle, onSignIn, t }: { formTitle: string; onSignIn: () => void; t: typeof LIGHT }) => (
  <StateCard
    t={t}
    tone="primary"
    icon={<LockIcon size={48} />}
    title="Sign in to open this form"
    body={<><strong style={{ color: t.textPrimary }}>{formTitle || "This form"}</strong> is for PMW staff only. Sign in with your work account to continue.</>}
    actions={
      <>
        <button type="button" onClick={onSignIn} className="dfp-pill" style={{ ...pillFilled(t), width: "100%", minHeight: 56, gap: 12 }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MsIcon size={15} />
          </span>
          Sign in with Microsoft 365
        </button>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>
          Need to report something? <a href="/report" className="dfp-link" style={{ color: t.purple, fontWeight: 700 }}>Report something without signing in</a>
        </p>
      </>
    }
  />
);

export default function DynamicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("version");
  const publishKey = searchParams.get("publish") || searchParams.get("batch");
  const explicitPrefill = useMemo(() => decodePrefilledQrPayload(searchParams.get(PREFILLED_QR_PARAM)), [searchParams]);
  /** Where the QR poster is nailed up, handed over by the public report picker. */
  const posterLocation = searchParams.get("location") ?? "";
  // A test run in progress. The ticket is what the server verifies before it
  // redirects any email this submission generates. `testEmail` is display-only:
  // the server never reads it, it takes the address out of the signed ticket.
  const testTicket = searchParams.get("testTicket") || "";
  const testEmailDisplay = searchParams.get("testEmail") || "";
  const isTestRun = testTicket.length > 0;
  // "Simulate submission": fill with sample answers and submit once. Ignored
  // without a test ticket, so a real link can never submit itself.
  const simulateRequested = isTestRun && searchParams.get("simulate") === "1";
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [dark, _setDark] = useState(() => { try { return localStorage.getItem("dfp_dark") === "1"; } catch { return false; } });
  const t = dark ? DARK : LIGHT;

  useEffect(() => { document.body.style.background = t.bg; document.body.style.color = t.textPrimary; return () => { document.body.style.background = ""; document.body.style.color = ""; }; }, [t]);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<LoadedFormData | null>(null);

  /**
   * A poster's `?location=` is resolved against *this* form's schema, because
   * only the form knows what it calls that question. A miss leaves the field
   * empty for the reporter to fill in — never a guess about where an answer
   * gets stored. An explicit prefill payload stays authoritative over it.
   */
  const prefilledQrPayload = useMemo<PrefilledQrPayload | null>(() => {
    const field = posterLocation ? findLocationField(formData?.surveyJson) : "";
    if (!field) return explicitPrefill;
    const base: PrefilledQrPayload = explicitPrefill ?? { v: 1, values: {}, locked: [] };
    if (field in base.values) return base;
    return { ...base, values: { ...base.values, [field]: posterLocation } };
  }, [explicitPrefill, posterLocation, formData]);
  const [enrichedSurveyJson, setEnrichedSurveyJson] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  /** Reference allocated to the submission just made, for the success screen. */
  const [submittedReference, setSubmittedReference] = useState("");
  // Kept alongside the status so a failed submit can say *why* — swallowing this
  // is what reduced a specific, fixable config error to "could not be completed".
  const [submitError, setSubmitError] = useState("");
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [pdpaConsentError, setPdpaConsentError] = useState("");
  /** Where a simulated submission has got to; "blocked" hands the form back. */
  const [simulateStep, setSimulateStep] = useState<"idle" | "armed" | "done" | "blocked">("idle");
  /** A test run's step-1 link, offered on the success screen. */
  const [testRunReview, setTestRunReview] = useState<{ href: string; label: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const shareUrl = (() => {
    const params = new URLSearchParams();
    if (pinVersion) params.set("version", pinVersion);
    if (publishKey) params.set("publish", publishKey);
    const query = params.toString();
    return window.location.origin + window.location.pathname + (query ? `?${query}` : "");
  })();
  const tokenRef = useRef<string | null>(null);
  // Set when the signed-in user's own SharePoint credentials cannot reach the form
  // lists, so reads and writes both have to go through the public endpoints instead.
  const spDirectUnavailableRef = useRef(false);
  const userEmail = accounts[0]?.username || null;
  // `accounts` is a fresh array on some MSAL events; key the loaders off the identity
  // itself so an unrelated event cannot re-trigger a full form reload.
  const activeAccountId = accounts[0]?.homeAccountId;
  const lastDataRef = useRef<Record<string, unknown> | null>(null);

  // main.tsx settles MSAL before React renders, but it caps that wait at 3s and gives
  // up silently if initialize() throws — so `inProgress` can still be pending here, or
  // never reach None at all. Give it a grace period, then load anyway: a guest filling
  // in a public form must never be held behind a sign-in state that is stuck.
  // Someone with a cached account waits longer, because giving up early loads the form
  // as a guest and then reloads it as them a moment later, which is what swaps the
  // header out from under a user whose session is slow to restore.
  const [msalSettleExpired, setMsalSettleExpired] = useState(false);
  useEffect(() => {
    if (inProgress === InteractionStatus.None) return;
    let hasCachedAccount = false;
    try { hasCachedAccount = instance.getAllAccounts().length > 0; } catch { /* not initialised yet */ }
    const timer = setTimeout(() => setMsalSettleExpired(true), hasCachedAccount ? 6000 : 1500);
    return () => clearTimeout(timer);
  }, [inProgress, instance]);
  const authStateSettled = inProgress === InteractionStatus.None || msalSettleExpired;

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (!isAuthenticated) return;
    const account = instance.getAllAccounts()[0];
    if (!account) return;
    const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
    acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account }).then(token => { tokenRef.current = token; }).catch(() => {});
  }, [isAuthenticated, inProgress, instance, activeAccountId]);

  useEffect(() => {
    if (!formId) { setError("No form slug provided."); setLoading(false); return; }
    // Wait for the sign-in state to settle before reading anything. Loading while MSAL
    // is still restoring the session resolves the form as a guest, then re-runs as the
    // signed-in user and overwrites the first result — which is how the document header
    // and company selector rendered and then vanished a moment later.
    if (!authStateSettled) return;

    let cancelled = false;

    // Reads the published form through the public endpoint, which resolves it with
    // the app-only credential. Used for guests, and as a fallback for signed-in
    // users whose own SharePoint permissions cannot reach the version lists.
    const loadFromPublicApi = async () => {
      const params = new URLSearchParams({ slug: formId });
      if (pinVersion) params.set("version", pinVersion);
      if (publishKey) params.set("publish", publishKey);
      const res = await fetch(`/api/form-config?${params.toString()}`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
      });
      const contentType = res.headers.get("content-type") || "";
      const responseText = await res.text();

      if (contentType.includes("text/html") || responseText.trim().startsWith("<")) {
        throw new Error("API endpoint not available (returned HTML). Are you running 'vercel dev'?");
      }

      // Detect if Vite served the raw TypeScript source instead of executing the API
      if (responseText.includes("export default async function") || responseText.includes('from "/api/_utils/')) {
        throw new Error("API route is returning source code instead of executing. Make sure you're running 'vercel dev' (not 'npm run dev').");
      }

      // Check HTTP status before attempting JSON parse
      if (!res.ok) {
        let errorDetail: string;
        try {
          const errJson = JSON.parse(responseText);
          errorDetail = errJson.error || `Server error: ${res.status}`;
        } catch {
          errorDetail = `Server returned status ${res.status}: ${responseText.substring(0, 200)}`;
        }
        throw new Error(errorDetail);
      }

      let parsed: { error?: string; formConfig?: Record<string, unknown>; surveyJson?: Record<string, unknown>; meta?: Record<string, unknown> };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        throw new Error(`Server returned non-JSON: ${responseText.substring(0, 200)}`);
      }

      if (!parsed.formConfig) {
        throw new Error("Invalid API response: missing formConfig.");
      }
      if (!parsed.surveyJson) {
        throw new Error(`Form "${formId}" has no published content for this link. Please republish the form and share the link again.`);
      }

      return {
        formConfig: parsed.formConfig,
        surveyJson: parsed.surveyJson,
        meta: (parsed.meta || {}) as Record<string, unknown>,
      };
    };

    const load = async () => {
      try {
        const origin = new URL(import.meta.env.VITE_SP_SITE_URL || "https://placeholder.sharepoint.com").origin;
        let token = tokenRef.current;

        // Try to acquire token if authenticated
        const account = instance.getAllAccounts()[0];
        if (!token && isAuthenticated && account) {
          try {
            token = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account });
            tokenRef.current = token;
          } catch {
            // Guest/public loading remains available when silent authentication fails.
          }
        }

        // Signed-in users read straight from SharePoint under their own identity so
        // private forms work, but that read depends on their list permissions. When it
        // fails — or comes back without survey content — fall back to the public
        // endpoint instead of leaving the page with nothing to render.
        const loadFromSharePoint = async (accessToken: string) => {
          let cfgRaw: Record<string, unknown>;
          let ver: { surveyJson: unknown; meta: unknown; layerConfig?: unknown; publishStatus?: string; publishExpiresAt?: string } | null;
          if (pinVersion) {
            const cfgRes = await fetchWithAuthRecovery(`${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(formId)}'&$select=Title,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,FormID,NumberOfApprovalLayer,Slug,IsPublic,ApprovalRules,ConditionField,LayerConfig&$top=1`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json;odata=nometadata" } });
            if (!cfgRes.ok) throw new SharePointHttpError("Failed to load form config", cfgRes);
            cfgRaw = (await cfgRes.json()).value?.[0];
            if (!cfgRaw) throw new Error(`Form "${formId}" not found.`);
            ver = await getFormVersion(accessToken, cfgRaw.Title as string, pinVersion, publishKey);
            if (!ver) throw new Error(`Version ${pinVersion} not found.`);
            if (ver.publishStatus === "off") throw new Error("This published form profile is turned off.");
            if (isExpiredPublishProfile(ver.publishExpiresAt)) throw new Error("This published form profile has expired.");
            if (ver.layerConfig) {
              cfgRaw.LayerConfig = JSON.stringify(ver.layerConfig);
            }
            cfgRaw.CurrentVersion = pinVersion;
            if (publishKey) cfgRaw.CurrentPublishKey = publishKey;
          } else {
            const latest = await getLatestFormBySlug(accessToken, formId, publishKey);
            if (!latest) throw new Error(`Form "${formId}" not found.`);
            cfgRaw = latest.formConfig as unknown as Record<string, unknown>;
            ver = { surveyJson: latest.surveyJson, meta: latest.meta };
          }
          if (!ver?.surveyJson) {
            throw new Error(`Published content for "${formId}" could not be read from SharePoint.`);
          }
          return {
            formConfig: cfgRaw,
            surveyJson: ver.surveyJson as Record<string, unknown>,
            meta: (ver.meta || {}) as Record<string, unknown>,
          };
        };

        if (token) {
          try {
            const direct = await loadFromSharePoint(token);
            if (cancelled) return;
            spDirectUnavailableRef.current = false;
            applyLoadedFormData(setFormData, direct);
          } catch (spError) {
            let fallback: Awaited<ReturnType<typeof loadFromPublicApi>>;
            try {
              fallback = await loadFromPublicApi();
            } catch {
              throw spError;
            }
            if (cancelled) return;
            // A private form has to be read and submitted under the signed-in user's
            // own identity, so report the access problem rather than quietly
            // downgrading them to an anonymous respondent.
            if (fallback.formConfig.IsPublic === false) {
              if (!isSharePointAccessDeniedError(spError)) throw spError;
              throw new Error(
                `You do not have access to "${String(fallback.formConfig.Title || formId)}". This form is restricted to named SharePoint users — ask an OSHES Forms Owner to grant you access, then reload this page.`,
                { cause: spError },
              );
            }
            // Silent for the respondent — the public endpoint serves the same form —
            // but a permission gap here is a real configuration problem, so leave a
            // trace someone can find when diagnosing a report.
            console.warn(`[form] SharePoint read failed for "${formId}", served via /api/form-config instead:`, spError);
            spDirectUnavailableRef.current = true;
            applyLoadedFormData(setFormData, fallback);
          }
        } else {
          // Guests, and signed-in users whose token could not be acquired silently.
          const publicData = await loadFromPublicApi();
          if (cancelled) return;
          spDirectUnavailableRef.current = false;
          applyLoadedFormData(setFormData, publicData);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [formId, pinVersion, publishKey, isAuthenticated, authStateSettled, instance, activeAccountId]);

  // Enrich survey JSON with SharePoint-sourced choices
  useEffect(() => {
    const baseJson = formData?.surveyJson;
    if (!baseJson) { setEnrichedSurveyJson(null); return; }

    const withAppFont = (json: Record<string, unknown>): Record<string, unknown> => ({ ...json, fontFamily: "Figtree" });
    const applyPrefill = (json: Record<string, unknown>): Record<string, unknown> =>
      cloneAndApplyPrefilledQr(withAppFont(json), prefilledQrPayload);
    // When the direct SharePoint reads are unavailable the config already arrived
    // from the public endpoint with its choices resolved server-side.
    const tokenRaw = spDirectUnavailableRef.current ? null : tokenRef.current;
    if (!tokenRaw) { setEnrichedSurveyJson(applyPrefill(baseJson)); return; }
    const token = tokenRaw; // narrowed to string

    const clone = withAppFont(JSON.parse(JSON.stringify(baseJson)) as Record<string, unknown>);

    async function enrich(): Promise<void> {
      const pages = (clone.pages || []) as { elements?: Record<string, unknown>[] }[];
      const pending: Promise<void>[] = [];

      function walk(elements: Record<string, unknown>[]) {
        for (const el of elements) {
          if (el.type === "panel" && Array.isArray(el.elements)) {
            walk(el.elements as Record<string, unknown>[]);
            continue;
          }

          // Main field spChoicesSource
          const src = el.spChoicesSource as { list?: string; column?: string } | undefined;
          if (src?.list && src?.column) {
            pending.push(
              getSharePointChoices(src.list, src.column, token)
                .then((choices) => {
                  if (choices.length > 0) el.choices = choices;
                })
                .catch(() => {})
            );
          }

          // Main field spFilteredListSource
          const fls = el.spFilteredListSource as { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string } | undefined;
          if (fls?.list && fls?.valueColumn) {
            pending.push(
              getFilteredListChoices(fls.list, fls.valueColumn, token, fls.filterColumn, fls.filterValue)
                .then((choices) => {
                  if (choices.length > 0) el.choices = choices;
                })
                .catch(() => {})
            );
          }

          // Matrix column choicesSource / filteredListSource
          if ((el.type === "matrixdynamic" || el.type === "dynamicmatrix") && Array.isArray(el.columns)) {
            const cols = el.columns as Record<string, unknown>[];
            for (const col of cols) {
              const colSrc = col.choicesSource as { list?: string; column?: string } | undefined;
              if (colSrc?.list && colSrc?.column) {
                pending.push(
                  getSharePointChoices(colSrc.list, colSrc.column, token)
                    .then((choices) => {
                      if (choices.length > 0) col.choices = choices;
                    })
                    .catch(() => {})
                );
              }
              const colFls = col.filteredListSource as { list?: string; valueColumn?: string; filterColumn?: string; filterValue?: string } | undefined;
              if (colFls?.list && colFls?.valueColumn) {
                pending.push(
                  getFilteredListChoices(colFls.list, colFls.valueColumn, token, colFls.filterColumn, colFls.filterValue)
                    .then((choices) => {
                      if (choices.length > 0) col.choices = choices;
                    })
                    .catch(() => {})
                );
              }
            }
          }
        }
      }

      for (const page of pages) {
        if (Array.isArray(page.elements)) walk(page.elements);
      }

      await Promise.all(pending);
      setEnrichedSurveyJson(cloneAndApplyPrefilledQr(clone, prefilledQrPayload));
    }

    enrich().catch(() => setEnrichedSurveyJson(applyPrefill(baseJson)));
  }, [formData, prefilledQrPayload]);

  /**
   * The published document, parsed for the native engine.
   *
   * All three SurveyJS workarounds this replaces are now properties of the
   * document rather than patches applied after the fact: formula fields are
   * derived from their inputs on every render rather than written back on a
   * `setTimeout` (which meant a submission fired in the same tick could carry a
   * stale total), `autocapitalize` is a parsed property of the question, and MYR
   * renders as "RM" inside the readout control.
   *
   * `resetKey` is a dependency so "submit another response" rebuilds the form
   * and clears every answer with it.
   */
  const nativeForm = useMemo<NativeForm | null>(() => {
    if (!enrichedSurveyJson) return null;
    try {
      return parseForm(enrichedSurveyJson);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedSurveyJson, resetKey]);

  // A hook cannot be called conditionally, so a form that has not loaded yet
  // runs an empty document rather than skipping the runtime entirely.
  const placeholderForm = useMemo(() => parseForm(null), []);
  // A test run prefills recognisably fake answers so the tester need not type
  // through every field; anything the sampler cannot guess (signatures, files)
  // is left for them. The engine reseeds only when the form itself changes, so
  // a fresh object each render is harmless.
  const testRunSeed = isTestRun && enrichedSurveyJson
    ? sampleAnswersFor(enrichedSurveyJson, { signatures: simulateRequested })
    : undefined;
  const runtime = useNativeForm(nativeForm ?? placeholderForm, testRunSeed);
  const formReady = nativeForm !== null;

  const formVersion = String(formData?.formConfig?.CurrentVersion || "1.0");
  const formIdValue = String(formData?.formConfig?.FormID || "");
  const showBanner = (formData?.meta?.showBanner as boolean) !== false;
  const isoStandardsText = (formData?.meta?.isoStandards as string) || "ISO 9001 · ISO 14001 · ISO 45001";
  // The managed Company question is published `visible: false` and the native
  // engine draws it inside the form. A chooser in the banner as well would ask
  // the same question twice, so the banner now carries only the document header.
  const showHeaderBanner = showBanner;
  const logoUrl = (formData?.meta?.logoUrl as string) || "";
  const isPublicForm = formData?.formConfig?.IsPublic !== false;
  const formTitle = String(formData?.formConfig?.Title || formData?.surveyJson?.title || "Form");
  const documentHeader = documentHeaderFromMeta(formData?.meta, formIdValue, formVersion);

  useEffect(() => { document.title = formTitle ? `Form: ${formTitle}` : "Form — PMW OSHES"; }, [formTitle]);

  /**
   * The submit gate: the form's own validation first, then the one condition
   * that lives outside the document — the privacy consent below it. The company
   * is a required question inside the form, so `validateAll` already covers it.
   *
   * Nothing here submits. It fills `lastDataRef` and raises the loading state,
   * which is what `doSubmitForm` runs off, exactly as the SurveyJS
   * `onCompleting` handler it replaces did.
   */
  const handleSubmit = useCallback((): boolean => {
    if (!formReady || submitStatus === "loading") return false;

    // The form view scrolls to the first failure and focuses it, so a rejected
    // validation needs no message of its own here.
    if (!runtime.validateAll().ok) return false;

    if (!pdpaAccepted) {
      setPdpaConsentError("Please read and accept the Privacy Notice before submitting this form.");
      document.querySelector(".dfp-pdpa-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    setPdpaConsentError("");
    lastDataRef.current = runtime.collect();
    setSubmitStatus("loading");
    return true;
  }, [formReady, submitStatus, runtime, pdpaAccepted]);

  /*
    "Simulate submission". Two passes, because the ticked consent is state: the
    first ticks it (the rehearsal's sample data is what is being consented for),
    the second submits once that has rendered. It runs once — a form that needs
    a real answer, such as a file upload, is handed back to the tester with the
    gaps highlighted rather than retried.
  */
  useEffect(() => {
    if (!simulateRequested || simulateStep !== "idle" || !formReady || submitStatus !== null) return;
    setPdpaAccepted(true);
    setSimulateStep("armed");
  }, [simulateRequested, simulateStep, formReady, submitStatus]);

  useEffect(() => {
    if (simulateStep !== "armed" || !pdpaAccepted) return;
    setSimulateStep(handleSubmit() ? "done" : "blocked");
  }, [simulateStep, pdpaAccepted, handleSubmit]);
  const doSubmitForm = useCallback(async () => {
    // Collapse "other" + "{name}-Comment" pairs into the free text the respondent
    // typed, before uploads or column mapping read the answers.
    const raw = foldOtherAnswers(lastDataRef.current ?? {});
    const cfg = formData?.formConfig;
    if (!cfg) { throw new Error("no form config"); }
    
      let activeLayers: { email: string; name: string }[] = [];
      let resolvedLayerCount = 0;
      // Someone who could not read this form from SharePoint cannot write to the
      // response list either, so submit through the public endpoint (recorded as
      // GUEST) exactly as an anonymous respondent on the same public link would.
      const token = spDirectUnavailableRef.current ? null : tokenRef.current;
      const formId = String(cfg.FormID || "");

      // Step 1: Upload file/image/signature fields to document libraries
      const urlFieldPatches: UrlFieldPatch[] = [];
      if (token) {
        // Detect file/image/signature field names from survey JSON
        const fileFieldNames = new Set<string>();
        const signatureFieldNames = new Set<string>();
        const surveyData = formData?.surveyJson;
        if (surveyData) {
          const pages = (surveyData as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
          if (pages) {
            const walk = (els: Record<string, unknown>[]) => {
              for (const el of els) {
                if ((el.type === 'file' || el.type === 'imageupload') && el.name) {
                  fileFieldNames.add(el.name as string);
                }
                if (el.type === 'signaturepad' && el.name) {
                  signatureFieldNames.add(el.name as string);
                }
                if (el.elements) walk(el.elements as Record<string, unknown>[]);
              }
            };
            for (const page of pages) { if (page.elements) walk(page.elements); }
          }
        }

        let docLibName: string | null = null;

        for (const [k, v] of Object.entries(raw)) {
          // Handle base64 data values: signatures → Signature Images, file fields → per-form doc lib
          const candidate = uploadCandidateFromValue(v);
          if (candidate) {
            try {
              const isSignature = signatureFieldNames.has(k) || (candidate.content.startsWith("data:image/") && !fileFieldNames.has(k));
              if (isSignature) {
                const imageUrl = toAbsoluteSharePointUrl(await uploadSignatureImage(token, formId, "submission", candidate.content));
                raw[k] = imageUrl;
                urlFieldPatches.push({ fieldName: k, url: imageUrl, description: "Signature" });
              } else {
                if (!docLibName) {
                  docLibName = await ensureDocLibrary(token, cfg.Title as string);
                }
                const fileName = uploadFileName(k, candidate);
                const fileUrl = toAbsoluteSharePointUrl(await uploadFileToDocLib(token, docLibName, fileName, candidate.content));
                raw[k] = fileUrl;
              }
            } catch (e) {
              throw new Error(`Could not upload "${k}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
            }
          }
          // Handle multi-file arrays (SurveyJS file question with allowMultiple)
          if (Array.isArray(v)) {
            const urls: string[] = [];
            for (const item of v) {
              const itemCandidate = uploadCandidateFromValue(item);
              if (itemCandidate) {
                try {
                  if (!docLibName) {
                    docLibName = await ensureDocLibrary(token, cfg.Title as string);
                  }
                  const fileName = uploadFileName(k, itemCandidate, urls.length);
                  const fileUrl = toAbsoluteSharePointUrl(await uploadFileToDocLib(token, docLibName, fileName, itemCandidate.content));
                  urls.push(fileUrl);
                } catch (e) {
                  throw new Error(`Could not upload "${k}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
                }
              }
            }
            if (urls.length > 0) {
              raw[k] = urls;
            }
          }
        }
      }

      if (token) {
        normalizeSharePointDateTimeFields(raw, enrichedSurveyJson || formData?.surveyJson);
      }

      // Step 2: Resolve layers — try LayerConfig first, fall back to old rules
      let layerConfigParsed: LayerConfig | null = null;
      const rawLayerConfig = cfg.LayerConfig as string | undefined;
      if (rawLayerConfig && rawLayerConfig.trim()) {
        try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch {}
      }
      const hasManualBranches = (layerConfigParsed?.manualBranches?.length ?? 0) > 0;
      const hasDepartmentApproverLayers = (layerConfigParsed?.layers ?? [])
        .some((layer) => layer.assignee.type === "department-approver");
      const deferDepartmentApproverLookupToApi = !token && hasDepartmentApproverLayers;

      if (hasManualBranches) {
        // Manual branch workflows start only after an OSHES Forms Owner chooses a branch.
        resolvedLayerCount = 0;
        activeLayers = [];
      } else if (layerConfigParsed?.layers?.length) {
        resolvedLayerCount = layerConfigParsed.layers.length;
        if (!deferDepartmentApproverLookupToApi) {
          for (const layer of layerConfigParsed.layers) {
            activeLayers.push(await resolveLayerAssignee(layer, raw, token));
          }
        }
      } else {
        // Old approval rules / approvers list fallback (keep existing logic)
        let approvalRules = null;
        try { approvalRules = cfg.ApprovalRules ? JSON.parse(cfg.ApprovalRules as string) : null; } catch {}
        if (approvalRules?.conditionField && approvalRules?.rules?.length) {
          const condVal = String(raw[approvalRules.conditionField] ?? "").toLowerCase();
          const matched = approvalRules.rules.find((r: Record<string, unknown>) => (r.when as string).toLowerCase() === condVal);
          if (matched) {
            activeLayers = matched.layers;
            resolvedLayerCount = matched.layers.length;
          }
        } else if (token) {
          const apData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(OSHES_LISTS.approvers)}')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title as string)}'&$select=LayerNumber,ApproverEmail,ApproverName&$orderby=LayerNumber asc&$top=10`).catch(() => ({ value: [] })) as { value: Record<string, string>[] };
          activeLayers = (apData.value ?? []).map((a) => ({ email: a.ApproverEmail, name: a.ApproverName }));
          resolvedLayerCount = activeLayers.length;
        }
      }

      let hasManualPaperWorkflow = false;

      // Step 3: Build body (keep existing logic)
      const body: Record<string, unknown> = {};
      const urlFieldPatchNames = new Set(urlFieldPatches.map((patch) => patch.fieldName));
      for (const [k, v] of Object.entries(raw)) {
        if (urlFieldPatchNames.has(k)) continue;
        if (v && typeof v === "object" && (v as Record<string, unknown>).html && (v as Record<string, unknown>).json) {
          body[`${k}_Response`] = (v as Record<string, unknown>).html;
          body[`${k}_Json`] = typeof (v as Record<string, unknown>).json === "string" ? (v as Record<string, unknown>).json : JSON.stringify((v as Record<string, unknown>).json);
        }
        // Arrays stay arrays here — only the column mapping knows whether the
        // target is a MultiChoice column (wants the array) or text (wants JSON).
        else if (Array.isArray(v)) { body[k] = v; }
        else if (v && typeof v === "object") {
          if ("Url" in (v as Record<string, unknown>)) {
            body[k] = v;
          } else {
            body[k] = JSON.stringify(v);
          }
        }
        else if (typeof v === "number" || typeof v === "boolean") { body[k] = String(v); }
        else { body[k] = v; }
      }
      body.SubmittedAt = new Date().toISOString();
      body.FormVersion = cfg.CurrentVersion;
      body.PublishKey = cfg.CurrentPublishKey || publishKey || "production";
      body.FormID = cfg.FormID;
      body.PDPAConsent = "Accepted";
      body.PDPANoticeVersion = PDPA_NOTICE_VERSION;
      body.PDPAConsentAt = new Date().toISOString();
      body.RetentionUntil = getPdpaRetentionUntil(new Date(body.PDPAConsentAt as string));
      body.SubmittedBy = token ? (userEmail || accounts[0]?.username || "authenticated-user") : "GUEST";

      // Step 4: Write layer status columns
      if (layerConfigParsed?.layers?.length && !deferDepartmentApproverLookupToApi) {
        // Enhanced path — use new constants
        for (let index = 0; index < layerConfigParsed.layers.length; index++) {
          const layer = layerConfigParsed.layers[index];
          const layerNumber = layer.layerNumber;
          const routed = resolveEvaluationSubmitterRouting(layer, body);
          if (routed?.manualPaper) {
            hasManualPaperWorkflow = true;
            body[`L${layerNumber}_Status`] = manualPaperStatusForLayer(layer);
            const senderEmail = routed.sendToConfiguredSender ? CONFIGURED_SENDER_EMAIL : "";
            body[`L${layerNumber}_Email`] = senderEmail;
            activeLayers[index] = { email: senderEmail, name: "" };
          } else {
            const routedEmail = routed?.email || activeLayers[index]?.email || "";
            const manualPaperForSender = shouldUseManualPaperForSender(layer, routedEmail);
            if (manualPaperForSender) hasManualPaperWorkflow = true;
            body[`L${layerNumber}_Status`] = manualPaperForSender
              ? manualPaperStatusForLayer(layer)
              : SP_LAYER_STATUS.PENDING;
            body[`L${layerNumber}_Email`] = routedEmail;
            activeLayers[index] = { ...(activeLayers[index] || { name: "" }), email: routedEmail };
          }
        }
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = layerConfigParsed.layers[0]?.layerNumber ?? 0;
        body.CurrentApprovalLayer = body.CurrentLayer;
      } else if (layerConfigParsed?.layers?.length) {
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = layerConfigParsed.layers[0]?.layerNumber ?? 0;
        body.CurrentApprovalLayer = body.CurrentLayer;
      } else if (hasManualBranches) {
        // Branch-only workflow — admin assigns branch in Approvals before layers start
        body.FormStatus = SP_FORM_STATUS.SUBMITTED;
        body.Status = SP_FORM_STATUS.SUBMITTED;
        body.CurrentLayer = 0;
        body.CurrentApprovalLayer = 0;
      } else {
        // Legacy path — keep old behavior
        for (let n = 1; n <= resolvedLayerCount; n++) {
          body[`L${n}_Status`] = n === 1 ? "Pending" : "Waiting";
          body[`L${n}_Email`] = activeLayers[n - 1]?.email ?? "";
        }
      }

      // Step 5: Submit
      let submittedByEmail = "";
      if (token) {
        submittedByEmail = String(body.SubmittedBy || userEmail || accounts[0]?.username || "authenticated-user");
        await ensurePdpaColumns(token, cfg.Title as string);

        // Claimed before the item is written so the number and the row appear
        // together. Guests skip this — api/submit-form.ts allocates for them,
        // keeping one allocator regardless of how the row gets created.
        if (parseReferenceNumberConfig(cfg.ReferenceConfig).enabled) {
          await ensureReferenceNoColumn(token, cfg.Title as string);
          const referenceNo = await claimReferenceNumber(cfg.Title as string, testTicket);
          if (referenceNo) {
            body[REFERENCE_NO_FIELD] = referenceNo;
            setSubmittedReference(referenceNo);
          }
        }
        if (hasManualBranches) {
          const maxBranchLayers = Math.max(
            1,
            ...(layerConfigParsed?.manualBranches ?? []).map((b) => b.layers.length),
          );
          await ensureWorkflowColumns(token, cfg.Title as string, maxBranchLayers);
          await new Promise((r) => setTimeout(r, 1500));
        }
        const listUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items`;
        // A question named like one of SharePoint's own columns — `attachments`
        // is the one that happens — would write into that built-in column (a
        // Yes/No flag) and fail the submission. Its answer gets a column of its
        // own, created here the first time it is needed.
        const movedAnswers = Object.keys(body).filter(isReservedColumnName);
        for (const name of movedAnswers) {
          body[answerColumnName(name)] = body[name];
          delete body[name];
        }
        if (movedAnswers.length > 0) {
          const ensured = await ensureColumns(
            token,
            cfg.Title as string,
            movedAnswers.map((name) => ({ n: answerColumnName(name), k: SP_FIELD_KIND.note, ml: true })),
          );
          // SharePoint needs a moment after adding a column before it can be written.
          if (ensured.created.length > 0) await new Promise((r) => setTimeout(r, 1500));
        }
        // Several attached files are stored as a list of their addresses, which
        // outgrows a single line of text after two or three long names. Widen
        // the column first rather than let SharePoint refuse the submission.
        const longFileAnswers = fileQuestions(formData?.surveyJson)
          .map((question) => answerColumnName(question.name))
          .filter((name) => {
            const value = body[name];
            const stored = Array.isArray(value) ? JSON.stringify(value) : typeof value === "string" ? value : "";
            return stored.length > SP_TEXT_COLUMN_MAX;
          });
        if (longFileAnswers.length > 0) {
          await ensureColumnsHoldLongText(token, cfg.Title as string, longFileAnswers);
        }
        const { resolveColumnKey, isMultiValueColumn, columnKind } = await getSharePointColumnResolvers(token, cfg.Title as string);
        let result: { Id?: number } | undefined;
        try {
          result = await spPost(
            token,
            listUrl,
            mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn, columnKind),
          ) as { Id?: number };
        } catch (submitErr) {
          const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
          // If the response list is missing enhanced layer columns (pre-provisioning),
          // retry without FormStatus / CurrentLayer
          if ((msg.includes('FormStatus') || msg.includes('CurrentLayer')) && body.FormStatus !== undefined) {
            delete body.FormStatus;
            delete body.CurrentLayer;
            result = await spPost(
              token,
              listUrl,
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn, columnKind),
            ) as { Id?: number };
          } else if (msg.includes('_Response') || msg.includes('_Json')) {
            // Retry without _Response/_Json columns (matrix fields published before
            // dynamicmatrix column provisioning was added)
            for (const key of Object.keys(body)) {
              if (key.endsWith('_Response') || key.endsWith('_Json')) {
                delete body[key];
              }
            }
            result = await spPost(
              token,
              listUrl,
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn, columnKind),
            ) as { Id?: number };
          } else {
            throw submitErr;
          }
        }

        // A signed-in submission writes its row itself, so it never passes the
        // server step that flags a test run at create time. Everything after this
        // — the approvals workspace, the review page, the cron — decides whether
        // mail is real by reading IsTest off the row, so the server flags it now,
        // after verifying the ticket itself. Not swallowed: an unflagged row would
        // mail a real approver the moment layer 1 is approved. On failure the row
        // is removed and the submission stops before anyone is notified.
        if (isTestRun && result?.Id) {
          const stampRes = await fetch("/api/submit-form", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
            },
            body: JSON.stringify({
              action: "stamp-test-run",
              itemId: String(result.Id),
              slug: (cfg.Slug as string) || (cfg.slug as string) || "",
              testTicket,
            }),
          });
          if (!stampRes.ok) {
            const stampData = await stampRes.json().catch(() => ({})) as { error?: string };
            await spDelete(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`).catch(() => {});
            throw new Error(stampData.error || "Could not mark this submission as a test run — stopped before any approver could be notified.");
          }
        }

        if (result?.Id && urlFieldPatches.length > 0) {
          for (const patch of urlFieldPatches) {
            const patchFieldName = resolveColumnKey(patch.fieldName);
            if (!patchFieldName) {
              throw new Error(`The form field "${patch.fieldName}" is not provisioned in "${cfg.Title as string}". Please republish the form before trying again.`);
            }
            try {
              await spPatchUrlField(token, cfg.Title as string, result.Id, patchFieldName, patch.url, patch.description);
            } catch (urlPatchErr) {
              try {
                await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`, {
                  [patchFieldName]: patch.url,
                });
              } catch {
                throw new Error(`Could not save uploaded image link for "${patch.fieldName}": ${urlPatchErr instanceof Error ? urlPatchErr.message : String(urlPatchErr)}`);
              }
            }
          }
        }

        // Step 6: Write matrix child list items (dynamicmatrix fields)
        const matrixUpdateBody: Record<string, unknown> = {};
        if (result?.Id && enrichedSurveyJson) {
          try {
            const pages = (enrichedSurveyJson as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
            const matrixFields: { name: string; columns: MatrixColumnDef[] }[] = [];
            if (pages) {
              const walk = (els: Record<string, unknown>[]) => {
                for (const el of els) {
                  if (el.type === "dynamicmatrix" || el.type === "matrixdynamic") {
                    const cols = (el.columns as MatrixColumnDef[]) || [];
                    if (el.name && cols.length > 0) matrixFields.push({ name: el.name as string, columns: cols });
                  }
                  if (el.elements) walk(el.elements as Record<string, unknown>[]);
                }
              };
              for (const page of pages) { if (page.elements) walk(page.elements); }
            }
            for (const mf of matrixFields) {
              const rawVal = raw[mf.name];
              if (!rawVal || typeof rawVal !== "object") continue;
              const rows = (rawVal as Record<string, unknown>).rows as Record<string, unknown>[] | undefined;
              if (!Array.isArray(rows) || rows.length === 0) continue;
              const childList = await ensureMatrixChildList(token, cfg.Title as string, mf.name, mf.columns, () => {});
              if (childList) {
                const ids = await writeMatrixChildItems(token, childList.listName, result.Id, rows, mf.columns, {
                  formTitle: cfg.Title as string,
                  formVersion: String(body.FormVersion || ""),
                  submittedAt: String(body.SubmittedAt || ""),
                  submittedBy: String(body.SubmittedBy || ""),
                });
                matrixUpdateBody[`${mf.name}_RowIds`] = JSON.stringify(ids);
              }
            }
            // PATCH parent item with RowIds (if any matrix data was written)
            if (Object.keys(matrixUpdateBody).length > 0) {
              const mappedMatrixUpdateBody = mapBodyToSharePointColumnKeys(
                matrixUpdateBody,
                resolveColumnKey,
                cfg.Title as string,
              );
              if (Object.keys(mappedMatrixUpdateBody).length > 0) {
                await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`, mappedMatrixUpdateBody);
              }
            }
          } catch (e) {
            void e;
          }
        }

        // Step 7: Trigger notification
        if (resolvedLayerCount > 0 && result?.Id) {
          // A shared first layer routes to nobody, so everyone named on it is told.
          const layer1Recipients = layerRecipients(layerConfigParsed?.layers?.[0], activeLayers[0]?.email);
          const firstLayerNumber = layerConfigParsed?.layers?.[0]?.layerNumber ?? 1;
          const firstLayerManualPaper = String(body[`L${firstLayerNumber}_Status`] || "").toLowerCase().startsWith("manual ");
          const formSlug = (cfg.Slug as string) || (cfg.slug as string) || "";
          const baseUrl = appBaseUrl();
          const firstLayer = layerConfigParsed?.layers?.[0];
          // A public first layer is reachable only by its own token; the signed-in
          // route and the admin link both wall off the outside reviewer.
          // The first reviewer's link opens this submission and no other, so the
          // value binding it is written to the record before the link is built.
          let firstLayerLinkToken = "";
          if (String(firstLayer?.authMode || "") === "public" && String(firstLayer?.publicToken || "").trim()) {
            firstLayerLinkToken = mintLinkToken();
            const responseListTitle = String(cfg.Title);
            await ensureWorkflowColumns(token, responseListTitle, resolvedLayerCount);
            await spPatch(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${result.Id})`,
              { [linkTokenField(firstLayerNumber)]: firstLayerLinkToken },
            );
          }
          const firstLayerReviewLink = buildLayerReviewLink({
            baseUrl,
            layer: firstLayer,
            formSlug,
            responseItemId: result.Id,
            linkToken: firstLayerLinkToken,
          });
          // A test run hands the tester the first step's own link. Here it carries
          // the binding this page just wrote, so a public step opens too.
          if (isTestRun && firstLayerReviewLink && !firstLayerManualPaper) {
            setTestRunReview({
              href: firstLayerReviewLink,
              label: firstLayer?.type === "evaluation" ? "Open step 1 to evaluate" : "Open step 1 to approve",
            });
          }

          if (firstLayerManualPaper) {
            // Manual-paper workflow notices are sent with the generated PDF below.
          } else if (resolvedLayerCount > 0) {
            await triggerApprovalNotification(token, {
              formTitle: cfg.Title as string,
              submittedBy: submittedByEmail,
              responseItemId: result.Id,
              layer: 1,
              totalLayers: resolvedLayerCount,
              action: "submit",
              ...(layer1Recipients.length > 0 ? { nextApproverEmail: layer1Recipients } : {}),
              ...(firstLayer?.type ? { nextLayerType: firstLayer.type } : {}),
              ...(firstLayer?.authMode ? { nextLayerAuthMode: firstLayer.authMode } : {}),
              ...(firstLayer?.type === "evaluation" ? { nextEmailSchedule: firstLayer.emailSchedule } : {}),
              ...(firstLayerReviewLink ? { reviewLink: firstLayerReviewLink } : {}),
              ...(isTestRun ? { testRun: { ticket: testTicket, slug: formSlug } } : {}),
            });
          }
        }

        // Step 7: Generate PDF for no-layers or manual-paper workflow submissions.
        if ((resolvedLayerCount === 0 || hasManualPaperWorkflow) && result?.Id && token) {
          try {
            const cfgData = await getFormConfigByTitle(token, cfg.Title as string);
            const formVer = cfgData ? (cfgData as unknown as Record<string, unknown>).CurrentVersion as string || "1.0" : "1.0";
            const verData = await spGet(
              token,
              `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=FormTitle eq '${encodeURIComponent(cfg.Title as string)}' and FormVersion eq '${encodeURIComponent(formVer)}'&$select=SurveyJSON&$top=1`
            ) as { value?: { SurveyJSON?: string }[] };
            const rawSurvey = verData.value?.[0]?.SurveyJSON;
            if (rawSurvey) {
              const parsed = JSON.parse(rawSurvey);
              const surveyContent = parsed.surveyJson || parsed;
              const versionMeta = parsed.meta && typeof parsed.meta === "object" && !Array.isArray(parsed.meta)
                ? parsed.meta as Record<string, unknown>
                : {};
              const respItem = await spGet(
                token,
                `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items(${result.Id})`
              ) as Record<string, unknown>;
              const SYSTEM_FIELDS = new Set(['Id','Title','SubmittedBy','SubmittedAt','Status','CurrentApprovalLayer','FormVersion','PublishKey','FormID','RawJSON','CurrentLayer','FormStatus','EvaluationData','WorkflowAssignmentData','WorkflowEmailLog','WorkflowEmailSchedule','PDPAConsent','PDPANoticeVersion','PDPAConsentAt','RetentionUntil','Author','Editor','Created','Modified','ContentType','PermMask','PdfUrl','L1_Status','L1_Email','L1_SignedAt','L1_Rejection','L1_Signature','L2_Status','L2_Email','L2_SignedAt','L2_Rejection','L2_Signature','L3_Status','L3_Email','L3_SignedAt','L3_Rejection','L3_Signature']);
              const pdfData: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(respItem)) {
                if (SYSTEM_FIELDS.has(k) || v === null || v === undefined) continue;
                // Filter out matrix system columns — rendered separately as tables
                if (k.endsWith('_Html') || k.endsWith('_Json') || k.endsWith('_RowIds')) continue;
                pdfData[k] = v;
              }
              // ── Inject matrix child rows for table rendering ──────────
              // (generateAndStorePdf also does this independently; doing it here
              //  provides the data upfront for any future pdfData consumers.)
              try {
                const sPages = (surveyContent as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
                if (sPages) {
                  const walkEls = (els: Record<string, unknown>[]) => {
                    for (const el of els) {
                      const t = el.type as string | undefined;
                      if (t === 'dynamicmatrix' || t === 'matrixdynamic' || t === 'tableinput') {
                        const fName = el.name as string | undefined;
                        if (fName && respItem[`${fName}_RowIds`]) {
                          const safeName = fName.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
                          const childListName = `${cfg.Title as string} Matrix ${safeName}`;
                          readMatrixChildItems(token, childListName, result.Id as number).then(childRows => {
                            if (childRows.length > 0) {
                              pdfData[`${fName}_childRows`] = { columns: (el.columns as MatrixColumnDef[]) || [], rows: childRows };
                            }
                          }).catch(() => { /* ignore */ });
                        }
                      }
                      if (el.elements) walkEls(el.elements as Record<string, unknown>[]);
                    }
                  };
                  for (const page of sPages) { if (page.elements) walkEls(page.elements); }
                }
              } catch { /* ignore matrix injection errors */ }
              const { generateAndStorePdf, buildPdfLayerResults } = await import("../utils/generateFormPdf");
              let manualPdfAttachment: { name: string; contentType: string; contentBytes: string } | null = null;
              const responseItemId = result.Id;
              const pdfUrl = await generateAndStorePdf(token, cfg.Title as string, responseItemId, {
                surveyJson: surveyContent as PdfFormData["surveyJson"],
                responseData: pdfData,
                layerResults: buildPdfLayerResults(respItem, 10, cfg.LayerConfig),
                meta: { submittedBy: submittedByEmail, submittedAt: new Date().toISOString(), formTitle: cfg.Title as string, formVersion: formVer, formStatus: "submitted" },
                isoStandards: isoStandardsText,
                logoUrl: logoUrl || COMPANY.logoUrl,
                pdfConfig: versionMeta.pdfConfig && typeof versionMeta.pdfConfig === "object" && !Array.isArray(versionMeta.pdfConfig)
                  ? { ...(versionMeta.pdfConfig as NonNullable<PdfFormData["pdfConfig"]>), ...(hasManualPaperWorkflow ? { enabled: true, includeEmptyEvaluationFields: true } : {}) }
                  : hasManualPaperWorkflow ? { enabled: true, title: "Manual Workflow Form", deliveryMethod: "sharepoint", includeEmptyEvaluationFields: true } : undefined,
                documentHeader: versionMeta.documentHeader && typeof versionMeta.documentHeader === "object" && !Array.isArray(versionMeta.documentHeader)
                  ? versionMeta.documentHeader as PdfFormData["documentHeader"]
                  : undefined,
              }, {
                onGeneratedBlob: async (blob) => {
                  if (!hasManualPaperWorkflow) return;
                  manualPdfAttachment = {
                    name: safePdfFileName(cfg.Title as string, responseItemId),
                    contentType: "application/pdf",
                    contentBytes: await blobToBase64(blob),
                  };
                },
              });
              if (hasManualPaperWorkflow) {
                const pdfLink = pdfUrl.startsWith("http") ? pdfUrl : `${new URL(SP_SITE_URL).origin}${pdfUrl}`;
                await fetch("/api/send-email", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
                  },
                  body: JSON.stringify({
                    sendToConfiguredSender: true,
                    subject: `Manual workflow PDF ready: ${cfg.Title as string}`,
                    body: `A submission matched a manual paper workflow rule.<br/><br/>Form: ${cfg.Title as string}<br/>Submission ID: ${result.Id}<br/>The manual evaluation/approval PDF is attached.<br/><a href="${pdfLink}">Open generated PDF record</a>`,
                    // Lets the server tell a rehearsal's notice from a real one:
                    // it reads the row, and verifies the ticket itself.
                    row: { listTitle: cfg.Title as string, responseItemId: result.Id },
                    ...(isTestRun ? { testTicket, slug: (cfg.Slug as string) || (cfg.slug as string) || "" } : {}),
                    attachments: manualPdfAttachment ? [manualPdfAttachment] : undefined,
                  }),
                });
              }
            }
          } catch {
            // Submission remains successful when optional PDF generation is unavailable.
          }
        }
      } else {
        submittedByEmail = "GUEST";
        body.SubmittedBy = submittedByEmail;

        // Extract matrix data from raw submission (for server-side child list writing)
        const matrixData: Record<string, { rows: Record<string, unknown>[]; columns: { name: string; title: string; cellType?: string; choices?: string[] }[] }> = {};
        if (enrichedSurveyJson) {
          const pages = (enrichedSurveyJson as unknown as Record<string, unknown>).pages as { elements?: Record<string, unknown>[] }[] | undefined;
          if (pages) {
            const walk = (els: Record<string, unknown>[]) => {
              for (const el of els) {
                if ((el.type === "dynamicmatrix" || el.type === "matrixdynamic") && el.name) {
                  const rawVal = raw[el.name as string];
                  if (rawVal && typeof rawVal === "object") {
                    const rows = (rawVal as Record<string, unknown>).rows as Record<string, unknown>[] | undefined;
                    if (Array.isArray(rows) && rows.length > 0) {
                      matrixData[el.name as string] = {
                        rows,
                        columns: (el.columns as { name: string; title: string; cellType?: string; choices?: string[] }[]) || [],
                      };
                    }
                  }
                }
                if (el.elements) walk(el.elements as Record<string, unknown>[]);
              }
            };
            for (const page of pages) { if (page.elements) walk(page.elements); }
          }
        }

        // Attachments go first, a piece at a time: carried inside the
        // submission they pushed it past the ~4.5 MB a serverless request may
        // be, and the whole form failed.
        await uploadPublicAttachments(body, enrichedSurveyJson || formData?.surveyJson, {
          listTitle: cfg.Title as string,
          formVersion: cfg.CurrentVersion as string | undefined,
          publishKey: (cfg.CurrentPublishKey as string | undefined) || publishKey || undefined,
        }, async (payload) => {
          const uploadRes = await fetch("/api/submit-form", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
            },
            body: JSON.stringify(payload),
          });
          const reply = await uploadRes.json().catch(() => ({})) as Record<string, unknown>;
          if (!uploadRes.ok) throw new Error(typeof reply.error === "string" ? reply.error : `Upload failed: ${uploadRes.status}`);
          return reply;
        });

        const res = await fetch("/api/submit-form", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
          },
          body: JSON.stringify({
            listTitle: cfg.Title,
            formVersion: cfg.CurrentVersion,
            publishKey: cfg.CurrentPublishKey || publishKey,
            body,
            matrixData: Object.keys(matrixData).length > 0 ? matrixData : undefined,
            pdpaConsent: true,
            pdpaNoticeVersion: PDPA_NOTICE_VERSION,
            pdpaConsentedAt: body.PDPAConsentAt,
            retentionUntil: body.RetentionUntil,
            ...(isTestRun ? { testTicket } : {}),
          }),
        });
        const resData = await res.json().catch(() => ({})) as { id?: string; referenceNo?: string; error?: string };
        if (!res.ok) { throw new Error(resData.error || `Submit failed: ${res.status}`); }
        if (resData.referenceNo) setSubmittedReference(resData.referenceNo);

        // A test run hands the tester step 1's link. Only a signed-in step: a
        // public one needs the binding the server wrote, which only its email has.
        const guestFirstLayer = layerConfigParsed?.layers?.[0];
        if (isTestRun && resData.id && guestFirstLayer && guestFirstLayer.authMode !== "public") {
          const href = buildLayerReviewLink({
            baseUrl: appBaseUrl(),
            layer: guestFirstLayer,
            formSlug: (cfg.Slug as string) || (cfg.slug as string) || "",
            responseItemId: resData.id,
          });
          if (href) {
            setTestRunReview({
              href,
              label: guestFirstLayer.type === "evaluation" ? "Open step 1 to evaluate" : "Open step 1 to approve",
            });
          }
        }

        // If API returned parent item ID and we have matrixData, try server-side child list write
        // (API creates child items using system credential; we verify via RowIds response field)
        if (resData.id && Object.keys(matrixData).length > 0) {
          // The API already handled child list creation if successful
          // Nothing more to do client-side for guest path
        }
      }
      // Success — function returns normally; errors propagate to caller (useEffect)
  }, [formData, userEmail, accounts, isTestRun, testTicket]);

  // Run submission logic when handleSubmit raises the loading state
  useEffect(() => {
    if (submitStatus !== "loading") return;
    let cancelled = false;
    doSubmitForm()
      .then(() => { if (!cancelled) { setSubmitError(""); setSubmitStatus("success"); } })
      .catch((submitErr) => {
        if (cancelled) return;
        setSubmitError(submitErr instanceof Error ? submitErr.message : String(submitErr));
        setSubmitStatus("error");
      });
    return () => { cancelled = true; };
  }, [submitStatus, doSubmitForm]);

  const handleSignIn = useCallback(() => {
    try {
      sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    } catch {
      // May fail if storage is inaccessible
    }
    instance.loginRedirect({ ...loginRequest, redirectStartPage: window.location.href });
  }, [instance]);
  const handleSignOut = useCallback(() => {
    clearStoredAuthDecision();
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.href });
  }, [instance]);
  const handleReset = useCallback(() => {
    setSubmitStatus(null);
    setSubmittedReference("");
    setSubmitError("");
    setTestRunReview(null);
    setPdpaAccepted(false);
    setPdpaConsentError("");
    lastDataRef.current = null;
    setResetKey(k => k + 1);
  }, []);

  // Generate QR when modal opens
  useEffect(() => {
    if (!showQr) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(shareUrl, { width: 280, margin: 2, color: { dark: "#161B24", light: "#FFFFFF" } }),
      )
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [showQr]);

  if (loading) return (
    <div role="status" aria-live="polite" style={{ minHeight: "100dvh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24, fontFamily: APP_FONT_FAMILY }}>
      <style>{globalCss(t)}</style>
      <Spinner size={64} t={t} />
      <div style={{ fontSize: 16, fontWeight: 600, color: t.textSecond }}>Opening the form…</div>
    </div>
  );

  // A form that loaded without survey content can never be filled in or submitted —
  // say so instead of sitting on a spinner forever.
  if (!error && !formData?.surveyJson) return (
    <StateCard
      t={t}
      tone="neutral"
      role="alert"
      icon={<HourglassIcon size={48} />}
      title="This form isn't ready yet"
      body="This link has no published form content. Please ask an OSHES Forms Owner to republish the form and share the link again."
      actions={<BackToHomeLink t={t} />}
    />
  );

  if (error) {
    const kind = formErrorKind(error);
    if (kind === "closed") return (
      <StateCard
        t={t}
        tone="amber"
        role="alert"
        icon={<ClockIcon size={48} />}
        title="This form is closed"
        body="It isn't taking responses right now. Ask the OSHES team if you think it should be open."
        actions={<BackToHomeLink t={t} />}
      />
    );
    if (kind === "expired") return (
      <StateCard
        t={t}
        tone="amber"
        role="alert"
        icon={<CalendarIcon size={48} />}
        title="This form has expired"
        body="Its publishing period has ended. Ask the OSHES team for a current link."
        actions={<BackToHomeLink t={t} />}
      />
    );
    if (kind === "notFound") return (
      <StateCard
        t={t}
        tone="neutral"
        role="alert"
        icon={<SearchIcon size={48} />}
        title="We couldn't find this form"
        body="Check the link, or scan the poster again."
        actions={<BackToHomeLink t={t} />}
      />
    );
    return (
      <StateCard
        t={t}
        tone="neutral"
        role="alert"
        icon={<RefreshIcon size={48} />}
        title="We couldn't load this form"
        body={<span style={{ fontSize: 13, color: t.textMuted, overflowWrap: "anywhere" }}>{error}</span>}
        actions={
          <>
            <button type="button" onClick={() => window.location.reload()} className="dfp-pill" style={{ ...pillFilled(t), width: "100%" }}>Try again</button>
            <BackToHomeLink t={t} />
          </>
        }
      />
    );
  }

  if (!isPublicForm && !isAuthenticated) return (<><style>{globalCss(t)}</style><PrivateGate formTitle={formTitle} onSignIn={handleSignIn} t={t} /></>);

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, fontFamily: APP_FONT_FAMILY }}>
      <style>{globalCss(t)}</style>
      <ScrollProgress t={t} />
      {isTestRun && (
        <div role="status" style={{ background: t.amberPale, color: t.amber, fontSize: 13, fontWeight: 700, textAlign: "center", padding: "10px 12px", lineHeight: 1.4 }}>
          Test run — emails go only to {testEmailDisplay || "the nominated test address"}
        </div>
      )}
      {simulateStep === "blocked" && submitStatus !== "success" && (
        <div role="alert" style={{ background: t.amberPale, color: t.amber, fontSize: 13, textAlign: "center", padding: "10px 12px", lineHeight: 1.5 }}>
          <strong>Not submitted yet.</strong> Some questions need a real answer, such as a file upload. Fill the highlighted ones, then press Submit.
        </div>
      )}
      {simulateRequested && simulateStep !== "blocked" && submitStatus === null && (
        <div role="status" style={{ background: t.purplePale, color: t.purple, fontSize: 13, fontWeight: 700, textAlign: "center", padding: "10px 12px" }}>
          Filling in sample answers and submitting…
        </div>
      )}
      <header className="dfp-header" style={{ background: t.cardBg, minHeight: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 0 18px", position: "sticky", top: 10, zIndex: 50, gap: 10, margin: "10px 12px 0", borderRadius: 24, boxShadow: t.shadow }}>
        <div className="dfp-header-left" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Logo size={{ xs: 26, sm: 28, md: 32 }} />
          <span className="dfp-title" style={{ fontWeight: 800, fontSize: 16, color: t.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formTitle}</span>
          {pinVersion && <span className="dfp-badge" style={{ fontSize: 12, fontWeight: 700, color: t.amber, background: t.amberPale, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>v{pinVersion}</span>}
          {!isPublicForm && <span className="dfp-badge" style={{ fontSize: 12, fontWeight: 700, color: t.purple, background: t.purplePale, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>Private</span>}
        </div>
        <div className="dfp-header-right" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => { setShowQr(true); setCopied(false); }} title="Share this form" aria-label="Share this form" className="dfp-pill" style={{ ...pillGhost(t), minHeight: 36, width: 36, padding: 0 }}><IosShareIcon style={{ fontSize: 16 }} /></button>
          {isAuthenticated ? (
            <>
              <div className="dfp-user-badge" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: t.textSecond }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.green, flexShrink: 0 }} />
                <span className="dfp-user-name">{userEmail?.split("@")[0]}</span>
              </div>
              <button type="button" onClick={handleSignOut} className="dfp-pill" style={{ ...pillGhost(t), minHeight: 36, padding: "0 14px", fontSize: 13, whiteSpace: "nowrap" }}>Sign out</button>
            </>
          ) : (<button type="button" onClick={handleSignIn} className="dfp-pill" style={{ ...pillTonal(t), minHeight: 36, padding: "0 14px", fontSize: 13, gap: 8, whiteSpace: "nowrap" }}><MsIcon /> Sign in</button>)}
          <span className="dfp-version" style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap" }}>v{formVersion}</span>
        </div>
      </header>

      {showHeaderBanner && (
        <div className="dfp-banner" style={{ width: "calc(100% - 24px)", maxWidth: 836, margin: "16px auto 0", borderRadius: 24, overflow: "hidden", background: t.cardBg, boxShadow: t.shadow }}>
          <div style={{ padding: "18px 22px 16px" }}>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>{isoStandardsText}</div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.25, color: t.textPrimary }}>{formTitle}</div>
          </div>
          {/* Logo beside the document control block, the way the printed form
              carries them. The company used to sit here, because SurveyJS could
              not draw the managed field — the engine draws it inside the form
              now, so a chooser up here would only ask the same question twice. */}
          <div className="dfp-banner-row" style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${t.border}` }}>
            <div className="dfp-banner-logo" style={{ width: 150, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.offWhite, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={logoUrl || COMPANY.logoUrl} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
            </div>
            <div className="dfp-doc-control" aria-label="Document control metadata">
              {[
                ["Document Number:", documentHeader.documentNumber],
                ["Issue Number:", documentHeader.issueNumber],
                ["Effective Date:", documentHeader.effectiveDate],
                ["Revision Number:", documentHeader.revisionNumber],
                ["Revision Date:", documentHeader.revisionDate],
              ].map(([label, value]) => (
                <div className="dfp-doc-cell" key={label}>
                  <span className="dfp-doc-label">{label}</span>
                  {value && <span className="dfp-doc-value">{value}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dfp-content" style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 88px", animation: "fadeUp .3s ease" }}>
        {submitStatus === "success" ? (
          <SuccessScreen formTitle={formTitle} referenceNo={submittedReference} onReset={handleReset} t={t} isTestRun={isTestRun} testEmailDisplay={testEmailDisplay} testRunReview={testRunReview} />
        ) : (
          <div>
            {!isPublicForm && isAuthenticated && (
              <div style={{ background: t.greenPale, borderRadius: 24, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: "50%", background: t.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{(userEmail?.[0] || "?").toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: t.greenText }}>Submitting as yourself</div><div style={{ fontSize: 12, color: t.textSecond, overflowWrap: "anywhere" }}>{userEmail}</div></div>
                <button type="button" onClick={handleSignOut} className="dfp-pill" style={{ ...pillGhost(t), minHeight: 36, padding: "0 14px", fontSize: 13 }}>Sign out</button>
              </div>
            )}
            {formReady ? <div className="dfp-survey-wrap"><NativeFormView runtime={runtime} dark={dark} /></div> : !enrichedSurveyJson && formData && !error ? <div style={{ textAlign: "center", padding: 40, color: t.textMuted, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><Spinner size={40} t={t} /><span>Preparing form…</span></div> : <div style={{ textAlign: "center", padding: 40, color: t.textMuted }}>Unable to render form.</div>}
            {formReady && runtime.isLastPage && (
              <>
                <div className="dfp-pdpa-consent" style={{ background: pdpaConsentError ? t.redPale : t.offWhite, borderRadius: 24, padding: "16px 20px", marginTop: 18 }}>
                  <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={pdpaAccepted}
                      onChange={(e) => {
                        setPdpaAccepted(e.target.checked);
                        if (e.target.checked) setPdpaConsentError("");
                      }}
                      style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: t.purple }}
                    />
                    <span style={{ fontSize: 13, lineHeight: 1.7, color: t.textSecond }}>
                      <strong style={{ color: t.textPrimary }}>{PDPA_CONSENT_LABEL}</strong><br />
                      {PDPA_SUMMARY}{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="dfp-link" style={{ color: t.purple, fontWeight: 700 }}>
                        View Privacy Notice
                      </a>
                    </span>
                  </label>
                  {pdpaConsentError && <div style={{ color: t.red, fontSize: 13, fontWeight: 700, marginTop: 8 }}>{pdpaConsentError}</div>}
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitStatus === "loading"}
                  className="dfp-pill"
                  style={{
                    ...pillFilled(t),
                    width: "100%",
                    marginTop: 14,
                    background: submitStatus === "loading" ? t.purplePale : t.purple,
                    color: submitStatus === "loading" ? t.purple : t.onPrimary,
                    cursor: submitStatus === "loading" ? "wait" : "pointer",
                    boxShadow: t.shadowFab,
                  }}
                >
                  {submitStatus === "loading" ? "Submitting…" : "Submit"}
                </button>
              </>
            )}
            {submitStatus === "loading" && <div role="status" style={{ marginTop: 16, padding: "14px 18px", background: t.purplePale, borderRadius: 24, color: t.purple, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Spinner size={18} t={t} /> Submitting your response…</div>}
            {submitStatus === "error" && <div role="alert" style={{ marginTop: 16, padding: "16px 18px", background: t.redPale, borderRadius: 24, color: t.red, fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>Submission could not be completed. Your answers are still on this page; review them and try again.</div>
              {submitError && <div style={{ fontWeight: 400, lineHeight: 1.6, wordBreak: "break-word", color: t.textSecond, fontSize: 13 }}>{submitError}</div>}
              <button type="button" onClick={handleSubmit} className="dfp-pill" style={{ ...pillTonal(t), alignSelf: "flex-start", minHeight: 40, padding: "0 18px", fontSize: 14 }}>Retry submission</button>
            </div>}
          </div>
        )}
        <div style={{ marginTop: 32, textAlign: "center", fontSize: 12, color: t.textMuted }}>PMW International Berhad OSHES Forms</div>
      </div>

      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(22,27,36,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeUp .2s ease", backdropFilter: "blur(2px)" }}>
          <div role="dialog" aria-label="Share this form" onClick={e => e.stopPropagation()} style={{ background: t.cardBg, borderRadius: 32, padding: "32px 28px 24px", maxWidth: 340, width: "100%", textAlign: "center", boxShadow: t.shadowLg, fontFamily: APP_FONT_FAMILY }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: t.textPrimary, marginBottom: 4 }}>Share this form</div>
            <div style={{ fontSize: 14, color: t.textSecond, marginBottom: 20, lineHeight: 1.5 }}>Scan the QR code or copy the link below</div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, display: "block", margin: "0 auto 16px", borderRadius: 16 }} />
            ) : (
              <div style={{ width: 200, height: 200, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>Generating…</div>
            )}
            <div style={{ fontSize: 12, color: t.textSecond, wordBreak: "break-all", padding: "10px 14px", background: t.offWhite, borderRadius: 16, marginBottom: 18, lineHeight: 1.5 }}>
              {shareUrl}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button type="button" onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }} className="dfp-pill" style={{ ...pillGhost(t), flex: 1, minHeight: 46, padding: "0 16px", fontSize: 14, ...(copied ? { background: t.greenPale, color: t.greenText } : {}) }}>{copied ? "Copied" : "Copy link"}</button>
              <button type="button" onClick={() => setShowQr(false)} className="dfp-pill" style={{ ...pillFilled(t), flex: 1, minHeight: 46, padding: "0 16px", fontSize: 14 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
