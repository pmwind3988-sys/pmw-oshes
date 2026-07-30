import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import type {
  DiscoveredList,
  HardDeleteSubmissionResult,
  SharePointClient,
  Submission,
} from "../types";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "./authRecovery";

export class SharePointHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly action: string;

  constructor(action: string, response: Response) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    super(`${action}: ${response.status}${statusText}`);
    this.name = "SharePointHttpError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.action = action;
  }
}

export function isSharePointForbiddenError(error: unknown): boolean {
  return error instanceof SharePointHttpError && error.status === 403;
}

function createSharePointHttpError(action: string, response: Response): SharePointHttpError {
  return new SharePointHttpError(action, response);
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function getStringRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collectUrlCandidates(value: unknown, target: Set<string>): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (/^(https?:\/\/|\/)/i.test(trimmed)) {
      target.add(trimmed);
      return;
    }

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        collectUrlCandidates(JSON.parse(trimmed) as unknown, target);
      } catch {
        /* Plain text field, not a JSON encoded upload value. */
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrlCandidates(item, target);
    return;
  }

  const record = getStringRecord(value);
  if (!record) return;

  for (const key of ["Url", "url", "ServerRelativeUrl", "serverRelativeUrl", "webUrl"]) {
    collectUrlCandidates(record[key], target);
  }
  for (const nextValue of Object.values(record)) {
    collectUrlCandidates(nextValue, target);
  }
}

function getMatrixFieldNames(submissionData: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(submissionData)) {
    const match = key.match(/^(.+)_(?:Response|Html|Json|RowIds)$/);
    if (match?.[1]) names.add(match[1]);
  }
  return [...names];
}

function safeMatrixFieldName(fieldName: string): string {
  return fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
}

function normalizeServerRelativeUrl(value: string, siteUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const site = new URL(siteUrl);
      const url = new URL(trimmed);
      if (url.origin.toLowerCase() !== site.origin.toLowerCase()) return null;
      return decodeURIComponent(url.pathname);
    }

    if (trimmed.startsWith("/")) {
      return decodeURIComponent(trimmed.split("?")[0]);
    }
  } catch {
    return null;
  }

  return null;
}

function isManagedSubmissionFile(serverRelativeUrl: string, listTitle: string): boolean {
  const normalized = serverRelativeUrl.replace(/\\/g, "/").toLowerCase();
  const managedLibraries = [
    "form pdfs",
    "signature images",
    `${listTitle} files`.toLowerCase(),
  ];

  return managedLibraries.some((library) => normalized.includes(`/${library}/`));
}

function collectManagedFileUrls(item: Submission, siteUrl: string): string[] {
  const candidates = new Set<string>();
  collectUrlCandidates(item.submissionData, candidates);

  for (const layer of item.layers) {
    collectUrlCandidates(layer?.signature, candidates);
  }

  for (const layer of item.enhancedLayers ?? []) {
    collectUrlCandidates(getStringRecord(layer)?.signature, candidates);
  }

  const urls = new Set<string>();
  for (const candidate of candidates) {
    const serverRelativeUrl = normalizeServerRelativeUrl(candidate, siteUrl);
    if (serverRelativeUrl && isManagedSubmissionFile(serverRelativeUrl, item.listTitle)) {
      urls.add(serverRelativeUrl);
    }
  }
  return [...urls];
}

function getErrorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(escapeODataString(serverRelativeUrl)).replace(/%2F/gi, "/");
}

function getAccountClaims(account: AccountInfo | undefined): Record<string, unknown> {
  const claims = account?.idTokenClaims;
  return claims && typeof claims === "object" ? claims as Record<string, unknown> : {};
}

function normalizeSharePointIdentity(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const loginName = trimmed.includes("|") ? trimmed.split("|").pop() || trimmed : trimmed;
  return loginName.replace(/^mailto:/, "");
}

function getOriginalEmailFromExternalIdentity(identity: string): string {
  const extMarker = "#ext#@";
  const markerIndex = identity.indexOf(extMarker);
  if (markerIndex === -1) return "";

  const externalLocalPart = identity.slice(0, markerIndex);
  const separatorIndex = externalLocalPart.lastIndexOf("_");
  if (separatorIndex <= 0) return "";

  const localPart = externalLocalPart.slice(0, separatorIndex);
  const domain = externalLocalPart.slice(separatorIndex + 1);
  if (!localPart || !domain.includes(".")) return "";

  return `${localPart}@${domain}`;
}

