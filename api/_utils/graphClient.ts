import { createHash, createSign, randomUUID, X509Certificate } from "node:crypto";
import forge from "node-forge";
import { OSHES_LISTS } from "./oshesConfig.js";

// Microsoft Graph client for serverless API (Sites.Selected compatible)
// Uses client credentials flow with Graph API scope

const TENANT_ID = process.env.VITE_AZURE_TENANT_ID || process.env.AZURE_TENANT_ID || "";
const CLIENT_ID = process.env.SYSTEM_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SYSTEM_CLIENT_SECRET || process.env.VITE_AZURE_CLIENT_SECRET || "";
const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
const SHAREPOINT_CERT_PFX_BASE64 = process.env.SHAREPOINT_CERT_PFX_BASE64 || "";
const SHAREPOINT_CERT_PASSWORD = process.env.SHAREPOINT_CERT_PASSWORD || "";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface CachedAccessToken {
  value: string;
  expiresAt: number;
}

let cachedGraphToken: CachedAccessToken | null = null;
let cachedSharePointToken: CachedAccessToken | null = null;

// Extract hostname and server-relative path from SP_SITE_URL
function parseSiteUrl(url: string): { hostname: string; path: string } {
  try {
    const u = new URL(url);
    return { hostname: u.hostname, path: u.pathname };
  } catch {
    throw new Error("Invalid SP_SITE_URL");
  }
}

// --- Token ---

