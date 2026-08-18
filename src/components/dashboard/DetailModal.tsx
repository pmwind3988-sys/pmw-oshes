import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  CalendarToday as CalendarIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Description as DocumentIcon,
  Edit as SignatureIcon,
  Email as EmailIcon,
  InfoOutlined as InfoIcon,
  InsertDriveFile as FileIcon,
  Lock as LockIcon,
  OpenInNew as OpenInNewIcon,
  Person as PersonIcon,
  PictureAsPdf as PdfIcon,
  VerifiedUser as ApprovalIcon,
} from "@mui/icons-material";
import { useEffect, useState, type ReactNode } from "react";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../../utils/authRecovery";
import { useMsal } from "@azure/msal-react";
import type { Submission, ApprovalLayer, ApprovalLayerResult, EvaluationLayerResult, EvaluationLayerConfig } from "../../types";
import StatusBadge from "./StatusBadge";
import EvaluationSummary from "../builder/EvaluationSummary";
import ReferenceTag from "../ReferenceTag";
import { getActiveLayers } from "../builder/approvalDashboardLayerProgress";
import DOMPurify from "dompurify";
import { editorial, editorialHairline } from "../../theme/editorial";
import { getSelectedCompany, isCompanyResponseKey } from "../../utils/companySelection";
import { loginRequest } from "../../auth/msalConfig";
import {
  buildFormSubmissionSections,
  type FormSubmissionField,
  type FormSubmissionSection,
} from "../../utils/formSubmissionLayout";
import {
  formatDashboardDateTime,
  getSubmittedByDisplayName,
  getFormReference,
  getSubmissionDisplayTitle,
  isPlaceholderDisplayValue,
  isBranchDecisionPending,
} from "../../utils/submissionDisplay";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

const SYSTEM_FIELDS = new Set([
  "Id",
  "ID",
  "_authorEmail",
  "Author",
  "AuthorId",
  "Editor",
  "EditorId",
  "Created",
  "Modified",
  "Status",
  "FormStatus",
  "FormId",
  "FormID",
  "FormVersion",
  "PublishKey",
  "SubmittedAt",
  "SubmittedBy",
  "Submitted_x0020_By",
  "SelectedBranch",
  "Selected_x0020_Branch",
  "ContentType",
  "ContentTypeId",
  "RawJSON",
  "Attachments",
  "GUID",
  "FileSystemObjectType",
  "ServerRedirectedEmbedUri",
  "ServerRedirectedEmbedUrl",
  "OData__UIVersionString",
  "OData__ColorTag",
  "ComplianceAssetId",
  "PermMask",
  "CurrentLayer",
  "CurrentApprovalLayer",
  "EvaluationData",
  "WorkflowEmailLog",
  "WorkflowEmailSchedule",
  "WorkflowAssignmentData",
  "PDPAConsent",
  "PDPANoticeVersion",
  "PDPAConsentAt",
  "RetentionUntil",
]);

const SUPPORTING_DETAIL_LABELS: Record<string, string> = {
  Created: "Created",
  Modified: "Modified",
  PDPAConsent: "PDPA consent",
  PDPANoticeVersion: "PDPA notice version",
  PDPAConsentAt: "PDPA consent at",
  RetentionUntil: "Retention until",
};

const SUPPORTING_DETAIL_ORDER = [
  "formVersion",
  "selectedBranch",
  "Created",
  "Modified",
  "PDPAConsent",
  "PDPANoticeVersion",
  "PDPAConsentAt",
  "RetentionUntil",
] as const;

interface DetailModalProps {
  item: Submission | null;
  isAdmin: boolean;
  onClose: () => void;
}

interface LinkValue {
  url: string;
  label: string;
}

interface SupportingDetail {
  key: string;
  label: string;
  value: unknown;
}

interface SignatureField {
  key: string;
  label: string;
  value: unknown;
  src: string;
  link: LinkValue | null;
}

type ApprovalCardLayer = ApprovalLayer & {
  confirmedVia?: "signature" | "checkbox";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const parsed = parseMaybeJson(value);
  return parsed ?? value;
}

function toAbsoluteSharePointUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:") || url.startsWith("mailto:") || url.startsWith("tel:")) {
    return url;
  }
  if (!url.startsWith("/")) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(escapeODataString(serverRelativeUrl)).replace(/%2F/gi, "/");
}

function sharePointServerRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const siteUrl = new URL(SP_SITE_URL);
      const imageUrl = new URL(trimmed);
      if (siteUrl.origin.toLowerCase() !== imageUrl.origin.toLowerCase()) return "";
      return decodeURIComponent(imageUrl.pathname);
    }
  } catch {
    return "";
  }

  return trimmed.startsWith("/") ? decodeURIComponent(trimmed.split(/[?#]/)[0] ?? trimmed) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverRelativePath = sharePointServerRelativePath(value);
  if (!serverRelativePath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverRelativePath)}')/$value`;
}

function extractImageSrcFromHtml(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i);
  return match?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): { url: string; label: string } | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  const separatorIndex = trimmed.search(/,\s+/);
  if (separatorIndex === -1) return null;

  const url = trimmed.slice(0, separatorIndex).trim();
  const label = trimmed.slice(separatorIndex + 1).replace(/^,?\s*/, "").trim();
  return isUrlLike(url) ? { url, label } : null;
}

function isUrlLike(value: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|\/sites\/|\/SiteAssets\/|\/Shared%20Documents\/|\/)/i.test(value.trim());
}

