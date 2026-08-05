import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import {
  getGraphToken,
  getSharePointToken,
  queryMasterFormByTitle,
  queryWebFormVersion,
  createListItem,
  updateListItemFields,
  getListColumns,
  listExistsGraph,
  ensureDocLibrary as ensureGraphDocLibrary,
  ensureListColumns,
  uploadFileToDriveItem,
  deleteListItem,
  deleteDocLibraryFile,
} from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { resolveDepartmentApproverFromList } from "./_utils/departmentApproverLookup.js";
import { patchHyperlinkViaSPRest } from "./_utils/sharepointRest.js";
import {
  buildWorkflowActionEmail,
  getApplicationBaseUrl,
  scheduleOrDeliverWorkflowEmail,
  type WorkflowEmailScheduleConfig,
} from "./_utils/workflowEmail.js";

// ─── Why SP REST is used for Image / Hyperlink columns ────────────────────────
// Graph can create the response item and upload files, but it is unreliable for
// updating SharePoint URL-backed fields such as Hyperlink/Picture/Image columns.
//
// SharePoint REST expects the field value object, not the primitive
// "url, description" string:
//
//   { "Signature": { "__metadata": { "type": "SP.FieldUrlValue" },
//                    "Url": "https://…/signature.png",
//                    "Description": "Signature" } }
// ─────────────────────────────────────────────────────────────────────────────

const PDPA_NOTICE_VERSION = "PDPA-MY-HR-2026-05-22";
const PDPA_RETENTION_YEARS = Number(process.env.PDPA_RETENTION_YEARS || "7");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAYER_PENDING_STATUS = "Pending";
const FORM_SUBMITTED_STATUS = "Submitted";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface ApiFixedUserLayerAssignee {
  type: "user";
  value: string;
}

/** Several mailboxes in one "a@x.com; b@x.com" string — see FixedUsersLayerAssignee. */
interface ApiFixedUsersLayerAssignee {
  type: "users";
  value: string;
}

interface ApiFieldReferenceLayerAssignee {
  type: "field-reference";
  value: string;
}

interface ApiDepartmentApproverLayerAssignee {
  type: "department-approver";
  value: string;
  listName?: string;
  departmentColumn?: string;
  emailColumn?: string;
  nameColumn?: string;
  roleColumn?: string;
  roleValue?: string;
}

type ApiLayerAssignee =
  | ApiFixedUserLayerAssignee
  | ApiFixedUsersLayerAssignee
  | ApiFieldReferenceLayerAssignee
  | ApiDepartmentApproverLayerAssignee;

interface ApiLayerConfigItem {
  layerNumber: number;
  type: "approval" | "evaluation";
  authMode: "365" | "public";
  assignee: ApiLayerAssignee;
  title?: string;
  publicToken?: string;
  emailSchedule?: WorkflowEmailScheduleConfig;
}

interface ApiLayerConfig {
  layers?: ApiLayerConfigItem[];
  manualBranches?: { layers?: ApiLayerConfigItem[] }[];
}

interface ApiMatrixColumn {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
}

interface ApiMatrixFieldSpec {
  name: string;
  columns: ApiMatrixColumn[];
}

type ApiFieldKind = "text" | "note" | "number" | "boolean" | "dateTime" | "choice" | "multiChoice" | "url" | "file";

interface ApiFieldSpec {
  name: string;
  kind: ApiFieldKind;
}

interface ApiSubmissionSchema {
  fields: ApiFieldSpec[];
  matrices: ApiMatrixFieldSpec[];
}

interface ApiUploadContext {
  token: string;
  listTitle: string;
  uploadLibraryByUse: Record<string, string | null>;
  uploadDataUri: ApiUploadDataUri;
  uploadLibraryDeps: ApiUploadLibraryDeps;
  uploadedFiles: ApiUploadedFile[];
}

interface ApiUploadCandidate {
  content: string;
  name?: string;
}

interface ApiDataUri {
  base64: string;
  ext: string;
  rawSize: number;
}

interface ApiUrlFieldPatch {
  fieldName: string;
  url: string;
  description: string;
  graphValue: string;
}

interface ApiUploadedFile {
  libraryName: string;
  driveItemId: string;
  url: string;
}

interface ApiSubmissionBuildResult {
  fields: Record<string, unknown>;
  urlFieldPatches: ApiUrlFieldPatch[];
  uploadedFiles: ApiUploadedFile[];
}

interface ApiCreateResponseItemResult {
  id: string;
  usedFallback: boolean;
}

interface ApiCreatedListItemRef {
  listTitle: string;
  itemId: string;
}

type ApiUploadDataUri = (
  context: ApiUploadContext,
  fieldName: string,
  candidate: ApiUploadCandidate,
  index: number,
  use: "file" | "signature",
) => Promise<{ url: string; fileName: string }>;

interface ApiBuildSubmissionOptions {
  uploadDataUri?: ApiUploadDataUri;
  uploadLibraryDeps?: ApiUploadLibraryDeps;
}

interface ApiUploadLibraryDeps {
  listExistsGraph: typeof listExistsGraph;
  ensureDocLibrary: typeof ensureGraphDocLibrary;
}

interface ApiCreateResponseItemDeps {
  createListItem: typeof createListItem;
  updateListItemFields: typeof updateListItemFields;
  deleteListItem: typeof deleteListItem;
}

interface ApiUrlFieldPatchDeps {
  getSharePointToken: typeof getSharePointToken;
  patchHyperlinkViaSPRest: typeof patchHyperlinkViaSPRest;
}

