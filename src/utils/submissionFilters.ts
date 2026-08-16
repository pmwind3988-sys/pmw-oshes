/**
 * submissionFilters.ts — one filter model for every place submissions are listed.
 *
 * The shape is a hierarchy, narrowed one level at a time:
 *
 *     form title  →  publish profile  →  version  →  conditions on its questions
 *
 * Each level is only meaningful inside the one above it. A profile belongs to a
 * form, a version belongs to a (form, profile) pair, and a question belongs to
 * the versions that asked it — so picking a new value at any level drops what was
 * scoped beneath it rather than leaving conditions that silently match nothing.
 *
 * The universal facets — free-text search, lifecycle stage, submitter,
 * submitted-on range — sit outside the hierarchy, because they exist on every
 * submission regardless of which questions it asked.
 *
 * `fieldFilters` replaces what used to be a hardcoded `trainingTitle` select: one
 * form's question had been promoted into the global filter model, which left
 * every other form's questions unfilterable. Conditions are AND-ed.
 *
 * Consumers hold different row types (the dashboard's `Submission`, the approval
 * workspace's `PendingItem`, the response viewer's `SubmissionItem`), so matching
 * runs against the normalised `FilterableRecord` and each caller supplies an
 * adapter. The semantics then live here once.
 */
import type { Submission } from "../types";
import { resolveLifecycleStage, type LifecycleStage } from "./submissionLifecycle";
import {
  defaultOpForKind,
  fieldsFromResponses,
  fieldsFromSurveyJson,
  mergeObservedValues,
  opLabel,
  readResponseValue,
  selectSnapshotFields,
  type FieldFilterOp,
  type FilterFieldKind,
  type FilterableField,
  type SchemaSnapshot,
} from "./formFieldCatalog";

/** Profile key used for submissions predating the PublishKey column. */
export const DEFAULT_PROFILE_KEY = "production";

/** One condition on one of the selected form type's questions. */
export interface FieldFilter {
  /** Stable identity for React keys and removal — several conditions may share a key. */
  id: string;
  /** Question name. */
  key: string;
  kind: FilterFieldKind;
  op: FieldFilterOp;
  /** Single-value operators, and the lower bound of `between`. */
  value: string;
  /** Upper bound of `between`. */
  value2: string;
  /** Selected options for `anyOf` / `noneOf`. */
  values: string[];
}

export interface SubmissionFilterState {
  search: string;
  /** Level 1. "" = every form. The form/list title. */
  formType: string;
  /** "all" or a LifecycleStage value. */
  stage: string;
  submitter: string;
  /** yyyy-mm-dd, inclusive from start of day. */
  dateFrom: string;
  /** yyyy-mm-dd, inclusive to end of day. */
  dateTo: string;
  /** Level 2. "" = all, or a profile key. Scoped to the selected form. */
  publishProfile: string;
  /** Level 3. "" = all, or one version. Scoped to the selected form and profile. */
  formVersion: string;
  /** Level 4. Conditions on the questions in scope, AND-ed together. */
  fieldFilters: FieldFilter[];
}

export const EMPTY_SUBMISSION_FILTERS: SubmissionFilterState = {
  search: "",
  formType: "",
  stage: "all",
  submitter: "",
  dateFrom: "",
  dateTo: "",
  publishProfile: "",
  formVersion: "",
  fieldFilters: [],
};

/**
 * A submission reduced to what filtering needs. Every list view maps its own row
 * type onto this, so one implementation serves all of them.
 */
export interface FilterableRecord {
  formType: string;
  profileKey: string;
  formVersion: string;
  stage: LifecycleStage;
  submittedAt: string | null;
  /** Values the free-text search scans (title, ids, reference number). */
  searchTexts: (string | null | undefined)[];
  /** Values the submitter filter scans (name and address spellings). */
  submitterTexts: (string | null | undefined)[];
  /** The submitted answers, keyed by question name. */
  data: Record<string, unknown>;
}

let fieldFilterSeq = 0;

/** Build a blank condition for a field, pre-set to that kind's usual operator. */
export function createFieldFilter(field: FilterableField): FieldFilter {
  fieldFilterSeq += 1;
  return {
    id: `ff-${fieldFilterSeq}`,
    key: field.key,
    kind: field.kind,
    op: defaultOpForKind(field.kind),
    value: "",
    value2: "",
    values: [],
  };
}

