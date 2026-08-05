/**
 * DynamicFormPage.tsx - Public form renderer
 * Route: /form/:formId
 */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { FunctionFactory, Model, Serializer } from "survey-core";
import { Survey } from "survey-react-ui";
import { LayeredDarkPanelless, LayeredLightPanelless } from "survey-core/themes";
import "survey-core/survey-core.min.css";

import { getLatestFormBySlug, getFormVersion, spGet, spPost, spPatch, spPatchUrlField, triggerApprovalNotification, getSharePointChoices, getFilteredListChoices, uploadSignatureImage, getFormConfigByTitle, writeMatrixChildItems, ensureMatrixChildList, readMatrixChildItems, uploadFileToDocLib, ensureDocLibrary, ensurePdpaColumns, ensureWorkflowColumns, toAbsoluteSharePointUrl, getSharePointColumnResolvers } from "../utils/formBuilderSP";
import { SharePointHttpError, isSharePointAccessDeniedError } from "../utils/sharepointClient";
import type { MatrixColumnDef } from "../utils/formBuilderSP";
import type { DocumentControlHeader, LayerConfig, LayerConfigItem } from "../types";
import { SP_LAYER_STATUS, SP_FORM_STATUS } from "../utils/statusConstants";
import { registerSignaturePad } from "../utils/SignaturePad";
import { getDepartmentApproverLookupConfig } from "../utils/departmentApproverLookup";
import { isFixedAssignee, layerRecipients, routedAssigneeEmail, validFixedAssigneeEmails } from "../utils/layerAssignees";
import { resolveEvaluationSubmitterRouting } from "../utils/evaluationSubmitterRouting";
import { loginRequest } from "../auth/msalConfig";
import { clearStoredAuthDecision } from "../utils/authDecision";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";
import IosShareIcon from "@mui/icons-material/IosShare";
import Logo from "../components/Logo";
import { safeEvalArithmetic } from "../utils/FormBuilderEngine";
import type { PdfFormData } from "../utils/FormPdfDocument";
import { getPdpaRetentionUntil, PDPA_CONSENT_LABEL, PDPA_NOTICE_VERSION, PDPA_SUMMARY } from "../utils/pdpa";
import { PREFILLED_QR_PARAM, cloneAndApplyPrefilledQr, decodePrefilledQrPayload, type PrefilledQrPayload } from "../utils/prefilledQr";
import { findLocationField } from "../utils/formFieldHints";
import { foldOtherAnswers } from "../utils/surveyOtherAnswers";
import { toSharePointMalaysiaDateTime } from "../utils/sharepointDateTime";
import { OSHES_LISTS } from "../config/oshes";

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
const COMPANY_FIELD_NAME = "company";
const COMPANY_FIELD_LABEL = "Company";
const COMPANY_CHOICE_REQUIRED_ERROR = "Please choose a company.";

// Columns the pmw-hrform builder adds to response lists but which may be absent on
// a list provisioned by an older builder. A submission must not fail because of one.
const OPTIONAL_SIGNED_IN_SUBMISSION_COLUMNS = new Set(["FormStatus", "CurrentLayer", "PublishKey"]);

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
    mapped[columnKey] = Array.isArray(value) && !isMultiValueColumn(fieldName)
      ? JSON.stringify(value)
      : value;
  }
  return mapped;
}

type CompanyChoiceOption = { value: string; text: string };