const DEFAULT_UPLOAD_LIBRARY_DEPS: ApiUploadLibraryDeps = {
  listExistsGraph,
  ensureDocLibrary: ensureGraphDocLibrary,
};

const DEFAULT_CREATE_RESPONSE_ITEM_DEPS: ApiCreateResponseItemDeps = {
  createListItem,
  updateListItemFields,
  deleteListItem,
};

const DEFAULT_URL_FIELD_PATCH_DEPS: ApiUrlFieldPatchDeps = {
  getSharePointToken,
  patchHyperlinkViaSPRest,
};

class PublicSubmissionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PublicSubmissionError";
    this.statusCode = statusCode;
  }
}

function getRetentionUntil(from: Date = new Date()): string {
  const retentionUntil = new Date(from);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + PDPA_RETENTION_YEARS);
  return retentionUntil.toISOString();
}

function parseLayerConfig(value: unknown): ApiLayerConfig | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as ApiLayerConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function sanitizeRawJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().startsWith("data:") ? "[uploaded file omitted]" : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeRawJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, next]) => [key, sanitizeRawJsonValue(next)]),
    );
  }
  return value;
}

function buildRawJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(sanitizeRawJsonValue(value));
  return json.length > 250000 ? `${json.slice(0, 250000)}...[truncated]` : json;
}

function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

/**
 * Mailboxes a fixed-assignee layer names outright. A "users" layer holds several
 * in one semicolon-separated string.
 * Mirrors src/utils/layerAssignees.ts — api/ does not import from src/.
 */
function fixedAssigneeEmails(value: string): string[] {
  return value.split(/[;,\n]/).map((entry) => entry.trim()).filter((entry) => EMAIL_RE.test(entry));
}

/**
 * Whether an assignee names its people outright. Types we do not recognise count
 * when their value spells out addresses — a question name never contains "@" —
 * so a variant spelling cannot fail the way "users" did.
 */
function isFixedApiAssignee(assignee: ApiLayerAssignee): boolean {
  if (assignee.type === "user" || assignee.type === "users") return true;
  if (assignee.type === "field-reference" || assignee.type === "department-approver") return false;
  return fixedAssigneeEmails((assignee as { value?: string }).value ?? "").length > 0;
}

/**
 * The address written to `L{n}_Email` at submit time. A layer naming two or more
 * people is shared — it routes to nobody, and stays blank until whoever acts on
 * it claims it, so this is deliberately empty for that case.
 */
function routedAssigneeEmail(value: string): string {
  const emails = fixedAssigneeEmails(value);
  return emails.length > 1 ? "" : emails[0] ?? "";
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "1", "accepted", "checked"].includes(normalized)) return true;
  if (["false", "no", "0", "declined", "unchecked"].includes(normalized)) return false;
  return undefined;
}

function toIsoDateTime(value: unknown): string | undefined {
  const text = valueToText(value);
  if (!text) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const parsed = parseJsonValue(trimmed);
    if (Array.isArray(parsed)) return parsed.map(valueToText).filter(Boolean);
    return [trimmed];
  }
  const text = valueToText(value);
  return text ? [text] : [];
}

function isMatrixType(type: string): boolean {
  return type === "dynamicmatrix" || type === "matrixdynamic" || type === "tableinput";
}

function isLayoutOrDisplayOnlyType(type: string): boolean {
  return [
    "alert", "chartdisplay", "columns", "countdown", "datatable", "divider",
    "html", "image", "pagebreak", "panel", "repeater", "spacer", "videoembed",
  ].includes(type);
}

function questionFieldKind(question: Record<string, unknown>): ApiFieldKind | null {
  const type = typeof question.type === "string" ? question.type : "";
  const inputType = typeof question.inputType === "string" ? question.inputType : "";
  if (!type || isLayoutOrDisplayOnlyType(type) || isMatrixType(type)) return null;
  if (question._expression || type === "expression" || type === "formula") return "number";

  if (type === "text" && inputType) {
    if (inputType === "number" || inputType === "range") return "number";
    if (inputType === "date" || inputType === "datetime-local") return "dateTime";
  }

  if (["number", "counter", "currency", "duration", "rating", "scorecard", "slider"].includes(type)) return "number";
  if (["date", "datetime"].includes(type)) return "dateTime";
  if (["boolean", "consent"].includes(type)) return "boolean";
  if (type === "checkbox") return "multiChoice";
  if (type === "dropdown" || type === "radiogroup") return "choice";
  if (type === "comment" || type === "jsoneditor" || type === "ranking") return "note";
  if (type === "signaturepad") return "url";
  if (type === "file" || type === "imageupload") return "file";

  return "text";
}

function collectSubmissionSchema(surveyJson: Record<string, unknown>): ApiSubmissionSchema {
  const fields: ApiFieldSpec[] = [];
  const matrices: ApiMatrixFieldSpec[] = [];
  const seenFields = new Set<string>();

  function addField(name: string, kind: ApiFieldKind): void {
    if (!name || seenFields.has(name)) return;
    seenFields.add(name);
    fields.push({ name, kind });
  }

  function walk(elements: unknown[]): void {
    for (const element of elements) {
      if (!element || typeof element !== "object") continue;
      const question = element as Record<string, unknown>;
      const type = typeof question.type === "string" ? question.type : "";
      const name = typeof question.name === "string" ? question.name.trim() : "";

      if (type === "panel" && Array.isArray(question.elements)) {
        walk(question.elements);
        continue;
      }

      if (name && isMatrixType(type)) {
        const columns = Array.isArray(question.columns)
          ? question.columns
              .filter((col): col is Record<string, unknown> => !!col && typeof col === "object")
              .map((col) => ({
                name: valueToText(col.name),
                title: valueToText(col.title),
                cellType: valueToText(col.cellType) || undefined,
                choices: Array.isArray(col.choices) ? col.choices.map(valueToText).filter(Boolean) : undefined,
              }))
              .filter((col) => col.name)
          : [];
        matrices.push({ name, columns });
        continue;
      }

      if (name) {
        const kind = questionFieldKind(question);
        if (kind) addField(name, kind);
      }

      if (Array.isArray(question.elements)) {
        walk(question.elements);
      }
    }
  }

  const pages = Array.isArray(surveyJson.pages) ? surveyJson.pages : [];
  for (const page of pages) {
    if (page && typeof page === "object" && Array.isArray((page as Record<string, unknown>).elements)) {
      walk((page as { elements: unknown[] }).elements);
    }
  }

  return { fields, matrices };
}

