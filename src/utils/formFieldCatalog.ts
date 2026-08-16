/**
 * formFieldCatalog.ts — what a given form, at a given version, can be filtered by.
 *
 * A submission carries its own published schema (`Submission.surveyJson`), so the
 * set of questions an admin may filter on is derivable per form without a single
 * extra network call. This module turns that schema into typed field descriptors,
 * and the descriptors decide which operators the UI offers.
 *
 * Schema first, data second: a form whose choices come from a SharePoint list has
 * no `choices` array in the published JSON, so `mergeObservedValues` folds the
 * values actually present in the responses into the catalogue. And a form whose
 * schema snapshot is missing entirely falls back to `fieldsFromResponses`, which
 * reads the answer columns straight off the responses — without it those forms
 * offer no field conditions at all, which reads as the feature being broken.
 */

/** How a field is filtered, which is coarser than how it is rendered. */
export type FilterFieldKind = "text" | "choice" | "date" | "datetime" | "time" | "number" | "boolean";

export type FieldFilterOp =
  | "contains"
  | "notContains"
  | "is"
  | "isNot"
  | "anyOf"
  | "noneOf"
  | "between"
  | "on"
  | "before"
  | "after"
  | "eq"
  | "gte"
  | "lte"
  | "isTrue"
  | "isFalse"
  | "isEmpty"
  | "isNotEmpty";

export interface FilterFieldChoice {
  value: string;
  label: string;
}

export interface FilterableField {
  /** Question name — the key the answer lands under in the response data. */
  key: string;
  /** Question title, shown in the field picker and on chips. */
  label: string;
  /** Page or panel the question sits in, used to group the picker. */
  section: string;
  kind: FilterFieldKind;
  /** Known options, for `choice`. Union of schema choices and observed answers. */
  choices?: FilterFieldChoice[];
}

/** Element types that hold no answer, so nothing to filter on. */
const LAYOUT_TYPES = new Set([
  "html",
  "image",
  "spacer",
  "divider",
  "pagebreak",
  "videoembed",
  "videeembed",
  "alert",
  "countdown",
  "datatable",
  "chartdisplay",
]);

/**
 * Answers we deliberately refuse to filter on. Signatures and files are blobs;
 * matrices store their rows in a child list, so filtering them is a different
 * feature (a row-level predicate) rather than a value comparison.
 */
const UNFILTERABLE_TYPES = new Set([
  "signaturepad",
  "signature",
  "file",
  "imageupload",
  "dynamicmatrix",
  "matrixdynamic",
  "matrixdropdown",
  "matrix",
  "tableinput",
  "jsoneditor",
]);

const CHOICE_TYPES = new Set([
  "dropdown",
  "radiogroup",
  "checkbox",
  "tagbox",
  "imagepicker",
  "buttongroup",
  "ranking",
  "hierarchy",
]);

const CHILD_ELEMENT_KEYS = ["elements", "templateElements", "questions"];

/** Operators offered per kind, in the order the UI lists them. */
export const OPS_BY_KIND: Record<FilterFieldKind, FieldFilterOp[]> = {
  text: ["contains", "notContains", "is", "isNot", "isEmpty", "isNotEmpty"],
  choice: ["anyOf", "noneOf", "isEmpty", "isNotEmpty"],
  date: ["between", "on", "before", "after", "isEmpty", "isNotEmpty"],
  datetime: ["between", "on", "before", "after", "isEmpty", "isNotEmpty"],
  time: ["between", "before", "after", "isEmpty", "isNotEmpty"],
  number: ["between", "eq", "gte", "lte", "isEmpty", "isNotEmpty"],
  boolean: ["isTrue", "isFalse", "isEmpty"],
};

const OP_LABELS: Record<FieldFilterOp, string> = {
  contains: "contains",
  notContains: "does not contain",
  is: "is exactly",
  isNot: "is not",
  anyOf: "is any of",
  noneOf: "is none of",
  between: "between",
  on: "on",
  before: "before",
  after: "after",
  eq: "equals",
  gte: "at least",
  lte: "at most",
  isTrue: "is Yes",
  isFalse: "is No",
  isEmpty: "is blank",
  isNotEmpty: "is answered",
};