function companyLinesFromText(value: string): string[] {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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

function companyChoiceFromUnknown(choice: unknown): CompanyChoiceOption | null {
  if (typeof choice === "string") {
    const trimmed = choice.trim();
    return trimmed ? { value: trimmed, text: trimmed } : null;
  }
  if (!choice || typeof choice !== "object") return null;
  const record = choice as Record<string, unknown>;
  const value = String(record.value ?? record.text ?? "").trim();
  const text = String(record.text ?? record.value ?? "").trim();
  return value ? { value, text: text || value } : null;
}

function getCompanyChoiceOptions(choices: unknown, fallbackCompanyLines: string[]): CompanyChoiceOption[] {
  const fromChoices = Array.isArray(choices)
    ? choices.map(companyChoiceFromUnknown).filter((choice): choice is CompanyChoiceOption => Boolean(choice))
    : [];
  return fromChoices.length > 0 ? fromChoices : fallbackCompanyLines.map(value => ({ value, text: value }));
}

function findCompanyChoiceElement(
  json: Record<string, unknown> | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const enabledByMeta = meta?.companyChoiceEnabled === true;
  const walk = (elements: Record<string, unknown>[]): Record<string, unknown> | null => {
    for (const element of elements) {
      if (
        element.isManagedCompanyChoice === true ||
        (enabledByMeta && element.name === COMPANY_FIELD_NAME && element.type === "radiogroup")
      ) {
        return element;
      }
      if (Array.isArray(element.elements)) {
        const nested = walk(element.elements as Record<string, unknown>[]);
        if (nested) return nested;
      }
    }
    return null;
  };
  const pages = (json?.pages as { elements?: Record<string, unknown>[] }[] | undefined) ?? [];
  for (const page of pages) {
    if (!Array.isArray(page.elements)) continue;
    const found = walk(page.elements);
    if (found) return found;
  }
  return null;
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

function uploadFileName(fieldName: string, candidate: UploadCandidate, index?: number): string {
  const originalName = candidate.name?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (originalName) return originalName;
  const mimeMatch = candidate.content.match(/^data:([\w/+-]+);/);
  const ext = (mimeMatch ? mimeMatch[1].split('/').pop() || 'bin' : 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const suffix = index === undefined ? "" : `_${index}`;
  return `${fieldName}_${Date.now()}${suffix}.${ext}`;
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
const APP_FONT_FAMILY = "'Inter','Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif";

// ── Register custom SurveyJS widgets and properties ────────────────────
registerSignaturePad();

if (!FunctionFactory.Instance.hasFunction("now")) {
  FunctionFactory.Instance.register("now", () => new Date());
}

if (!Serializer.findProperty("text", "autocapitalize")) {
  Serializer.addProperty("text", {
    name: "autocapitalize",
    category: "general",
    choices: ["none", "sentences", "words", "characters"],
    default: "none",
  });
}

// Theme tokens
const LIGHT = {
  purple: "#101010", purpleLight: "#333333", purplePale: "#EAF5FC", purpleMid: "#BFDDF4",
  purpleDark: "#000000", bg: "linear-gradient(180deg,#BFDDF4 0%,#DCECF8 46%,#F7F5EF 100%)", cardBg: "#FFFFFF", offWhite: "#F7F5EF", border: "#D6DCE5",
  textPrimary: "#101010", textSecond: "#5F646D", textMuted: "#747B86",
  green: "#107C10", greenPale: "#E3F1E3", greenBorder: "#107C10",
  red: "#C62828", redPale: "#F8E4E4", amber: "#805800", amberPale: "#FFF7BD",
  shadow: "none",
  shadowLg: "0 18px 42px rgba(16,16,16,0.14)", shadowFab: "0 10px 28px rgba(16,16,16,0.10)",
};

const DARK = {
  ...LIGHT, bg: "#101923", cardBg: "#17212B", offWhite: "#111B25", border: "#2F3B47",
  textPrimary: "#F8FAFC", textSecond: "#CBD5E1", textMuted: "#94A3B8",
  greenPale: "#052e16", greenBorder: "#166534", redPale: "#3b0707", amberPale: "#2d1b00",
  shadow: "0 1px 3px rgba(0,0,0,.4),0 4px 16px rgba(0,0,0,.3)",
  shadowLg: "0 8px 40px rgba(0,0,0,.5)", shadowFab: "0 4px 20px rgba(0,0,0,.4)",
};

const globalCss = (t: typeof LIGHT) => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;font-family:${APP_FONT_FAMILY}!important}
  body{font-family:${APP_FONT_FAMILY};background:${t.bg};color:${t.textPrimary};transition:background .3s,color .3s}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
   .dfp-survey-wrap .sd-root-modern{background:transparent!important}
.dfp-survey-wrap .sd-container-modern>.sd-title{text-align:center!important}
.dfp-survey-wrap .sd-row{display:flex!important;flex-wrap:wrap!important}
  .dfp-header{flex-wrap:nowrap}
  .dfp-survey-wrap .sd-container-modern,.dfp-survey-wrap .sd-root-modern{max-width:100%!important}
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
    .dfp-header{padding:0 12px!important;min-height:48px!important}
    .dfp-header-left{gap:6px!important}
    .dfp-title{font-size:13px!important;max-width:140px}
    .dfp-user-name{display:none}
    .dfp-badge{font-size:9px!important;padding:1px 7px!important}
    .dfp-header-right{gap:6px!important}
    .dfp-version{display:none}
    .dfp-content{padding:20px 16px 72px!important}
  }
  @media(max-width:480px){
    .dfp-title{max-width:100px}
    .dfp-banner-logo img{max-height:34px!important}
  }
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-thumb{background:${t.purpleMid};border-radius:10px}
`;

const Spinner = ({ size = 30, t }: { size?: number; t: typeof LIGHT }) => (
  <div style={{ width: size, height: size, border: `2.5px solid ${t.purpleMid}`, borderTop: `2.5px solid ${t.purple}`, borderRadius: "50%", animation: "spin .85s linear infinite", flexShrink: 0 }} />
);

const MsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 9999, pointerEvents: "none" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${t.purple},${t.purpleLight})`, transition: "width .1s linear", borderRadius: "0 2px 2px 0" }} />
    </div>
  );
};

