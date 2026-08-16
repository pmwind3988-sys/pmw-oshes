/**
 * approvalDirectory.ts — reads the `Approval Directory` list over SharePoint REST.
 *
 * The serverless equivalent is `api/_utils/approvalDirectory.ts`, which goes
 * over Graph. Only the transport differs; both feed the same `lookupPerson` /
 * `lookupRoleHolder` ports on the shared resolver, and the column names come
 * from the mirrored schema module so the two cannot disagree.
 *
 * Every lookup answers `null` rather than throwing when a person or role is
 * missing — a directory gap parks one submission for an admin to resolve, and
 * must never be the reason a submission is lost.
 */
import {
  SP_FIELD_KIND,
  ensureColumns,
  ensureSpList,
  listExists,
  spDelete,
  spGet,
  spPatch,
  spPost,
} from "./formBuilderSP";
import {
  APPROVAL_DIRECTORY_COLUMNS,
  APPROVAL_DIRECTORY_LIST,
  REQUIRED_DIRECTORY_FIELDS,
  directoryEmailKey,
  directoryIsUsable,
  mapDirectoryColumns,
  missingDirectoryColumns,
  toApprovalDirectoryRow,
  type DirectoryColumnMap,
  type ApprovalDirectoryRow,
} from "./approvalDirectorySchema";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || "").replace(/\/$/, "");

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

interface ExistingField {
  Title?: string;
  InternalName?: string;
  StaticName?: string;
  EntityPropertyName?: string;
}

/**
 * The list's real columns, matched against the ones we look for.
 *
 * Resolved once per reader rather than assumed, because a column's internal
 * name rarely equals what somebody typed, and selecting a name that does not
 * exist fails the whole request — one mismatched column would otherwise make a
 * correct directory look completely empty.
 */
export async function resolveDirectoryColumns(token: string): Promise<DirectoryColumnMap> {
  const data = await spGet(
    token,
    `${listUrl()}/fields?$select=Title,InternalName,StaticName,EntityPropertyName&$top=5000`,
  ) as { value?: ExistingField[] };

  return mapDirectoryColumns((data.value ?? []).map((field) => ({
    key: field.EntityPropertyName || field.InternalName || field.StaticName || field.Title || "",
    aliases: [field.Title, field.InternalName, field.StaticName, field.EntityPropertyName]
      .filter((alias): alias is string => !!alias),
  })).filter((column) => column.key));
}

function selectFor(map: DirectoryColumnMap): string {
  return ["Id", ...Object.values(map).filter((column): column is string => !!column)].join(",");
}

/**
 * Creates the list and its columns if they are not there yet.
 *
 * Must run on an admin's **delegated** token: the app-only Graph principal gets
 * 403 accessDenied when creating columns (see the app-only note in
 * api/AGENTS.md), which is why provisioning lives on this side and not in the
 * serverless routes.
 */
export async function ensureApprovalDirectory(token: string): Promise<void> {
  await ensureSpList(token, APPROVAL_DIRECTORY_LIST, {
    description: "Who approves whom. One row per person; ApproverEmail carries the reporting line.",
  });
  await ensureColumns(token, APPROVAL_DIRECTORY_LIST, [
    { n: APPROVAL_DIRECTORY_COLUMNS.personEmail, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.personName, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.department, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.position, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.employeeId, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.approverEmail, k: SP_FIELD_KIND.text },
    { n: APPROVAL_DIRECTORY_COLUMNS.isActive, k: SP_FIELD_KIND.boolean },
  ]);
}

/** Whether the list exists at all, for telling "not set up" from "not listed". */
export async function approvalDirectoryExists(token: string): Promise<boolean> {
  return listExists(token, APPROVAL_DIRECTORY_LIST);
}

function listUrl(): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(APPROVAL_DIRECTORY_LIST)}')`;
}

export interface ApprovalDirectoryInput {
  personEmail: string;
  personName: string;
  department: string;
  position: string;
  employeeId: string;
  approverEmail: string;
  isActive: boolean;
}