async function getPublishedSurveyJson(
  token: string,
  formConfig: Record<string, unknown>,
  publishKey?: string,
): Promise<Record<string, unknown> | null> {
  const formTitle = valueToText(formConfig.Title);
  const targetVersion = valueToText(formConfig.CurrentVersion) || "1.0";
  if (!formTitle) return null;

  const row = (await queryWebFormVersion(token, formTitle, targetVersion, publishKey))?.fields;
  const parsed = parseJsonRecord(row?.SurveyJSON);
  const surveyJson = parsed?.surveyJson ?? parsed;
  return surveyJson && typeof surveyJson === "object" && !Array.isArray(surveyJson)
    ? (surveyJson as Record<string, unknown>)
    : null;
}

function extractUploadCandidates(value: unknown): ApiUploadCandidate[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("data:")) return [{ content: trimmed }];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = parseJsonValue(trimmed);
      if (parsed !== undefined) return extractUploadCandidates(parsed);
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractUploadCandidates);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const content = record.content ?? record.data ?? record.fileContent;
    if (typeof content === "string" && content.trim().startsWith("data:")) {
      return [{ content, name: valueToText(record.name) || valueToText(record.fileName) || undefined }];
    }
  }
  return [];
}

function parseDataUri(value: string): ApiDataUri | null {
  const match = value.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  const rawSize = Math.ceil((base64.length * 3) / 4);
  const ext = (mime.split("/").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "") || "bin";
  return { base64, ext, rawSize };
}

async function resolveExistingUploadLibrary(
  context: ApiUploadContext,
  use: "file" | "signature",
): Promise<string> {
  const cached = context.uploadLibraryByUse[use];
  if (cached) return cached;
  if (cached === null) {
    throw new PublicSubmissionError(
      "Upload storage is not provisioned for this public form. Please republish the form before trying again.",
      409,
    );
  }

  const perFormLibrary = `${context.listTitle} Files`;
  const deps = context.uploadLibraryDeps;

  if (use === "signature") {
    try {
      const libraryName = await deps.ensureDocLibrary(context.token, "Signature Images");
      if (libraryName) {
        context.uploadLibraryByUse[use] = "Signature Images";
        return "Signature Images";
      }
    } catch (ensureError) {
      logWarn("api:submit-form", "System signature image library ensure failed; trying existing upload libraries", {
        listTitle: context.listTitle,
        errorMessage: ensureError instanceof Error ? ensureError.message.slice(0, 250) : String(ensureError).slice(0, 250),
      });
    }
  }

  const candidates = [perFormLibrary, "Documents", "Shared Documents"];
  for (const candidate of candidates) {
    if (await deps.listExistsGraph(context.token, candidate)) {
      context.uploadLibraryByUse[use] = candidate;
      return candidate;
    }
  }

  context.uploadLibraryByUse[use] = null;
  throw new PublicSubmissionError(
    "Upload storage is not provisioned for this public form. Please republish the form before trying again.",
    409,
  );
}

async function uploadDataUri(
  context: ApiUploadContext,
  fieldName: string,
  candidate: ApiUploadCandidate,
  index: number,
  use: "file" | "signature",
): Promise<{ url: string; fileName: string }> {
  const parsed = parseDataUri(candidate.content);
  if (!parsed) {
    throw new Error(`Invalid data URI for field "${fieldName}".`);
  }
  if (parsed.rawSize > MAX_UPLOAD_BYTES) {
    throw new Error(`Field "${fieldName}" upload exceeds the 10MB limit.`);
  }
  const libraryName = await resolveExistingUploadLibrary(context, use);
  const safeList = context.listTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "form";
  const safeField = fieldName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
  const originalName = candidate.name ? candidate.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) : "";
  const fileName = originalName || `${safeList}_${safeField}_${Date.now()}_${index}.${parsed.ext}`;
  const binary = new Uint8Array(Buffer.from(parsed.base64, "base64"));
  const uploaded = await uploadFileToDriveItem(context.token, libraryName, fileName, binary);
  if (uploaded.id) {
    context.uploadedFiles.push({ libraryName, driveItemId: uploaded.id, url: uploaded.webUrl });
  }
  return { url: uploaded.webUrl, fileName };
}

