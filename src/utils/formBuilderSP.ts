import type { LayerStatus, EvaluationDataEntry, LayerConfigItem, EvaluationEmailSchedule } from '../types/index.ts';
import { resolveEvaluationEmailDueAt, setScheduledWorkflowEmail } from "./workflowEmailSchedule";
import { fetchWithAuthRecovery } from "./authRecovery";
import { SharePointHttpError } from "./sharepointClient";
import { OSHES_LISTS } from "../config/oshes";
import { REFERENCE_NO_FIELD } from "./referenceNumber";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || '').replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_API_SECRET_KEY || '';

/**
 * SharePoint answers an unknown column or a missing list with 400/404 rather than an
 * empty result, so a query written against a newer schema fails outright on a site
 * that has not been provisioned yet. Callers use this to retry with a narrower
 * $select instead of surfacing the failure.
 */
function isQueryMismatchError(error: unknown): boolean {
  return error instanceof SharePointHttpError && (error.status === 400 || error.status === 404);
}

function emptyOnQueryMismatch(error: unknown): { value: never[] } {
  if (!isQueryMismatchError(error)) throw error;
  return { value: [] };
}

export interface SpColumnSpec {
  n: string;
  k: number;
  ml?: boolean;
  rt?: boolean;
  choices?: string[];
  /**
   * The question has "Other" enabled, so the column must accept a value outside
   * its choice list. Without FillInChoice SharePoint rejects the typed answer and
   * the whole submission fails on a question the respondent answered legally.
   */
  fillIn?: boolean;
  label?: string;
}

export interface SpListSchema {
  title: string;
  baseTemplate?: number;
  description?: string;
  columns?: SpColumnSpec[];
}

export interface ExistingFieldInfo {
  Title?: string;
  InternalName?: string;
  StaticName?: string;
  EntityPropertyName?: string;
  /** "MultiChoice", "UserMulti", "LookupMulti", … — every multi-value name carries "Multi". */
  TypeAsString?: string;
  FieldTypeKind?: number;
}

export interface EnsureColumnsResult {
  created: string[];
  existing: string[];
}

export const SP_FIELD_KIND = {
  text: 2,
  note: 3,
  dateTime: 4,
  choice: 6,
  boolean: 8,
  number: 9,
  image: 11,
  multiChoice: 15,
} as const;

export const PDPA_COLUMN_SPECS: SpColumnSpec[] = [
  { n: 'PDPAConsent', k: SP_FIELD_KIND.text },
  { n: 'PDPANoticeVersion', k: SP_FIELD_KIND.text },
  { n: 'PDPAConsentAt', k: SP_FIELD_KIND.dateTime },
  { n: 'RetentionUntil', k: SP_FIELD_KIND.dateTime },
];

export const PDF_URL_COLUMN_SPEC: SpColumnSpec = { n: 'PdfUrl', k: SP_FIELD_KIND.text };

export const REFERENCE_NO_COLUMN_SPEC: SpColumnSpec = { n: REFERENCE_NO_FIELD, k: SP_FIELD_KIND.text };

export const SELECTED_BRANCH_COLUMN_SPEC: SpColumnSpec = {
  n: 'SelectedBranch',
  k: SP_FIELD_KIND.text,
};

const SP_FIELD_TYPE_MAP: Record<number, string> = {
  [SP_FIELD_KIND.text]: 'SP.Field',
  [SP_FIELD_KIND.note]: 'SP.FieldMultiLineText',
  [SP_FIELD_KIND.dateTime]: 'SP.FieldDateTime',
  [SP_FIELD_KIND.choice]: 'SP.FieldChoice',
  [SP_FIELD_KIND.boolean]: 'SP.Field',
  [SP_FIELD_KIND.number]: 'SP.FieldNumber',
  [SP_FIELD_KIND.image]: 'SP.FieldUrl',
  [SP_FIELD_KIND.multiChoice]: 'SP.FieldMultiChoice',
};

const columnCache = new Map<string, Set<string>>();

function columnCacheKey(listTitle: string): string {
  return listTitle.trim().toLowerCase();
}

function normalizeColumnName(name: string): string {
  return name.trim().toLowerCase();
}

function rememberColumn(listTitle: string, fieldName: string): void {
  const key = columnCacheKey(listTitle);
  const cached = columnCache.get(key) ?? new Set<string>();
  cached.add(normalizeColumnName(fieldName));
  columnCache.set(key, cached);
}

async function getExistingColumnNames(token: string, listTitle: string): Promise<Set<string>> {
  const key = columnCacheKey(listTitle);
  const cached = columnCache.get(key);
  if (cached) return cached;

  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=Title,InternalName,StaticName,EntityPropertyName&$top=5000`
  ) as { value?: ExistingFieldInfo[] };
  const names = new Set<string>();
  for (const field of data.value || []) {
    for (const name of [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]) {
      if (name) names.add(normalizeColumnName(name));
    }
  }
  columnCache.set(key, names);
  return names;
}

export function createSharePointColumnKeyResolver(
  fields: ExistingFieldInfo[],
): (fieldName: string) => string | null {
  const byName = new Map<string, string>();
  for (const field of fields) {
    const entityKey = field.EntityPropertyName || field.InternalName || field.StaticName || field.Title;
    if (!entityKey) continue;
    for (const name of [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]) {
      if (name) byName.set(normalizeColumnName(name), entityKey);
    }
  }
  return (fieldName: string) => byName.get(normalizeColumnName(fieldName)) ?? null;
}

/**
 * Columns that expect a JSON array rather than a scalar.
 *
 * A SurveyJS checkbox is provisioned as a SharePoint MultiChoice column, and
 * posting a JSON *string* to one fails the whole item create with "An unexpected
 * 'PrimitiveValue' node was found ... A 'StartArray' node was expected." Every
 * multi-value type name carries "Multi" (MultiChoice, UserMulti, LookupMulti,
 * TaxonomyFieldTypeMulti); no single-value type does.
 */
export function createSharePointMultiValueResolver(
  fields: ExistingFieldInfo[],
): (fieldName: string) => boolean {
  const multiValue = new Set<string>();
  for (const field of fields) {
    const isMulti = field.FieldTypeKind === SP_FIELD_KIND.multiChoice
      || /multi/i.test(field.TypeAsString ?? '');
    if (!isMulti) continue;
    for (const name of [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]) {
      if (name) multiValue.add(normalizeColumnName(name));
    }
  }
  return (fieldName: string) => multiValue.has(normalizeColumnName(fieldName));
}

export interface SharePointColumnResolvers {
  resolveColumnKey: (fieldName: string) => string | null;
  isMultiValueColumn: (fieldName: string) => boolean;
}

/**
 * Just the name→key half of {@link getSharePointColumnResolvers}.
 *
 * Callers that only translate authored column names — the approval directory
 * readers — take this rather than destructuring the pair, which keeps them
 * source-identical to their pmw-hrform counterparts.
 */
export async function getSharePointColumnKeyResolver(
  token: string,
  listTitle: string,
): Promise<(fieldName: string) => string | null> {
  const { resolveColumnKey } = await getSharePointColumnResolvers(token, listTitle);
  return resolveColumnKey;
}

export async function getSharePointColumnResolvers(
  token: string,
  listTitle: string,
): Promise<SharePointColumnResolvers> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=Title,InternalName,StaticName,EntityPropertyName,TypeAsString,FieldTypeKind&$top=5000`,
  ) as { value?: ExistingFieldInfo[] };
  const fields = data.value || [];
  return {
    resolveColumnKey: createSharePointColumnKeyResolver(fields),
    isMultiValueColumn: createSharePointMultiValueResolver(fields),
  };
}

function buildColumnBody(spec: SpColumnSpec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    __metadata: { type: SP_FIELD_TYPE_MAP[spec.k] ?? 'SP.Field' },
    FieldTypeKind: spec.k,
    Title: spec.n,
    StaticName: spec.n,
  };
  if (spec.k === 3 || spec.ml) {
    body.NumberOfLines = 6;
    body.RichText = !!spec.rt;
  }
  if (spec.k === 11) {
    body.DisplayFormat = 0; // URL link. Public submissions store a shortcut to the uploaded signature file.
  }
  if ((spec.k === 6 || spec.k === 15) && spec.choices && spec.choices.length > 0) {
    body.Choices = { results: spec.choices };
    // A question with "Other" enabled submits a value the respondent typed. Without
    // FillInChoice the column treats it as invalid; with it, the answer is stored and
    // shown like any other.
    if (spec.fillIn) body.FillInChoice = true;
  }
  return body;
}

async function createColumn(token: string, listTitle: string, spec: SpColumnSpec): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify(buildColumnBody(spec)),
  });
  if (!response.ok) {
    const text = await response.text();
    if (text.toLowerCase().includes('duplicate') || text.toLowerCase().includes('already exists')) {
      rememberColumn(listTitle, spec.n);
      return;
    }
    throw new Error(`addColumn "${spec.n}" ${response.status}: ${text}`);
  }
  rememberColumn(listTitle, spec.n);
}

