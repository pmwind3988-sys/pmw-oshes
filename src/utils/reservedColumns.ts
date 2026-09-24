/**
 * reservedColumns.ts — question names SharePoint already uses for itself.
 *
 * Every SharePoint list carries built-in columns, and some have names an
 * author would naturally give a question. The one that bites is `Attachments`:
 * it is SharePoint's own yes/no flag for "this item has files attached", so a
 * file question named `attachments` had its answer — a list of file links —
 * written into a Boolean column, and SharePoint refused the whole submission
 * with "Cannot convert a primitive value to the expected type 'Edm.Boolean'".
 * Publishing never created a column for the question either, because one by
 * that name already existed.
 *
 * Such an answer is stored under `<name>_Answer` instead, and every reader
 * resolves the question to that key through `createResponseKeyResolver`.
 * `api/submit-form.ts` keeps its own copy of this list (the API does not import
 * from `src/`); keep the two identical.
 */
const RESERVED = new Set(
  [
    "Attachments", "AttachmentFiles", "ID", "GUID", "Created", "Modified", "Author", "Editor",
    "ContentType", "ContentTypeId", "Edit", "LinkTitle", "LinkTitleNoMenu", "DocIcon",
    "ItemChildCount", "FolderChildCount", "AppAuthor", "AppEditor", "ComplianceAssetId",
    "FileRef", "FileLeafRef", "FileDirRef", "FSObjType", "UniqueId", "ProgId", "ScopeId",
    "owshiddenversion", "InstanceID", "Order", "WorkflowVersion", "MetaInfo", "PermMask",
  ].map((name) => name.toLowerCase()),
);

export const RESERVED_ANSWER_SUFFIX = "_Answer";

export function isReservedColumnName(name: string): boolean {
  return RESERVED.has(name.trim().toLowerCase());
}

/** The column a question's answer is stored in. */
export function answerColumnName(questionName: string): string {
  return isReservedColumnName(questionName) ? `${questionName}${RESERVED_ANSWER_SUFFIX}` : questionName;
}

/** The question a stored key belongs to, when the key is a moved answer. */
export function questionNameForReservedKey(storedKey: string): string | undefined {
  if (!storedKey.endsWith(RESERVED_ANSWER_SUFFIX)) return undefined;
  const base = storedKey.slice(0, -RESERVED_ANSWER_SUFFIX.length);
  return isReservedColumnName(base) ? base : undefined;
}