async function coerceFieldValue(
  context: ApiUploadContext,
  spec: ApiFieldSpec,
  value: unknown,
): Promise<unknown> {
  if (value === undefined || value === null) return undefined;

  if (spec.kind === "file") {
    const candidates = extractUploadCandidates(value);
    if (candidates.length > 0) {
      const uploads: string[] = [];
      for (let index = 0; index < candidates.length; index++) {
        const uploaded = await context.uploadDataUri(context, spec.name, candidates[index], index, "file");
        uploads.push(uploaded.url);
      }
      return uploads.length === 1 ? uploads[0] : JSON.stringify(uploads);
    }
    return stringifyValue(valueToText(value) || value);
  }

  // "url" kind (signaturepad) is handled separately in coerceUrlFieldPatch —
  // return undefined here so it doesn't end up in the main fields payload.
  if (spec.kind === "url") {
    return undefined;
  }

  switch (spec.kind) {
    case "number":
      return toFiniteNumber(value);
    case "boolean":
      return toBoolean(value);
    case "dateTime":
      return toIsoDateTime(value);
    case "multiChoice":
      return toStringArray(value);
    case "choice":
      return valueToText(value) || undefined;
    case "note":
      return stringifyValue(value);
    case "text":
    default:
      return stringifyValue(valueToText(value) || value);
  }
}

function errorMessage(error: unknown, maxLength = 250): string {
  return error instanceof Error ? error.message.slice(0, maxLength) : String(error).slice(0, maxLength);
}

function graphUrlFieldValue(url: string, description: string): string {
  const label = description.trim() || url;
  return `${url}, ${label}`;
}

async function coerceUrlFieldPatch(
  context: ApiUploadContext,
  spec: ApiFieldSpec,
  value: unknown,
): Promise<ApiUrlFieldPatch | null> {
  if (value === undefined || value === null) return null;

  const candidates = extractUploadCandidates(value);
  if (candidates.length > 0) {
    const uploaded = await context.uploadDataUri(context, spec.name, candidates[0], 0, "signature");
    return {
      fieldName: spec.name,
      url: uploaded.url,
      description: "Signature",
      graphValue: graphUrlFieldValue(uploaded.url, "Signature"),
    };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const url = valueToText(record.Url) || valueToText(record.url);
    if (url) {
      return {
        fieldName: spec.name,
        url,
        description: valueToText(record.Description) || "Signature",
        graphValue: graphUrlFieldValue(url, valueToText(record.Description) || "Signature"),
      };
    }
  }

  const url = valueToText(value);
  if (!url) return null;
  return {
    fieldName: spec.name,
    url,
    description: "Signature",
    graphValue: graphUrlFieldValue(url, "Signature"),
  };
}

function coerceMatrixCellValue(value: unknown, column: ApiMatrixColumn): unknown {
  if (value === undefined || value === null) return undefined;
  switch (column.cellType) {
    case "number":
      return toFiniteNumber(value);
    case "boolean":
      return toBoolean(value);
    case "date":
      return toIsoDateTime(value);
    case "checkbox":
      return Array.isArray(column.choices) && column.choices.length > 0
        ? toStringArray(value)
        : toBoolean(value);
    case "dropdown":
      return Array.isArray(value) ? toStringArray(value) : valueToText(value);
    case "text":
    default:
      return stringifyValue(valueToText(value) || value);
  }
}

async function buildSubmissionFields(
  token: string,
  listTitle: string,
  incomingBody: Record<string, unknown>,
  formConfig: Record<string, unknown>,
  schema: ApiSubmissionSchema,
  options: ApiBuildSubmissionOptions = {},
): Promise<ApiSubmissionBuildResult> {
  const context: ApiUploadContext = {
    token,
    listTitle,
    uploadLibraryByUse: {},
    uploadDataUri: options.uploadDataUri ?? uploadDataUri,
    uploadLibraryDeps: options.uploadLibraryDeps ?? DEFAULT_UPLOAD_LIBRARY_DEPS,
    uploadedFiles: [],
  };
  const fields: Record<string, unknown> = {
    SubmittedAt: new Date().toISOString(),
    FormVersion: valueToText(formConfig.CurrentVersion) || "1.0",
    PublishKey: valueToText(formConfig.CurrentPublishKey) || "production",
    FormID: valueToText(formConfig.FormID),
    SubmittedBy: "GUEST",
  };
  const rawJsonBody: Record<string, unknown> = { ...incomingBody };
  const urlFieldPatches: ApiUrlFieldPatch[] = [];

  for (const spec of schema.fields) {
    if (!(spec.name in incomingBody)) continue;
    if (spec.kind === "url") {
      const patch = await coerceUrlFieldPatch(context, spec, incomingBody[spec.name]);
      if (patch) {
        urlFieldPatches.push(patch);
        // ── Image column fields are excluded from the Graph create payload ──
        // They are written after item creation via SharePoint REST FieldUrlValue.
        // graphValue is retained on the patch for RawJSON reference only.
        rawJsonBody[spec.name] = patch.url;
      }
      continue;
    }
    const coerced = await coerceFieldValue(context, spec, incomingBody[spec.name]);
    if (coerced !== undefined) fields[spec.name] = coerced;
  }

  for (const matrix of schema.matrices) {
    const rawMatrix = incomingBody[matrix.name];
    const rawMatrixRecord =
      rawMatrix && typeof rawMatrix === "object" && !Array.isArray(rawMatrix)
        ? (rawMatrix as Record<string, unknown>)
        : null;
    const html =
      valueToText(incomingBody[`${matrix.name}_Response`]) ||
      valueToText(incomingBody[`${matrix.name}_Html`]) ||
      valueToText(rawMatrixRecord?.html);
    const json =
      valueToText(incomingBody[`${matrix.name}_Json`]) ||
      valueToText(rawMatrixRecord?.json) ||
      (Array.isArray(rawMatrixRecord?.rows) ? JSON.stringify(rawMatrixRecord.rows) : "");
    if (html) {
      fields[`${matrix.name}_Response`] = html;
      fields[`${matrix.name}_Html`] = html;
    }
    if (json) fields[`${matrix.name}_Json`] = json;
  }

  fields.RawJSON = buildRawJson(rawJsonBody);

  return { fields, urlFieldPatches, uploadedFiles: context.uploadedFiles };
}