function addIdentityCandidate(candidates: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const normalized = normalizeSharePointIdentity(value);
  if (!normalized) return;

  candidates.add(normalized);

  const originalEmail = getOriginalEmailFromExternalIdentity(normalized);
  if (originalEmail) candidates.add(originalEmail);
}

function getAccountIdentityCandidates(account: AccountInfo | undefined): Set<string> {
  const candidates = new Set<string>();
  const claims = getAccountClaims(account);

  addIdentityCandidate(candidates, account?.username);
  addIdentityCandidate(candidates, claims.preferred_username);
  addIdentityCandidate(candidates, claims.email);
  addIdentityCandidate(candidates, claims.upn);

  return candidates;
}

function isExternalIdentityMatch(memberIdentity: string, userIdentity: string): boolean {
  if (!userIdentity.includes("@")) return false;
  const externalPrefix = `${userIdentity.replace("@", "_")}#ext#`;
  return memberIdentity.includes(externalPrefix);
}

function matchesSharePointUser(member: Record<string, unknown>, identities: Set<string>): boolean {
  const memberValues = [
    member.Email,
    member.UserPrincipalName,
    member.LoginName,
  ]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeSharePointIdentity)
    .filter(Boolean);

  return memberValues.some((memberIdentity) =>
    [...identities].some((userIdentity) =>
      memberIdentity === userIdentity || isExternalIdentityMatch(memberIdentity, userIdentity)
    )
  );
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

// Module-level digest cache
let _digestCache: string | null = null;
let _digestExpiry: number = 0;

function spScope(): string {
  const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
  try {
    const origin = new URL(SP_SITE_URL).origin;
    return `${origin}/AllSites.Manage`;
  } catch {
    return "https://graph.microsoft.com/.default";
  }
}

async function getToken(
  instance: IPublicClientApplication,
  accounts: AccountInfo[]
): Promise<string> {
  if (accounts.length === 0) {
    throw new Error("No accounts found. User must sign in first.");
  }

  return acquireAccessTokenSilentOrRedirect(instance, {
    scopes: [spScope()],
    account: accounts[0],
  });
}

async function getDigest(token: string): Promise<string> {
  const now = Date.now();
  if (_digestCache && now < _digestExpiry) {
    return _digestCache;
  }

  const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

  const response = await fetchWithTimeout(`${SP_SITE_URL}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get digest: ${response.status}`);
  }

  const data = await response.json();
  const formDigestValue = data?.FormDigestValue;

  if (typeof formDigestValue !== "string") {
    throw new Error("Invalid digest response");
  }

  _digestCache = formDigestValue;
  _digestExpiry = now + 1800000; // 30 minutes

  return formDigestValue;
}

function buildSelect(columns: string[]): string {
  const cols = new Set(["Id", ...columns]);
  return [...cols].join(",");
}

const AUTHOR_SELECT = ["Author/Id", "Author/EMail", "Author/Title"] as const;

function getAuthorEmail(item: Record<string, unknown>): string {
  const author = item.Author as Record<string, unknown> | undefined;
  return String(author?.EMail || author?.Email || "");
}