async function repairUrlColumnDisplayFormat(token: string, listTitle: string, fieldName: string): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(fieldName)}')`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.FieldUrl' },
      DisplayFormat: 0,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`repairUrlColumn "${fieldName}" ${response.status}: ${text}`);
  }
}

async function setColumnIndexed(token: string, listTitle: string, fieldName: string): Promise<void> {
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields/getbyinternalnameortitle('${encodeURIComponent(fieldName)}')`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=verbose',
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
      'X-RequestDigest': await getDigest(token),
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.Field' },
      Indexed: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`indexColumn "${fieldName}" ${response.status}: ${text}`);
  }
}

const LIST_INDEXES: Record<string, string[]> = {
  [OSHES_LISTS.masterForm]: ['Title', 'Slug', 'FormID', 'CurrentVersion'],
  [OSHES_LISTS.approvers]: ['FormTitle', 'LayerNumber', 'ApproverEmail'],
  [OSHES_LISTS.versions]: ['FormTitle', 'FormSlug', 'FormVersion', 'PublishedAt'],
  [OSHES_LISTS.builderLog]: ['FormTitle', 'EventType', 'ChangedBy', 'EventAt'],
  [OSHES_LISTS.dashboardSettings]: ['BackgroundId', 'UpdatedAt'],
};

async function ensureIndexedColumns(
  token: string,
  listTitle: string,
  fieldNames: string[],
  onLog: (msg: string, type: string) => void = () => {},
): Promise<void> {
  for (const fieldName of fieldNames) {
    try {
      await setColumnIndexed(token, listTitle, fieldName);
      onLog(`  indexed: ${fieldName}`, 'ok');
    } catch (e) {
      onLog(`  index skipped: ${fieldName} (${(e as Error).message})`, 'warn');
    }
  }
}

/** Escape single quotes for OData filter string values to prevent injection */
function sanitizeODataValue(val: string): string {
  return val.replace(/'/g, "''");
}

/** HTML-entity-encode a string to prevent XSS */
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wraps fetch with an AbortController timeout (default 30s) */
async function fetchWithTimeout(url: string | URL | Request, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchWithAuthRecovery(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const DIGEST_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
let cachedDigest: string | null = null;
let digestExpiry: number | null = null;

async function getDigest(token: string): Promise<string> {
  const now = Date.now();
  if (cachedDigest && digestExpiry && now < digestExpiry) {
    return cachedDigest;
  }

  const url = `${SP_SITE_URL}/_api/contextinfo`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch request digest: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.FormDigestValue) {
    throw new Error('No FormDigestValue returned from contextinfo endpoint');
  }

  const digestValue: string = data.FormDigestValue;
  cachedDigest = digestValue;
  digestExpiry = now + DIGEST_EXPIRY_MS;
  return digestValue;
}

export async function getSharePointChoices(
  listTitle: string,
  fieldName: string,
  token: string
): Promise<string[]> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const encodedFieldName = encodeURIComponent(sanitizeODataValue(fieldName));
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')/fields?$filter=Title eq '${encodedFieldName}'`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SharePoint choices: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const field = data.value?.[0];
  if (!field) {
    return [];
  }
  const choices = field.Choices;
  if (!choices) {
    return [];
  }
  return Array.isArray(choices) ? choices : (choices.results || []);
}

/**
 * Fetch distinct values from a list column, with optional OData filter.
 * Used by the Filtered List choice source at runtime.
 */
/**
 * Resolve a column's internal name from its display name via SharePoint REST API.
 * The fields endpoint uses `Title` (display name) for filtering and returns `EntityPropertyName` (OData name).
 */
async function resolveInternalName(
  listTitle: string,
  displayName: string,
  token: string
): Promise<string> {
  try {
    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(displayName))}'&$select=Title,EntityPropertyName`;
    const data = await spGet(token, url) as { value?: { EntityPropertyName?: string }[] };
    return data.value?.[0]?.EntityPropertyName || displayName;
  } catch {
    return displayName;
  }
}

export async function getFilteredListChoices(
  listTitle: string,
  valueColumn: string,
  token: string,
  filterColumn?: string,
  filterValue?: string,
): Promise<string[]> {
  const encoded = encodeURIComponent(listTitle);
  // Resolve display names → internal names (SP REST returns fields under internal names)
  const internalValCol = await resolveInternalName(listTitle, valueColumn, token);
  const internalFilterCol = filterColumn
    ? await resolveInternalName(listTitle, filterColumn, token)
    : undefined;

  let url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encoded}')/items?$select=${encodeURIComponent(internalValCol)}&$top=5000`;
  if (internalFilterCol && filterValue) {
    url += `&$filter=${encodeURIComponent(internalFilterCol)} eq '${encodeURIComponent(sanitizeODataValue(filterValue))}'`;
  }
  try {
    const data = await spGet(token, url) as { value?: Record<string, unknown>[] };
    const raw = data.value || [];
    const values = new Set<string>();
    for (const item of raw) {
      const v = item[internalValCol];
      if (v != null && v !== "") {
        values.add(String(v));
      }
    }
    return Array.from(values).sort();
  } catch {
    return [];
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function spUploadFile(token: string, lib: string, filename: string, content: string | Uint8Array): Promise<unknown> {
  const digest = await getDigest(token);
  const r = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(lib)}')/rootfolder/files/add(url='${encodeURIComponent(filename)}',overwrite=true)`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-RequestDigest': digest, 'Content-Type': 'application/octet-stream' }, body: (typeof content === 'string' ? new TextEncoder().encode(content) : content) as BodyInit });
  if (!r.ok) { const t = await r.text(); throw new Error(`Upload ${r.status}: ${t}`); }
  return r.json().catch(() => ({}));
}

/** Profile key used for forms published before PublishKey existed. */
export const DEFAULT_PUBLISH_KEY = 'production';

export function normalizePublishKey(value?: string | null): string {
  const normalized = slugify(value || DEFAULT_PUBLISH_KEY);
  return normalized || DEFAULT_PUBLISH_KEY;
}

export function isPublishExpired(value?: string): boolean {
  return !!value && Date.parse(value) <= Date.now();
}

/**
 * Resolves one published version of a form, optionally pinned to a publish profile.
 *
 * The profile columns are written by the pmw-hrform builder and may not exist yet on
 * a site provisioned before they were added, so a query naming them can fail with a
 * 400. When the caller asked for the default profile — which is what a link with no
 * ?publish= resolves to — fall back to the profile-less query so those older rows
 * still load. Anything that is not a schema mismatch propagates: an access failure
 * must not read as "no such version".
 */
export async function getFormVersion(
  token: string,
  listTitle: string,
  version: string,
  publishKey?: string | null
): Promise<{ surveyJson: unknown; meta: unknown; layerConfig?: unknown; publishKey?: string; publishLabel?: string; publishStatus?: string; publishExpiresAt?: string; version?: string } | null> {
  const baseFilter = `FormTitle eq '${encodeURIComponent(sanitizeODataValue(listTitle))}' and FormVersion eq '${encodeURIComponent(sanitizeODataValue(version))}'`;
  const normalizedPublishKey = publishKey ? normalizePublishKey(publishKey) : "";
  const query = normalizedPublishKey
    ? `${baseFilter} and PublishKey eq '${encodeURIComponent(sanitizeODataValue(normalizedPublishKey))}'`
    : baseFilter;
  const legacyUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${baseFilter}&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy&$orderby=PublishedAt desc&$top=1`;

  let data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Web%20Form%20Versions')/items?$filter=${query}&$select=SurveyJSON,FormVersion,PublishedAt,PublishedBy,PublishKey,PublishLabel,PublishStatus,PublishExpiresAt&$orderby=PublishedAt desc&$top=1`)
    .catch(async (error: unknown) => {
      if (!isQueryMismatchError(error)) throw error;
      if (!normalizedPublishKey || normalizedPublishKey !== DEFAULT_PUBLISH_KEY) return { value: [] };
      return spGet(token, legacyUrl).catch(emptyOnQueryMismatch);
    }) as { value?: { SurveyJSON?: string }[] };

  if (normalizedPublishKey === DEFAULT_PUBLISH_KEY && !data.value?.length) {
    data = await spGet(token, legacyUrl).catch(emptyOnQueryMismatch) as { value?: { SurveyJSON?: string }[] };
  }

  const row = data.value?.[0];
  if (!row?.SurveyJSON) return null;
  try {
    const parsed = JSON.parse(row.SurveyJSON);
    return {
      ...parsed,
      publishStatus: (row as { PublishStatus?: string }).PublishStatus || parsed.publishStatus,
      publishExpiresAt: (row as { PublishExpiresAt?: string }).PublishExpiresAt || parsed.publishExpiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * addColumn — idempotent.
 * kind: 2=Text 3=Note 4=DateTime 6=Choice 8=Boolean 9=Number 15=MultiChoice
 * multiLine=true → SP.FieldMultiLineText (kind must be 3)
 * richText=true → Enhanced Rich Text (multiLine must be true)
 * choices → required for kind 6 (Choice) and 15 (MultiChoice)
 */
export async function addColumn(
  token: string,
  listTitle: string,
  fieldName: string,
  kind: number,
  multiLine = false,
  richText = false,
  choices?: string[]
): Promise<void> {
  await ensureColumns(token, listTitle, [{ n: fieldName, k: kind, ml: multiLine, rt: richText, choices }]);
}

export async function ensureColumns(
  token: string,
  listTitle: string,
  columns: SpColumnSpec[],
): Promise<EnsureColumnsResult> {
  if (columns.length === 0) return { created: [], existing: [] };

  const existingColumns = await getExistingColumnNames(token, listTitle);
  const result: EnsureColumnsResult = { created: [], existing: [] };
  for (const column of columns) {
    const normalized = normalizeColumnName(column.n);
    if (existingColumns.has(normalized)) {
      if (column.k === SP_FIELD_KIND.image) {
        await repairUrlColumnDisplayFormat(token, listTitle, column.n);
      }
      result.existing.push(column.n);
      continue;
    }
    await createColumn(token, listTitle, column);
    existingColumns.add(normalized);
    result.created.push(column.n);
  }
  return result;
}

export async function createSpList(
  token: string,
  listTitle: string,
  baseTemplate = 100,
  description = ""
): Promise<unknown> {
  columnCache.delete(columnCacheKey(listTitle));
  const d = await getDigest(token);
  const r = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": d },
    body: JSON.stringify({ __metadata: { type: "SP.List" }, AllowContentTypes: false, BaseTemplate: baseTemplate, ContentTypesEnabled: false, Title: listTitle, Description: description }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`createSpList ${r.status}: ${t}`); }
  // Retry: wait for the list to be available (SP provisioning)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(res => setTimeout(res, 1000));
    if (await listExists(token, listTitle)) break;
  }
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

export async function listExists(
  token: string,
  listTitle: string
): Promise<boolean> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodedListTitle}')`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json;odata=nometadata',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Low-level HTTP helpers (from reference) ─────────────────────────────────────
export async function ensureSpList(
  token: string,
  listTitle: string,
  options: { baseTemplate?: number; description?: string } = {},
): Promise<boolean> {
  if (await listExists(token, listTitle)) return false;
  await createSpList(token, listTitle, options.baseTemplate ?? 100, options.description ?? '');
  return true;
}