async function getColumnKeyResolver(
  token: string,
  listTitle: string,
): Promise<(fieldName: string) => string | null> {
  const columns = await getListColumns(token, listTitle);
  const byName = new Map<string, string>();
  for (const column of columns) {
    byName.set(column.name.toLowerCase(), column.name);
    byName.set(column.displayName.toLowerCase(), column.name);
  }
  return (fieldName: string) => byName.get(fieldName.toLowerCase()) ?? null;
}

function mapToExistingColumns(
  fields: Record<string, unknown>,
  resolveColumnKey: (fieldName: string) => string | null,
  listTitle: string,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [fieldName, value] of Object.entries(fields)) {
    const columnKey = resolveColumnKey(fieldName);
    if (!columnKey) {
      logWarn("api:submit-form", "Submitted field missing from response list schema", { listTitle, fieldName });
      throw new PublicSubmissionError(
        `The public form field "${fieldName}" is not provisioned. Please republish the form before trying again.`,
        409,
      );
    }
    mapped[columnKey] = value;
  }
  return mapped;
}

function omitUrlPatchFields(
  fields: Record<string, unknown>,
  patches: ApiUrlFieldPatch[],
): Record<string, unknown> {
  if (patches.length === 0) return fields;
  const urlFieldNames = new Set(patches.map((patch) => patch.fieldName.toLowerCase()));
  return Object.fromEntries(
    Object.entries(fields).filter(([fieldName]) => !urlFieldNames.has(fieldName.toLowerCase())),
  );
}

function isGraphItemCreatePayloadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    (message.includes("/items 400") && message.includes("invalidRequest")) ||
    (message.includes("/items 500") && message.includes("generalException"))
  );
}

function isCoreSubmissionField(fieldName: string): boolean {
  return (
    fieldName === "SubmittedAt" ||
    fieldName === "SubmittedBy" ||
    fieldName === "FormVersion" ||
    fieldName === "PublishKey" ||
    fieldName === "FormID" ||
    fieldName === "RawJSON" ||
    fieldName === "PDPAConsent" ||
    fieldName === "PDPANoticeVersion" ||
    fieldName === "PDPAConsentAt" ||
    fieldName === "RetentionUntil" ||
    fieldName === "Status" ||
    fieldName === "FormStatus" ||
    fieldName === "CurrentLayer" ||
    fieldName === "CurrentApprovalLayer" ||
    /^L\d+_(Status|Email)$/.test(fieldName)
  );
}

function graphFieldValueFallback(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    return valueToText(value) || stringifyValue(value);
  }
  return value;
}

async function patchFieldWithFallback(
  token: string,
  listTitle: string,
  itemId: string,
  fieldName: string,
  value: unknown,
  deps: Pick<ApiCreateResponseItemDeps, "updateListItemFields"> = DEFAULT_CREATE_RESPONSE_ITEM_DEPS,
): Promise<void> {
  try {
    await deps.updateListItemFields(token, listTitle, itemId, { [fieldName]: value });
    return;
  } catch (firstError) {
    const fallback = graphFieldValueFallback(value);
    if (Object.is(fallback, value)) {
      logWarn("api:submit-form", "Required field Graph patch failed", {
        listTitle,
        fieldName,
        errorMessage: firstError instanceof Error ? firstError.message.slice(0, 250) : String(firstError).slice(0, 250),
      });
      throw new PublicSubmissionError(`Could not save submitted field "${fieldName}". Please try again.`, 500);
    }
    try {
      await deps.updateListItemFields(token, listTitle, itemId, { [fieldName]: fallback });
      return;
    } catch (fallbackError) {
      logWarn("api:submit-form", "Required field Graph patch fallback failed", {
        listTitle,
        fieldName,
        errorMessage:
          fallbackError instanceof Error ? fallbackError.message.slice(0, 250) : String(fallbackError).slice(0, 250),
      });
      throw new PublicSubmissionError(`Could not save submitted field "${fieldName}". Please try again.`, 500);
    }
  }
}

async function createResponseItem(
  token: string,
  listTitle: string,
  fields: Record<string, unknown>,
  deps: ApiCreateResponseItemDeps = DEFAULT_CREATE_RESPONSE_ITEM_DEPS,
): Promise<ApiCreateResponseItemResult> {
  try {
    const result = await deps.createListItem(token, listTitle, fields);
    return { ...result, usedFallback: false };
  } catch (error) {
    if (!isGraphItemCreatePayloadFailure(error)) throw error;

    const coreFields = Object.fromEntries(
      Object.entries(fields).filter(([fieldName]) => isCoreSubmissionField(fieldName)),
    );
    const optionalFields = Object.entries(fields).filter(([fieldName]) => !isCoreSubmissionField(fieldName));

    logWarn("api:submit-form", "Full Graph item create failed; retrying core create then field patches", {
      listTitle,
      fieldCount: Object.keys(fields).length,
      optionalFieldCount: optionalFields.length,
    });

    const result = await deps.createListItem(token, listTitle, coreFields);
    let patched = 0;
    try {
      for (const [fieldName, value] of optionalFields) {
        await patchFieldWithFallback(token, listTitle, result.id, fieldName, value, deps);
        patched++;
      }
    } catch (patchError) {
      try {
        await deps.deleteListItem(token, listTitle, result.id);
      } catch (deleteError) {
        logWarn("api:submit-form", "Failed to delete partial response after field patch failure", {
          listTitle,
          itemId: result.id,
          patched,
          errorMessage: errorMessage(deleteError),
        });
      }
      throw patchError;
    }
    return { ...result, usedFallback: true };
  }
}