export const EMPTY_APPROVAL_DIRECTORY_INPUT: ApprovalDirectoryInput = {
  personEmail: "",
  personName: "",
  department: "",
  position: "",
  employeeId: "",
  approverEmail: "",
  isActive: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everything wrong with a row, in the order an admin would fix it. Returns an
 * empty array when the row is usable.
 *
 * A person may legitimately have no approver — that is the top of the line, and
 * the resolver treats it as a stopping point rather than an error.
 */
export function validateApprovalDirectoryInput(
  input: ApprovalDirectoryInput,
  existing: ApprovalDirectoryRow[],
  editingId?: number,
): string[] {
  const problems: string[] = [];
  const email = input.personEmail.trim();

  if (!email) {
    problems.push("A person's email is required — it is what the row is keyed on.");
  } else if (!EMAIL_RE.test(email)) {
    problems.push(`"${email}" is not a valid email address.`);
  } else if (
    existing.some((row) => row.id !== editingId && directoryEmailKey(row.personEmail) === directoryEmailKey(email))
  ) {
    problems.push(`${email} is already listed. Edit that row instead of adding a second one.`);
  }

  const approver = input.approverEmail.trim();
  if (approver && !EMAIL_RE.test(approver)) {
    problems.push(`"${approver}" is not a valid approver email address.`);
  }
  if (approver && directoryEmailKey(approver) === directoryEmailKey(email)) {
    problems.push("A person cannot be their own approver.");
  }

  return problems;
}

/**
 * The item body for a write, addressed to the columns the list actually has.
 *
 * Reads have always gone through the resolved column map; writes used the
 * canonical spellings, and the two disagree the moment a column was made by
 * hand. A list whose column is `EmployeeID` rather than `EmployeeId` reads
 * perfectly — the map is case-insensitive — and then fails every single save
 * with SharePoint's "property does not exist on type", because one unknown
 * property rejects the whole request rather than being ignored.
 *
 * A field with no column at all is left out, so a list missing `EmployeeId`
 * saves the six fields it can hold instead of refusing the row.
 */
export function directoryItemBody(
  input: ApprovalDirectoryInput,
  isNew: boolean,
  map: DirectoryColumnMap,
): Record<string, unknown> {
  const missing = REQUIRED_DIRECTORY_FIELDS
    .filter((field) => !map[field])
    .map((field) => APPROVAL_DIRECTORY_COLUMNS[field]);
  if (missing.length > 0) {
    throw new Error(
      `"${APPROVAL_DIRECTORY_LIST}" has no ${missing.join(" or ")} column, so there is nowhere to store who approves whom. Add the missing columns first.`,
    );
  }

  const body: Record<string, unknown> = {};
  const put = (field: keyof DirectoryColumnMap, value: unknown): void => {
    const column = map[field];
    if (column) body[column] = value;
  };

  put("personEmail", input.personEmail.trim().toLowerCase());
  put("personName", input.personName.trim());
  put("department", input.department.trim());
  put("position", input.position.trim());
  put("employeeId", input.employeeId.trim());
  put("approverEmail", input.approverEmail.trim().toLowerCase());
  put("isActive", input.isActive);

  // A generic SharePoint list still requires Title; mirror the person into it
  // on create only, so a hand-maintained title survives later edits.
  if (isNew) body.Title = input.personName.trim() || input.personEmail.trim();
  return body;
}

export interface ApprovalDirectoryLoad {
  rows: ApprovalDirectoryRow[];
  /**
   * Which real column backs each field. Writes need this as much as reads do —
   * see `directoryItemBody` — so it is handed back rather than resolved twice.
   */
  columns: DirectoryColumnMap;
  /** Expected names of columns the list does not have, for the admin to add. */
  missingColumns: string[];
  /** False when the list lacks the columns needed to answer anything at all. */
  usable: boolean;
}

/**
 * Every row, sorted by department then name.
 *
 * Reports missing columns rather than quietly returning nothing: a directory
 * that looks empty because one column name is off is the single most confusing
 * failure this feature can have.
 */
export async function loadApprovalDirectory(token: string): Promise<ApprovalDirectoryLoad> {
  const map = await resolveDirectoryColumns(token);
  const missingColumns = missingDirectoryColumns(map);
  if (!directoryIsUsable(map)) {
    return { rows: [], columns: map, missingColumns, usable: false };
  }

  const rows = (await queryDirectory(token, map, "", 5000)).sort((a, b) =>
    a.department.localeCompare(b.department)
    || (a.personName || a.personEmail).localeCompare(b.personName || b.personEmail));

  return { rows, columns: map, missingColumns, usable: true };
}

export async function createApprovalDirectoryRow(
  token: string,
  input: ApprovalDirectoryInput,
  columns: DirectoryColumnMap,
): Promise<void> {
  await spPost(token, `${listUrl()}/items`, directoryItemBody(input, true, columns));
}

export async function updateApprovalDirectoryRow(
  token: string,
  id: number,
  input: ApprovalDirectoryInput,
  columns: DirectoryColumnMap,
): Promise<void> {
  await spPatch(token, `${listUrl()}/items(${id})`, directoryItemBody(input, false, columns));
}

/**
 * Removes a row outright. Prefer switching `isActive` off for a leaver: their
 * old submissions stay readable, and the resolver already skips inactive rows.
 */
export async function deleteApprovalDirectoryRow(token: string, id: number): Promise<void> {
  await spDelete(token, `${listUrl()}/items(${id})`);
}

async function queryDirectory(
  token: string,
  map: DirectoryColumnMap,
  filter: string,
  top: number,
): Promise<ApprovalDirectoryRow[]> {
  const params = new URLSearchParams();
  params.set("$select", selectFor(map));
  if (filter) params.set("$filter", filter);
  params.set("$top", String(top));

  const data = await spGet(
    token,
    `${listUrl()}/items?${params.toString()}`,
  ) as { value?: Record<string, unknown>[] };

  return (data.value ?? []).map((item) => ({
    ...toApprovalDirectoryRow(item, map),
    id: Number(item.Id) || undefined,
  }));
}

/**
 * One request per distinct address, cached for the life of the reader. Walking
 * a chain re-reads the same rows, since each hop's target is the next hop's
 * subject. The column map is resolved once and shared by both lookups.
 */
export function createApprovalDirectoryReader(token: string) {
  const people = new Map<string, ApprovalDirectoryRow | null>();
  let columnsPromise: Promise<DirectoryColumnMap | null> | null = null;

  /** null when the list is absent or too incomplete to answer anything. */
  function columns(): Promise<DirectoryColumnMap | null> {
    // A missing list is the normal state before the directory is set up, so
    // this resolves to null rather than throwing: the layer parks with a
    // useful message instead of the submission failing.
    columnsPromise ??= resolveDirectoryColumns(token)
      .then((map) => (directoryIsUsable(map) ? map : null))
      .catch(() => null);
    return columnsPromise;
  }

  async function lookupPerson(email: string): Promise<ApprovalDirectoryRow | null> {
    const key = directoryEmailKey(email);
    if (!key) return null;

    const cached = people.get(key);
    if (cached !== undefined) return cached;

    const map = await columns();
    const row = map
      ? await queryDirectory(token, map, `${map.personEmail} eq '${escapeODataString(key)}'`, 2)
        .then((matches) => matches.find((candidate) => candidate.isActive) ?? null)
        .catch(() => null)
      : null;

    people.set(key, row);
    return row;
  }

  async function lookupRoleHolder(
    department: string,
    role: string,
  ): Promise<{ email: string; name: string } | null> {
    const wantedDepartment = department.trim();
    const wantedRole = role.trim();
    if (!wantedDepartment || !wantedRole) return null;

    const map = await columns();
    // Role lookup needs the two columns that describe the post, which are
    // optional for chain routing and so may genuinely be absent.
    if (!map?.department || !map.position) return null;

    try {
      const matches = await queryDirectory(
        token,
        map,
        [
          `${map.department} eq '${escapeODataString(wantedDepartment)}'`,
          `${map.position} eq '${escapeODataString(wantedRole)}'`,
        ].join(" and "),
        2,
      );
      const holder = matches.find((candidate) => candidate.isActive && candidate.personEmail);
      return holder ? { email: holder.personEmail, name: holder.personName } : null;
    } catch {
      return null;
    }
  }

  return {
    lookupPerson: async (email: string) => {
      const row = await lookupPerson(email);
      return row
        ? {
          email: row.personEmail,
          name: row.personName,
          department: row.department,
          position: row.position,
          approverEmail: row.approverEmail,
        }
        : null;
    },
    lookupRoleHolder,
  };
}