function filenameFromUrl(url: string): string {
  if (url.startsWith("data:image/")) return "Signature image";
  if (url.startsWith("mailto:")) return url.replace(/^mailto:/i, "");
  if (url.startsWith("tel:")) return url.replace(/^tel:/i, "");
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const last = withoutQuery.split("/").filter(Boolean).pop();
  if (!last) return "Open link";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function recordText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function linkFromValue(value: unknown): LinkValue | null {
  const normalized = normalizeMaybeJson(value);
  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    const htmlImageSrc = extractImageSrcFromHtml(trimmed);
    const urlFieldValue = splitSharePointUrlFieldValue(trimmed);
    const rawUrl = htmlImageSrc || urlFieldValue?.url || trimmed;
    if (!isUrlLike(rawUrl) && !rawUrl.startsWith("data:image/")) return null;
    const url = toAbsoluteSharePointUrl(rawUrl);
    return { url, label: urlFieldValue?.label || filenameFromUrl(url) };
  }

  if (!isRecord(normalized)) return null;

  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = normalized[key];
    if (typeof next === "string" && next.trim()) {
      const url = toAbsoluteSharePointUrl(next.trim());
      const label = recordText(normalized, ["Description", "description", "Name", "name", "FileName", "fileName", "Title", "title"]) || filenameFromUrl(url);
      return { url, label };
    }
  }

  const serverUrl = normalized.serverUrl || normalized.ServerUrl;
  const relativeUrl = normalized.serverRelativeUrl || normalized.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const url = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    const label = recordText(normalized, ["Description", "description", "Name", "name", "Title", "title"]) || filenameFromUrl(url);
    return { url, label };
  }

  return null;
}

function collectLinks(value: unknown): LinkValue[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) {
    return normalized.flatMap((entry) => collectLinks(entry));
  }
  const link = linkFromValue(normalized);
  return link ? [link] : [];
}

function isSignatureField(key: string): boolean {
  return /signature/i.test(key);
}

function isPdfField(key: string): boolean {
  return /^pdfurl$/i.test(key) || (/pdf/i.test(key) && /(url|link|file|document)/i.test(key));
}

function signatureValueToSrc(value: unknown): string {
  const normalized = normalizeMaybeJson(value);
  if (typeof normalized === "string" && normalized.trim().startsWith("data:image/")) return normalized.trim();
  return linkFromValue(normalized)?.url ?? "";
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function shouldSkipField(key: string, value: unknown): boolean {
  if (SYSTEM_FIELDS.has(key)) return true;
  if (key.startsWith("odata.") || key.startsWith("@odata.")) return true;
  if (/^L\d+_/i.test(key)) return true;
  if (/_Json$/i.test(key) || /^Json$/i.test(key)) return true;
  if (isCompanyResponseKey(key)) return true;
  if (isSignatureField(key) || isPdfField(key)) return true;
  return !hasDisplayValue(value);
}

function hasSupportingDetailValue(value: unknown): boolean {
  if (!hasDisplayValue(value)) return false;
  if (typeof value === "string") return !isPlaceholderDisplayValue(value);
  return true;
}

function addSupportingDetail(
  details: Map<string, SupportingDetail>,
  key: string,
  label: string,
  value: unknown,
): void {
  if (!hasSupportingDetailValue(value)) return;
  details.set(key, { key, label, value });
}

function sortSupportingDetails(details: SupportingDetail[]): SupportingDetail[] {
  return details.sort((a, b) => {
    const aIndex = SUPPORTING_DETAIL_ORDER.indexOf(a.key as (typeof SUPPORTING_DETAIL_ORDER)[number]);
    const bIndex = SUPPORTING_DETAIL_ORDER.indexOf(b.key as (typeof SUPPORTING_DETAIL_ORDER)[number]);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return normalizedA === normalizedB ? a.label.localeCompare(b.label) : normalizedA - normalizedB;
  });
}

function buildSupportingDetails(
  item: Submission,
  entries: [string, unknown][],
  renderedSignatureKeys: Set<string>,
): SupportingDetail[] {
  const details = new Map<string, SupportingDetail>();

  addSupportingDetail(details, "formVersion", "Form version", item.formVersion);
  addSupportingDetail(details, "selectedBranch", "Selected branch", item.selectedBranch);

  for (const [key, value] of entries) {
    const label = SUPPORTING_DETAIL_LABELS[key];
    if (label) {
      addSupportingDetail(details, key, label, value);
      continue;
    }

    if (isSignatureField(key) && !renderedSignatureKeys.has(key)) {
      addSupportingDetail(details, key, formatFieldName(key), value);
    }
  }

  return sortSupportingDetails([...details.values()]);
}

function textRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function collectSurveyFieldKeysByType(surveyJson: unknown, targetTypes: Set<string>): Set<string> {
  const keys = new Set<string>();
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages.filter(isRecord) : [];
  const childKeys = ["elements", "templateElements", "questions"] as const;

  const visit = (element: Record<string, unknown>) => {
    const type = textRecordValue(element, "type").toLowerCase();
    const name = textRecordValue(element, "name");
    if (name && targetTypes.has(type)) keys.add(name);

    for (const childKey of childKeys) {
      const children = element[childKey];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }

    if (type !== "dynamicmatrix" && type !== "matrixdynamic" && type !== "tableinput") {
      const columns = element.columns;
      if (Array.isArray(columns)) {
        for (const column of columns.filter(isRecord)) {
          const columnElements = column.elements;
          if (Array.isArray(columnElements)) columnElements.filter(isRecord).forEach(visit);
        }
      }
    }
  };

  for (const page of pages) {
    const elements = page.elements;
    if (Array.isArray(elements)) elements.filter(isRecord).forEach(visit);
  }

  return keys;
}

function formatFieldName(key: string): string {
  const decoded = key
    .replace(/_x0020_/gi, " ")
    .replace(/_x002f_/gi, "/")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bUrl\b/gi, "Link")
    .replace(/\bPdf\b/gi, "PDF")
    .replace(/\bId\b/g, "ID")
    .trim();

  return decoded.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** The stored config for an evaluation layer, respecting the submission's branch. */
function evaluationLayerConfig(item: Submission, layerNumber: number): EvaluationLayerConfig | undefined {
  const layer = getActiveLayers(item.layerConfig, item.selectedBranch)
    .find((candidate) => candidate.layerNumber === layerNumber);
  return layer?.type === "evaluation" ? layer : undefined;
}

function formatDateValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?$/i.test(value)) return null;
  const formatted = formatDashboardDateTime(value, "");
  return formatted || null;
}

function formatPlainValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const trimmed = value.trim();
  if (!trimmed) return "Not provided";
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true" ? "Yes" : "No";
  return formatDateValue(trimmed) ?? trimmed;
}

function recordFriendlyText(record: Record<string, unknown>): string {
  const email = recordText(record, ["Email", "email", "EMail"]);
  const title = recordText(record, ["Title", "title", "DisplayName", "displayName", "Name", "name"]);
  const value = recordText(record, ["Value", "value", "Label", "label", "Text", "text"]);

  if (title && email && title.toLowerCase() !== email.toLowerCase()) return `${title} (${email})`;
  if (email) return email;
  if (title) return title;
  if (value) return value;
  return "";
}

function summarizeNestedValue(value: unknown): string {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) {
    return normalized.map((entry) => summarizeNestedValue(entry)).filter(Boolean).join(", ") || "Not provided";
  }
  if (isRecord(normalized)) {
    const friendlyText = recordFriendlyText(normalized);
    if (friendlyText) return friendlyText;
    return Object.entries(normalized)
      .filter(([key, entry]) => hasDisplayValue(entry) && !key.startsWith("__") && !key.startsWith("odata."))
      .slice(0, 4)
      .map(([key, entry]) => `${formatFieldName(key)}: ${summarizeNestedValue(entry)}`)
      .join(", ") || "Not provided";
  }
  if (typeof normalized === "string" || typeof normalized === "number" || typeof normalized === "boolean" || normalized === null || normalized === undefined) {
    return formatPlainValue(normalized);
  }
  return "Not provided";
}

function isHtmlValue(key: string, value: unknown): value is string {
  return typeof value === "string" && (/(Html|_Response)$/i.test(key) || /<[a-z][\s\S]*>/i.test(value));
}

function externalProps(url: string) {
  if (url.startsWith("mailto:") || url.startsWith("tel:")) return {};
  return { target: "_blank", rel: "noopener noreferrer" };
}

function ValueLink({ link }: { link: LinkValue }) {
  return (
    <MuiLink
      href={link.url}
      {...externalProps(link.url)}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        color: editorial.pmwBlueDark,
        fontWeight: 800,
        textDecorationThickness: "2px",
        textUnderlineOffset: "3px",
        overflowWrap: "anywhere",
      }}
    >
      {link.label}
      {!link.url.startsWith("mailto:") && !link.url.startsWith("tel:") && <OpenInNewIcon sx={{ fontSize: 14 }} />}
    </MuiLink>
  );
}

function FriendlyValue({ fieldKey, value, depth = 0 }: { fieldKey: string; value: unknown; depth?: number }): ReactNode {
  const normalized = normalizeMaybeJson(value);
  const links = collectLinks(normalized);

  if (links.length === 1 && !Array.isArray(normalized)) return <ValueLink link={links[0]} />;
  if (links.length > 1) {
    return (
      <Stack spacing={0.75}>
        {links.map((link, index) => (
          <ValueLink key={`${fieldKey}-${link.url}-${index}`} link={link} />
        ))}
      </Stack>
    );
  }

  if (typeof normalized === "string" || typeof normalized === "number" || typeof normalized === "boolean" || normalized === null || normalized === undefined) {
    const text = formatPlainValue(normalized);
    if (typeof normalized === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.trim())) {
      return <ValueLink link={{ url: `mailto:${normalized.trim()}`, label: normalized.trim() }} />;
    }
    return <Typography variant="body2">{text}</Typography>;
  }

  if (Array.isArray(normalized)) {
    if (normalized.length === 0) return <Typography variant="body2">Not provided</Typography>;
    return (
      <Stack component="ul" spacing={0.75} sx={{ pl: 2.25, my: 0 }}>
        {normalized.map((entry, index) => (
          <Box component="li" key={`${fieldKey}-${index}`} sx={{ color: editorial.ink }}>
            {depth > 1 ? (
              <Typography variant="body2">{summarizeNestedValue(entry)}</Typography>
            ) : (
              <FriendlyValue fieldKey={`${fieldKey}-${index}`} value={entry} depth={depth + 1} />
            )}
          </Box>
        ))}
      </Stack>
    );
  }

  if (isRecord(normalized)) {
    const friendlyText = recordFriendlyText(normalized);
    if (friendlyText) return <Typography variant="body2">{friendlyText}</Typography>;

    const entries = Object.entries(normalized).filter(([key, entry]) => hasDisplayValue(entry) && !key.startsWith("__") && !key.startsWith("odata."));
    if (entries.length === 0 || depth > 1) return <Typography variant="body2">Not provided</Typography>;

    return (
      <Stack spacing={1}>
        {entries.slice(0, 8).map(([key, entry]) => (
          <Box key={key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "140px minmax(0, 1fr)" }, gap: 0.75 }}>
            <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 800 }}>
              {formatFieldName(key)}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <FriendlyValue fieldKey={`${fieldKey}-${key}`} value={entry} depth={depth + 1} />
            </Box>
          </Box>
        ))}
      </Stack>
    );
  }

  return <Typography variant="body2">{summarizeNestedValue(normalized)}</Typography>;
}