export function opLabel(op: FieldFilterOp): string {
  return OP_LABELS[op] ?? op;
}

/** How many value inputs an operator needs. `many` is a multi-select. */
export function opArity(op: FieldFilterOp): "none" | "one" | "two" | "many" {
  if (op === "isEmpty" || op === "isNotEmpty" || op === "isTrue" || op === "isFalse") return "none";
  if (op === "between") return "two";
  if (op === "anyOf" || op === "noneOf") return "many";
  return "one";
}

export function defaultOpForKind(kind: FilterFieldKind): FieldFilterOp {
  return OPS_BY_KIND[kind][0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * SharePoint escapes characters it cannot use in an internal column name, so the
 * response key for "Staff Name" can arrive as `Staff_x0020_Name`. Filters are
 * keyed by the question name, so both spellings must resolve to one value.
 */
function decodeSharePointKey(key: string): string {
  return key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeKey(value: string): string {
  return decodeSharePointKey(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Read a question's answer out of response data, tolerating SharePoint's key mangling. */
export function readResponseValue(data: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  const target = normalizeKey(key);
  if (!target) return undefined;
  for (const candidate of Object.keys(data)) {
    if (normalizeKey(candidate) === target) return data[candidate];
  }
  return undefined;
}

function kindForElement(element: Record<string, unknown>): FilterFieldKind | null {
  const type = textValue(element.type).toLowerCase();
  const inputType = textValue(element.inputType).toLowerCase();

  if (!type || LAYOUT_TYPES.has(type) || UNFILTERABLE_TYPES.has(type)) return null;
  if (CHOICE_TYPES.has(type)) return "choice";
  if (type === "boolean" || type === "consent") return "boolean";
  if (type === "rating" || type === "slider" || type === "counter" || type === "duration") return "number";
  if (type === "comment") return "text";

  // `expression` covers formulas and scorecards — a computed number worth filtering.
  if (type === "expression") return "number";

  if (type === "text" || type === "nric" || type === "" ) {
    switch (inputType) {
      case "date":
        return "date";
      case "datetime-local":
      case "datetime":
        return "datetime";
      case "time":
        return "time";
      case "number":
      case "range":
        return "number";
      default:
        return "text";
    }
  }

  // Unknown custom type: treat as text rather than dropping it, so a new question
  // type is never silently unfilterable.
  return "text";
}

function choicesFromElement(element: Record<string, unknown>): FilterFieldChoice[] | undefined {
  const raw = element.choices;
  if (!Array.isArray(raw)) return undefined;
  const choices: FilterFieldChoice[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" || typeof entry === "number") {
      const value = String(entry).trim();
      if (value) choices.push({ value, label: value });
      continue;
    }
    if (isRecord(entry)) {
      const value = textValue(entry.value) || textValue(entry.text);
      const label = textValue(entry.text) || value;
      if (value) choices.push({ value, label });
    }
  }
  return choices.length ? choices : undefined;
}

function isDefaultPageName(value: string): boolean {
  return /^page\d*$/i.test(value.trim());
}

function sectionTitle(node: Record<string, unknown>, fallback: string): string {
  const title = textValue(node.title);
  if (title) return title;
  const name = textValue(node.name);
  return name && !isDefaultPageName(name) ? name : fallback;
}

function childElements(element: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  for (const key of CHILD_ELEMENT_KEYS) {
    const value = element[key];
    if (Array.isArray(value)) children.push(...value.filter(isRecord));
  }
  const columns = element.columns;
  if (Array.isArray(columns)) {
    for (const column of columns) {
      if (isRecord(column) && Array.isArray(column.elements)) {
        children.push(...column.elements.filter(isRecord));
      }
    }
  }
  return children;
}

/**
 * Flatten one published survey schema into the questions it can be filtered by.
 * Accepts either a bare SurveyJSON or the `{ surveyJson: … }` envelope the
 * version list stores, matching `buildFormSubmissionSections`.
 */
export function fieldsFromSurveyJson(surveyJson: unknown): FilterableField[] {
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages.filter(isRecord) : [];
  const fields: FilterableField[] = [];
  const seen = new Set<string>();

  const visit = (element: Record<string, unknown>, section: string) => {
    const type = textValue(element.type).toLowerCase();
    const key = textValue(element.name);

    if (type === "panel" || type === "paneldynamic" || type === "columns") {
      const nested = sectionTitle(element, section);
      for (const child of childElements(element)) visit(child, nested);
      return;
    }

    if (!key || seen.has(key)) return;
    const kind = kindForElement(element);
    if (!kind) return;

    seen.add(key);
    fields.push({
      key,
      label: textValue(element.title) || key,
      section,
      kind,
      ...(kind === "choice" ? { choices: choicesFromElement(element) } : {}),
    });
  };

  pages.forEach((page, index) => {
    const section = sectionTitle(page, `Page ${index + 1}`);
    const elements = Array.isArray(page.elements) ? page.elements.filter(isRecord) : [];
    for (const element of elements) visit(element, section);
  });

  return fields;
}

/**
 * Union several schemas into one catalogue. A form type spans versions and
 * publish profiles whose schemas differ, and an admin filtering "this form"
 * expects every question the form has ever asked, not just the newest cut.
 */
export function mergeFieldCatalogs(catalogs: FilterableField[][]): FilterableField[] {
  const merged = new Map<string, FilterableField>();
  for (const catalog of catalogs) {
    for (const field of catalog) {
      const existing = merged.get(field.key);
      if (!existing) {
        merged.set(field.key, { ...field, choices: field.choices ? [...field.choices] : undefined });
        continue;
      }
      // Later schemas only add: a question that gained options keeps the old ones
      // so historical answers stay selectable.
      if (field.choices?.length) {
        const values = new Set((existing.choices ?? []).map((choice) => choice.value));
        const nextChoices = [...(existing.choices ?? [])];
        for (const choice of field.choices) {
          if (!values.has(choice.value)) {
            values.add(choice.value);
            nextChoices.push(choice);
          }
        }
        existing.choices = nextChoices;
      }
    }
  }
  return Array.from(merged.values());
}

/**
 * Columns that carry list plumbing or workflow bookkeeping rather than an answer.
 * Only consulted when a catalogue is recovered from raw response rows, where the
 * SharePoint REST payload mixes both together.
 */
const NON_ANSWER_KEYS = new Set([
  // SharePoint REST plumbing
  "Id", "ID", "GUID", "FileSystemObjectType", "ServerRedirectedEmbedUri", "ServerRedirectedEmbedUrl",
  "ContentTypeId", "ContentType", "ComplianceAssetId", "Attachments", "AttachmentFiles", "PermMask",
  "Created", "Modified", "Author", "Editor", "AuthorId", "EditorId", "Order",
  // Response-list bookkeeping the workflow engine writes
  "Title", "SubmittedBy", "SubmittedAt", "Status", "FormStatus", "FormVersion", "FormID", "RawJSON",
  "CurrentLayer", "CurrentApprovalLayer", "SelectedBranch", "PublishKey", "PdfUrl",
  "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
]);

function isNonAnswerKey(key: string): boolean {
  if (NON_ANSWER_KEYS.has(key)) return true;
  // OData__UIVersionString, __metadata, odata.etag and friends.
  if (key.startsWith("__") || key.startsWith("OData__") || key.startsWith("odata.")) return true;
  // Per-layer workflow columns: L1_Status, L3_SignedAt, …
  if (/^L\d+_/.test(key)) return true;
  // The HTML mirror a dynamic matrix writes beside its child list.
  if (key.endsWith("_Html")) return true;
  // SharePoint's lookup shadow for a column it already returns expanded.
  if (/^(Author|Editor)Id$/.test(key)) return true;
  return false;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const CLOCK_TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;

/** The narrowest kind an observed value is consistent with. */
function kindForValue(value: unknown): FilterFieldKind | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return value.length ? "choice" : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (ISO_DATETIME.test(text)) return "datetime";
  if (ISO_DATE_ONLY.test(text)) return "date";
  if (CLOCK_TIME.test(text)) return "time";
  return "text";
}

/**
 * Widen two readings of the same column into one that fits both. Answers vary
 * across submissions — one row leaves a date blank and stores "", the next
 * stores a real stamp — so a column only keeps a specific kind while every
 * value it holds agrees on it, and falls back to text otherwise.
 */
function widenKind(current: FilterFieldKind, next: FilterFieldKind): FilterFieldKind {
  if (current === next) return current;
  if ((current === "date" && next === "datetime") || (current === "datetime" && next === "date")) return "datetime";
  return "text";
}

/**
 * Recover a catalogue from the responses alone, for a form with no usable schema
 * snapshot. Keys are both the label and the lookup key, since the question titles
 * only exist in the schema that is missing.
 */
export function fieldsFromResponses(
  responses: Record<string, unknown>[],
  section = "Recorded answers",
): FilterableField[] {
  const kinds = new Map<string, FilterFieldKind>();
  for (const response of responses) {
    for (const [key, value] of Object.entries(response)) {
      if (isNonAnswerKey(key)) continue;
      const kind = kindForValue(value);
      if (!kind) continue;
      const existing = kinds.get(key);
      kinds.set(key, existing ? widenKind(existing, kind) : kind);
    }
  }
  return Array.from(kinds, ([key, kind]) => ({
    key,
    label: decodeSharePointKey(key),
    section,
    kind,
    ...(kind === "choice" ? { choices: [] } : {}),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Fold the answers actually present into the catalogue: fills the options of a
 * SharePoint-backed dropdown whose choices live outside the published schema.
 */
export function mergeObservedValues(
  catalog: FilterableField[],
  responses: Record<string, unknown>[],
): FilterableField[] {
  const byKey = new Map(catalog.map((field) => [field.key, field]));
  const observed = new Map<string, Set<string>>();

  const record = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      const text = textValue(entry);
      if (!text) continue;
      const bucket = observed.get(key) ?? new Set<string>();
      bucket.add(text);
      observed.set(key, bucket);
    }
  };

  for (const response of responses) {
    for (const field of catalog) {
      if (field.kind === "choice") record(field.key, readResponseValue(response, field.key));
    }
  }

  for (const [key, values] of observed) {
    const field = byKey.get(key);
    if (!field) continue;
    const existing = new Set((field.choices ?? []).map((choice) => choice.value));
    const nextChoices = [...(field.choices ?? [])];
    for (const value of values) {
      if (!existing.has(value)) nextChoices.push({ value, label: value });
    }
    // Observed-only options are unordered noise otherwise; a stable sort keeps the
    // list scannable when a SharePoint-backed field contributes them all.
    field.choices = field.choices?.length
      ? nextChoices
      : nextChoices.sort((a, b) => a.label.localeCompare(b.label));
  }

  return catalog;
}

/**
 * One published cut of a form: the questions it asked, tagged with the version
 * and profile it was published as. Filtering narrows to a single snapshot once an
 * admin picks a version, and unions them while they have not.
 */
export interface SchemaSnapshot {
  formVersion: string;
  profileKey: string;
  fields: FilterableField[];
}

/**
 * The questions in scope for a profile/version selection. An empty selection is
 * "every one of them", so the catalogue only narrows as the admin walks down the
 * hierarchy rather than emptying out at the top of it.
 */
export function selectSnapshotFields(
  snapshots: SchemaSnapshot[],
  selection: { profileKey?: string; formVersion?: string } = {},
): FilterableField[] {
  const scoped = snapshots.filter(
    (snapshot) =>
      (!selection.profileKey || snapshot.profileKey === selection.profileKey) &&
      (!selection.formVersion || snapshot.formVersion === selection.formVersion),
  );
  return mergeFieldCatalogs(scoped.map((snapshot) => snapshot.fields));
}

/** Group a catalogue by section, preserving the order questions appear in the form. */
export function groupFieldsBySection(fields: FilterableField[]): { section: string; fields: FilterableField[] }[] {
  const groups = new Map<string, FilterableField[]>();
  for (const field of fields) {
    const bucket = groups.get(field.section) ?? [];
    bucket.push(field);
    groups.set(field.section, bucket);
  }
  return Array.from(groups, ([section, sectionFields]) => ({ section, fields: sectionFields }));
}
