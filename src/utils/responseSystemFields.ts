/**
 * responseSystemFields.ts — which columns on a response are plumbing, not answers.
 *
 * A response list holds the submitted answers next to the workflow's own
 * bookkeeping: who filed it, where it is in the chain, the JSON snapshot, the
 * per-layer decision columns, and whatever SharePoint adds to every list it
 * makes. Anything reading "the answers" has to subtract that set first, and this
 * is the one copy of it.
 *
 * The layer columns are matched by pattern rather than listed. Spelling out
 * `L1_`…`L3_` — which is what the screens that grew this list did — quietly lets
 * a fourth layer's columns through as if they were questions, and a form with
 * four approvers is not unusual.
 */

/** Fixed column names the workflow and SharePoint own. */
const SYSTEM_FIELD_NAMES = [
  "Id",
  "ID",
  "GUID",
  "Title",
  "SubmittedBy",
  "SubmittedAt",
  "Status",
  "FormStatus",
  "CurrentLayer",
  "CurrentApprovalLayer",
  "FormVersion",
  "FormID",
  "FormId",
  "PublishKey",
  "ReferenceNo",
  "SelectedBranch",
  "RawJSON",
  "EvaluationData",
  "WorkflowAssignmentData",
  "WorkflowEmailLog",
  "WorkflowEmailSchedule",
  "PDPAConsent",
  "PDPANoticeVersion",
  "PDPAConsentAt",
  "RetentionUntil",
  "PdfUrl",
  "Author",
  "AuthorId",
  "Editor",
  "EditorId",
  "Created",
  "Modified",
  "ContentType",
  "ContentTypeId",
  "PermMask",
  "Attachments",
  "FileSystemObjectType",
  "ComplianceAssetId",
  "ServerRedirectedEmbedUri",
  "ServerRedirectedEmbedUrl",
  "OData__UIVersionString",
  "OData__ColorTag",
] as const;

const LAYER_COLUMN_RE = /^L\d+_(Status|Email|ActedBy|SignedAt|Rejection|Signature)$/;

/** SharePoint escapes what it cannot put in an internal name: `Submitted_x0020_By`. */
function decodeSharePointKey(key: string): string {
  return key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function normalize(key: string): string {
  return decodeSharePointKey(key).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const NORMALIZED_SYSTEM_FIELDS = new Set(SYSTEM_FIELD_NAMES.map(normalize));

export function isResponseSystemField(key: string): boolean {
  if (key.startsWith("odata.") || key.startsWith("@odata")) return true;
  if (LAYER_COLUMN_RE.test(key)) return true;
  return NORMALIZED_SYSTEM_FIELDS.has(normalize(key));
}

/** The submitted answers on a response item, with the bookkeeping subtracted. */
export function responseAnswerFields(item: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (isResponseSystemField(key) || value === null || value === undefined) continue;
    answers[key] = value;
  }
  return answers;
}