function FieldCard({ fieldKey, label, value }: { fieldKey: string; label?: string; value: unknown }) {
  if (isHtmlValue(fieldKey, value)) {
    return (
      <Box>
        <FieldLabel>{label ?? formatFieldName(fieldKey)}</FieldLabel>
        <Box
          sx={{
            backgroundColor: "#ffffff",
            border: editorialHairline,
            borderRadius: "8px",
            p: 2,
            overflowX: "auto",
            "& table": {
              width: "100%",
              borderCollapse: "collapse",
            },
            "& td, & th": {
              border: editorialHairline,
              padding: "10px 14px",
              fontSize: "0.875rem",
              verticalAlign: "top",
            },
            "& th": {
              backgroundColor: editorial.blueSoft,
              fontWeight: 800,
            },
            "& tr:nth-of-type(even)": {
              backgroundColor: "rgba(0,0,0,0.02)",
            },
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
        />
      </Box>
    );
  }

  return (
    <Box>
      <FieldLabel>{label ?? formatFieldName(fieldKey)}</FieldLabel>
      <Box
        sx={{
          backgroundColor: "#ffffff",
          border: editorialHairline,
          borderRadius: "8px",
          p: 2,
          color: editorial.ink,
          overflowWrap: "anywhere",
          minHeight: 58,
        }}
      >
        <FriendlyValue fieldKey={fieldKey} value={value} />
      </Box>
    </Box>
  );
}

function MatrixFieldCard({ field }: { field: FormSubmissionField }) {
  const columns = field.matrixColumns?.length
    ? field.matrixColumns
    : Object.keys(field.matrixRows?.[0] ?? {}).map((key) => ({ name: key, title: formatFieldName(key) }));
  const rows = field.matrixRows ?? [];

  if (rows.length === 0 || columns.length === 0) {
    return <FieldCard fieldKey={field.key} label={field.label} value={field.value} />;
  }

  return (
    <Box>
      <FieldLabel>{field.label}</FieldLabel>
      <Box
        sx={{
          backgroundColor: "#ffffff",
          border: editorialHairline,
          borderRadius: "8px",
          overflowX: "auto",
        }}
      >
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 420,
            "& th": {
              backgroundColor: editorial.blueSoft,
              color: editorial.ink,
              fontSize: "0.75rem",
              fontWeight: 900,
              textAlign: "left",
              p: 1.25,
              borderBottom: editorialHairline,
            },
            "& td": {
              color: editorial.ink,
              fontSize: "0.875rem",
              p: 1.25,
              borderBottom: editorialHairline,
              verticalAlign: "top",
            },
            "& tr:last-of-type td": {
              borderBottom: 0,
            },
          }}
        >
          <Box component="thead">
            <Box component="tr">
              {columns.map((column) => (
                <Box component="th" key={column.name}>
                  {column.title || formatFieldName(column.name)}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((row, rowIndex) => (
              <Box component="tr" key={`${field.key}-${rowIndex}`}>
                {columns.map((column) => (
                  <Box component="td" key={`${field.key}-${rowIndex}-${column.name}`}>
                    <FriendlyValue fieldKey={`${field.key}-${rowIndex}-${column.name}`} value={row[column.name]} />
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function DataPreviewSections({ sections }: { sections: FormSubmissionSection[] }) {
  return (
    <Stack spacing={2.5}>
      {sections.map((section) => (
        <Box key={section.id}>
          <Typography
            variant="body1"
            sx={{
              color: editorial.ink,
              fontWeight: 900,
              mb: 1.25,
              textWrap: "balance",
            }}
          >
            {section.title}
          </Typography>
          <Grid container spacing={2}>
            {section.fields.map((field) => (
              <Grid size={{ xs: 12, sm: isHtmlValue(field.key, field.value) || field.kind === "matrix" ? 12 : 6 }} key={field.key}>
                {field.kind === "matrix" ? (
                  <MatrixFieldCard field={field} />
                ) : (
                  <FieldCard fieldKey={field.key} label={field.label} value={field.value} />
                )}
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Stack>
  );
}

function SupportingDetailsGrid({ details }: { details: SupportingDetail[] }) {
  return (
    <Grid container spacing={2}>
      {details.map((detail) => (
        <Grid size={{ xs: 12, sm: 6 }} key={detail.key}>
          <FieldCard fieldKey={detail.key} label={detail.label} value={detail.value} />
        </Grid>
      ))}
    </Grid>
  );
}

function useAuthenticatedImageSrc(src: string): { imageSrc: string; isLoading: boolean } {
  const { instance, accounts } = useMsal();
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const fileValueUrl = src ? sharePointFileValueUrl(src) : "";
    const account = instance.getActiveAccount() ?? accounts[0];

    setImageSrc(src);
    setIsLoading(false);

    if (!src || src.startsWith("data:image/") || !fileValueUrl || !account) {
      return () => undefined;
    }

    setIsLoading(true);

    void acquireAccessTokenSilentOrRedirect(instance, { ...loginRequest, account })
      .then(async (accessToken) => {
        const response = await fetchWithAuthRecovery(fileValueUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) throw new Error(`Signature image fetch failed: ${response.status}`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImageSrc(src);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accounts, instance, src]);

  return { imageSrc, isLoading };
}

function SignatureCard({ signature }: { signature: SignatureField }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const { imageSrc, isLoading } = useAuthenticatedImageSrc(signature.src);
  const shouldShowPreview = Boolean(imageSrc) && !previewFailed;

  useEffect(() => {
    setPreviewFailed(false);
  }, [imageSrc]);

  return (
    <Paper
      elevation={0}
      sx={{
        border: editorialHairline,
        borderRadius: "8px",
        backgroundColor: "#ffffff",
        p: 2,
      }}
    >
      <FieldLabel>{signature.label}</FieldLabel>
      {shouldShowPreview ? (
        <Box
          component="img"
          src={imageSrc}
          alt={signature.label}
          onError={() => {
            if (!isLoading) setPreviewFailed(true);
          }}
          sx={{
            display: "block",
            maxHeight: 140,
            maxWidth: "100%",
            borderRadius: "8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            backgroundColor: "#ffffff",
            p: 1,
            mb: signature.link ? 1 : 0,
          }}
        />
      ) : (
        <FieldCard fieldKey={signature.key} label={signature.label} value={signature.value} />
      )}
      {signature.link && (
        <Box sx={{ mt: shouldShowPreview ? 0 : 1 }}>
          <ValueLink link={{ ...signature.link, label: "Open signature file" }} />
        </Box>
      )}
    </Paper>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        textTransform: "uppercase",
        letterSpacing: 0,
        color: editorial.muted,
        fontWeight: 800,
        fontSize: "0.72rem",
        display: "block",
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: editorial.pmwBlueDark,
          backgroundColor: editorial.blueWash,
          border: `1px solid ${editorial.pmwBlueSoft}`,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: editorial.ink, textWrap: "balance" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: editorialHairline,
        borderRadius: "8px",
        p: 1.75,
        backgroundColor: "#ffffff",
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr)",
        gap: 1.25,
        alignItems: "center",
        minHeight: 74,
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "8px",
          backgroundColor: editorial.paperSoft,
          color: editorial.pmwBlueDark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 800, display: "block" }}>
          {label}
        </Typography>
        <Typography
          component="div"
          variant="body2"
          sx={{
            color: editorial.ink,
            fontWeight: 800,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

function DocumentLinkCard({ title, link, icon }: { title: string; link: LinkValue | null; icon: ReactNode }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: editorialHairline,
        borderRadius: "8px",
        p: 1.75,
        backgroundColor: "#ffffff",
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr)",
        gap: 1.25,
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "8px",
          backgroundColor: link ? editorial.blueWash : editorial.paperSoft,
          color: link ? editorial.pmwBlueDark : editorial.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 800 }}>
          {title}
        </Typography>
        {link ? (
          <ValueLink link={link} />
        ) : (
          <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700 }}>
            Not generated yet
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function LayerProgression({
  totalLayers,
  currentLayer,
  enhancedLayers,
}: {
  totalLayers: number;
  currentLayer?: number;
  enhancedLayers?: (ApprovalLayerResult | EvaluationLayerResult | null)[];
}) {
  if (totalLayers <= 0) return null;

  return (
    <Box>
      <SectionTitle icon={<ApprovalIcon sx={{ fontSize: 18 }} />} title="Approval details" subtitle={`${totalLayers} workflow layer${totalLayers === 1 ? "" : "s"}`} />
      <Stack spacing={1.25}>
        {Array.from({ length: totalLayers }, (_, i) => {
          const layerNum = i + 1;
          const enhanced = enhancedLayers?.[i];
          const isTerminal =
            enhanced?.status === "approved" ||
            enhanced?.status === "confirmed" ||
            enhanced?.status === "rejected" ||
            enhanced?.status === "skipped" ||
            enhanced?.status === "cancelled";
          const isActive = currentLayer === layerNum && !isTerminal;

          let borderColor: string = editorial.border;
          let bgColor: string = editorial.paperSoft;
          let statusIcon = <AccessTimeIcon sx={{ fontSize: 16 }} />;
          let statusLabel = "Waiting";
          let iconColor: string = editorial.muted;
          const propagatedRejection =
            enhanced?.status === "rejected" && enhanced.type === "approval" && enhanced.rejectionReason?.toLowerCase().includes("rejected at layer")
              ? enhanced.rejectionReason
              : enhanced?.status === "rejected" && enhanced.type === "evaluation" && enhanced.notes?.toLowerCase().includes("rejected at layer")
                ? enhanced.notes
                : "";

          if (enhanced?.status === "approved" || enhanced?.status === "confirmed") {
            borderColor = editorial.success;
            bgColor = "rgba(16, 124, 16, 0.06)";
            statusIcon = <CheckCircleIcon sx={{ fontSize: 16 }} />;
            statusLabel = enhanced.status === "confirmed" ? "Confirmed" : "Approved";
            iconColor = editorial.success;
          } else if (enhanced?.status === "rejected") {
            borderColor = editorial.error;
            bgColor = "rgba(198, 40, 40, 0.06)";
            statusIcon = <CancelIcon sx={{ fontSize: 16 }} />;
            statusLabel = propagatedRejection || "Rejected";
            iconColor = editorial.error;
          } else if (isActive) {
            borderColor = editorial.pmwPurple;
            bgColor = editorial.purpleWash;
            statusIcon = <AccessTimeIcon sx={{ fontSize: 16 }} />;
            statusLabel = enhanced?.type === "evaluation" ? "Pending evaluation" : "Pending approval";
            iconColor = editorial.pmwPurpleDark;
          }

          return (
            <Paper
              key={i}
              elevation={0}
              sx={{
                border: `1px solid ${borderColor}66`,
                backgroundColor: bgColor,
                borderRadius: "8px",
                p: 1.75,
                display: "grid",
                gridTemplateColumns: "32px minmax(0, 1fr) auto",
                gap: 1.5,
                alignItems: "center",
                boxShadow: isActive ? `0 0 0 3px ${editorial.pmwPurpleSoft}` : "none",
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "8px",
                  backgroundColor: `${iconColor}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: iconColor,
                  flexShrink: 0,
                }}
              >
                {statusIcon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.ink }}>
                  Layer {layerNum}
                  {enhanced?.type === "evaluation" && (
                    <Typography component="span" variant="caption" sx={{ color: editorial.muted, ml: 1 }}>
                      Evaluation
                    </Typography>
                  )}
                </Typography>
                <Typography variant="caption" sx={{ color: iconColor, fontWeight: 800 }}>
                  {statusLabel}
                </Typography>
              </Box>
              {enhanced?.email && (
                <MuiLink
                  href={`mailto:${enhanced.email}`}
                  sx={{
                    color: editorial.muted,
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    overflowWrap: "anywhere",
                    textAlign: "right",
                  }}
                >
                  {enhanced.email}
                </MuiLink>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

function ApprovalCard({ layer, index }: { layer: ApprovalCardLayer | null; index: number }) {
  if (!layer) return null;

  const isSigned = layer.status === "approved" || layer.status === "signed" || layer.status === "confirmed";
  const isRejected = layer.status === "rejected";
  const signatureSrc = signatureValueToSrc(layer.signature);

  let borderColor: string = editorial.pmwPurple;
  let bgColor: string = editorial.purpleWash;
  let iconColor: string = editorial.pmwPurpleDark;
  let statusIcon = <AccessTimeIcon sx={{ fontSize: 20 }} />;
  let statusLabel = "Awaiting";

  if (isSigned) {
    borderColor = editorial.success;
    bgColor = "rgba(16, 124, 16, 0.06)";
    iconColor = editorial.success;
    statusIcon = <CheckCircleIcon sx={{ fontSize: 20 }} />;
    statusLabel = layer.confirmedVia === "checkbox" ? "Confirmed" : "Approved";
  } else if (isRejected) {
    borderColor = editorial.error;
    bgColor = "rgba(198, 40, 40, 0.06)";
    iconColor = editorial.error;
    statusIcon = <CancelIcon sx={{ fontSize: 20 }} />;
    statusLabel = "Rejected";
  }

  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${borderColor}55`,
        backgroundColor: bgColor,
        borderRadius: "8px",
        p: 2,
        transition: "box-shadow 0.2s ease",
        "&:hover": {
          boxShadow: "0 8px 20px rgba(16, 16, 16, 0.06)",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "8px",
            backgroundColor: `${iconColor}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          {statusIcon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink }}>
            Layer {index + 1}
          </Typography>
          <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700 }}>
            {layer.confirmedVia === "checkbox" ? "Checkbox confirmation" : "Signature approval"}
          </Typography>
        </Box>
        <Chip
          label={statusLabel}
          size="small"
          sx={{
            backgroundColor: `${iconColor}15`,
            color: iconColor,
            fontWeight: 800,
            fontSize: "0.7rem",
            height: 24,
            ml: "auto",
          }}
        />
      </Box>

      <Stack spacing={1}>
        {layer.email && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
            <EmailIcon sx={{ fontSize: 16, color: editorial.muted }} />
            <ValueLink link={{ url: `mailto:${layer.email}`, label: layer.email }} />
          </Box>
        )}

        {layer.signedAt && (
          <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700 }}>
            Completed {formatDateValue(layer.signedAt) ?? layer.signedAt}
          </Typography>
        )}

        {layer.rejectionReason && (
          <Typography variant="body2" sx={{ color: editorial.error, fontStyle: "italic" }}>
            Reason: {layer.rejectionReason}
          </Typography>
        )}

        {signatureSrc && (
          <Box>
            <FieldLabel>Signature</FieldLabel>
            <Box
              component="img"
              src={signatureSrc}
              alt={`Layer ${index + 1} signature`}
              sx={{
                display: "block",
                maxHeight: 118,
                maxWidth: "100%",
                borderRadius: "8px",
                outline: "1px solid rgba(0, 0, 0, 0.1)",
                outlineOffset: "-1px",
                backgroundColor: "#ffffff",
                p: 1,
              }}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

export default function DetailModal({ item, isAdmin, onClose }: DetailModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const selectedCompany = getSelectedCompany(item?.submissionData, item?.surveyJson);
  const submissionData = item?.submissionData ?? {};
  const entries = Object.entries(submissionData);
  const signatureFieldKeys = item ? collectSurveyFieldKeysByType(item.surveyJson, new Set(["signaturepad"])) : new Set<string>();

  const pdfLink = entries.find(([key, value]) => isPdfField(key) && collectLinks(value).length > 0);
  const generatedPdf = pdfLink ? collectLinks(pdfLink[1])[0] : null;

  const documentGroups = entries
    .filter(([key, value]) => !isPdfField(key) && !isSignatureField(key) && !signatureFieldKeys.has(key) && !SYSTEM_FIELDS.has(key) && collectLinks(value).length > 0)
    .map(([key, value]) => ({
      key,
      title: formatFieldName(key),
      links: collectLinks(value),
    }));

  const signatureFields = entries
    .filter(([key, value]) => (isSignatureField(key) || signatureFieldKeys.has(key)) && hasDisplayValue(value))
    .map(([key, value]) => ({
      key,
      label: formatFieldName(key),
      value,
      src: signatureValueToSrc(value),
      link: linkFromValue(value),
    }));
  const renderedSignatureKeys = new Set(signatureFields.map((signature) => signature.key));

  const formSections = item
    ? buildFormSubmissionSections(item.surveyJson, submissionData, {
        fallbackSectionTitle: "Submitted answers",
        formatFallbackLabel: formatFieldName,
        shouldIncludeField: (key, value) => shouldSkipField(key, value) === false && collectLinks(value).length === 0,
      })
    : [];
  const supportingDetails = item ? buildSupportingDetails(item, entries, renderedSignatureKeys) : [];
  const displayTitle = item ? getSubmissionDisplayTitle(item) : "";
  const submitterDisplay = item ? getSubmittedByDisplayName(item) : "Unknown submitter";
  const formReference = item ? getFormReference(item) : "Not available";
  const branchDecisionPending = item ? isBranchDecisionPending(item) : false;
  const submittedAt = formatDashboardDateTime(item?.submittedAt, "Not available");

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="lg"
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : "8px",
            border: isMobile ? 0 : editorialHairline,
            overflow: "hidden",
            animation: "fadeInUp 0.26s ease-out",
            "@keyframes fadeInUp": {
              "0%": {
                opacity: 0,
                transform: "translateY(14px)",
              },
              "100%": {
                opacity: 1,
                transform: "translateY(0)",
              },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          backgroundColor: "#ffffff",
          color: editorial.ink,
          py: { xs: 2, sm: 2.5 },
          px: { xs: 2, sm: 3 },
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 2,
          alignItems: "start",
          borderBottom: editorialHairline,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1 }}>
            <StatusBadge status={item?.formStatus ?? null} />
            <Chip
              label={isAdmin ? "Admin view" : "User view"}
              size="small"
              sx={{
                backgroundColor: isAdmin ? editorial.purpleWash : editorial.blueWash,
                color: isAdmin ? editorial.pmwPurpleDark : editorial.pmwBlueDark,
                border: `1px solid ${isAdmin ? editorial.pmwPurpleSoft : editorial.pmwBlueSoft}`,
                fontWeight: 800,
              }}
            />
            {branchDecisionPending && (
              <Chip
                icon={<InfoIcon />}
                label="Branch decision pending"
                size="small"
                sx={{
                  backgroundColor: editorial.blueWash,
                  color: editorial.pmwBlueDark,
                  border: `1px solid ${editorial.pmwBlueSoft}`,
                  fontWeight: 800,
                  "& .MuiChip-icon": {
                    color: editorial.pmwBlueDark,
                  },
                }}
              />
            )}
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0, textWrap: "balance" }}>
            {displayTitle}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", mt: 0.75 }}>
            <ReferenceTag value={item?.referenceNo || item?.submissionId || ""} size="md" />
            <Typography variant="body2" sx={{ color: editorial.muted, fontWeight: 700 }}>
              {item?.listTitle}
            </Typography>
          </Stack>
        </Box>
        <IconButton
          aria-label="Close submission details"
          onClick={onClose}
          size="small"
          sx={{
            width: 40,
            height: 40,
            color: editorial.ink,
            backgroundColor: editorial.paperSoft,
            border: editorialHairline,
            "&:hover": {
              backgroundColor: editorial.blueWash,
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, backgroundColor: editorial.blueSoft }}>
        {item && (
          <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
            <Box>
              <SectionTitle icon={<DocumentIcon sx={{ fontSize: 18 }} />} title="Submission overview" />
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <InfoTile icon={<DocumentIcon sx={{ fontSize: 18 }} />} label="Form ID" value={formReference} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <InfoTile icon={<CalendarIcon sx={{ fontSize: 18 }} />} label="Submitted" value={submittedAt} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <InfoTile
                    icon={<PersonIcon sx={{ fontSize: 18 }} />}
                    label={isAdmin ? "Submitter" : "Account"}
                    value={submitterDisplay}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <InfoTile icon={<FileIcon sx={{ fontSize: 18 }} />} label={isAdmin ? "SharePoint item" : "Reference"} value={isAdmin ? item.id : (item.referenceNo || item.submissionId)} />
                </Grid>
                {/* Admins see the SharePoint item ID in the tile above, so the
                    issued reference gets its own tile rather than replacing it. */}
                {isAdmin && item.referenceNo && (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <InfoTile icon={<FileIcon sx={{ fontSize: 18 }} />} label="Reference no." value={item.referenceNo} />
                  </Grid>
                )}
                {selectedCompany && (
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <InfoTile icon={<ApprovalIcon sx={{ fontSize: 18 }} />} label="Company" value={selectedCompany} />
                  </Grid>
                )}
              </Grid>
              {branchDecisionPending && (
                <Alert
                  severity="info"
                  icon={<InfoIcon fontSize="small" />}
                  sx={{
                    mt: 1.5,
                    borderRadius: "8px",
                    border: `1px solid ${editorial.pmwBlueSoft}`,
                    backgroundColor: "#ffffff",
                    color: editorial.ink,
                    "& .MuiAlert-message": {
                      width: "100%",
                    },
                    "& .MuiAlert-icon": {
                      color: editorial.pmwBlueDark,
                    },
                  }}
                >
                  <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 900 }}>
                    FYI: Branch still needs to be decided
                  </Typography>
                  <Typography variant="caption" sx={{ color: editorial.muted, display: "block", fontWeight: 700 }}>
                    An OSHE Forms Owner needs to choose the branch before approval or evaluation starts.
                  </Typography>
                </Alert>
              )}
            </Box>

            <Box>
              <SectionTitle icon={<PdfIcon sx={{ fontSize: 18 }} />} title="PDF details" />
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <DocumentLinkCard title="Generated submission PDF" link={generatedPdf} icon={<PdfIcon sx={{ fontSize: 20 }} />} />
                </Grid>
                {documentGroups.flatMap((group) =>
                  group.links.map((link, index) => (
                    <Grid size={{ xs: 12, md: 6 }} key={`${group.key}-${link.url}-${index}`}>
                      <DocumentLinkCard title={group.links.length > 1 ? `${group.title} ${index + 1}` : group.title} link={link} icon={<FileIcon sx={{ fontSize: 20 }} />} />
                    </Grid>
                  )),
                )}
              </Grid>
            </Box>

            {formSections.length > 0 && (
              <Box>
                <SectionTitle icon={<FileIcon sx={{ fontSize: 18 }} />} title="Data preview" subtitle="Grouped by the published form layout" />
                <DataPreviewSections sections={formSections} />
              </Box>
            )}

            {supportingDetails.length > 0 && (
              <Box>
                <SectionTitle icon={<InfoIcon sx={{ fontSize: 18 }} />} title="Submission details" subtitle="Compliance and record fields" />
                <SupportingDetailsGrid details={supportingDetails} />
              </Box>
            )}

            {signatureFields.length > 0 && (
              <Box>
                <SectionTitle icon={<SignatureIcon sx={{ fontSize: 18 }} />} title="Signatures" />
                <Grid container spacing={2}>
                  {signatureFields.map((signature) => (
                    <Grid size={{ xs: 12, sm: 6 }} key={signature.key}>
                      <SignatureCard signature={signature} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {item.totalLayers > 0 && (
              <Box>
                <LayerProgression
                  totalLayers={item.totalLayers}
                  currentLayer={item.currentLayer}
                  enhancedLayers={item.enhancedLayers}
                />

                {item.enhancedLayers && item.enhancedLayers.length > 0 && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {item.enhancedLayers.map((layer, i) => {
                      if (!layer) return null;
                      if (layer.type === "evaluation") {
                        // The layer's own config supplies the field titles, types
                        // and declaration order, so the card lists every question
                        // the evaluator was asked — not only the ones they filled.
                        const config = evaluationLayerConfig(item, layer.layerNumber);
                        return (
                          <EvaluationSummary
                            key={i}
                            result={layer}
                            layerTitle={config?.title || `Layer ${layer.layerNumber}`}
                            layerDescription={config?.description}
                            surveyElements={config?.surveyElements}
                          />
                        );
                      }
                      return (
                        <ApprovalCard
                          key={i}
                          layer={{
                            status: layer.status,
                            outcome: layer.outcome,
                            email: layer.email,
                            signedAt: layer.signedAt,
                            rejectionReason: layer.rejectionReason,
                            signature: layer.signature,
                            confirmedVia: layer.confirmedVia,
                          }}
                          index={layer.layerNumber - 1}
                        />
                      );
                    })}
                  </Stack>
                )}

                {(!item.enhancedLayers || item.enhancedLayers.length === 0) && item.layers && item.layers.length > 0 && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {item.layers.map(
                      (layer, i) => layer && <ApprovalCard key={i} layer={layer} index={i} />,
                    )}
                  </Stack>
                )}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2,
          borderTop: editorialHairline,
          backgroundColor: "#ffffff",
          display: "flex",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: editorial.muted,
            fontSize: "0.8rem",
            mr: "auto",
          }}
        >
          <LockIcon sx={{ fontSize: 16 }} />
          Read-only dashboard preview
        </Box>
        {generatedPdf && (
          <Button
            component="a"
            href={generatedPdf.url}
            {...externalProps(generatedPdf.url)}
            variant="outlined"
            startIcon={<PdfIcon />}
            sx={{
              borderRadius: "8px",
              fontWeight: 800,
            }}
          >
            Open PDF
          </Button>
        )}
        <Button
          onClick={onClose}
          variant="contained"
          startIcon={<CloseIcon />}
          sx={{
            backgroundColor: editorial.pmwBlue,
            borderRadius: "8px",
            textTransform: "none",
            fontWeight: 800,
            px: 3,
            py: 1,
            "&:hover": { backgroundColor: editorial.pmwBlueDark },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