// ── value coercion ──────────────────────────────────────────────────────────

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return toText(record.text ?? record.value ?? "");
  }
  return "";
}

/** Answers that may be multi-valued (checkbox, tagbox, ranking) as a flat list. */
function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  const text = toText(value);
  return text ? [text] : [];
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = toText(value).replace(/[,\s]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = toText(value).toLowerCase();
  if (["true", "yes", "1", "y"].includes(text)) return true;
  if (["false", "no", "0", "n"].includes(text)) return false;
  return null;
}

/**
 * A calendar day number (yyyymmdd) for an answer, so dates compare without
 * timezone drift. Answers arrive either as `yyyy-mm-dd` or as a full ISO stamp;
 * the plain form is read literally rather than through `Date`, which would treat
 * it as UTC midnight and shift it a day for anyone east or west of Greenwich.
 */
function toDayNumber(value: unknown): number | null {
  const text = toText(value);
  if (!text) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (plain) return Number(plain[1]) * 10000 + Number(plain[2]) * 100 + Number(plain[3]);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear() * 10000 + (parsed.getMonth() + 1) * 100 + parsed.getDate();
}

/** Minutes since midnight, for `time` answers and `HH:MM` filter bounds. */
function toMinuteOfDay(value: unknown): number | null {
  const text = toText(value);
  if (!text) return null;
  const direct = /^(\d{1,2}):(\d{2})/.exec(text);
  if (direct) {
    const hours = Number(direct[1]);
    const minutes = Number(direct[2]);
    if (hours <= 23 && minutes <= 59) return hours * 60 + minutes;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

// ── field conditions ────────────────────────────────────────────────────────

/** Does one answer satisfy one condition? Exported for tests. */
export function fieldFilterMatches(answer: unknown, filter: FieldFilter): boolean {
  if (filter.op === "isEmpty") return isBlank(answer);
  if (filter.op === "isNotEmpty") return !isBlank(answer);
  if (filter.op === "isTrue") return toBoolean(answer) === true;
  if (filter.op === "isFalse") return toBoolean(answer) === false;

  switch (filter.kind) {
    case "choice": {
      // An unset multi-select is not a constraint — an admin who opened the
      // condition but picked nothing should still see everything.
      if (!filter.values.length) return true;
      const answers = toTextList(answer).map((entry) => entry.toLowerCase());
      const wanted = filter.values.map((entry) => entry.toLowerCase());
      const overlaps = wanted.some((entry) => answers.includes(entry));
      return filter.op === "noneOf" ? !overlaps : overlaps;
    }

    case "number": {
      const actual = toNumber(answer);
      if (actual === null) return false;
      const first = toNumber(filter.value);
      const second = toNumber(filter.value2);
      switch (filter.op) {
        case "between":
          if (first !== null && actual < first) return false;
          if (second !== null && actual > second) return false;
          return true;
        case "gte":
          return first === null || actual >= first;
        case "lte":
          return first === null || actual <= first;
        default:
          return first === null || actual === first;
      }
    }

    case "date":
    case "datetime": {
      const actual = toDayNumber(answer);
      if (actual === null) return false;
      const first = toDayNumber(filter.value);
      const second = toDayNumber(filter.value2);
      switch (filter.op) {
        case "between":
          if (first !== null && actual < first) return false;
          if (second !== null && actual > second) return false;
          return true;
        case "before":
          return first === null || actual < first;
        case "after":
          return first === null || actual > first;
        default:
          return first === null || actual === first;
      }
    }

    case "time": {
      const actual = toMinuteOfDay(answer);
      if (actual === null) return false;
      const first = toMinuteOfDay(filter.value);
      const second = toMinuteOfDay(filter.value2);
      switch (filter.op) {
        case "between":
          if (first !== null && actual < first) return false;
          if (second !== null && actual > second) return false;
          return true;
        case "before":
          return first === null || actual < first;
        case "after":
          return first === null || actual > first;
        default:
          return first === null || actual === first;
      }
    }

    case "boolean":
      return true;

    default: {
      const needle = filter.value.trim().toLowerCase();
      if (!needle) return true;
      const haystack = toText(answer).toLowerCase();
      switch (filter.op) {
        case "notContains":
          return !haystack.includes(needle);
        case "is":
          return haystack === needle;
        case "isNot":
          return haystack !== needle;
        default:
          return haystack.includes(needle);
      }
    }
  }
}

// ── record matching ─────────────────────────────────────────────────────────

/**
 * Lowercased text for matching. SharePoint returns null for any column never
 * written, and adapters hand those through, so this never assumes a string.
 */
function haystack(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

/** Reference with separators removed, for punctuation-insensitive matching. */
function compactReference(value: string | null | undefined): string {
  return haystack(value).replace(/[^a-z0-9]/g, "");
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a yyyy-mm-dd filter value as a LOCAL calendar date.
 * `new Date("2026-07-10")` parses as UTC midnight, which shifts the range by the
 * timezone offset. Admins pick dates in their own timezone, so the boundaries
 * must be local.
 */
function parseFilterDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: string): Date | null {
  const date = parseFilterDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string): Date | null {
  const date = parseFilterDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function recordMatchesFilters(record: FilterableRecord, filters: SubmissionFilterState): boolean {
  if (filters.search) {
    // Reference numbers are the ID people actually quote, so they are matched
    // with separators stripped too — someone searching "0408260001" or pasting
    // "osh-040826-0001" should land on the same record as "040826-0001".
    const needle = filters.search.toLowerCase();
    const compactNeedle = compactReference(needle);
    const matched =
      record.searchTexts.some((value) => haystack(value).includes(needle)) ||
      (!!compactNeedle && record.searchTexts.some((value) => compactReference(value).includes(compactNeedle)));
    if (!matched) return false;
  }

  if (filters.formType && record.formType !== filters.formType) return false;

  if (filters.stage !== "all" && record.stage !== filters.stage) return false;

  if (filters.submitter) {
    const needle = filters.submitter.toLowerCase();
    if (!record.submitterTexts.some((candidate) => haystack(candidate).includes(needle))) return false;
  }

  if (filters.dateFrom || filters.dateTo) {
    const submitted = parseDate(record.submittedAt);
    if (!submitted) return false;
    const from = filters.dateFrom ? startOfDay(filters.dateFrom) : null;
    const to = filters.dateTo ? endOfDay(filters.dateTo) : null;
    if (from && submitted < from) return false;
    if (to && submitted > to) return false;
  }

  if (filters.publishProfile && record.profileKey !== filters.publishProfile) return false;

  if (filters.formVersion && record.formVersion !== filters.formVersion) return false;

  for (const fieldFilter of filters.fieldFilters) {
    if (!fieldFilterMatches(readResponseValue(record.data, fieldFilter.key), fieldFilter)) return false;
  }

  return true;
}

export function getSubmissionProfileKey(item: Pick<Submission, "publishKey">): string {
  return (item.publishKey ?? "").trim() || DEFAULT_PROFILE_KEY;
}

export function getSubmissionStage(item: Pick<Submission, "formStatus" | "currentLayerStatus">): LifecycleStage {
  return resolveLifecycleStage({
    formStatus: item.formStatus,
    currentLayerStatus: item.currentLayerStatus,
  });
}

export function toFilterableRecord(item: Submission): FilterableRecord {
  return {
    formType: item.listTitle,
    profileKey: getSubmissionProfileKey(item),
    formVersion: item.formVersion,
    stage: getSubmissionStage(item),
    submittedAt: item.submittedAt,
    searchTexts: [item.title, item.formId, item.submissionId, item.referenceNo ?? ""],
    submitterTexts: [
      item.submittedByEmail,
      item.submitterName ?? "",
      item.createdByName ?? "",
      item.createdByEmail ?? "",
    ],
    data: item.submissionData,
  };
}

export function submissionMatchesFilters(item: Submission, filters: SubmissionFilterState): boolean {
  return recordMatchesFilters(toFilterableRecord(item), filters);
}

// ── option collectors ───────────────────────────────────────────────────────

export interface FormTypeOption {
  title: string;
  count: number;
}

/**
 * Form types present in the data, with how many submissions each holds.
 * `knownTitles` keeps forms that exist but have no submissions yet in the picker,
 * so the list of form types matches what the admin knows the site to have.
 */
export function collectFormTypes(items: Submission[], knownTitles: string[] = []): FormTypeOption[] {
  const counts = new Map<string, number>();
  for (const title of knownTitles) counts.set(title, 0);
  for (const item of items) {
    counts.set(item.listTitle, (counts.get(item.listTitle) ?? 0) + 1);
  }
  return Array.from(counts, ([title, count]) => ({ title, count })).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Publish profiles present, narrowed to a form type when one is selected —
 * a profile belongs to a form, so offering every form's profiles at once
 * produces choices that match nothing.
 */
export function collectPublishProfiles(items: Submission[], formType = ""): string[] {
  const profiles = new Set<string>();
  for (const item of items) {
    if (formType && item.listTitle !== formType) continue;
    profiles.add(getSubmissionProfileKey(item));
  }
  return Array.from(profiles).sort((a, b) => a.localeCompare(b));
}

export interface FormVersionOption {
  version: string;
  count: number;
}

/**
 * Versions that actually have submissions, narrowed to the form and — when one
 * is chosen — the profile above them. Newest first, by the numeric ordering
 * "10.0" needs and a plain string sort would get wrong.
 */
export function collectFormVersions(
  items: Submission[],
  formType: string,
  publishProfile = "",
): FormVersionOption[] {
  if (!formType) return [];
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.listTitle !== formType) continue;
    if (publishProfile && getSubmissionProfileKey(item) !== publishProfile) continue;
    const version = (item.formVersion || "").trim();
    if (!version) continue;
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return Array.from(counts, ([version, count]) => ({ version, count })).sort((a, b) =>
    compareVersionsDescending(a.version, b.version),
  );
}

/** Newest-first ordering for dotted version strings, falling back to text. */
export function compareVersionsDescending(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const numA = Number(partsA[i] ?? 0);
    const numB = Number(partsB[i] ?? 0);
    if (Number.isNaN(numA) || Number.isNaN(numB)) return b.localeCompare(a);
    if (numA !== numB) return numB - numA;
  }
  return 0;
}

/**
 * The published cuts of one form, one per version+profile pair. A form usually
 * has a handful of these while it may have thousands of submissions, so the
 * schemas are de-duplicated rather than re-parsed per row.
 */
export function collectSchemaSnapshots(items: Submission[], formType: string): SchemaSnapshot[] {
  if (!formType) return [];
  const snapshots: SchemaSnapshot[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.listTitle !== formType || !item.surveyJson) continue;
    const profileKey = getSubmissionProfileKey(item);
    const snapshotKey = `${item.formVersion}::${profileKey}`;
    if (seen.has(snapshotKey)) continue;
    seen.add(snapshotKey);
    snapshots.push({ formVersion: item.formVersion, profileKey, fields: fieldsFromSurveyJson(item.surveyJson) });
  }
  return snapshots;
}

/**
 * The questions in scope, taken from the published schemas riding on the form's
 * own submissions and widened by the answers actually recorded. Returns nothing
 * until a form is picked: field conditions are meaningless across forms that ask
 * different questions.
 *
 * Narrowing to a profile or version narrows the questions with it, so an admin
 * filtering one version is offered exactly what that version asked. With neither
 * chosen the versions are unioned, because a question the form has since dropped
 * still has historical answers worth finding.
 */
export function collectFieldCatalog(
  items: Submission[],
  formType: string,
  selection: { publishProfile?: string; formVersion?: string } = {},
): FilterableField[] {
  if (!formType) return [];
  const scoped = items.filter(
    (item) =>
      item.listTitle === formType &&
      (!selection.publishProfile || getSubmissionProfileKey(item) === selection.publishProfile) &&
      (!selection.formVersion || item.formVersion === selection.formVersion),
  );
  const answers = scoped.map((item) => item.submissionData);
  const catalog = selectSnapshotFields(collectSchemaSnapshots(items, formType), {
    profileKey: selection.publishProfile,
    formVersion: selection.formVersion,
  });
  // No usable snapshot for this cut — read the questions off the answers instead,
  // so a form whose schema never made it into the version list is still filterable.
  if (!catalog.length) return mergeObservedValues(fieldsFromResponses(answers), answers);
  return mergeObservedValues(catalog, answers);
}

// ── sorting and summaries ───────────────────────────────────────────────────

export function sortSubmissions(items: Submission[], sortBy: string): Submission[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (a.submittedAt || "").localeCompare(b.submittedAt || "");
      case "status":
        return getSubmissionStage(a).localeCompare(getSubmissionStage(b));
      case "list":
        return a.listTitle.localeCompare(b.listTitle);
      default:
        return (b.submittedAt || "").localeCompare(a.submittedAt || "");
    }
  });
}