function getClientConfig(target: string): { tenantId: string; clientId: string } {
  const missing: string[] = [];
  if (!TENANT_ID) missing.push("VITE_AZURE_TENANT_ID (or AZURE_TENANT_ID)");
  if (!CLIENT_ID) missing.push("SYSTEM_CLIENT_ID (or VITE_AZURE_CLIENT_ID)");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${target}: ${missing.join(", ")}. ` +
      `If you recently updated .env.local, restart the dev server (vercel dev) to pick up changes.`
    );
  }

  return { tenantId: TENANT_ID, clientId: CLIENT_ID };
}

function getClientSecretConfig(target: string): { tenantId: string; clientId: string; clientSecret: string } {
  const { tenantId, clientId } = getClientConfig(target);
  if (!CLIENT_SECRET) {
    throw new Error(
      `Missing required environment variables for ${target}: SYSTEM_CLIENT_SECRET (or VITE_AZURE_CLIENT_SECRET). ` +
      `If you recently updated .env.local, restart the dev server (vercel dev) to pick up changes.`
    );
  }

  return { tenantId, clientId, clientSecret: CLIENT_SECRET };
}

async function acquireClientCredentialsToken(scope: string, target: string): Promise<CachedAccessToken> {
  const { tenantId, clientId, clientSecret } = getClientSecretConfig(target);
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope,
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${target} token acquisition failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  return {
    value: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

interface SharePointCertificateMaterial {
  privateKeyPem: string;
  certificatePem: string;
}

function getBagsByType(p12: forge.pkcs12.Pkcs12Pfx, bagType: string): forge.pkcs12.Bag[] {
  return p12.getBags({ bagType })[bagType] ?? [];
}

function extractCertificateMaterialFromPfx(target: string): SharePointCertificateMaterial {
  if (!SHAREPOINT_CERT_PFX_BASE64 || !SHAREPOINT_CERT_PASSWORD) {
    const missing = [];
    if (!SHAREPOINT_CERT_PFX_BASE64) missing.push("SHAREPOINT_CERT_PFX_BASE64");
    if (!SHAREPOINT_CERT_PASSWORD) missing.push("SHAREPOINT_CERT_PASSWORD");
    throw new Error(
      `Missing required certificate environment variables for ${target}: ${missing.join(", ")}. ` +
      `If you recently updated Vercel env vars or .env.local, restart vercel dev or redeploy.`
    );
  }

  try {
    const der = forge.util.decode64(SHAREPOINT_CERT_PFX_BASE64.trim());
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, SHAREPOINT_CERT_PASSWORD);
    const keyBags = [
      ...getBagsByType(p12, forge.pki.oids.pkcs8ShroudedKeyBag),
      ...getBagsByType(p12, forge.pki.oids.keyBag),
    ];
    const certBags = getBagsByType(p12, forge.pki.oids.certBag);
    const privateKey = keyBags.find((bag) => bag.key)?.key;
    const certificate = certBags.find((bag) => bag.cert)?.cert;

    if (!privateKey || !certificate) {
      throw new Error("PFX did not contain both a private key and certificate.");
    }

    return {
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
      certificatePem: forge.pki.certificateToPem(certificate),
    };
  } catch (error) {
    throw new Error(
      `${target} certificate PFX could not be read. Check SHAREPOINT_CERT_PFX_BASE64 and SHAREPOINT_CERT_PASSWORD. ` +
      `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function getSharePointCertificateConfig(target: string): {
  tenantId: string;
  clientId: string;
  privateKeyPem: string;
  certificatePem: string;
} {
  const { tenantId, clientId } = getClientConfig(target);
  const { privateKeyPem, certificatePem } = extractCertificateMaterialFromPfx(target);

  return { tenantId, clientId, privateKeyPem, certificatePem };
}

function createClientCertificateAssertion(
  tokenUrl: string,
  clientId: string,
  privateKeyPem: string,
  certificatePem: string,
): string {
  const certificate = new X509Certificate(certificatePem);
  const thumbprint = base64UrlEncode(createHash("sha1").update(certificate.raw).digest());
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t: thumbprint,
  };
  const payload = {
    aud: tokenUrl,
    exp: now + 600,
    iss: clientId,
    jti: randomUUID(),
    nbf: now,
    sub: clientId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64UrlEncode(signer.sign(privateKeyPem))}`;
}

async function acquireCertificateClientCredentialsToken(scope: string, target: string): Promise<CachedAccessToken> {
  const { tenantId, clientId, privateKeyPem, certificatePem } = getSharePointCertificateConfig(target);
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: createClientCertificateAssertion(tokenUrl, clientId, privateKeyPem, certificatePem),
    scope,
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${target} certificate token acquisition failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  return {
    value: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };
}

export async function getGraphToken(): Promise<string> {
  if (cachedGraphToken && cachedGraphToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
    return cachedGraphToken.value;
  }

  cachedGraphToken = await acquireClientCredentialsToken("https://graph.microsoft.com/.default", "Graph API");
  return cachedGraphToken.value;
}

export async function getSharePointToken(): Promise<string> {
  if (cachedSharePointToken && cachedSharePointToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
    return cachedSharePointToken.value;
  }
  if (!SP_SITE_URL) throw new Error("SP_SITE_URL env var not set.");

  const origin = new URL(SP_SITE_URL).origin;
  cachedSharePointToken = await acquireCertificateClientCredentialsToken(`${origin}/.default`, "SharePoint REST API");
  return cachedSharePointToken.value;
}

// --- Site / List cache ---

let cachedSiteId: string | null = null;
const cachedListIds: Record<string, string> = {};

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const { hostname, path } = parseSiteUrl(SP_SITE_URL);
  const res = await fetch(`${GRAPH_BASE}/sites/${hostname}:${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph GET site ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  cachedSiteId = data.id;
  return data.id;
}

export async function getListId(token: string, displayName: string): Promise<string> {
  if (cachedListIds[displayName]) return cachedListIds[displayName];
  const siteId = await getSiteId(token);
  const filter = `$filter=displayName eq '${encodeURIComponent(displayName)}'`;
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists?${filter}&$select=id,displayName`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph GET lists ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { value: Array<{ id: string; displayName: string }> };
  const list = data.value?.[0];
  if (!list) throw new Error(`List "${displayName}" not found`);
  cachedListIds[displayName] = list.id;
  return list.id;
}

// --- Low-level Graph helpers ---

export async function graphGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${res.status}: ${text}`);
  }
  return res.json();
}