export function createSpClient(
  instance: IPublicClientApplication,
  accounts: AccountInfo[]
): SharePointClient {
  const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

  async function acquireToken(): Promise<string> {
    return getToken(instance, accounts);
  }

  function getCurrentUserEmail(): string {
    if (accounts.length === 0) {
      throw new Error("No accounts found");
    }
    const email = accounts[0].username;
    if (!email) {
      throw new Error("No email found in account");
    }
    return email;
  }

  async function ensureSiteAccess(): Promise<void> {
    const token = await acquireToken();
    const response = await fetchWithTimeout(`${SP_SITE_URL}/_api/web?$select=Title`, {
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw createSharePointHttpError("Failed to access SharePoint site", response);
    }
  }

  async function discoverLists(): Promise<DiscoveredList[]> {
    const token = await acquireToken();
    const response = await fetchWithTimeout(
      `${SP_SITE_URL}/_api/web/lists?$select=Title,Id,ItemCount,Created,Hidden,BaseTemplate,BaseType,IsCatalog,IsSiteAssetsLibrary,IsApplicationList,IsSystemList,NoCrawl`,
      {
        headers: {
          Accept: "application/json;odata=nometadata",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw createSharePointHttpError("Failed to discover lists", response);
    }

    const data = await response.json();
    const results = data.value;

    if (!Array.isArray(results)) {
      return [];
    }

    return results.map((list: Record<string, unknown>) => ({
      title: String(list.Title || ""),
      id: String(list.Id || ""),
      itemCount: Number(list.ItemCount) || 0,
      created: String(list.Created || ""),
      hidden: Boolean(list.Hidden),
      baseTemplate: Number(list.BaseTemplate) || 0,
      baseType: Number(list.BaseType) || 0,
      isCatalog: Boolean(list.IsCatalog),
      isSiteAssetsLibrary: Boolean(list.IsSiteAssetsLibrary),
      isApplicationList: Boolean(list.IsApplicationList),
      isSystemList: Boolean(list.IsSystemList),
      noCrawl: Boolean(list.NoCrawl),
    }));
  }

  async function queryList(
    listName: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const token = await acquireToken();
    const params = new URLSearchParams();
    const selectInput = options?.select;
    const selectArr = Array.isArray(selectInput) ? selectInput : typeof selectInput === "string" ? [selectInput] : [];
    const selectCols = buildSelect([...selectArr, ...AUTHOR_SELECT]);
    params.set("$select", selectCols);
    if (options?.filter) params.set("$filter", options.filter as string);
    if (options?.orderby) params.set("$orderby", options.orderby as string);
    params.set("$top", String(options?.top ?? 500));
    params.set("$expand", "Author");

    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?${params}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query list: ${response.status}`);
    }

    const data = await response.json();
    const items = data.value || [];

    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    return items.map((item: Record<string, unknown>) => ({
      ...item,
      _authorEmail: getAuthorEmail(item),
    }));
  }

  async function queryListByGuid(
    listGuid: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const token = await acquireToken();
    const params = new URLSearchParams();
    const selectInput = options?.select;
    const selectArr = Array.isArray(selectInput) ? selectInput : typeof selectInput === "string" ? [selectInput] : [];
    const selectCols = buildSelect([...selectArr, ...AUTHOR_SELECT]);
    params.set("$select", selectCols);
    if (options?.filter) params.set("$filter", options.filter as string);
    if (options?.orderby) params.set("$orderby", options.orderby as string);
    params.set("$top", String(options?.top ?? 500));
    params.set("$expand", "Author");

    const url = `${SP_SITE_URL}/_api/web/lists(guid'${listGuid}')/items?${params}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query list by GUID: ${response.status}`);
    }

    const data = await response.json();
    const items = data.value || [];

    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    return items.map((item: Record<string, unknown>) => ({
      ...item,
      _authorEmail: getAuthorEmail(item),
    }));
  }

  async function queryListByEmail(
    listName: string,
    userEmail: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const token = await acquireToken();
    const params = new URLSearchParams();
    const selectInput = options?.select;
    const selectArr = Array.isArray(selectInput) ? selectInput : typeof selectInput === "string" ? [selectInput] : [];
    const selectCols = buildSelect([...selectArr, ...AUTHOR_SELECT, "FormID", "NumberOfApprovalLayers", "FormStatus"]);
    params.set("$select", selectCols);
    if (options?.filter) params.set("$filter", options.filter as string);
    if (options?.orderby) params.set("$orderby", options.orderby as string);
    params.set("$top", String(options?.top ?? 500));
    params.set("$expand", "Author");

    const url = `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')/items?${params}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const items = data.value || [];

    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const userEmailLower = userEmail.toLowerCase();
    return items
      .filter((item: Record<string, unknown>) => {
        const authorEmail = getAuthorEmail(item);
        return authorEmail.toLowerCase() === userEmailLower;
      })
      .map((item: Record<string, unknown>) => ({
        ...item,
        _authorEmail: getAuthorEmail(item),
      }));
  }

  async function isGroupMember(groupName: string): Promise<boolean> {
    const token = await acquireToken();
    const identityCandidates = getAccountIdentityCandidates(accounts[0]);

    try {
      const response = await fetchWithTimeout(
        `${SP_SITE_URL}/_api/web/sitegroups/getByName('${encodeURIComponent(groupName)}')/users?$select=LoginName,Email,UserPrincipalName`,
        {
          headers: {
            Accept: "application/json;odata=nometadata",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) return false;

      const data = await response.json();
      const members: Record<string, unknown>[] = data.value || [];

      return members.some((member) => matchesSharePointUser(member, identityCandidates));
    } catch {
      return false;
    }
  }

  async function listExists(title: string): Promise<boolean> {
    const token = await acquireToken();

    try {
      const response = await fetchWithTimeout(
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(title)}')?$select=Id`,
        {
          headers: {
            Accept: "application/json;odata=nometadata",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async function createList(
    title: string,
    description?: string
  ): Promise<string | null> {
    const token = await acquireToken();
    const digest = await getDigest(token);

    const body = {
      __metadata: { type: "SP.List" },
      Title: title,
      Description: description || "",
      BaseTemplate: 100,
    };

    const response = await fetchWithTimeout(`${SP_SITE_URL}/_api/web/lists`, {
      method: "POST",
      headers: {
        Accept: "application/json;odata=nometadata",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json;odata=nometadata",
        "X-RequestDigest": digest,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.Id || data?.id || null;
  }

  async function addColumn(
    listTitle: string,
    internalName: string,
    fieldTypeKind: number,
    isMultiLine?: boolean
  ): Promise<void> {
    const token = await acquireToken();
    const digest = await getDigest(token);

    const body: Record<string, unknown> = {
      __metadata: { type: "SP.Field" },
      Title: internalName,
      FieldTypeKind: fieldTypeKind,
    };

    if (fieldTypeKind === 3 && isMultiLine) {
      body["RichText"] = false;
      body["NumLines"] = 6;
    }

    const response = await fetchWithTimeout(
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields`,
      {
        method: "POST",
        headers: {
          Accept: "application/json;odata=nometadata",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json;odata=nometadata",
          "X-RequestDigest": digest,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add column: ${response.status}`);
    }
  }

  async function upsertListItem(
    listTitle: string,
    filterExpr: string,
    body: Record<string, unknown>
  ): Promise<{ updated: boolean; id: string }> {
    const token = await acquireToken();

    // Try to find existing item
    const existing = await queryList(listTitle, { filter: filterExpr, top: 1 });

    if (existing.length > 0) {
      // Update existing
      const item = existing[0];
      const itemId = String(item.Id || "");
      const digest = await getDigest(token);

      const updateBody = {
        __metadata: { type: "SP.Data." + listTitle.replace(/\s/g, "_x0020_") + "ListItem" },
        ...body,
      };

      const response = await fetchWithTimeout(
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`,
        {
          method: "POST",
          headers: {
            Accept: "application/json;odata=nometadata",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json;odata=nometadata",
            "X-RequestDigest": digest,
            "X-HTTP-Method": "MERGE",
            "If-Match": "*",
          },
          body: JSON.stringify(updateBody),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update item: ${response.status}`);
      }

      return { updated: true, id: itemId };
    } else {
      // Create new
      const digest = await getDigest(token);

      const createBody = {
        __metadata: { type: "SP.Data." + listTitle.replace(/\s/g, "_x0020_") + "ListItem" },
        ...body,
      };

      const response = await fetchWithTimeout(
        `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`,
        {
          method: "POST",
          headers: {
            Accept: "application/json;odata=nometadata",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json;odata=nometadata",
            "X-RequestDigest": digest,
          },
          body: JSON.stringify(createBody),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create item: ${response.status}`);
      }

      const data = await response.json();
      return {
        updated: false,
        id: data?.Id || "",
      };
    }
  }

  async function deleteListItemsWhere(
    listTitle: string,
    filterExpr: string
  ): Promise<number> {
    const token = await acquireToken();
    const items = await queryList(listTitle, { filter: filterExpr, top: 500 });
    let deleted = 0;

    for (const item of items) {
      const itemId = String(item.Id || "");
      if (!itemId) continue;

      try {
        const digest = await getDigest(token);
        const response = await fetchWithTimeout(
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})`,
          {
            method: "POST",
            headers: {
              Accept: "application/json;odata=nometadata",
              Authorization: `Bearer ${token}`,
              "X-RequestDigest": digest,
              "X-HTTP-Method": "DELETE",
              "If-Match": "*",
            },
          }
        );

        if (response.ok) {
          deleted++;
        }
      } catch {
        // Continue with other deletions
      }
    }

    return deleted;
  }

  async function deleteListItemById(
    listTitle: string,
    itemId: string
  ): Promise<void> {
    const token = await acquireToken();
    const digest = await getDigest(token);
    const response = await fetchWithTimeout(
      `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(escapeODataString(listTitle))}')/items(${encodeURIComponent(itemId)})`,
      {
        method: "POST",
        headers: {
          Accept: "application/json;odata=nometadata",
          Authorization: `Bearer ${token}`,
          "X-RequestDigest": digest,
          "X-HTTP-Method": "DELETE",
          "If-Match": "*",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete submission item: ${response.status}`);
    }
  }

  async function deleteFileByServerRelativeUrl(
    token: string,
    serverRelativeUrl: string
  ): Promise<boolean> {
    const digest = await getDigest(token);
    const encodedPath = encodeServerRelativePathParam(serverRelativeUrl);
    const response = await fetchWithTimeout(
      `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodedPath}')`,
      {
        method: "POST",
        headers: {
          Accept: "application/json;odata=nometadata",
          Authorization: `Bearer ${token}`,
          "X-RequestDigest": digest,
          "X-HTTP-Method": "DELETE",
          "If-Match": "*",
        },
      }
    );

    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new Error(`Failed to delete file ${serverRelativeUrl}: ${response.status}`);
  }

  async function hardDeleteSubmission(item: Submission): Promise<HardDeleteSubmissionResult> {
    const itemId = Number(item.id);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      throw new Error("Submission item id is missing or invalid.");
    }

    const token = await acquireToken();
    const warnings: string[] = [];
    let deletedMatrixRows = 0;
    let deletedFiles = 0;

    for (const fieldName of getMatrixFieldNames(item.submissionData)) {
      const matrixFieldName = safeMatrixFieldName(fieldName);
      if (!matrixFieldName) continue;

      const childListName = `${item.listTitle} Matrix ${matrixFieldName}`;
      try {
        deletedMatrixRows += await deleteListItemsWhere(childListName, `ParentResponseId eq ${itemId}`);
      } catch (error) {
        warnings.push(`Matrix rows in "${childListName}" were not fully deleted: ${getErrorSummary(error)}`);
      }
    }

    for (const fileUrl of collectManagedFileUrls(item, SP_SITE_URL)) {
      try {
        const deleted = await deleteFileByServerRelativeUrl(token, fileUrl);
        if (deleted) {
          deletedFiles += 1;
        } else {
          warnings.push(`File was already missing: ${fileUrl}`);
        }
      } catch (error) {
        warnings.push(getErrorSummary(error));
      }
    }

    await deleteListItemById(item.listTitle, item.id);

    return {
      deletedItem: true,
      deletedFiles,
      deletedMatrixRows,
      warnings,
    };
  }

  async function getSiteUsers(): Promise<{ email: string; name: string }[]> {
    const token = await acquireToken();

    try {
      const response = await fetchWithTimeout(
        `${SP_SITE_URL}/_api/web/siteusers?$select=Email,Title&$filter=PrincipalType eq 1`,
        {
          headers: {
            Accept: "application/json;odata=nometadata",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.value || [])
        .filter((u: Record<string, unknown>) => u.Email)
        .map((u: Record<string, unknown>) => ({
          email: String(u.Email || ""),
          name: String(u.Title || ""),
        }));
    } catch {
      return [];
    }
  }

  return {
    ensureSiteAccess,
    discoverLists,
    queryList,
    queryListByGuid,
    queryListByEmail,
    isGroupMember,
    getCurrentUserEmail,
    acquireToken,
    listExists,
    createList,
    addColumn,
    upsertListItem,
    deleteListItemsWhere,
    hardDeleteSubmission,
    getSiteUsers,
  };
}