export async function ensureListSchema(
  token: string,
  schema: SpListSchema,
  onLog?: (msg: string, type: string) => void,
): Promise<EnsureColumnsResult> {
  const createdList = await ensureSpList(token, schema.title, {
    baseTemplate: schema.baseTemplate,
    description: schema.description,
  });
  onLog?.(`${createdList ? 'Created' : 'Found'} list "${schema.title}"`, createdList ? 'ok' : 'info');

  const columns = schema.columns ?? [];
  const result = await ensureColumns(token, schema.title, columns);
  for (const column of columns) {
    const status = result.created.includes(column.n) ? 'created' : 'exists';
    onLog?.(`  ${status}: ${column.n}`, 'ok');
  }
  await ensureIndexedColumns(token, schema.title, LIST_INDEXES[schema.title] ?? [], onLog);
  return result;
}

export async function ensurePdpaColumns(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  return ensureColumns(token, listTitle, PDPA_COLUMN_SPECS);
}

export async function ensurePdfUrlColumn(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  return ensureColumns(token, listTitle, [PDF_URL_COLUMN_SPEC]);
}

/**
 * Ensures the column a submission's reference is written to.
 *
 * Forms here are authored from the HR builder on another origin, so turning
 * reference numbering on for a form does not necessarily provision anything on
 * this site. Ensuring it at submit time — next to the PDPA columns, which exist
 * for the same reason — means the setting takes effect without a republish.
 */
export async function ensureReferenceNoColumn(token: string, listTitle: string): Promise<EnsureColumnsResult> {
  const result = await ensureColumns(token, listTitle, [REFERENCE_NO_COLUMN_SPEC]);
  if (result.created.includes(REFERENCE_NO_FIELD)) {
    await ensureIndexedColumns(token, listTitle, [REFERENCE_NO_FIELD]);
  }
  return result;
}

export async function ensureDocumentLibrary(
  token: string,
  libraryName: string,
  description = "",
  onLog?: (msg: string) => void,
): Promise<string> {
  const created = await ensureSpList(token, libraryName, {
    baseTemplate: 101,
    description,
  });
  if (created) {
    onLog?.(`Created document library "${libraryName}"`);
  }
  return libraryName;
}

export async function spGet(token: string, url: string): Promise<unknown> {
  const response = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
    },
  });
  if (!response.ok) throw new SharePointHttpError(`GET ${url}`, response);
  return response.json();
}

export async function spPost(token: string, url: string, body: unknown): Promise<unknown> {
  const digest = await getDigest(token);
  const cleanBody = body ? JSON.parse(JSON.stringify(body)) : {};
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(cleanBody),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${response.status}: ${text}`);
  }
  return response.status === 204 ? {} : response.json().catch(() => ({}));
}

export async function spPatch(token: string, url: string, body: unknown): Promise<void> {
  const digest = await getDigest(token);
  const cleanBody = body ? JSON.parse(JSON.stringify(body)) : {};
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(cleanBody),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH ${response.status}: ${text}`);
  }
}

async function getListEntityTypeFullName(token: string, listTitle: string): Promise<string> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')?$select=ListItemEntityTypeFullName`,
  ) as { ListItemEntityTypeFullName?: string };
  if (!data.ListItemEntityTypeFullName) {
    throw new Error(`Could not resolve SharePoint entity type for "${listTitle}".`);
  }
  return data.ListItemEntityTypeFullName;
}

export function toAbsoluteSharePointUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || !SP_SITE_URL) return trimmed;
  const site = new URL(SP_SITE_URL);
  if (trimmed.startsWith("/")) return `${site.origin}${trimmed}`;
  return `${SP_SITE_URL}/${trimmed.replace(/^\/+/, "")}`;
}

export async function spPatchUrlField(
  token: string,
  listTitle: string,
  itemId: string | number,
  fieldName: string,
  url: string,
  description = "",
): Promise<void> {
  const digest = await getDigest(token);
  const entityType = await getListEntityTypeFullName(token, listTitle);
  const absoluteUrl = toAbsoluteSharePointUrl(url);
  const response = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify({
      __metadata: { type: entityType },
      [fieldName]: {
        __metadata: { type: 'SP.FieldUrlValue' },
        Url: absoluteUrl,
        Description: description || absoluteUrl,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH URL field ${response.status}: ${text}`);
  }
}

export async function spDelete(token: string, url: string): Promise<void> {
  const digest = await getDigest(token);
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'DELETE',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DELETE ${response.status}: ${text}`);
  }
}

// ── Form Config CRUD (from reference) ────────────────────────────────────────
interface FormConfigData {
  Id?: string;
  Title: string;
  FormID?: string;
  NumberOfApprovalLayer?: number;
  Slug?: string;
  CurrentVersion?: string;
  CurrentPublishKey?: string;
  CurrentPublishLabel?: string;
  IsPublished?: boolean;
  IsPublic?: boolean;
  ConditionField?: string;
  ApprovalRules?: string;
  LayerConfig?: string;
}

export async function getAllFormConfigs(token: string): Promise<FormConfigData[]> {
  if (!await listExists(token, OSHES_LISTS.masterForm)) return [];
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig&$orderby=Title asc&$top=500`) as { value?: FormConfigData[] };
  return data.value || [];
}

export async function getFormConfigByTitle(token: string, listTitle: string): Promise<FormConfigData | null> {
  if (!await listExists(token, OSHES_LISTS.masterForm)) return null;
  const data = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(listTitle))}'&$select=Id,Title,FormID,NumberOfApprovalLayer,Slug,CurrentVersion,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig&$top=1`) as { value?: FormConfigData[] };
  return data.value?.[0] || null;
}

// ── Form Deletion ─────────────────────────────────────────────────────────

export interface DeleteFormResult {
  configDeleted: boolean;
  versionsDeleted: number;
  logEntriesDeleted: number;
  approversDeleted: number;
  responseListDeleted?: boolean;
  responseItemsDeleted?: number;
}