export async function graphPost(token: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph POST ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

// --- High-level helpers ---

export interface GraphListItem {
  id: string;
  fields: Record<string, unknown>;
}

export type GraphColumnType = "text" | "number" | "note" | "hyperlink" | "dateTime";

export interface GraphColumnSpec {
  name: string;
  displayName: string;
  type: GraphColumnType;
}

export function escapeGraphODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function graphFieldEquals(columnName: string, value: string): string {
  return `fields/${columnName} eq '${escapeGraphODataString(value)}'`;
}

export async function queryListItems(
  token: string,
  listDisplayName: string,
  options?: {
    filter?: string;
    top?: number;
    expand?: string;
    preferNonIndexed?: boolean;
  }
): Promise<GraphListItem[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  const params = new URLSearchParams();
  params.set("$select", "id");
  params.set("$expand", "fields");
  if (options?.top) params.set("$top", String(options.top));
  if (options?.filter) params.set("$filter", options.filter);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  // Allow filtering on non-indexed columns (e.g. ApplicantEmail)
  if (options?.preferNonIndexed) {
    headers["Prefer"] = "HonorNonIndexedQueriesWarningMayFailRandomly";
  }

  const res = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items?${params.toString()}`,
    { headers },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    value: Array<{ id: string; fields?: Record<string, unknown> }>;
  };

  return (data.value || []).map((item) => ({
    id: item.id,
    fields: item.fields || {},
  }));
}

export async function queryListItemByFields(
  token: string,
  listDisplayName: string,
  fields: Record<string, string>,
): Promise<GraphListItem | null> {
  const filters = Object.entries(fields).map(([columnName, value]) => graphFieldEquals(columnName, value));
  const items = await queryListItems(token, listDisplayName, {
    filter: filters.join(" and "),
    top: 1,
  });
  return items[0] ?? null;
}

export function queryMasterFormByTitle(token: string, title: string): Promise<GraphListItem | null> {
  return queryListItemByFields(token, OSHES_LISTS.masterForm, { Title: title });
}

export function queryMasterFormBySlug(token: string, slug: string): Promise<GraphListItem | null> {
  return queryListItemByFields(token, OSHES_LISTS.masterForm, { Slug: slug });
}

/**
 * Resolves one published version, optionally pinned to a publish profile.
 *
 * PublishKey is written by the pmw-hrform builder and may be absent on rows
 * published before it existed. When the caller asked for the default profile —
 * what a link with no ?publish= resolves to — fall back to the unkeyed lookup so
 * those older rows still resolve. A non-default profile has no such fallback:
 * silently serving production content under a different profile's link would be
 * worse than reporting nothing found.
 */
export function queryWebFormVersion(
  token: string,
  formTitle: string,
  formVersion: string,
  publishKey?: string,
): Promise<GraphListItem | null> {
  const unkeyed = () => queryListItemByFields(token, OSHES_LISTS.versions, {
    FormTitle: formTitle,
    FormVersion: formVersion,
  });
  if (publishKey) {
    return queryListItemByFields(token, OSHES_LISTS.versions, {
      FormTitle: formTitle,
      FormVersion: formVersion,
      PublishKey: publishKey,
    }).then(async (item) => {
      if (item || publishKey !== "production") return item;
      return unkeyed();
    }).catch(async () => {
      if (publishKey !== "production") return null;
      return unkeyed();
    });
  }
  return unkeyed();
}

/**
 * Fetch a single list item by its item ID (no OData filter — avoids filter-on-id issues).
 */
export async function queryListItemById(
  token: string,
  listDisplayName: string,
  itemId: string,
): Promise<GraphListItem | null> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    const data = (await graphGet(
      token,
      `/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=fields`,
    )) as { id: string; fields?: Record<string, unknown> };
    return { id: data.id, fields: data.fields || {} };
  } catch {
    return null;
  }
}

export async function createListItem(
  token: string,
  listDisplayName: string,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  const data = (await graphPost(token, `/sites/${siteId}/lists/${listId}/items`, {
    fields,
  })) as { id: string };

  return data;
}

/**
 * Add a multi-line text column to a SharePoint list via Graph API.
 */
export async function createListColumn(
  token: string,
  listDisplayName: string,
  columnName: string,
  displayName: string,
): Promise<void> {
  await ensureListColumn(token, listDisplayName, columnName, displayName, "note");
}

/**
 * Get all columns of a SharePoint list via Graph API.
 * Returns name and displayName for each column.
 */
export async function getListColumns(
  token: string,
  listDisplayName: string,
): Promise<Array<{ name: string; displayName: string }>> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/columns?$select=name,displayName`,
  )) as { value: Array<{ name: string; displayName: string }> };
  return data.value || [];
}

function buildGraphColumnBody(type: GraphColumnType): Record<string, unknown> {
  switch (type) {
    case "note":
      return { text: { multiline: true, allowUnlimitedLength: true } };
    case "number":
      return { number: {} };
    case "hyperlink":
      return { hyperlinkOrPicture: {} };
    case "dateTime":
      return { dateTime: { format: "dateTime" } };
    case "text":
    default:
      return { text: {} };
  }
}

export async function ensureListColumns(
  token: string,
  listDisplayName: string,
  columns: GraphColumnSpec[],
): Promise<{ created: string[]; existing: string[] }> {
  if (columns.length === 0) return { created: [], existing: [] };

  const existing = await getListColumns(token, listDisplayName);
  const known = new Set<string>();
  for (const column of existing) {
    known.add(column.name.toLowerCase());
    known.add(column.displayName.toLowerCase());
  }

  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const result = { created: [] as string[], existing: [] as string[] };

  for (const column of columns) {
    const internalKey = column.name.toLowerCase();
    const displayKey = column.displayName.toLowerCase();
    if (known.has(internalKey) || known.has(displayKey)) {
      result.existing.push(column.name);
      continue;
    }

    await graphPost(token, `/sites/${siteId}/lists/${listId}/columns`, {
      name: column.name,
      displayName: column.displayName,
      ...buildGraphColumnBody(column.type),
    });
    known.add(internalKey);
    known.add(displayKey);
    result.created.push(column.name);
  }

  return result;
}