function CompanySelector({
  title,
  options,
  value,
  error,
  disabled,
  onChange,
  t,
}: {
  title: string;
  options: CompanyChoiceOption[];
  value: string;
  error: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  t: typeof LIGHT;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0 }}>
        {title}
      </div>
      <div className="dfp-company-options" role="radiogroup" aria-label={title} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map(option => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className="dfp-company-option"
              style={{
                minHeight: 40,
                flex: "1 1 220px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: checked ? t.purplePale : t.cardBg,
                boxShadow: checked
                  ? `0 0 0 1px ${t.purpleMid}, 0 8px 20px rgba(16,16,16,0.06)`
                  : `0 0 0 1px ${error ? t.red : t.border}`,
                color: checked ? t.purple : t.textPrimary,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                transition: "background-color .15s, box-shadow .15s, color .15s, opacity .15s",
              }}
            >
              <input
                type="radio"
                name="pmw-company-choice"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                style={{ width: 16, height: 16, accentColor: t.purple, flexShrink: 0 }}
              />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
                {option.text}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <div role="alert" style={{ color: t.red, fontSize: 12, fontWeight: 800, lineHeight: 1.4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

const SuccessScreen = ({ formTitle, onReset, t }: { formTitle: string; onReset: () => void; t: typeof LIGHT }) => (
  <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp .3s ease" }}>
    <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.greenPale, border: `2px solid ${t.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>OK</div>
    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: t.textPrimary, marginBottom: 10 }}>Submission received</div>
    <p style={{ color: t.textSecond, fontSize: 14, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 10px" }}>Your response for <strong>{formTitle}</strong> has been recorded.</p>
    <button onClick={onReset} style={{ padding: "11px 30px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.cardBg, color: t.textSecond, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans'" }}>Submit another response</button>
  </div>
);

const PrivateGate = ({ formTitle, onSignIn, t }: { formTitle: string; onSignIn: () => void; t: typeof LIGHT }) => (
  <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <div style={{ background: t.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}`, animation: "fadeUp .3s ease" }}>
      <div style={{ width: 66, height: 66, borderRadius: 18, margin: "0 auto 22px", background: t.purplePale, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>LOCK</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: t.textPrimary, marginBottom: 10 }}>Sign in required</div>
      <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}><strong>{formTitle || "This form"}</strong> is restricted.</p>
      <button onClick={onSignIn} style={{ width: "100%", padding: "14px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${t.purple},${t.purpleLight})`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <MsIcon /> Sign in with Microsoft 365
      </button>
    </div>
  </div>
);

export default function DynamicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const pinVersion = searchParams.get("version");
  const publishKey = searchParams.get("publish") || searchParams.get("batch");
  const explicitPrefill = useMemo(() => decodePrefilledQrPayload(searchParams.get(PREFILLED_QR_PARAM)), [searchParams]);
  /** Where the QR poster is nailed up, handed over by the public report picker. */
  const posterLocation = searchParams.get("location") ?? "";
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
  // Kept alongside the status so a failed submit can say *why* — swallowing this
  // is what reduced a specific, fixable config error to "could not be completed".
  const [submitError, setSubmitError] = useState("");
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [pdpaConsentError, setPdpaConsentError] = useState("");
  const [isLastSurveyPage, setIsLastSurveyPage] = useState(true);
  const [companyChoiceValue, setCompanyChoiceValue] = useState("");
  const [companyChoiceError, setCompanyChoiceError] = useState("");
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

    const withAppFont = (json: Record<string, unknown>): Record<string, unknown> => ({ ...json, fontFamily: "Inter" });
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

  const survey = useMemo(() => {
    const json = enrichedSurveyJson;
    if (!json) return null;
    try {
      // Ensure old-format formula fields (type:"text" with _expression) have
      // readOnly: false — SurveyJS blocks m.setValue() on readOnly questions, which
      // prevents our custom recalcExpressions from updating the displayed value.
      // New-format (type:"expression") already has readOnly:false from mapFieldToSurveyJs.
      const ensureFormulaWritable = (els: Record<string, unknown>[]) => {
        for (const el of els) {
          if (el._expression && el.readOnly === true) {
            el.readOnly = false;
          }
          if (el.elements) ensureFormulaWritable(el.elements as Record<string, unknown>[]);
        }
      };
      for (const page of (json as unknown as Record<string, unknown>).pages as Record<string, unknown>[] ?? []) {
        if (page.elements) ensureFormulaWritable(page.elements as Record<string, unknown>[]);
      }

      const m = new Model(json);
      m.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless);
      m.showCompletedPage = false;
      m.showCompleteButton = false;
      // Manually evaluate formula fields (stored as readOnly text with _expression)
      // Build expression map from the source JSON — SurveyJS does NOT preserve
      // custom JSON properties (_expression) on the question object in v2.5
      const exprMap = new Map<string, string>();
      const walkJson = (els: Record<string, unknown>[]) => {
        for (const el of els) {
          // Check custom _expression first, then fall back to native expression property
          // (native expression may exist on forms published before _expression was introduced)
          const expr = (el._expression as string) || (el.expression as string);
          if (expr) exprMap.set(el.name as string, expr);
          if (el.elements) walkJson(el.elements as Record<string, unknown>[]);
        }
      };
      for (const page of (json as unknown as Record<string, unknown>).pages as Record<string, unknown>[] ?? []) {
        if (page.elements) walkJson(page.elements as Record<string, unknown>[]);
      }
      const recalcExpressions = () => {
        for (const q of m.getAllQuestions()) {
          let expr = exprMap.get(q.name);
          if (!expr) continue;
          // Normalize corrupted expressions (e.g. `++` → `+`) for existing published forms
          // that may have been saved with the old buggy regex.
          expr = expr.replace(/([+\-*/])\s+([+\-*/])/g, '$1').replace(/([+\-*/])\1+/g, '$1');
          let compiled = expr;
          // Replace ALL occurrences of each field reference (split/join replaces globally)
          const refs = [...new Set(expr.match(/\{([^}]+)\}/g) || [])];
          for (const ref of refs) {
            const name = ref.slice(1, -1);
            const srcQ = m.getQuestionByName(name);
            const val = srcQ ? (srcQ.value as number | undefined) : undefined;
            compiled = compiled.split(ref).join(String(Number(val) || 0));
          }
          try {
            const result = safeEvalArithmetic(compiled);
            if (typeof result === "number" && isFinite(result)) {
              if (q.value !== result) m.setValue(q.name, result);
            }
          } catch {
            // Leave the prior calculated value in place when an expression is invalid.
          }
        }
      };
      m.onValueChanged.add(() => setTimeout(recalcExpressions, 0));
      setTimeout(recalcExpressions, 0);
      m.onValueChanged.add((_, options) => {
        const q = m.getQuestionByName(options.name);
        if (!q || q.getType() !== "text") return;
        const mode = (q as Record<string, unknown>).autocapitalize as string | undefined;
        if (!mode || mode === "none") return;
        const val = options.value;
        if (typeof val !== "string") return;
        const transform = (v: string) => {
          switch (mode) {
            case "words": return v.replace(/\b\w/g, c => c.toUpperCase());
            case "sentences": return v.replace(/(^\w|[.!?]\s+\w)/g, c => c.toUpperCase());
            case "characters": return v.toUpperCase();
            default: return v;
          }
        };
        const next = transform(val);
        if (next !== val) {
          q.value = next;
        }
      });
      // Customise currency display for MYR → show "RM" symbol
      m.onGetExpressionDisplayValue.add((_sender, options) => {
        if (options.question && options.question.getType() === "expression" && (options.question as any).currency === "MYR") {
          options.displayValue = "RM " + String(options.displayValue).replace(/^[^\d\s-]+/, "").trim();
        }
      });
      return m;
    } catch { return null; }
  }, [enrichedSurveyJson, resetKey]);

  useEffect(() => { survey?.applyTheme(dark ? LayeredDarkPanelless : LayeredLightPanelless); }, [dark, survey]);

  const formVersion = String(formData?.formConfig?.CurrentVersion || "1.0");
  const formIdValue = String(formData?.formConfig?.FormID || "");
  const showBanner = (formData?.meta?.showBanner as boolean) !== false;
  const isoStandardsText = (formData?.meta?.isoStandards as string) || "ISO 9001 · ISO 14001 · ISO 45001";
  const companiesText = (formData?.meta?.companies as string) || "";
  const companyLines = companyLinesFromText(companiesText);
  const companySelector = findCompanyChoiceElement(enrichedSurveyJson || formData?.surveyJson, formData?.meta);
  const companyChoiceEnabled = formData?.meta?.companyChoiceEnabled === true;
  const companyOptions = getCompanyChoiceOptions(companySelector?.choices, companyLines);
  const companyFieldName = String(companySelector?.name || (companyChoiceEnabled ? COMPANY_FIELD_NAME : ""));
  const companyTitle = String(companySelector?.title || COMPANY_FIELD_LABEL);
  const showCompanyChoice = companyChoiceEnabled && companyOptions.length > 0 && !!companyFieldName;
  const showHeaderBanner = showBanner || showCompanyChoice;
  const logoUrl = (formData?.meta?.logoUrl as string) || "";
  const isPublicForm = formData?.formConfig?.IsPublic !== false;
  const formTitle = String(formData?.formConfig?.Title || formData?.surveyJson?.title || "Form");
  const documentHeader = documentHeaderFromMeta(formData?.meta, formIdValue, formVersion);

  useEffect(() => { document.title = formTitle ? `Form: ${formTitle}` : "Form — PMW OSHES"; }, [formTitle]);

  useEffect(() => {
    if (!showCompanyChoice || !survey || !companyFieldName) {
      setCompanyChoiceValue("");
      setCompanyChoiceError("");
      return;
    }
    const current = submittedValueToString(survey.getValue(companyFieldName));
    setCompanyChoiceValue(current);
    const syncCompanyValue = (_sender: Model, options: { name: string; value: unknown }) => {
      if (options.name !== companyFieldName) return;
      setCompanyChoiceValue(submittedValueToString(options.value));
      if (options.value) setCompanyChoiceError("");
    };
    survey.onValueChanged.add(syncCompanyValue);
    return () => survey.onValueChanged.remove(syncCompanyValue);
  }, [survey, showCompanyChoice, companyFieldName]);

  const onCompleting = useCallback((sender: { data: Record<string, unknown> }, options: { allowComplete: boolean }) => {
    if (!pdpaAccepted) {
      options.allowComplete = false;
      setPdpaConsentError("Please read and accept the Privacy Notice before submitting this form.");
      document.querySelector(".dfp-pdpa-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (showCompanyChoice) {
      const selectedCompany = submittedValueToString(sender.data[companyFieldName] ?? companyChoiceValue);
      if (!selectedCompany) {
        options.allowComplete = false;
        setPdpaConsentError("");
        setCompanyChoiceError(COMPANY_CHOICE_REQUIRED_ERROR);
        document.querySelector(".dfp-banner")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      sender.data[companyFieldName] = selectedCompany;
      if (survey?.getValue(companyFieldName) !== selectedCompany) {
        survey?.setValue(companyFieldName, selectedCompany);
      }
    }
    setPdpaConsentError("");
    setCompanyChoiceError("");
    lastDataRef.current = { ...sender.data };
    options.allowComplete = false; // prevent survey auto-complete — we handle submission + success/error UI
    setSubmitStatus("loading");
  }, [pdpaAccepted, showCompanyChoice, companyFieldName, companyChoiceValue, survey]);
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
        if (hasManualBranches) {
          const maxBranchLayers = Math.max(
            1,
            ...(layerConfigParsed?.manualBranches ?? []).map((b) => b.layers.length),
          );
          await ensureWorkflowColumns(token, cfg.Title as string, maxBranchLayers);
          await new Promise((r) => setTimeout(r, 1500));
        }
        const listUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(cfg.Title as string)}')/items`;
        const { resolveColumnKey, isMultiValueColumn } = await getSharePointColumnResolvers(token, cfg.Title as string);
        let result: { Id?: number } | undefined;
        try {
          result = await spPost(
            token,
            listUrl,
            mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn),
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
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn),
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
              mapBodyToSharePointColumnKeys(body, resolveColumnKey, cfg.Title as string, isMultiValueColumn),
            ) as { Id?: number };
          } else {
            throw submitErr;
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
          const baseUrl = window.location.origin;

          if (firstLayerManualPaper) {
            // Manual-paper workflow notices are sent with the generated PDF below.
          } else if (layerConfigParsed?.layers?.[0]?.type === "evaluation" && layerConfigParsed.layers[0].authMode === "365" && layer1Recipients.length > 0) {
            const reviewLink = formSlug
              ? `${baseUrl}/eval/${encodeURIComponent(formSlug)}/${result.Id}/1`
              : undefined;
            await triggerApprovalNotification(token, {
              formTitle: cfg.Title as string,
              submittedBy: submittedByEmail,
              responseItemId: result.Id,
              layer: 1,
              totalLayers: resolvedLayerCount,
              action: "submit",
              nextApproverEmail: layer1Recipients,
              nextLayerType: layerConfigParsed.layers[0].type,
              nextEmailSchedule: layerConfigParsed.layers[0].emailSchedule,
              reviewLink,
            });
          } else if (resolvedLayerCount > 0) {
            await triggerApprovalNotification(token, {
              formTitle: cfg.Title as string,
              submittedBy: submittedByEmail,
              responseItemId: result.Id,
              layer: 1,
              totalLayers: resolvedLayerCount,
              action: "submit",
              ...(layer1Recipients.length > 0 ? { nextApproverEmail: layer1Recipients } : {}),
              ...(layerConfigParsed?.layers?.[0]?.type ? { nextLayerType: layerConfigParsed.layers[0].type } : {}),
              ...(layerConfigParsed?.layers?.[0]?.type === "evaluation"
                ? { nextEmailSchedule: layerConfigParsed.layers[0].emailSchedule }
                : {}),
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
                logoUrl: logoUrl || "/logo-128.png",
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
          }),
        });
        const resData = await res.json().catch(() => ({})) as { id?: string; error?: string };
        if (!res.ok) { throw new Error(resData.error || `Submit failed: ${res.status}`); }

        // If API returned parent item ID and we have matrixData, try server-side child list write
        // (API creates child items using system credential; we verify via RowIds response field)
        if (resData.id && Object.keys(matrixData).length > 0) {
          // The API already handled child list creation if successful
          // Nothing more to do client-side for guest path
        }
      }
      // Success — function returns normally; errors propagate to caller (useEffect)
  }, [formData, userEmail, accounts]);

  useEffect(() => {
    if (!survey) return;
    survey.onCompleting.add(onCompleting);
    // NOTE: onComplete is intentionally NOT registered — onCompleting prevents
    // auto-completion and triggers submission via doSubmitForm + submitStatus effect
    return () => { survey.onCompleting.remove(onCompleting); };
  }, [survey, onCompleting]);

  useEffect(() => {
    if (!survey) {
      setIsLastSurveyPage(true);
      return;
    }
    const syncPageState = () => setIsLastSurveyPage(survey.isLastPage);
    syncPageState();
    survey.onCurrentPageChanged.add(syncPageState);
    return () => { survey.onCurrentPageChanged.remove(syncPageState); };
  }, [survey]);

  // Run submission logic when onCompleting triggers the loading state
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
    setSubmitError("");
    setPdpaAccepted(false);
    setPdpaConsentError("");
    setCompanyChoiceValue("");
    setCompanyChoiceError("");
    lastDataRef.current = null;
    setResetKey(k => k + 1);
  }, []);

  // Generate QR when modal opens
  useEffect(() => {
    if (!showQr) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(shareUrl, { width: 280, margin: 2, color: { dark: "#1E1B4B", light: "#FFFFFF" } }),
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
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss(t)}</style>
      <Spinner t={t} />
      <div style={{ fontSize: 13, color: t.textMuted, animation: "pulse 1.5s infinite" }}>Loading form...</div>
    </div>
  );

  // A form that loaded without survey content can never be filled in or submitted —
  // say so instead of sitting on a spinner forever.
  if (!error && !formData?.surveyJson) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>ERR</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Form unavailable</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>This link has no published form content. Please ask an OSHES Forms Owner to republish the form and share the link again.</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{globalCss(t)}</style>
      <div style={{ background: t.cardBg, borderRadius: 8, padding: "56px 44px", maxWidth: 420, textAlign: "center", boxShadow: t.shadowLg, border: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>ERR</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: t.red, marginBottom: 10 }}>Form not found</div>
        <p style={{ color: t.textSecond, fontSize: 13, lineHeight: 1.7 }}>{error}</p>
      </div>
    </div>
  );

  if (!isPublicForm && !isAuthenticated) return (<><style>{globalCss(t)}</style><PrivateGate formTitle={formTitle} onSignIn={handleSignIn} t={t} /></>);

  return (
    <div style={{ minHeight: "100vh", background: t.bg }}>
      <style>{globalCss(t)}</style>
      <ScrollProgress t={t} />
      <header className="dfp-header" style={{ background: t.cardBg, borderBottom: `1px solid ${t.border}`, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", position: "sticky", top: 0, zIndex: 50, gap: 10, boxShadow: "0 1px 2px rgba(17,24,39,0.04)" }}>
        <div className="dfp-header-left" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Logo size={{ xs: 26, sm: 28, md: 32 }} />
          <span className="dfp-title" style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15, color: t.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formTitle}</span>
          {pinVersion && <span className="dfp-badge" style={{ fontSize: 10, fontWeight: 700, color: t.amber, background: t.amberPale, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>v{pinVersion}</span>}
          {!isPublicForm && <span className="dfp-badge" style={{ fontSize: 10, fontWeight: 700, color: t.purple, background: t.purplePale, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>Private</span>}
        </div>
        <div className="dfp-header-right" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={() => { setShowQr(true); setCopied(false); }} title="Share this form" style={{ height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.border}`, borderRadius: 8, background: "none", color: t.textSecond, cursor: "pointer", padding: 0, lineHeight: 0 }}><IosShareIcon style={{ fontSize: 15 }} /></button>
          {isAuthenticated ? (
            <>
              <div className="dfp-user-badge" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textSecond }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.green, flexShrink: 0 }} />
                <span className="dfp-user-name">{userEmail?.split("@")[0]}</span>
              </div>
              <button onClick={handleSignOut} style={{ height: 30, padding: "0 10px", border: `1px solid ${t.border}`, borderRadius: 8, background: "none", color: t.textSecond, fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans'", whiteSpace: "nowrap" }}>Sign out</button>
            </>
          ) : (<button onClick={handleSignIn} style={{ height: 30, padding: "0 12px", border: `1px solid ${t.purpleMid}`, borderRadius: 8, background: "none", color: t.purple, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><MsIcon /> Sign in</button>)}
          <span className="dfp-version" style={{ fontSize: 10, color: t.textMuted, whiteSpace: "nowrap" }}>v{formVersion}</span>
        </div>
      </header>

      {showHeaderBanner && (
        <div className="dfp-banner" style={{ borderBottom: `1px solid ${t.border}`, background: t.cardBg }}>
          <div style={{ background: `linear-gradient(135deg,${t.purpleDark},${t.purple})`, padding: "14px 20px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>{isoStandardsText}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff" }}>{formTitle}</div>
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
          <div className="dfp-banner-row" style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${t.border}` }}>
            <div className="dfp-banner-logo" style={{ width: 150, flexShrink: 0, borderRight: `1px solid ${t.border}`, background: t.offWhite, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={logoUrl || "/logo-128.png"} alt="Company Logo" style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
            </div>
            <div className="dfp-banner-info" style={{ flex: 1, padding: "12px 16px", fontWeight: 700, fontSize: 13, color: t.textPrimary }}>
              {showCompanyChoice
                ? <CompanySelector
                    title={companyTitle}
                    options={companyOptions}
                    value={companyChoiceValue}
                    error={companyChoiceError}
                    disabled={!survey || prefilledQrPayload?.locked.includes(companyFieldName) === true}
                    onChange={value => {
                      if (prefilledQrPayload?.locked.includes(companyFieldName)) return;
                      setCompanyChoiceValue(value);
                      setCompanyChoiceError("");
                      survey?.setValue(companyFieldName, value);
                    }}
                    t={t}
                  />
                : companyLines.length > 0
                ? companyLines.map((line, i) => <div key={i} style={i > 0 ? { marginTop: 4 } : undefined}>{line}</div>)
                : "PMW INTERNATIONAL BERHAD"}
            </div>
          </div>
        </div>
      )}

      <div className="dfp-content" style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 88px", animation: "fadeUp .3s ease" }}>
        {submitStatus === "success" ? (
          <SuccessScreen formTitle={formTitle} onReset={handleReset} t={t} />
        ) : (
          <div>
            {!isPublicForm && isAuthenticated && (
              <div style={{ background: t.greenPale, border: `1px solid ${t.greenBorder}`, borderRadius: 8, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${t.green},#34D399)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{(userEmail?.[0] || "?").toUpperCase()}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: t.green }}>Submitting as yourself</div><div style={{ fontSize: 11, color: t.textSecond }}>{userEmail}</div></div>
                <button onClick={handleSignOut} style={{ fontSize: 11, color: t.textSecond, background: "none", border: `1px solid ${t.border}`, borderRadius: 7, padding: "5px 11px", cursor: "pointer", fontFamily: "'DM Sans'" }}>Sign out</button>
              </div>
            )}
            {survey ? <div className="dfp-survey-wrap"><Survey model={survey} /></div> : !enrichedSurveyJson && formData && !error ? <div style={{ textAlign: "center", padding: 40, color: t.textMuted, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><Spinner t={t} /><span>Preparing form...</span></div> : <div style={{ textAlign: "center", padding: 40, color: t.textMuted }}>Unable to render form.</div>}
            {survey && isLastSurveyPage && (
              <>
                <div className="dfp-pdpa-consent" style={{ background: t.cardBg, border: `1px solid ${pdpaConsentError ? t.red : t.border}`, borderRadius: 8, padding: "14px 16px", marginTop: 18, boxShadow: t.shadow }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={pdpaAccepted}
                      onChange={(e) => {
                        setPdpaAccepted(e.target.checked);
                        if (e.target.checked) setPdpaConsentError("");
                      }}
                      style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 12, lineHeight: 1.7, color: t.textSecond }}>
                      <strong style={{ color: t.textPrimary }}>{PDPA_CONSENT_LABEL}</strong><br />
                      {PDPA_SUMMARY}{" "}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: t.purple, fontWeight: 700 }}>
                        View Privacy Notice
                      </a>
                    </span>
                  </label>
                  {pdpaConsentError && <div style={{ color: t.red, fontSize: 12, fontWeight: 700, marginTop: 8 }}>{pdpaConsentError}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => survey.tryComplete()}
                  disabled={submitStatus === "loading"}
                  style={{
                    width: "100%",
                    minHeight: 46,
                    marginTop: 14,
                    border: "none",
                    borderRadius: 8,
                    background: submitStatus === "loading" ? t.purpleMid : t.purple,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: submitStatus === "loading" ? "wait" : "pointer",
                    boxShadow: t.shadowFab,
                  }}
                >
                  {submitStatus === "loading" ? "Submitting..." : "Submit"}
                </button>
              </>
            )}
            {submitStatus === "loading" && <div style={{ marginTop: 16, padding: "13px 16px", background: t.purplePale, border: `1px solid ${t.purpleMid}`, borderRadius: 8, color: t.purple, fontSize: 13, fontWeight: 700 }}><Spinner size={14} t={t} /> Submitting your response...</div>}
            {submitStatus === "error" && <div style={{ marginTop: 16, padding: "13px 16px", background: t.redPale, border: "1px solid #FCA5A5", borderRadius: 8, color: t.red, fontSize: 13, fontWeight: 700, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>Submission could not be completed. Your answers are still on this page; review them and try again.</div>
              {submitError && <div style={{ fontWeight: 400, lineHeight: 1.6, wordBreak: "break-word" }}>{submitError}</div>}
              <button onClick={() => survey?.tryComplete()} style={{ alignSelf: "flex-start", padding: "8px 18px", border: "none", borderRadius: 8, background: t.red, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'" }}>Retry submission</button>
            </div>}
          </div>
        )}
        <div style={{ marginTop: 32, textAlign: "center", fontSize: 11, color: t.textMuted }}>PMW International Berhad OSHES Forms</div>
      </div>

      {showQr && (
        <div onClick={() => setShowQr(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeUp .2s ease", backdropFilter: "blur(2px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 8, padding: "32px 28px 24px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: "#1E1B4B", marginBottom: 4 }}>Share this form</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 1.5 }}>Scan the QR code or copy the link below</div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, display: "block", margin: "0 auto 16px", borderRadius: 8 }} />
            ) : (
              <div style={{ width: 200, height: 200, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 12 }}>Generating...</div>
            )}
            <div style={{ fontSize: 11, color: "#6B7280", wordBreak: "break-all", padding: "10px 12px", background: "#F3F4F6", borderRadius: 8, marginBottom: 18, lineHeight: 1.5 }}>
              {shareUrl}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }} style={{ flex: 1, padding: "10px", border: `1px solid ${copied ? "#059669" : "#E5E3F0"}`, borderRadius: 8, background: copied ? "#D1FAE5" : "none", color: copied ? "#059669" : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all .2s" }}>{copied ? "Copied!" : "Copy Link"}</button>
              <button onClick={() => setShowQr(false)} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: "linear-gradient(135deg,#005A9E,#0078D4)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