// ── Bootstrap (from reference) ──────────────────────────────────────────
const LIST_SCHEMAS: Record<string, { t: number; desc: string; cols: SpColumnSpec[] }> = {
  [OSHES_LISTS.masterForm]: { t: 100, desc: 'OSHES form builder configuration', cols: [
    { n: 'FormID', k: 2 }, { n: 'NumberOfApprovalLayer', k: 9 },
    { n: 'Slug', k: 2 }, { n: 'CurrentVersion', k: 2 },
    { n: 'IsPublished', k: 8 }, { n: 'IsPublic', k: 8 },
    { n: 'ConditionField', k: 2 }, { n: 'ApprovalRules', k: 3, ml: true },
    { n: 'LayerConfig', k: 3, ml: true },
  ]},
  [OSHES_LISTS.approvers]: { t: 100, desc: 'OSHES approver layers per form', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'LayerNumber', k: 9 },
    { n: 'ApproverEmail', k: 2 }, { n: 'ApproverName', k: 2 },
  ]},
  [OSHES_LISTS.versions]: { t: 100, desc: 'Published OSHES form version metadata', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'FormSlug', k: 2 },
    { n: 'FormVersion', k: 2 }, { n: 'SurveyJSON', k: 3, ml: true },
    { n: 'PublishedBy', k: 2 }, { n: 'PublishedAt', k: 4 },
  ]},
  [OSHES_LISTS.builderLog]: { t: 100, desc: 'OSHES form builder audit log', cols: [
    { n: 'FormTitle', k: 2 }, { n: 'EventType', k: 2 },
    { n: 'ChangedBy', k: 2 }, { n: 'EventSummary', k: 3, ml: true },
    { n: 'BeforeJSON', k: 3, ml: true }, { n: 'AfterJSON', k: 3, ml: true },
    { n: 'EventAt', k: 4 },
  ]},
  [OSHES_LISTS.dashboardSettings]: { t: 100, desc: 'Shared OSHES dashboard settings', cols: [
    { n: 'BackgroundId', k: 2 }, { n: 'CustomImageUrl', k: 3, ml: true },
    { n: 'CustomImageSource', k: 3, ml: true }, { n: 'ImageOpacity', k: 9 },
    // The appearance axes. Created from the browser on the signed-in admin's
    // delegated token, which carries AllSites.Manage — the serverless API holds
    // only the `write` role and is refused when it tries the same thing.
    { n: 'ColorTheme', k: 2 }, { n: 'ContrastTheme', k: 2 }, { n: 'FontTheme', k: 2 },
    { n: 'UpdatedBy', k: 2 }, { n: 'UpdatedAt', k: 4 },
  ]},
};

async function ensureListExists(token: string, listTitle: string): Promise<void> {
  const schema = LIST_SCHEMAS[listTitle];
  if (!schema) {
    await ensureSpList(token, listTitle);
    return;
  }
  await ensureListSchema(token, {
    title: listTitle,
    baseTemplate: schema.t,
    description: schema.desc,
    columns: schema.cols,
  });
}

export async function ensureDashboardBackgroundSettingsList(token: string): Promise<void> {
  await ensureListExists(token, OSHES_LISTS.dashboardSettings);
}

// ── Get latest form by slug (from reference) ────────────────────────────────
export async function getLatestFormBySlug(token: string, slug: string, publishKey?: string | null): Promise<{
  formConfig: FormConfigData;
  surveyJson: unknown;
  meta: unknown;
} | null> {
  const selectWithProfile = 'Title,CurrentVersion,CurrentPublishKey,CurrentPublishLabel,FormID,NumberOfApprovalLayer,Slug,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig';
  const selectLegacy = 'Title,CurrentVersion,FormID,NumberOfApprovalLayer,Slug,IsPublished,IsPublic,ConditionField,ApprovalRules,LayerConfig';
  const itemsUrl = (select: string) =>
    `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Slug eq '${encodeURIComponent(sanitizeODataValue(slug))}'&$select=${select}&$top=1`;

  // CurrentPublishKey/Label only exist on sites the current builder has provisioned;
  // retry without them rather than failing the whole read on an older site.
  const data = await spGet(token, itemsUrl(selectWithProfile)).catch(async (error: unknown) => {
    if (!isQueryMismatchError(error)) throw error;
    return spGet(token, itemsUrl(selectLegacy));
  }) as { value?: FormConfigData[] };

  const form = data.value?.[0];
  if (!form) return null;
  if (!form.IsPublished) return null;

  const resolvedPublishKey = publishKey || (form as { CurrentPublishKey?: string }).CurrentPublishKey || DEFAULT_PUBLISH_KEY;
  const versionData = await getFormVersion(token, form.Title, form.CurrentVersion || '1.0', resolvedPublishKey);
  if (versionData && (versionData.publishStatus === 'off' || isPublishExpired(versionData.publishExpiresAt))) return null;

  return {
    formConfig: form,
    surveyJson: versionData?.surveyJson || null,
    meta: versionData?.meta || {},
  };
}

// ── Matrix Child Lists ────────────────────────────────────────────────────

/** Column definition for a dynamicmatrix child list — mirrors DynamicMatrix.tsx MatrixColumn */
export interface MatrixColumnDef {
  name: string;
  title: string;
  cellType?: string;
  choices?: string[];
  multiSelect?: boolean;
}

export interface MatrixChildParentSnapshot {
  formTitle?: string;
  formVersion?: string;
  submittedAt?: string;
  submittedBy?: string;
}

const ENHANCED_LAYER_COLUMNS: SpColumnSpec[] = [
  { n: 'EvaluationData', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowAssignmentData', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowEmailLog', k: SP_FIELD_KIND.note, ml: true },
  { n: 'WorkflowEmailSchedule', k: SP_FIELD_KIND.note, ml: true },
  { n: 'CurrentLayer', k: SP_FIELD_KIND.number },
  { n: 'FormStatus', k: SP_FIELD_KIND.text },
];

function dedupeColumnSpecs(columns: SpColumnSpec[]): SpColumnSpec[] {
  const seen = new Set<string>();
  const deduped: SpColumnSpec[] = [];
  for (const column of columns) {
    const key = normalizeColumnName(column.n);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(column);
  }
  return deduped;
}

function layerColumnSpecs(layerCount: number): SpColumnSpec[] {
  const specs: SpColumnSpec[] = [];
  for (let n = 1; n <= layerCount; n++) {
    specs.push(
      { n: `L${n}_Status`, k: 2 },
      { n: `L${n}_Email`, k: 2 },
      { n: `L${n}_SignedAt`, k: 4 },
      { n: `L${n}_Rejection`, k: 3, ml: true },
      { n: `L${n}_Signature`, k: 3, ml: true },
    );
  }
  return specs;
}

function matrixColumnSpec(col: MatrixColumnDef): SpColumnSpec {
  switch (col.cellType || 'text') {
    case 'dropdown':
      return { n: col.name, k: 6, choices: col.choices };
    case 'date':
      return { n: col.name, k: 4 };
    case 'number':
      return { n: col.name, k: 9 };
    case 'checkbox':
      return { n: col.name, k: 15, choices: col.choices };
    case 'boolean':
      return { n: col.name, k: 8 };
    case 'text':
    default:
      return { n: col.name, k: 2 };
  }
}

/** Ensure workflow columns exist before branch selection or layer actions. */
export async function ensureWorkflowColumns(
  token: string,
  listTitle: string,
  layerCount: number,
): Promise<EnsureColumnsResult> {
  const count = Math.max(layerCount, 1);
  const result = await ensureColumns(token, listTitle, dedupeColumnSpecs([
    SELECTED_BRANCH_COLUMN_SPEC,
    ...ENHANCED_LAYER_COLUMNS,
    ...layerColumnSpecs(count),
  ]));
  await ensureIndexedColumns(token, listTitle, ['SelectedBranch', 'CurrentLayer', 'FormStatus']);
  return result;
}

function logEnsuredColumns(
  columns: SpColumnSpec[],
  result: EnsureColumnsResult,
  onLog: (msg: string, type: string) => void,
): void {
  const created = new Set(result.created);
  for (const column of columns) {
    const status = created.has(column.n) ? 'created' : 'exists';
    const suffix = column.label ? ` (${column.label})` : '';
    onLog(`  ${status}: ${column.n}${suffix}`, 'ok');
  }
}

/**
 * Ensures a child list exists for a dynamicmatrix/tableinput field.
 * List name: "{formTitle} Matrix {fieldName}" (sanitized).
 * Creates ParentResponseId (Number), RowIndex (Number), and per-column fields.
 * Returns { listName, listId } or null on failure.
 */
export async function ensureMatrixChildList(
  token: string,
  formTitle: string,
  fieldName: string,
  columns: MatrixColumnDef[],
  onLog: (msg: string, type: string) => void = () => {}
): Promise<{ listName: string; listId: string } | null> {
  // Sanitize field name for SP list title (remove chars that break URL encoding)
  const safeName = fieldName.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
  const listName = `${formTitle} Matrix ${safeName}`;
  const columnSpecs = dedupeColumnSpecs([
    { n: 'ParentResponseId', k: 9 },
    { n: 'RowIndex', k: 9 },
    { n: 'ParentFormTitle', k: SP_FIELD_KIND.text },
    { n: 'ParentFormVersion', k: SP_FIELD_KIND.text },
    { n: 'ParentSubmittedAt', k: SP_FIELD_KIND.dateTime },
    { n: 'ParentSubmittedBy', k: SP_FIELD_KIND.text },
    ...columns.filter((col) => col.name).map(matrixColumnSpec),
  ]);

  onLog(`  Matrix child list "${listName}"…`, 'info');

  if (await listExists(token, listName)) {
    onLog(`    List exists`, 'ok');
  } else {
    await createSpList(token, listName, 100, `Matrix rows for ${formTitle} - ${fieldName}`);
    onLog(`    Created list`, 'ok');
  }

  const ensured = await ensureColumns(token, listName, columnSpecs);
  logEnsuredColumns(columnSpecs, ensured, onLog);
  await ensureIndexedColumns(token, listName, [
    'ParentResponseId',
    'ParentFormTitle',
    'ParentFormVersion',
    'ParentSubmittedAt',
    'ParentSubmittedBy',
  ], onLog);

  // Fetch list ID
  try {
    const listData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')?$select=Id`) as { Id?: string };
    return { listName, listId: listData.Id || '' };
  } catch {
    return null;
  }
}