/**
 * Ensure a column exists on a SharePoint list, creating it if missing.
 * Supports text, number, note (multiline), hyperlink, and dateTime types.
 * Efficiently checks existence first — no-op if column already exists.
 */
export async function ensureListColumn(
  token: string,
  listDisplayName: string,
  columnName: string,
  displayName: string,
  columnType: GraphColumnType,
): Promise<boolean> {
  const result = await ensureListColumns(token, listDisplayName, [
    { name: columnName, displayName, type: columnType },
  ]);
  return result.created.length > 0;
}

// --- SharePoint field/choice helpers (for server-side survey JSON enrichment) ---

/**
 * Fetch choices from a Choice/MultiChoice column definition via Graph API.
 */
export async function getListColumnChoices(
  token: string,
  listDisplayName: string,
  columnName: string
): Promise<string[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  // Fetch ALL columns and find by displayName — $filter on displayName is unreliable
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/columns`
  )) as {
    value: Array<{
      name: string;
      displayName: string;
      choice?: { choices: string[] };
      multiChoice?: { choices: string[] };
    }>;
  };
  const col = data.value?.find((c) => c.displayName === columnName);
  if (!col) return [];
  return col.choice?.choices || col.multiChoice?.choices || [];
}

/**
 * Resolve a column's internal name from its display name via Graph API.
 */
async function resolveColumnName(
  token: string,
  listDisplayName: string,
  displayName: string
): Promise<string> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    // Fetch ALL columns and find by displayName — $filter on displayName is unreliable
    const data = (await graphGet(
      token,
      `/sites/${siteId}/lists/${listId}/columns?$select=name,displayName`
    )) as { value: Array<{ name: string; displayName: string }> };
    const col = data.value?.find((c) => c.displayName === displayName);
    return col?.name || displayName;
  } catch {
    return displayName; // fallback — use as-is
  }
}

/**
 * Fetch distinct values from a list column items via Graph API.
 * Equivalent to the client-side `getFilteredListChoices`.
 */
export async function getListColumnValues(
  token: string,
  listDisplayName: string,
  valueColumn: string,
  filterColumn?: string,
  filterValue?: string
): Promise<string[]> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);

  // Resolve display names → internal names for Graph API
  const internalValueCol = await resolveColumnName(token, listDisplayName, valueColumn);
  const internalFilterCol = filterColumn
    ? await resolveColumnName(token, listDisplayName, filterColumn)
    : undefined;

  const expand = encodeURIComponent(`fields($select=${internalValueCol})`);
  let filter = "";
  if (internalFilterCol && filterValue) {
    // Sanitize filter value — strip characters that could break Graph $filter syntax
    const safeValue = String(filterValue).replace(/[^\w\s\-_.,@]/g, "");
    filter = `&$filter=fields/${encodeURIComponent(internalFilterCol)} eq '${encodeURIComponent(safeValue)}'`;
  }
  const data = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/items?$expand=${expand}&$top=5000${filter}`
  )) as { value: Array<{ fields?: Record<string, unknown> }> };

  const values = new Set<string>();
  for (const item of data.value || []) {
    const v = item.fields?.[internalValueCol];
    if (v != null && v !== "") values.add(String(v));
  }
  return Array.from(values).sort();
}

export async function updateListItemFields(
  token: string,
  listDisplayName: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}/fields`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH fields ${res.status}: ${text}`);
  }
}

