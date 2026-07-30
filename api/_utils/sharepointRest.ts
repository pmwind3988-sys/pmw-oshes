function requireSpSiteUrl(): string {
  const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");
  if (!SP_SITE_URL) throw new Error("SP_SITE_URL env var not set.");
  return SP_SITE_URL;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function spListEndpoint(listName: string): string {
  return `/_api/web/lists/getbytitle('${encodeURIComponent(escapeODataString(listName))}')`;
}

function spListGuidEndpoint(listGuid: string): string {
  const normalized = listGuid.replace(/[{}]/g, "");
  return `/_api/web/lists(guid'${escapeODataString(normalized)}')`;
}

export interface SpRestField {
  internalName: string;
  title: string;
  fieldTypeKind: number;
  lookupList?: string;
  lookupField?: string;
}

async function readJsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function getSpDigest(token: string): Promise<string> {
  const res = await fetch(`${requireSpSiteUrl()}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  const data = await readJsonOrThrow<{ FormDigestValue?: string }>(res, "SP REST contextinfo");
  if (!data.FormDigestValue) throw new Error("SharePoint did not return a FormDigestValue.");
  return data.FormDigestValue;
}

async function getOptionalSpDigest(token: string): Promise<string | null> {
  try {
    return await getSpDigest(token);
  } catch {
    return null;
  }
}

function mergeHeaders(token: string, digest: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json;odata=nometadata",
    "Content-Type": "application/json;odata=verbose",
    "X-HTTP-Method": "MERGE",
    "IF-MATCH": "*",
  };
  if (digest) headers["X-RequestDigest"] = digest;
  return headers;
}

function createHeaders(token: string, digest: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json;odata=nometadata",
    "Content-Type": "application/json;odata=verbose",
  };
  if (digest) headers["X-RequestDigest"] = digest;
  return headers;
}

async function spGet<T>(token: string, path: string, label: string): Promise<T> {
  const res = await fetch(`${requireSpSiteUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  return readJsonOrThrow<T>(res, label);
}

async function getListEntityType(token: string, listName: string): Promise<string> {
  const data = await spGet<{ ListItemEntityTypeFullName?: string }>(
    token,
    `${spListEndpoint(listName)}?$select=ListItemEntityTypeFullName`,
    `SP REST list metadata ${listName}`,
  );
  if (!data.ListItemEntityTypeFullName) {
    throw new Error(`Could not resolve SharePoint entity type for "${listName}".`);
  }
  return data.ListItemEntityTypeFullName;
}

export async function createListItemViaSPRest(
  token: string,
  listName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string }> {
  const digest = await getOptionalSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items`, {
    method: "POST",
    headers: createHeaders(token, digest),
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  const data = await readJsonOrThrow<{ Id?: number; ID?: number; id?: number }>(res, "SP REST create item");
  const id = data.Id ?? data.ID ?? data.id;
  if (!id) throw new Error("SharePoint did not return the created item ID.");
  return { id: String(id) };
}

export async function getListFieldsViaSPRest(token: string, listName: string): Promise<SpRestField[]> {
  const data = await spGet<{
    value?: Array<{
      InternalName?: string;
      Title?: string;
      FieldTypeKind?: number;
      LookupList?: string;
      LookupField?: string;
    }>;
  }>(
    token,
    `${spListEndpoint(listName)}/fields?$select=InternalName,Title,FieldTypeKind,LookupList,LookupField`,
    `SP REST fields ${listName}`,
  );

  return (data.value || [])
    .filter((field) => field.InternalName && field.Title && typeof field.FieldTypeKind === "number")
    .map((field) => ({
      internalName: String(field.InternalName),
      title: String(field.Title),
      fieldTypeKind: Number(field.FieldTypeKind),
      lookupList: field.LookupList ? String(field.LookupList) : undefined,
      lookupField: field.LookupField ? String(field.LookupField) : undefined,
    }));
}

export async function ensureTextFieldViaSPRest(
  token: string,
  listName: string,
  internalName: string,
  title: string,
): Promise<void> {
  const existing = await getListFieldsViaSPRest(token, listName);
  if (existing.some((field) => field.internalName === internalName || field.title === title)) return;

  const digest = await getSpDigest(token);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/fields`, {
    method: "POST",
    headers: createHeaders(token, digest),
    body: JSON.stringify({
      __metadata: { type: "SP.Field" },
      FieldTypeKind: 2,
      Title: title,
      StaticName: internalName,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const lowerText = text.toLowerCase();
    if (lowerText.includes("duplicate") || lowerText.includes("already exists")) return;
    throw new Error(`SP REST create text field ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function resolveLookupItemIdViaSPRest(
  token: string,
  lookupList: string,
  lookupField: string,
  value: string,
): Promise<number | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    "$select": `Id,${lookupField}`,
    "$filter": `${lookupField} eq '${escapeODataString(trimmed)}'`,
    "$top": "1",
  });
  const data = await spGet<{ value?: Array<{ Id?: number; ID?: number }> }>(
    token,
    `${spListGuidEndpoint(lookupList)}/items?${params.toString()}`,
    "SP REST lookup item",
  );
  const item = data.value?.[0];
  const id = item?.Id ?? item?.ID;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export async function patchHyperlinkViaSPRest(
  token: string,
  listName: string,
  numericItemId: string,
  fieldName: string,
  url: string,
  description = "",
): Promise<void> {
  const digest = await getOptionalSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items(${numericItemId})`, {
    method: "POST",
    headers: mergeHeaders(token, digest),
    body: JSON.stringify({
      __metadata: { type: entityType },
      [fieldName]: {
        __metadata: { type: "SP.FieldUrlValue" },
        Url: url,
        Description: description || url,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST FieldUrlValue update ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function updateListItemViaSPRest(
  token: string,
  listName: string,
  itemId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const digest = await getOptionalSpDigest(token);
  const entityType = await getListEntityType(token, listName);
  const res = await fetch(`${requireSpSiteUrl()}${spListEndpoint(listName)}/items(${itemId})`, {
    method: "POST",
    headers: mergeHeaders(token, digest),
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SP REST update item ${res.status}: ${text.slice(0, 300)}`);
  }
}