/**
 * Writes dynamicmatrix rows as items in a child list.
 * Each row becomes one SP item with ParentResponseId + RowIndex + column values.
 * Returns array of created item IDs.
 */
export async function writeMatrixChildItems(
  token: string,
  listName: string,
  parentResponseId: number,
  rows: Record<string, unknown>[],
  columns: MatrixColumnDef[],
  parentSnapshot: MatrixChildParentSnapshot = {},
): Promise<number[]> {
  const createdIds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const body: Record<string, unknown> = {
      ParentResponseId: parentResponseId,
      RowIndex: i,
    };
    if (parentSnapshot.formTitle) body.ParentFormTitle = parentSnapshot.formTitle;
    if (parentSnapshot.formVersion) body.ParentFormVersion = parentSnapshot.formVersion;
    if (parentSnapshot.submittedAt) body.ParentSubmittedAt = parentSnapshot.submittedAt;
    if (parentSnapshot.submittedBy) body.ParentSubmittedBy = parentSnapshot.submittedBy;

    // Map row values to column names
    for (const col of columns) {
      if (!col.name) continue;
      body[col.name] = row[col.name] ?? null;
    }

    const result = await spPost(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items`,
      body
    ) as { Id?: number };

    if (result.Id != null) {
      createdIds.push(result.Id);
    }
  }

  return createdIds;
}

/**
 * Reads all child list rows for a given parent response item.
 * Returns rows sorted by RowIndex ascending.
 */
export async function readMatrixChildItems(
  token: string,
  listName: string,
  parentResponseId: number
): Promise<Record<string, unknown>[]> {
  const data = await spGet(
    token,
    `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?$filter=ParentResponseId eq ${parentResponseId}&$orderby=RowIndex asc`
  ) as { value?: Record<string, unknown>[] };

  return data.value || [];
}

// ── Response List Provisioning ────────────────────────────────────────────

// ── Dynamic Matrix → HTML Serialization ────────────────────────────────────

/**
 * Converts a dynamicmatrix response to HTML table for SP storage.
 */
export function dynamicMatrixToHtml(
  rows: unknown,
  questionDef: unknown
): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<em>No rows</em>';
  }

  const qDef = questionDef as { columns?: { title?: string; name?: string }[] };
  const columns = qDef.columns || [];

  // Header
  const headers = ['#', ...columns.map((c) => c.title || c.name)];
  const headerHtml = headers
    .map(
      (h) =>
        `<th style="border:1px solid #ccc;padding:8px;background:#f0f0f0;text-align:left">${escapeHtml(String(h))}</th>`
    )
    .join('');

  // Rows
  const bodyHtml = rows
    .map((row: unknown, i: number) => {
      const r = row as Record<string, unknown>;
      const cells = [
        i + 1,
        ...columns.map((c) => {
          const v = r[c.name ?? ''];
          if (Array.isArray(v)) return v.join(', ');
          return v ?? '';
        }),
      ];
      return `<tr>${cells
        .map(
          (c) =>
            `<td style="border:1px solid #ccc;padding:8px;vertical-align:top">${escapeHtml(String(c))}</td>`
        )
        .join('')}</tr>`;
    })
    .join('');

  return `<table style="border-collapse:collapse;width:100%;font-family:Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif;font-size:13px">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>`;
}

// ── Email Notifications via SharePoint ─────────────────────────────────────

interface EmailParams {
  to: string | string[];
  subject: string;
  body: string;
  workflow?: {
    listTitle: string;
    responseItemId: number;
    layer: number;
  };
}

/**
 * Sends email via SharePoint REST API (_api/SP.Utilities.Utility.SendEmail)
 */
export async function sendSpEmail(_token: string, { to, subject, body, workflow }: EmailParams): Promise<void> {
  // ⚠ SharePoint's SendEmail API has been retired (Sep 2024).
  // All emails are now sent via the /api/send-email API route using Microsoft Graph's sendMail.
  const apiUrl = `${window.location.origin}/api/send-email`;

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'X-Api-Key': API_KEY } : {}),
    },
    body: JSON.stringify({ to, subject, body, workflow }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`sendSpEmail failed ${response.status}: ${err.error || response.statusText}`);
  }
}

// ── Approval Notification Triggers ─────────────────────────────────────────

interface ApprovalNotificationParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: number;
  layer: number;
  totalLayers: number;
  action?: 'submit' | 'approve' | 'reject';
  /** One address, or every address on a shared layer that nobody has claimed. */
  nextApproverEmail?: string | string[];
  nextLayerType?: 'approval' | 'evaluation';
  nextLayerNumber?: number;
  /** How the next layer is reached — a public step's link is meant to be forwarded on. */
  nextLayerAuthMode?: '365' | 'public';
  reviewLink?: string;
  pdfUrl?: string;
  responseListTitle?: string;
  throwOnEmailError?: boolean;
  nextEmailSchedule?: EvaluationEmailSchedule;
}

// ── Styled email HTML template ────────────────────────────────────────────

const SP_ORIGIN = (() => { try { return new URL(SP_SITE_URL).origin; } catch { return ''; } })();

function absolutePdfUrl(pdfUrl: string): string {
  return pdfUrl.startsWith('http') ? pdfUrl : `${SP_ORIGIN}${pdfUrl}`;
}

/**
 * Mail clients strip scripts, so the email cannot put anything on the clipboard
 * itself. The copy button points at this page instead, which holds the review
 * link and does the clipboard write on click.
 */
export function buildShareLinkUrl(reviewLink: string): string {
  return `${window.location.origin}/share-link?u=${encodeURIComponent(reviewLink)}`;
}

interface EmailDetail {
  label: string;
  value: string | number;
}

/**
 * Reads the submission's reference so every workflow email can quote it.
 *
 * Fetched here rather than threaded through each caller: the reference is a
 * property of the stored item, and reading it once at send time cannot drift
 * out of step with what the record actually says.
 */
async function getReferenceNoForNotification(
  token: string,
  responseListTitle: string,
  responseItemId: number,
): Promise<string> {
  try {
    const item = await spGet(
      token,
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${responseItemId})?$select=${REFERENCE_NO_FIELD}`,
    ) as Record<string, unknown>;
    return String(item[REFERENCE_NO_FIELD] || "").trim();
  } catch {
    // A list without the column, or an unreadable item, simply means no
    // reference line — never a failed notification.
    return "";
  }
}

function formatEmailTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const formatted = parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
  return `${formatted} (MYT)`;
}

const EMAIL_FONT_STACK = "Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif";
const EMAIL_MONO_STACK = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/**
 * Shared shell for every workflow email. Table-based and inline-styled because
 * Outlook ignores most of anything else; the `@media` block only has to sharpen
 * what already reads acceptably at 600px.
 */