export async function deleteListItem(
  token: string,
  listDisplayName: string,
  itemId: string
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Graph DELETE item ${res.status}: ${text}`);
  }
}

// ── Document Library & File Upload Helpers (server-side) ────────────────

export async function deleteDocLibraryFile(
  token: string,
  listDisplayName: string,
  driveItemId: string,
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const drive = (await graphGet(
    token,
    `/sites/${siteId}/lists/${listId}/drive?$select=id`,
  )) as { id: string };
  const res = await fetch(`${GRAPH_BASE}/drives/${drive.id}/items/${encodeURIComponent(driveItemId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Graph DELETE file ${res.status}: ${text}`);
  }
}

/**
 * Creates a document library via Graph API.
 * Returns the list id of the newly created library.
 */
export async function createDocLibrary(
  token: string,
  displayName: string,
): Promise<string> {
  const siteId = await getSiteId(token);
  const data = (await graphPost(token, `/sites/${siteId}/lists`, {
    displayName,
    columns: [],
    list: { template: "documentLibrary" },
  })) as { id: string };
  cachedListIds[displayName] = data.id;
  return data.id;
}

/**
 * Creates a generic SharePoint list via Graph API.
 */
export async function createGenericList(
  token: string,
  displayName: string,
): Promise<string> {
  const siteId = await getSiteId(token);
  const data = (await graphPost(token, `/sites/${siteId}/lists`, {
    displayName,
    list: { template: "genericList" },
  })) as { id: string };
  cachedListIds[displayName] = data.id;
  return data.id;
}

export async function ensureGenericList(
  token: string,
  displayName: string,
): Promise<string | null> {
  try {
    return await getListId(token, displayName);
  } catch {
    return createGenericList(token, displayName);
  }
}

export async function ensureDocLibrary(
  token: string,
  displayName: string,
): Promise<string | null> {
  try {
    return await getListId(token, displayName);
  } catch {
    return createDocLibrary(token, displayName);
  }
}

export async function ensureListSchema(
  token: string,
  displayName: string,
  columns: GraphColumnSpec[],
  template: "genericList" | "documentLibrary" = "genericList",
): Promise<void> {
  if (template === "documentLibrary") {
    await ensureDocLibrary(token, displayName);
  } else {
    await ensureGenericList(token, displayName);
  }
  await ensureListColumns(token, displayName, columns);
}

export interface UploadedDriveItem {
  id: string;
  webUrl: string;
}

/**
 * Uploads binary content to a SharePoint document library via Graph API drive endpoint.
 * Returns the Drive item id and web URL of the uploaded file.
 */
export async function uploadFileToDriveItem(
  token: string,
  listDisplayName: string,
  fileName: string,
  content: Uint8Array,
): Promise<UploadedDriveItem> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const encodedName = encodeURIComponent(fileName);

  const res = await fetch(
    `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/drive/root:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: content as Uint8Array,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PUT file ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id?: string; webUrl?: string; "@microsoft.graph.downloadUrl"?: string };
  return {
    id: data.id || "",
    webUrl: data.webUrl || data["@microsoft.graph.downloadUrl"] || "",
  };
}

/**
 * Uploads binary content to a SharePoint document library via Graph API drive endpoint.
 * Returns the web URL of the uploaded file.
 */
export async function uploadFileToDrive(
  token: string,
  listDisplayName: string,
  fileName: string,
  content: Uint8Array,
): Promise<string> {
  const uploaded = await uploadFileToDriveItem(token, listDisplayName, fileName, content);
  return uploaded.webUrl;
}

/**
 * Update a single list item via Graph API (PATCH to the item resource, not /fields).
 * Some column types (URL/hyperlink) may behave differently on this endpoint.
 */
export async function updateListItem(
  token: string,
  listDisplayName: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  const res = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph PATCH item ${res.status}: ${text}`);
  }
}

/**
 * Lists all files (drive items) in a document library via Graph API.
 */
export async function listDocLibraryFiles(
  token: string,
  listDisplayName: string,
): Promise<Array<{ id: string; name: string; webUrl: string }>> {
  const siteId = await getSiteId(token);
  const listId = await getListId(token, listDisplayName);
  try {
    const files: Array<{ id: string; name: string; webUrl: string }> = [];

    async function collect(path: string): Promise<void> {
      const data = (await graphGet(token, path)) as {
        value: Array<{ id: string; name: string; webUrl: string; folder?: unknown }>;
      };
      for (const item of data.value || []) {
        if (item.folder) {
          await collect(
            `/sites/${siteId}/lists/${listId}/drive/items/${encodeURIComponent(item.id)}/children?$select=id,name,webUrl,folder`,
          );
        } else {
          files.push({ id: item.id, name: item.name, webUrl: item.webUrl });
        }
      }
    }

    await collect(`/sites/${siteId}/lists/${listId}/drive/root/children?$select=id,name,webUrl,folder`);
    return files;
  } catch {
    return [];
  }
}

/**
 * Checks whether a SharePoint list exists via Graph API.
 */
export async function listExistsGraph(
  token: string,
  displayName: string,
): Promise<boolean> {
  try {
    await getListId(token, displayName);
    return true;
  } catch {
    return false;
  }
}