async function applyUrlFieldPatches(
  listTitle: string,
  itemId: string,
  patches: ApiUrlFieldPatch[],
  resolveColumnKey: (fieldName: string) => string | null,
  deps: ApiUrlFieldPatchDeps = DEFAULT_URL_FIELD_PATCH_DEPS,
): Promise<void> {
  if (patches.length === 0) return;

  const resolvedPatches = patches.map((patch) => {
    const columnKey = resolveColumnKey(patch.fieldName);
    if (!columnKey) {
      logWarn("api:submit-form", "Signature field missing from response list schema", {
        listTitle,
        fieldName: patch.fieldName,
      });
      throw new PublicSubmissionError(
        `The public form signature field "${patch.fieldName}" is not provisioned. Please republish the form before trying again.`,
        409,
      );
    }
    return { patch, columnKey };
  });

  let sharePointToken: string;
  try {
    sharePointToken = await deps.getSharePointToken();
  } catch (tokenError) {
    logWarn("api:submit-form", "SharePoint REST token unavailable for URL field patch", {
      listTitle,
      errorMessage: errorMessage(tokenError),
    });
    throw new PublicSubmissionError("Could not authenticate to save signature image. Please try again.", 500);
  }

  for (const { patch, columnKey } of resolvedPatches) {
    try {
      await deps.patchHyperlinkViaSPRest(sharePointToken, listTitle, itemId, columnKey, patch.url, patch.description);
    } catch (patchError) {
      logWarn("api:submit-form", "SharePoint REST FieldUrlValue update failed", {
        listTitle,
        fieldName: patch.fieldName,
        errorMessage: errorMessage(patchError),
      });
      throw new PublicSubmissionError(`Could not save uploaded image link to "${patch.fieldName}". Please try again.`, 500);
    }
  }
}

async function cleanupUploadedFiles(token: string, uploadedFiles: ApiUploadedFile[]): Promise<void> {
  for (const uploaded of uploadedFiles) {
    try {
      await deleteDocLibraryFile(token, uploaded.libraryName, uploaded.driveItemId);
    } catch (deleteError) {
      logWarn("api:submit-form", "Failed to delete uploaded file after public submission failure", {
        libraryName: uploaded.libraryName,
        driveItemId: uploaded.driveItemId,
        errorMessage: errorMessage(deleteError),
      });
    }
  }
}

async function cleanupPartialSubmission(
  token: string,
  listTitle: string,
  parentId: string,
  uploadedFiles: ApiUploadedFile[],
  childItemRefs: ApiCreatedListItemRef[],
): Promise<void> {
  for (const child of [...childItemRefs].reverse()) {
    try {
      await deleteListItem(token, child.listTitle, child.itemId);
    } catch (deleteError) {
      logWarn("api:submit-form", "Failed to delete matrix child item after public submission failure", {
        listTitle: child.listTitle,
        itemId: child.itemId,
        errorMessage: errorMessage(deleteError),
      });
    }
  }

  try {
    await deleteListItem(token, listTitle, parentId);
  } catch (deleteError) {
    logWarn("api:submit-form", "Failed to delete partial response after public submission failure", {
      listTitle,
      itemId: parentId,
      errorMessage: errorMessage(deleteError),
    });
  }

  await cleanupUploadedFiles(token, uploadedFiles);
}

async function resolveLayerAssignee(
  token: string,
  layer: ApiLayerConfigItem,
  formBody: Record<string, unknown>,
): Promise<{ email: string; name: string }> {
  const label = layer.title || `Layer ${layer.layerNumber}`;
  if (layer.assignee.type === "department-approver") {
    return resolveDepartmentApproverFromList(token, layer.assignee, formBody, label);
  }

  if (isFixedApiAssignee(layer.assignee)) {
    // A shared layer is left unassigned, so the roster is what has to be valid
    // here — not the (empty) routed address.
    if (layer.authMode === "365" && fixedAssigneeEmails(layer.assignee.value).length === 0) {
      throw new Error(`${label} needs a valid assignee email before the workflow can start.`);
    }
    return { email: routedAssigneeEmail(layer.assignee.value), name: "" };
  }

  const email = valueToText(formBody[stripFieldReference(layer.assignee.value)]).trim();
  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    throw new Error(`${label} needs a valid assignee email before the workflow can start.`);
  }
  return { email, name: "" };
}

/** Who to tell a layer is waiting: its holder, or everyone named on a shared layer. */
function layerNotificationRecipients(
  layer: ApiLayerConfigItem,
  storedEmail: string,
): string[] {
  if (EMAIL_RE.test(storedEmail)) return [storedEmail];
  return isFixedApiAssignee(layer.assignee) ? fixedAssigneeEmails(layer.assignee.value) : [];
}

async function applyLayerConfigWorkflow(
  token: string,
  formBody: Record<string, unknown>,
  layerConfig: ApiLayerConfig | null,
): Promise<void> {
  const manualBranches = layerConfig?.manualBranches ?? [];
  if (manualBranches.length > 0) {
    formBody.FormStatus = FORM_SUBMITTED_STATUS;
    formBody.Status = FORM_SUBMITTED_STATUS;
    formBody.CurrentLayer = 0;
    formBody.CurrentApprovalLayer = 0;
    return;
  }

  const layers = layerConfig?.layers ?? [];
  if (layers.length === 0) return;

  for (const layer of layers) {
    const layerNumber = layer.layerNumber;
    const resolved = await resolveLayerAssignee(token, layer, formBody);
    formBody[`L${layerNumber}_Status`] = LAYER_PENDING_STATUS;
    formBody[`L${layerNumber}_Email`] = resolved.email;
  }
  formBody.FormStatus = FORM_SUBMITTED_STATUS;
  formBody.CurrentLayer = layers[0]?.layerNumber ?? 1;
  formBody.CurrentApprovalLayer = formBody.CurrentLayer;
}