function emailBody(params: {
  title: string;
  subtitle: string;
  preheader: string;
  statusColor: string;
  statusLabel: string;
  statusBg: string;
  statusBorder: string;
  details: EmailDetail[];
  progress?: { current: number; total: number };
  instructions?: string[];
  link?: string;
  linkLabel?: string;
  /** Renders the copy-link card a public step needs before its button. */
  shareLink?: { url: string; href: string };
  secondaryLink?: { href: string; label: string };
  pdfUrl?: string;
  note?: string;
}): string {
  const detailsRows = params.details
    .filter((detail) => String(detail.value).trim())
    .map((detail) => `<tr>
      <td class="stack" style="padding:10px 0 0;font-size:12px;line-height:18px;color:#6B7280;width:150px;vertical-align:top">${escapeHtml(detail.label)}</td>
      <td class="stack" style="padding:10px 0;font-size:14px;line-height:20px;color:#111827;font-weight:600;vertical-align:top;word-break:break-word">${escapeHtml(String(detail.value))}</td>
    </tr>`)
    .join('');

  const progressHtml = params.progress && params.progress.total > 1 && params.progress.total <= 12
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${
      Array.from({ length: params.progress.total }, (_, index) => {
        const done = index + 1 <= params.progress!.current;
        return `<td style="padding-right:${index + 1 === params.progress!.total ? 0 : 4}px"><div style="height:6px;border-radius:999px;background:${done ? '#0078D4' : '#E1E8F0'};font-size:0;line-height:0">&nbsp;</div></td>`;
      }).join('')
    }</tr></table>`
    : '';

  const instructionsHtml = params.instructions?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;background:#F7FAFF;border:1px solid #E1E8F0;border-radius:12px">
      <tr><td style="padding:18px 20px 6px;font-size:12px;line-height:16px;font-weight:800;color:#0B4A80;text-transform:uppercase;letter-spacing:0.06em">What you need to do</td></tr>
      <tr><td style="padding:0 20px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${params.instructions.map((step, index) => `<tr>
            <td style="padding:8px 10px 0 0;width:24px;vertical-align:top"><div style="width:22px;height:22px;border-radius:999px;background:#0078D4;color:#FFFFFF;font-size:12px;line-height:22px;font-weight:800;text-align:center">${index + 1}</div></td>
            <td style="padding:8px 0 0;font-size:14px;line-height:21px;color:#243B53">${escapeHtml(step)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>`
    : '';

  const shareHtml = params.shareLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0">
      <tr><td style="padding:0 0 8px;font-size:12px;line-height:16px;font-weight:800;color:#0B4A80;text-transform:uppercase;letter-spacing:0.06em">Shareable review link</td></tr>
      <tr><td style="padding:14px 16px;background:#F1F7FE;border:1px dashed #A9CDF0;border-radius:12px">
        <a href="${escapeHtml(params.shareLink.url)}" style="font-family:${EMAIL_MONO_STACK};font-size:12px;line-height:19px;color:#0B4A80;text-decoration:none;word-break:break-all">${escapeHtml(params.shareLink.url)}</a>
      </td></tr>
    </table>`
    : '';

  const primaryHref = params.shareLink?.href || params.link;
  const primaryHtml = primaryHref
    ? `<tr><td align="center" style="padding:22px 0 0">
        <a class="btn" href="${escapeHtml(primaryHref)}" style="display:inline-block;background:#0078D4;color:#FFFFFF;padding:14px 30px;border-radius:10px;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;box-shadow:0 2px 6px rgba(0,120,212,0.28)">${escapeHtml(params.shareLink ? 'Copy review link' : (params.linkLabel || 'Open request'))}</a>
      </td></tr>`
    : '';
  const secondaryHtml = params.secondaryLink
    ? `<tr><td align="center" style="padding:12px 0 0;font-size:13px;line-height:19px;color:#6B7280">
        <a href="${escapeHtml(params.secondaryLink.href)}" style="color:#0078D4;text-decoration:underline;font-weight:600">${escapeHtml(params.secondaryLink.label)}</a>
      </td></tr>`
    : '';
  const pdfHtml = params.pdfUrl
    ? `<tr><td align="center" style="padding:12px 0 0">
        <a href="${escapeHtml(absolutePdfUrl(params.pdfUrl))}" style="display:inline-block;background:#FFFFFF;color:#0078D4;padding:11px 22px;border-radius:10px;text-decoration:none;font-size:13px;line-height:18px;font-weight:700;border:1px solid #B4D5F0">View PDF record</a>
      </td></tr>`
    : '';
  const noteHtml = params.note
    ? `<tr><td style="padding:22px 0 0;font-size:12px;line-height:19px;color:#6B7280">${escapeHtml(params.note)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(params.title)}</title>
<style>
  @media only screen and (max-width:600px) {
    .shell { padding:16px 10px !important; }
    .pad { padding:22px 20px !important; }
    .title { font-size:20px !important; line-height:27px !important; }
    .stack { display:block !important; width:100% !important; padding-bottom:0 !important; }
    .btn { display:block !important; width:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F3F6FA;font-family:${EMAIL_FONT_STACK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6FA">
  <tr>
    <td class="shell" align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(17,24,39,0.06),0 12px 32px rgba(17,24,39,0.08)">
        <tr><td style="height:4px;background:${params.statusColor};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td class="pad" style="padding:22px 28px;background:#FFFFFF;border-bottom:1px solid #E5EAF1">
            <div style="font-size:12px;line-height:16px;color:#0B4A80;font-weight:800;text-transform:uppercase;letter-spacing:0.08em">PMW OSHES Form</div>
            <div style="margin-top:4px;font-size:13px;line-height:18px;color:#6B7280">Automated workflow notification</div>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:28px">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;background:${params.statusBg};border:1px solid ${params.statusBorder};border-radius:999px">
              <tr><td style="padding:6px 12px;font-size:11px;line-height:14px;font-weight:800;color:${params.statusColor};text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(params.statusLabel)}</td></tr>
            </table>
            <h1 class="title" style="margin:0 0 8px;font-size:23px;line-height:30px;color:#111827;font-weight:750">${escapeHtml(params.title)}</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#4B5563">${escapeHtml(params.subtitle)}</p>
            ${progressHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5EAF1;border-bottom:1px solid #E5EAF1">
              ${detailsRows}
            </table>
            ${instructionsHtml}
            ${shareHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${primaryHtml}
              ${secondaryHtml}
              ${pdfHtml}
              ${noteHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E5EAF1;font-size:12px;line-height:18px;color:#6B7280">
            This is an automated notification. Attachments, comments and the full audit history stay in PMW OSHES Forms.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body></html>`;
}

/**
 * Triggers email notifications for approval workflow.
 * Handles: new submission, layer approved, final approval, rejection.
 */
export async function triggerApprovalNotification(
  token: string,
  params: ApprovalNotificationParams
): Promise<void> {
  const { formTitle, submittedBy, responseItemId, layer, totalLayers, action = 'submit', nextApproverEmail, nextLayerType = 'approval', nextLayerNumber, nextLayerAuthMode, reviewLink, pdfUrl, responseListTitle = formTitle, throwOnEmailError = false, nextEmailSchedule } = params;
  const nextActionNoun = nextLayerType === 'evaluation' ? 'evaluation review' : 'approval';
  const nextActionVerb = nextLayerType === 'evaluation' ? 'review' : 'approve';
  const displayNextLayerNumber = nextLayerNumber ?? layer + 1;
  const workflowStage = `Layer ${displayNextLayerNumber} of ${totalLayers}`;
  const submissionId = `#${responseItemId}`;
  const referenceNo = await getReferenceNoForNotification(token, responseListTitle, responseItemId);
  const refSuffix = referenceNo ? ` [${referenceNo}]` : "";
  // Blank detail values are dropped by emailBody, so this row simply disappears
  // on forms that do not issue references.
  const referenceDetail: EmailDetail = { label: "Reference no.", value: referenceNo };
  const requestLink = reviewLink || `${window.location.origin}/admin/submissions?form=${encodeURIComponent(formTitle)}&item=${responseItemId}`;
  const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  // Only a fresh submission knows when it was submitted; a later layer's email
  // leaves the row out rather than showing the hand-off time as a submit time.
  const submittedAtIso = action === 'submit' ? new Date().toISOString() : '';
  const submittedOn = submittedAtIso ? formatEmailTimestamp(submittedAtIso) : '';
  const isPublicStep = nextLayerAuthMode === 'public';
  const openLabel = nextLayerType === 'evaluation' ? 'Open evaluation' : 'Open approval';
  // A public step is usually addressed to a shared mailbox whose watchers are
  // not the ones who sign — the link opens without an account so it can be
  // passed on. Saying so stops it being treated as the reader's own task.
  const actionNote = isPublicStep
    ? 'Anyone holding this link can complete the step, so share it only with the person who should sign.'
    : 'Only the assigned reviewer or an authorized superuser should act on this workflow step.';
  // A public step leads with the link and a copy button; a 365 step leads with a
  // single centred call to action.
  const actionBlock = (stepLayer: number) => (isPublicStep
    ? {
      shareLink: { url: requestLink, href: buildShareLinkUrl(requestLink) },
      secondaryLink: { href: requestLink, label: `${openLabel} myself` },
      instructions: [
        'Copy the review link below — use the "Copy review link" button if you would rather not select it by hand.',
        `Send the link to whoever must ${nextActionVerb} this submission. It opens without a sign-in, so they do not need a PMW OSHES account.`,
        `They review the submission and record the decision. Whoever completes it is recorded against Layer ${stepLayer}, and the workflow then moves on by itself.`,
      ],
    }
    : {
      link: requestLink,
      linkLabel: openLabel,
      instructions: [
        `Open the ${nextLayerType === 'evaluation' ? 'evaluation' : 'approval'} with the button below and sign in with your PMW OSHES account.`,
        'Check the submission details, earlier layers’ decisions and any attachments.',
        `Record your decision. Layer ${stepLayer} of ${totalLayers} closes and the workflow moves to the next step automatically.`,
      ],
    });
  // A shared layer is addressed to everyone named on it until one of them claims it.
  const nextApproverEmails = (Array.isArray(nextApproverEmail) ? nextApproverEmail : [nextApproverEmail ?? ''])
    .map((entry) => (entry ?? '').trim())
    .filter(Boolean);
  // The schedule log keeps one recipient string; the cron splits it again on send.
  const persistSchedule = async (recipients: string[], targetLayer: number, targetLink: string) => {
    const recipient = recipients.join('; ');
    await ensureWorkflowColumns(token, responseListTitle, totalLayers);
    const itemUrl = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(responseListTitle)}')/items(${responseItemId})`;
    const item = await spGet(token, `${itemUrl}?$select=WorkflowEmailSchedule`) as { WorkflowEmailSchedule?: string };
    const now = new Date();
    const schedule = setScheduledWorkflowEmail(item.WorkflowEmailSchedule, {
      layer: targetLayer,
      recipient,
      dueAt: resolveEvaluationEmailDueAt(nextLayerType === "evaluation" ? nextEmailSchedule : undefined, now),
      status: "scheduled",
      updatedAt: now.toISOString(),
      layerType: nextLayerType,
      totalLayers,
      reviewLink: targetLink,
      submittedBy,
      authMode: isPublicStep ? 'public' : '365',
      ...(submittedAtIso ? { submittedAt: submittedAtIso } : {}),
    });
    await spPatch(token, itemUrl, { WorkflowEmailSchedule: JSON.stringify(schedule) });
  };

  try {
    if (action === 'submit') {
      // New submission — prefer the caller's resolved layer email, then fall back to the legacy Approvers list.
      let targetEmails = nextApproverEmails;
      if (targetEmails.length === 0) {
        try {
          const approvers = await spGet(
            token,
            `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(OSHES_LISTS.approvers)}')/items?$filter=FormTitle eq '${encodeURIComponent(sanitizeODataValue(formTitle))}' and LayerNumber eq ${layer}&$select=ApproverEmail,ApproverName&$top=1`
          ) as { value?: { ApproverEmail?: string; ApproverName?: string }[] };
          targetEmails = [approvers.value?.[0]?.ApproverEmail || ''].filter(Boolean);
        } catch {
          targetEmails = [];
        }
      }

      if (targetEmails.length > 0) {
        await persistSchedule(targetEmails, layer, requestLink);
        if (nextLayerType === "evaluation" && nextEmailSchedule && nextEmailSchedule.mode !== "immediate") {
          return;
        }
        await sendSpEmail(token, {
          to: targetEmails,
          subject: `Action required: ${formTitle} needs your ${nextActionNoun}${refSuffix}`,
          workflow: {
            listTitle: responseListTitle,
            responseItemId,
            layer,
          },
          body: emailBody({
            title: isPublicStep
              ? `${formTitle} needs an ${nextActionNoun}`
              : `${formTitle} needs your ${nextActionNoun}`,
            subtitle: isPublicStep
              ? 'This step is reached through a link that anyone can open, so it can be passed to the right person.'
              : `A new submission is waiting for you to ${nextActionVerb} it.`,
            preheader: isPublicStep
              ? `${formTitle} ${submissionId} needs its ${nextActionNoun} link passed on.`
              : `${formTitle} ${submissionId} is waiting for ${nextActionNoun}.`,
            statusColor: '#1E40AF',
            statusLabel: 'Action required',
            statusBg: '#EFF6FF',
            statusBorder: '#BFDBFE',
            progress: { current: layer, total: totalLayers },
            details: [
              referenceDetail,
              { label: 'Form', value: formTitle },
              { label: 'Submission ID', value: submissionId },
              { label: 'Submitted by', value: submittedBy },
              { label: 'Submitted on', value: submittedOn },
              { label: 'Workflow stage', value: `Layer ${layer} of ${totalLayers}` },
              { label: 'Step type', value: nextLayerType === 'evaluation' ? 'Evaluation' : 'Approval' },
              { label: 'Action needed', value: nextLayerType === 'evaluation' ? 'Complete the evaluation' : 'Approve or reject' },
              { label: 'Current status', value: 'Submitted' },
              { label: 'Access', value: isPublicStep ? 'Public link — no sign-in needed' : 'PMW OSHES account sign-in' },
            ],
            ...actionBlock(layer),
            note: actionNote,
          }),
        });
      }
    } else if (action === 'approve') {
      if (layer < totalLayers && nextApproverEmails.length > 0) {
        // Notify next layer approver
        await persistSchedule(nextApproverEmails, displayNextLayerNumber, requestLink);
        if (nextLayerType === "evaluation" && nextEmailSchedule && nextEmailSchedule.mode !== "immediate") {
          return;
        }
        await sendSpEmail(token, {
          to: nextApproverEmails,
          subject: `Action required: ${formTitle} is ready for your ${nextActionNoun}${refSuffix}`,
          workflow: {
            listTitle: responseListTitle,
            responseItemId,
            layer: displayNextLayerNumber,
          },
          body: emailBody({
            title: isPublicStep
              ? `${formTitle} is ready for its ${nextActionNoun}`
              : `${formTitle} is ready for your ${nextActionNoun}`,
            subtitle: isPublicStep
              ? `Layer ${layer} is done. The next step is reached through a link that anyone can open, so it can be passed to the right person.`
              : `The previous workflow step has been completed. This request now needs you to ${nextActionVerb} Layer ${displayNextLayerNumber}.`,
            preheader: `${formTitle} ${submissionId} has advanced to ${workflowStage}.`,
            statusColor: '#92400E',
            statusLabel: nextLayerType === 'evaluation' ? 'Pending review' : 'Pending approval',
            statusBg: '#FFFBEB',
            statusBorder: '#FDE68A',
            progress: { current: displayNextLayerNumber, total: totalLayers },
            details: [
              referenceDetail,
              { label: 'Form', value: formTitle },
              { label: 'Submission ID', value: submissionId },
              { label: 'Submitted by', value: submittedBy },
              { label: 'Completed step', value: `Layer ${layer} of ${totalLayers}` },
              { label: 'Current step', value: workflowStage },
              { label: 'Step type', value: nextLayerType === 'evaluation' ? 'Evaluation' : 'Approval' },
              { label: 'Action needed', value: nextLayerType === 'evaluation' ? 'Complete the evaluation' : 'Approve or reject' },
              { label: 'Access', value: isPublicStep ? 'Public link — no sign-in needed' : 'PMW OSHES account sign-in' },
            ],
            ...actionBlock(displayNextLayerNumber),
            pdfUrl,
            note: actionNote,
          }),
        });
      } else if (layer === totalLayers && isEmailAddress(submittedBy)) {
        // Final approval - notify submitter
        await sendSpEmail(token, {
          to: submittedBy,
          subject: `Status update: ${formTitle} approved${refSuffix}`,
          body: emailBody({
            title: `${formTitle} has been approved`,
            subtitle: 'All required workflow steps have been completed. No further action is needed from you at this time.',
            preheader: `${formTitle} ${submissionId} has been approved.`,
            statusColor: '#065F46',
            statusLabel: 'Approved',
            statusBg: '#ECFDF5',
            statusBorder: '#A7F3D0',
            details: [
              referenceDetail,
              { label: 'Form', value: formTitle },
              { label: 'Submission ID', value: submissionId },
              { label: 'Final status', value: 'Approved' },
              { label: 'Completed layers', value: totalLayers },
            ],
            pdfUrl,
            note: 'Keep the PDF record for reference if your department process requires it.',
          }),
        });
      }
    } else if (action === 'reject' && isEmailAddress(submittedBy)) {
      // Notify submitter of rejection
      await sendSpEmail(token, {
        to: submittedBy,
        subject: `Status update: ${formTitle} not approved${refSuffix}`,
        body: emailBody({
          title: `${formTitle} was not approved`,
          subtitle: 'The workflow has been closed at the current step. Open the request record to review the outcome details and any recorded reason.',
          preheader: `${formTitle} ${submissionId} was not approved.`,
          statusColor: '#991B1B',
          statusLabel: 'Not approved',
          statusBg: '#FEF2F2',
          statusBorder: '#FECACA',
          details: [
            referenceDetail,
            { label: 'Form', value: formTitle },
            { label: 'Submission ID', value: submissionId },
            { label: 'Final status', value: 'Not approved' },
            { label: 'Closed at', value: `Layer ${layer} of ${totalLayers}` },
          ],
          pdfUrl,
          note: 'Contact the reviewing department if you need clarification before submitting a new request.',
        }),
      });
    }
  } catch (error) {
    if (throwOnEmailError) throw error;
    // Don't throw - email failures shouldn't block the workflow
  }
}