/**
 * How many constraints are applied. Each field condition counts on its own, so
 * the badge reflects how narrow the view actually is rather than counting the
 * whole stack as one.
 */
export function countActiveFilters(filters: SubmissionFilterState): number {
  let count = filters.fieldFilters.length;
  if (filters.search !== EMPTY_SUBMISSION_FILTERS.search) count += 1;
  if (filters.formType !== EMPTY_SUBMISSION_FILTERS.formType) count += 1;
  if (filters.stage !== EMPTY_SUBMISSION_FILTERS.stage) count += 1;
  if (filters.submitter !== EMPTY_SUBMISSION_FILTERS.submitter) count += 1;
  if (filters.dateFrom !== EMPTY_SUBMISSION_FILTERS.dateFrom) count += 1;
  if (filters.dateTo !== EMPTY_SUBMISSION_FILTERS.dateTo) count += 1;
  if (filters.publishProfile !== EMPTY_SUBMISSION_FILTERS.publishProfile) count += 1;
  if (filters.formVersion !== EMPTY_SUBMISSION_FILTERS.formVersion) count += 1;
  return count;
}

export function hasActiveFilters(filters: SubmissionFilterState): boolean {
  return countActiveFilters(filters) > 0;
}

// ── walking the hierarchy ───────────────────────────────────────────────────
//
// Each of these replaces one level and clears the levels beneath it. Keeping a
// stale child would silently filter on a profile, version or question the new
// parent does not have, which reads as "the dashboard is broken".