interface ApiRequest {
  body: Record<string, unknown>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    listTitle,
    body: formBody,
    matrixData,
    formVersion,
    publishKey,
    pdpaConsent,
    pdpaNoticeVersion,
    pdpaConsentedAt,
    retentionUntil,
  } = req.body as {
    listTitle?: string;
    body?: Record<string, unknown>;
    matrixData?: Record<string, { rows: Record<string, unknown>[]; columns: ApiMatrixColumn[] }>;
    formVersion?: string;
    publishKey?: string;
    pdpaConsent?: boolean;
    pdpaNoticeVersion?: string;
    pdpaConsentedAt?: string;
    retentionUntil?: string;
  };

  if (!listTitle || typeof listTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid listTitle" });
  }
  if (!formBody || typeof formBody !== "object") {
    return res.status(400).json({ error: "Missing or invalid body" });
  }
  if (pdpaConsent !== true) {
    return res.status(400).json({ error: "PDPA consent is required before submitting this form." });
  }

  let tokenForCleanup = "";
  let uploadedFilesForCleanup: ApiUploadedFile[] = [];
  let cleanupHandled = false;

  try {
    const token = await getGraphToken();
    tokenForCleanup = token;

    const formConfig = (await queryMasterFormByTitle(token, listTitle))?.fields;

    if (!formConfig) {
      return res.status(404).json({ error: "Form not found" });
    }
    if (formConfig.IsPublic === false) {
      return res.status(403).json({ error: "Form is not public" });
    }

    // The client sends the profile it actually rendered, so the server validates the
    // submission against that same published schema rather than whatever is current.
    const targetPublishKey = typeof publishKey === "string" && publishKey.trim()
      ? publishKey.trim()
      : valueToText(formConfig.CurrentPublishKey) || "production";
    if (typeof formVersion === "string" && formVersion.trim()) {
      formConfig.CurrentVersion = formVersion.trim();
    }
    formConfig.CurrentPublishKey = targetPublishKey;

    const surveyJson = await getPublishedSurveyJson(token, formConfig, targetPublishKey);
    if (!surveyJson) {
      logError("api:submit-form", "Published form schema unavailable", undefined, { listTitle });
      return res.status(500).json({ error: "Internal server error. Please try again." });
    }

    const schema = collectSubmissionSchema(surveyJson);
    const submission = await buildSubmissionFields(token, listTitle, formBody, formConfig, schema);
    uploadedFilesForCleanup = submission.uploadedFiles;
    const submissionBody = submission.fields;

    const consentedAt =
      typeof pdpaConsentedAt === "string" && !Number.isNaN(Date.parse(pdpaConsentedAt))
        ? pdpaConsentedAt
        : new Date().toISOString();
    const retentionDate =
      typeof retentionUntil === "string" && !Number.isNaN(Date.parse(retentionUntil))
        ? retentionUntil
        : getRetentionUntil(new Date(consentedAt));

    submissionBody.PDPAConsent = "Accepted";
    submissionBody.PDPANoticeVersion = pdpaNoticeVersion || PDPA_NOTICE_VERSION;
    submissionBody.PDPAConsentAt = consentedAt;
    submissionBody.RetentionUntil = retentionDate;

    const parsedLayerConfig = parseLayerConfig(formConfig.LayerConfig);
    await applyLayerConfigWorkflow(token, submissionBody, parsedLayerConfig);

    const resolveColumnKey = await getColumnKeyResolver(token, listTitle);

    // Image column fields (urlFieldPatches) are excluded from the Graph create
    // payload — they have never been writable via Graph PATCH on Image columns.
    const createBody = omitUrlPatchFields(submissionBody, submission.urlFieldPatches);
    const writableBody = mapToExistingColumns(createBody, resolveColumnKey, listTitle);

    const result = await createResponseItem(token, listTitle, writableBody);
    const parentId = result.id;

    const childItemIds: Record<string, number[]> = {};
    const childItemRefs: ApiCreatedListItemRef[] = [];
    try {
      // ── Write Image/Hyperlink columns via SharePoint REST AFTER item creation ──
      await applyUrlFieldPatches(listTitle, parentId, submission.urlFieldPatches, resolveColumnKey);

      if (matrixData && parentId) {
        const matrixSpecs = new Map(schema.matrices.map((matrix) => [matrix.name, matrix]));
        for (const [fieldName, data] of Object.entries(matrixData)) {
          const matrixSpec = matrixSpecs.get(fieldName);
          if (!matrixSpec) {
            logWarn("api:submit-form", "Matrix data missing from published schema", { listTitle, fieldName });
            throw new PublicSubmissionError(
              `The public form matrix field "${fieldName}" is not provisioned. Please republish the form before trying again.`,
              409,
            );
          }
          const childListDisplayName = `${listTitle} Matrix ${fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim()}`;
          const rows = data.rows;
          const columns = matrixSpec.columns;
          if (!Array.isArray(rows) || rows.length === 0) continue;

          let canWriteParentSnapshot = true;
          try {
            await ensureListColumns(token, childListDisplayName, [
              { name: "ParentFormTitle", displayName: "ParentFormTitle", type: "text" },
              { name: "ParentFormVersion", displayName: "ParentFormVersion", type: "text" },
              { name: "ParentSubmittedAt", displayName: "ParentSubmittedAt", type: "dateTime" },
              { name: "ParentSubmittedBy", displayName: "ParentSubmittedBy", type: "text" },
            ]);
          } catch (e) {
            canWriteParentSnapshot = false;
            logWarn("api:submit-form", "Matrix child parent snapshot columns unavailable", {
              listTitle: childListDisplayName,
              errorMessage: e instanceof Error ? e.message : String(e),
            });
          }

          const childIds: number[] = [];
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fields: Record<string, unknown> = {
              ParentResponseId: Number(parentId),
              RowIndex: i,
            };
            if (canWriteParentSnapshot) {
              fields.ParentFormTitle = listTitle;
              fields.ParentFormVersion = valueToText(submissionBody.FormVersion);
              fields.ParentSubmittedAt = valueToText(submissionBody.SubmittedAt);
              fields.ParentSubmittedBy = valueToText(submissionBody.SubmittedBy);
            }
            for (const col of columns) {
              if (col.name && row[col.name] !== undefined) {
                const value = coerceMatrixCellValue(row[col.name], col);
                if (value !== undefined) fields[col.name] = value;
              }
            }
            try {
              const item = await createListItem(token, childListDisplayName, fields);
              if (item.id) {
                childIds.push(Number(item.id));
                childItemRefs.push({ listTitle: childListDisplayName, itemId: item.id });
              }
            } catch (e) {
              logWarn("api:submit-form", "Matrix child item write failed", {
                fieldName,
                rowIndex: i,
                errorMessage: e instanceof Error ? e.message : String(e),
              });
              throw new PublicSubmissionError(`Could not save matrix field "${fieldName}". Please try again.`, 500);
            }
          }
          if (childIds.length > 0) {
            childItemIds[fieldName] = childIds;
          }
        }

        if (Object.keys(childItemIds).length > 0) {
          const updateFields: Record<string, string> = {};
          for (const [fieldName, ids] of Object.entries(childItemIds)) {
            updateFields[`${fieldName}_RowIds`] = JSON.stringify(ids);
          }
          try {
            await updateListItemFields(token, listTitle, parentId, updateFields);
          } catch (e) {
            logWarn("api:submit-form", "Failed to update parent with matrix row ids", {
              parentId,
              errorMessage: e instanceof Error ? e.message : String(e),
            });
            throw new PublicSubmissionError("Could not save matrix row references. Please try again.", 500);
          }
        }
      }
    } catch (postCreateError) {
      cleanupHandled = true;
      await cleanupPartialSubmission(token, listTitle, parentId, submission.uploadedFiles, childItemRefs);
      throw postCreateError;
    }

    const firstLayer = parsedLayerConfig?.layers?.[0];
    if (firstLayer) {
      const recipients = layerNotificationRecipients(
        firstLayer,
        valueToText(submissionBody[`L${firstLayer.layerNumber}_Email`]),
      );
      if (recipients.length > 0) {
        const appBaseUrl = getApplicationBaseUrl();
        const formSlug = valueToText(formConfig.Slug);
        const reviewLink = firstLayer.authMode === "public" && firstLayer.publicToken
          ? `${appBaseUrl}/eval/${encodeURIComponent(firstLayer.publicToken)}?item=${encodeURIComponent(parentId)}`
          : `${appBaseUrl}/eval/${encodeURIComponent(formSlug)}/${encodeURIComponent(parentId)}/${firstLayer.layerNumber}`;
        try {
          await scheduleOrDeliverWorkflowEmail(
            token,
            buildWorkflowActionEmail({
              formTitle: listTitle,
              submittedBy: valueToText(submissionBody.SubmittedBy) || "Public respondent",
              responseItemId: parentId,
              layer: firstLayer.layerNumber,
              totalLayers: parsedLayerConfig?.layers?.length ?? 1,
              recipient: recipients,
              layerType: firstLayer.type,
              reviewLink,
            }),
            {
              listTitle,
              responseItemId: parentId,
              layer: firstLayer.layerNumber,
            },
            firstLayer.type === "evaluation" ? firstLayer.emailSchedule : undefined,
            {
              layer: firstLayer.layerNumber,
              layerType: firstLayer.type,
              totalLayers: parsedLayerConfig?.layers?.length ?? 1,
              reviewLink,
              submittedBy: valueToText(submissionBody.SubmittedBy) || "Public respondent",
            },
          );
        } catch (emailError) {
          logWarn("api:submit-form", "Initial workflow email delivery failed", {
            listTitle,
            itemId: parentId,
            layer: firstLayer.layerNumber,
            errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
    }

    return res.status(200).json({ success: true, id: parentId, childItemIds });
  } catch (err) {
    if (!cleanupHandled && tokenForCleanup && uploadedFilesForCleanup.length > 0) {
      await cleanupUploadedFiles(tokenForCleanup, uploadedFilesForCleanup);
    }
    if (err instanceof PublicSubmissionError) {
      logWarn("api:submit-form", err.message, { listTitle });
      return res.status(err.statusCode).json({ error: err.message });
    }
    logError("api:submit-form", "Failed to submit public form", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

export const __test__ = {
  applyUrlFieldPatches,
  buildSubmissionFields,
  collectSubmissionSchema,
  createResponseItem,
  graphUrlFieldValue,
  omitUrlPatchFields,
  resolveExistingUploadLibrary,
};