/**
 * Fetches a response item and parses the data needed for a specific layer's evaluation/approval view.
 * Returns the response item fields, layer config, and previous layer results.
 */
export async function getLayerResponseData(
  token: string,
  formTitle: string,
  responseItemId: number,
  layerNumber: number
): Promise<{
  responseFields: Record<string, unknown>;
  layerConfig: LayerConfigItem[];
  currentLayer: LayerConfigItem | undefined;
  previousResults: Record<string, unknown>[];
  evaluationData: Record<string, unknown>;
} | null> {
  try {
    // Fetch the response item
    const item = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(formTitle)}')/items(${responseItemId})`) as Record<string, unknown>;

    // Fetch form config for layer info
    const configData = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('Master%20Form')/items?$filter=Title eq '${encodeURIComponent(sanitizeODataValue(formTitle.replace(/ Responses$/, "")))}'&$select=LayerConfig&$top=1`) as { value?: Record<string, unknown>[] };
    const rawLayerConfig = configData?.value?.[0]?.LayerConfig as string | undefined;
    let layerConfig: LayerConfigItem[] = [];
    if (rawLayerConfig) {
      try {
        const parsed = JSON.parse(rawLayerConfig);
        const selectedBranch = typeof item.SelectedBranch === 'string' ? item.SelectedBranch.trim().toLowerCase() : '';
        if (selectedBranch && Array.isArray(parsed.manualBranches)) {
          const branch = parsed.manualBranches.find((b: { name?: string; label?: string; layers?: LayerConfigItem[] }) =>
            [b.name, b.label].some((candidate) => typeof candidate === 'string' && candidate.trim().toLowerCase() === selectedBranch)
          );
          layerConfig = branch?.layers || parsed.layers || [];
        } else {
          layerConfig = parsed.layers || [];
        }
      } catch {}
    }

    const currentLayer = layerConfig.find((l: LayerConfigItem) => l.layerNumber === layerNumber);

    // Parse evaluation data
    let evaluationData: Record<string, unknown> = {};
    const rawEvalData = item.EvaluationData as string | undefined;
    if (rawEvalData) {
      try { evaluationData = JSON.parse(rawEvalData); } catch {}
    }

    // Build previous layer results
    const previousResults: Record<string, unknown>[] = [];
    for (let n = 1; n < layerNumber; n++) {
      const statusVal = item[`L${n}_Status`];
      const emailVal = item[`L${n}_Email`];
      const signedAtVal = item[`L${n}_SignedAt`];
      previousResults.push({
        layerNumber: n,
        status: statusVal,
        email: emailVal,
        signedAt: signedAtVal,
        evaluationData: evaluationData[n],
      });
    }

    return {
      responseFields: item,
      layerConfig,
      currentLayer,
      previousResults,
      evaluationData,
    };
  } catch {
    return null;
  }
}

/**
 * Appends evaluation results to the EvaluationData JSON column of a response item.
 * The column stores Record<layerNumber, EvaluationDataEntry> as a JSON string.
 */
export async function submitEvaluationData(
  token: string,
  listTitle: string,
  responseItemId: number,
  layerNumber: number,
  data: {
    confirmerEmail: string;
    confirmerName?: string;
    fields: Record<string, unknown>;
    notes?: string;
    signatureUrl?: string | null;
  }
): Promise<void> {
  // 1. Fetch current item
  const item = await spGet(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})?$select=Id,EvaluationData`);

  // 2. Parse existing data
  let allData: Record<number, EvaluationDataEntry> = {};
  const rawEvalData = (item as Record<string, unknown>).EvaluationData as string | undefined;
  if (rawEvalData && rawEvalData.trim()) {
    try { allData = JSON.parse(rawEvalData) as Record<number, EvaluationDataEntry>; } catch {}
  }

  // 3. Set/update this layer's entry
  allData[layerNumber] = {
    status: "confirmed" as LayerStatus,
    confirmerEmail: data.confirmerEmail,
    confirmerName: data.confirmerName ?? null,
    confirmedAt: new Date().toISOString(),
    fields: data.fields,
    notes: data.notes,
    signatureUrl: data.signatureUrl ?? null,
  };

  // 4. Update the item
  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
    EvaluationData: JSON.stringify(allData),
  });
}