/** Level 1. Replaces the form, and drops its profile, version and conditions. */
export function applyFormTypeChange(
  filters: SubmissionFilterState,
  formType: string,
): SubmissionFilterState {
  if (filters.formType === formType) return filters;
  return { ...filters, formType, publishProfile: "", formVersion: "", fieldFilters: [] };
}

/** Level 2. Replaces the profile, and drops its version and conditions. */
export function applyPublishProfileChange(
  filters: SubmissionFilterState,
  publishProfile: string,
): SubmissionFilterState {
  if (filters.publishProfile === publishProfile) return filters;
  return { ...filters, publishProfile, formVersion: "", fieldFilters: [] };
}

/**
 * Level 3. Replaces the version and drops its conditions — the catalogue narrows
 * to that version's questions, so a condition on one the version never asked
 * would match nothing and be impossible to see or correct.
 */
export function applyFormVersionChange(
  filters: SubmissionFilterState,
  formVersion: string,
): SubmissionFilterState {
  if (filters.formVersion === formVersion) return filters;
  return { ...filters, formVersion, fieldFilters: [] };
}

/** One-line description of a condition, for the active-filter chips. */
export function describeFieldFilter(filter: FieldFilter, field?: FilterableField): string {
  const label = field?.label ?? filter.key;
  const verb = opLabel(filter.op);

  if (filter.op === "isEmpty" || filter.op === "isNotEmpty" || filter.op === "isTrue" || filter.op === "isFalse") {
    return `${label} ${verb}`;
  }

  if (filter.op === "anyOf" || filter.op === "noneOf") {
    if (!filter.values.length) return `${label} ${verb} …`;
    const labels = filter.values.map(
      (value) => field?.choices?.find((choice) => choice.value === value)?.label ?? value,
    );
    const shown = labels.slice(0, 2).join(", ");
    return labels.length > 2 ? `${label} ${verb} ${shown} +${labels.length - 2}` : `${label} ${verb} ${shown}`;
  }

  if (filter.op === "between") {
    const from = filter.value || "…";
    const to = filter.value2 || "…";
    return `${label} ${verb} ${from} – ${to}`;
  }

  return `${label} ${verb} ${filter.value || "…"}`;
}