/**
 * Updates a specific approval layer's status columns on a response item.
 * Patches L{n}_Status, L{n}_SignedAt, L{n}_Rejection, L{n}_Signature as needed.
 */
export async function updateLayerStatus(
  token: string,
  listTitle: string,
  responseItemId: number,
  layerNumber: number,
  updates: {
    status: string;
    email?: string;
    signedAt?: string;
    rejection?: string;
    signature?: string;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    [`L${layerNumber}_Status`]: updates.status,
  };
  if (updates.signedAt !== undefined) body[`L${layerNumber}_SignedAt`] = updates.signedAt;
  if (updates.rejection !== undefined) body[`L${layerNumber}_Rejection`] = updates.rejection;
  if (updates.signature !== undefined) body[`L${layerNumber}_Signature`] = updates.signature;
  if (updates.email !== undefined) body[`L${layerNumber}_Email`] = updates.email;

  await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, body);
}

// ── Signature Image Upload ─────────────────────────────────────────────
// Signatures are uploaded as PNG files to a "Signature Images" document
// library and linked via a URL/Hyperlink column in the response list.
//
// File naming: {action}-{formId}-{yymmdd}{xxx}.png
//   action  = "submission" | "approval" | "reject"
//   formId  = form identifier
//   yymmdd  = local date (2-digit year, 2-digit month, 2-digit day)
//   xxx     = daily counter starting at 001

const SIGNATURE_LIBRARY = "Signature Images";

/** Get the next daily counter by checking existing files for today */
async function getNextSignatureCounter(token: string, formId: string, action: string): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${action}-${formId}-${yy}${mm}${dd}`;

  try {
    // List files matching today's prefix
    const query = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(SIGNATURE_LIBRARY)}')/rootfolder/files?$select=Name&$filter=startswith(Name,'${encodeURIComponent(sanitizeODataValue(prefix))}')&$orderby=Name desc&$top=1`;
    const data = await spGet(token, query) as { value?: { Name?: string }[] };

    const lastName = data.value?.[0]?.Name;
    if (lastName) {
      const match = lastName.match(/^.+(\d{3})\.png$/);
      if (match) {
        return String(parseInt(match[1], 10) + 1).padStart(3, '0');
      }
    }
  } catch {
    // Library might not exist yet — start at 001
  }

  return '001';
}

/**
 * Upload a base64 signature image to the Signature Images document library.
 * Returns the server-relative URL to the uploaded file.
 */
export async function uploadSignatureImage(
  token: string,
  formId: string,
  action: "submission",
  base64DataUrl: string,
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const counter = await getNextSignatureCounter(token, formId, action);
  const fileName = `${action}-${formId}-${yy}${mm}${dd}${counter}.png`;

  await ensureDocumentLibrary(token, SIGNATURE_LIBRARY, "Signature image uploads");
  return uploadFileToDocLib(token, SIGNATURE_LIBRARY, fileName, base64DataUrl);
}

/**
 * Uploads a generated PDF to the Form PDFs document library and returns the server-relative URL.
 */
const PDF_LIBRARY = "Form PDFs";

export async function ensureFormPdfsLibrary(token: string): Promise<void> {
  await ensureDocumentLibrary(token, PDF_LIBRARY, "Generated form submission PDFs");
}

export async function uploadFormPdf(token: string, formTitle: string, responseId: number, pdfBlob: Blob): Promise<string> {
  await ensureFormPdfsLibrary(token);
  const fileName = `${formTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}_${responseId}_${new Date().toISOString().split("T")[0]}.pdf`;
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const sitePath = new URL(SP_SITE_URL).pathname;
  const result = await spUploadFile(token, PDF_LIBRARY, fileName, bytes) as { ServerRelativeUrl?: string };
  return result.ServerRelativeUrl ?? `${sitePath}/${PDF_LIBRARY}/${fileName}`;
}

export async function deleteFormPdf(token: string, pdfUrl: string): Promise<void> {
  if (!pdfUrl.trim()) return;
  let serverRelativeUrl = pdfUrl.trim();
  try {
    if (/^https?:\/\//i.test(serverRelativeUrl)) {
      serverRelativeUrl = new URL(serverRelativeUrl).pathname;
    }
    serverRelativeUrl = decodeURIComponent(serverRelativeUrl.split(/[?#]/)[0] ?? serverRelativeUrl);
  } catch {
    throw new Error("The existing PDF URL is invalid.");
  }
  if (!serverRelativeUrl.toLowerCase().includes(`/${PDF_LIBRARY.toLowerCase()}/`)) {
    throw new Error("Refusing to delete a file outside the Form PDFs library.");
  }
  const encodedPath = encodeURIComponent(sanitizeODataValue(serverRelativeUrl)).replace(/%2F/gi, "/");
  await spDelete(token, `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodedPath}')`);
}

// ── Document Library File Upload ────────────────────────────────────────

/**
 * Ensures a per-form document library exists for file uploads.
 * Creates `{formTitle} Files` if it doesn't already exist.
 * Returns the library name.
 */
export async function ensureDocLibrary(
  token: string,
  formTitle: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const libName = `${formTitle} Files`;
  return ensureDocumentLibrary(token, libName, `Uploaded files for ${formTitle}`, onLog);
}

/**
 * Uploads a base64-encoded file to a SharePoint document library.
 * Accepts raw base64 or a full data URI (data:mime;base64,...).
 * Returns the server-relative URL of the uploaded file.
 */
export async function uploadFileToDocLib(
  token: string,
  listName: string,
  fileName: string,
  base64Content: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  // Strip data URI prefix if present: data:mime;base64,<payload>
  let base64 = base64Content;
  const match = base64.match(/^data:[\w/+-]+;base64,(.+)$/);
  if (match) base64 = match[1];

  // Decode base64 → binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const sitePath = new URL(SP_SITE_URL).pathname;
  const result = await spUploadFile(token, listName, fileName, bytes) as { ServerRelativeUrl?: string };
  const url = result.ServerRelativeUrl ?? `${sitePath}/${listName}/${fileName}`;
  onLog?.(`Uploaded "${fileName}" to "${listName}"`);
  return url;
}
