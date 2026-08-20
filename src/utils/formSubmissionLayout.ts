import { isManagedCompanyQuestion } from "./companySelection";

type SurveyElement = Record<string, unknown>;

export interface FormSubmissionField {
  key: string;
  label: string;
  type: string;
  inputType?: string;
  choices?: unknown[];
  rateValues?: unknown[];
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  rows?: number;
  labelTrue?: string;
  labelFalse?: string;
  value: unknown;
  kind: "field" | "matrix";
  matrixColumns?: { name: string; title: string; cellType?: string; choices?: unknown[] }[];
  matrixRows?: Record<string, unknown>[];
}

export interface FormSubmissionSection {
  id: string;
  title: string;
  fields: FormSubmissionField[];
}

interface BuildFormSubmissionSectionsOptions {
  fallbackSectionTitle?: string;
  formatFallbackLabel?: (key: string) => string;
  includeAdditionalFields?: boolean;
  /**
   * Keep a question nobody answered.
   *
   * A submission record is a record of what was *asked* as much as of what was
   * said back: a permit whose unanswered items are simply absent reads as a
   * shorter form than the one that was signed, and the reader has no way to
   * tell a question that was skipped from one that was never on the page.
   * Callers that print a record pass this; callers that summarise it do not.
   */
  includeUnansweredFields?: boolean;
  shouldIncludeField?: (key: string, value: unknown, element?: SurveyElement) => boolean;
}

const LAYOUT_TYPES = new Set([
  "html",
  "image",
  "spacer",
  "divider",
  "pagebreak",
  "videeembed",
  "videoembed",
  "alert",
  "countdown",
  "datatable",
  "chartdisplay",
]);

const MATRIX_TYPES = new Set(["dynamicmatrix", "matrixdynamic", "tableinput"]);

/**
 * Repeating panels — "repeater" in the builder, `paneldynamic` on the wire.
 *
 * A repeater is not a heading with questions under it, which is how it used to
 * be read here. It is one question whose answer is a list of rows: the work
 * performers on a permit, the crew signing on, the attendees at a briefing. Its
 * template questions are never answered in their own right, so walking into
 * them printed a filled-in panel as a run of blank questions while the rows
 * themselves fell through to "Additional data" as raw JSON — the crew missing
 * from the record of the job they did.
 */
const REPEATER_TYPES = new Set(["paneldynamic", "repeater"]);

const CHILD_ELEMENT_KEYS = ["elements", "templateElements", "questions"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function decodeSharePointKey(key: string): string {
  return key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

function lookupKey(value: string): string {
  return decodeSharePointKey(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildResponseKeyLookup(responseData: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(responseData)) {
    const normalized = lookupKey(key);
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, key);
  }
  return lookup;
}

function resolveResponseKey(
  responseData: Record<string, unknown>,
  lookup: Map<string, string>,
  key: string,
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(responseData, key)) return key;
  return lookup.get(lookupKey(key));
}

function elementLabel(element: SurveyElement, fallback: string): string {
  return textValue(element.title) || textValue(element.name) || fallback;
}

function isDefaultPageName(value: string): boolean {
  return /^page\d*$/i.test(value.trim());
}

function pageTitle(page: SurveyElement, fallback: string): string {
  const title = textValue(page.title);
  if (title) return title;
  const name = textValue(page.name);
  return name && !isDefaultPageName(name) ? name : fallback;
}

function getChildElements(element: SurveyElement): SurveyElement[] {
  const children: SurveyElement[] = [];
  for (const key of CHILD_ELEMENT_KEYS) {
    const value = element[key];
    if (Array.isArray(value)) {
      children.push(...value.filter(isRecord));
    }
  }

  const columns = element.columns;
  if (Array.isArray(columns) && !MATRIX_TYPES.has(textValue(element.type).toLowerCase())) {
    for (const column of columns) {
      if (isRecord(column) && Array.isArray(column.elements)) {
        children.push(...column.elements.filter(isRecord));
      }
    }
  }

  return children;
}

function matrixColumns(element: SurveyElement): { name: string; title: string; cellType?: string; choices?: unknown[] }[] {
  const columns = element.columns;
  if (!Array.isArray(columns)) return [];
  return columns.filter(isRecord).map((column) => {
    const name = textValue(column.name);
    return {
      name,
      title: textValue(column.title) || name,
      cellType: textValue(column.cellType) || textValue(column.type) || undefined,
      choices: Array.isArray(column.choices) ? column.choices : undefined,
    };
  }).filter((column) => column.name);
}

/**
 * The rows inside a stored value, whatever wrapping it arrived in.
 *
 * A table of rows reaches a reader in three shapes: the array itself, straight
 * off the form; `{ rows: [...] }`, the way matrix child items are attached; and
 * the JSON text a SharePoint single-line column holds, because only a
 * MultiChoice column takes an array and a table is neither. Reading only the
 * first two is what left a repeating panel read back from SharePoint looking
 * like a wall of JSON rather than a list of people.
 */
function rowsWithin(value: unknown): Record<string, unknown>[] {
  const unwrapped = typeof value === "string" ? parseJsonValue(value) : value;
  if (Array.isArray(unwrapped)) return unwrapped.filter(isRecord);
  if (isRecord(unwrapped) && Array.isArray(unwrapped.rows)) return unwrapped.rows.filter(isRecord);
  return [];
}

function parseJsonValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function matrixRows(key: string, responseData: Record<string, unknown>, lookup: Map<string, string>): Record<string, unknown>[] {
  const childRowsKey = resolveResponseKey(responseData, lookup, `${key}_childRows`);
  const childRows = childRowsKey ? responseData[childRowsKey] : undefined;
  const childRowsParsed = rowsWithin(childRows);
  if (childRowsParsed.length > 0) return childRowsParsed;

  const directKey = resolveResponseKey(responseData, lookup, key);
  return rowsWithin(directKey ? responseData[directKey] : undefined);
}

/**
 * A repeating panel's columns: the questions its template asks, flattened.
 *
 * A template may group its questions in a panel or a column set for the sake of
 * the layout on screen. Those are arrangements of one row's fields, not rows of
 * their own, so they are walked through rather than treated as columns.
 */
function repeaterColumns(element: SurveyElement): { name: string; title: string; cellType?: string; choices?: unknown[] }[] {
  const columns: { name: string; title: string; cellType?: string; choices?: unknown[] }[] = [];

  const visit = (elements: SurveyElement[]): void => {
    for (const child of elements) {
      const type = textValue(child.type).toLowerCase();
      const name = textValue(child.name);
      const grandChildren = getChildElements(child);
      if (grandChildren.length > 0 && !REPEATER_TYPES.has(type) && !MATRIX_TYPES.has(type)) {
        visit(grandChildren);
        continue;
      }
      if (!name || LAYOUT_TYPES.has(type)) continue;
      columns.push({
        name,
        title: textValue(child.title) || name,
        // The cell is formatted by what it holds, and for a text question that
        // is its `inputType` — `date` rather than `text` — so a date in a row
        // prints the way the same date prints outside one.
        cellType: textValue(child.inputType) || type || undefined,
        choices: Array.isArray(child.choices) ? child.choices : undefined,
      });
    }
  };

  visit(getChildElements(element));
  return columns;
}

function responseValueForElement(
  element: SurveyElement,
  responseData: Record<string, unknown>,
  lookup: Map<string, string>,
): { value: unknown; usedKeys: string[] } {
  const key = textValue(element.name);
  const type = textValue(element.type).toLowerCase();
  if (!key) return { value: undefined, usedKeys: [] };

  if (MATRIX_TYPES.has(type)) {
    for (const suffix of ["_childRows", "_Response", "_Html"]) {
      const resolvedKey = resolveResponseKey(responseData, lookup, `${key}${suffix}`);
      const resolvedValue = resolvedKey ? responseData[resolvedKey] : undefined;
      if (resolvedKey && hasDisplayValue(resolvedValue)) return { value: resolvedValue, usedKeys: [resolvedKey] };
    }
  }

  const resolvedKey = resolveResponseKey(responseData, lookup, key);
  return {
    value: resolvedKey ? responseData[resolvedKey] : undefined,
    usedKeys: resolvedKey ? [resolvedKey] : [],
  };
}

/**
 * One level's worth of "where do the next fields go".
 *
 * Sections used to be keyed by title, so every field claiming a title joined
 * the one section that carried it no matter where on the form it was asked.
 * That reads correctly only when the panels come last: a question sitting
 * between two panels was pulled back up into whichever section had opened
 * first. A submission is a record of what was asked, so it is laid out in the
 * order it was asked, and a run of fields that resumes after a panel opens a
 * section of its own.
 */
interface SectionRun {
  /** Where fields at this level are landing, until a panel interrupts them. */
  current: FormSubmissionSection | null;
  /** Whether this level has already printed its heading. */
  titled: boolean;
}

function openSection(
  sections: FormSubmissionSection[],
  run: SectionRun,
  sectionTitle: string,
): FormSubmissionSection {
  const title = sectionTitle || "Submitted answers";
  const section: FormSubmissionSection = {
    // Two runs of the same panel can both be on the page, so the position is
    // what makes the id unique — callers use it as a React key.
    id: `${sections.length}:${title}`,
    // Only the first run under a heading carries it. A run resuming after a
    // nested panel is the rest of the section above it, and repeating the
    // heading would read as a second section rather than as a continuation.
    title: run.titled ? "" : title,
    fields: [],
  };
  sections.push(section);
  run.current = section;
  run.titled = true;
  return section;
}

/**
 * Companion columns: a second copy of an answer that already has a row.
 *
 * `_Response` and `_Html` hold the rendered form of a matrix the table above
 * has already drawn, so listing them again prints the same answer twice - once
 * as a table and once as a wall of markup.
 */
function shouldSkipAdditionalKey(key: string): boolean {
  return key.endsWith("_Json")
    || key.endsWith("_RowIds")
    || key.endsWith("_childRows")
    || key.endsWith("_Response")
    || key.endsWith("_Html");
}

export function buildFormSubmissionSections(
  surveyJson: unknown,
  responseData: Record<string, unknown>,
  options: BuildFormSubmissionSectionsOptions = {},
): FormSubmissionSection[] {
  const sections: FormSubmissionSection[] = [];
  const usedKeys = new Set<string>();
  const fallbackSectionTitle = options.fallbackSectionTitle ?? "Submitted answers";
  const includeAdditionalFields = options.includeAdditionalFields ?? true;
  const includeUnansweredFields = options.includeUnansweredFields ?? false;
  const formatFallbackLabel = options.formatFallbackLabel ?? ((key: string) => key);
  const responseKeyLookup = buildResponseKeyLookup(responseData);

  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages.filter(isRecord) : [];

  const visitElements = (elements: SurveyElement[], currentSectionTitle: string, run: SectionRun) => {
    for (const element of elements) {
      const type = textValue(element.type).toLowerCase();
      const key = textValue(element.name);
      const children = getChildElements(element);

      if (REPEATER_TYPES.has(type) && key) {
        const { value, usedKeys: matchedResponseKeys } = responseValueForElement(element, responseData, responseKeyLookup);
        const rows = rowsWithin(value);
        if (rows.length > 0 || hasDisplayValue(value)) {
          if (!options.shouldIncludeField || options.shouldIncludeField(key, value, element)) {
            usedKeys.add(key);
            for (const matchedKey of matchedResponseKeys) usedKeys.add(matchedKey);
            const target = run.current ?? openSection(sections, run, currentSectionTitle || fallbackSectionTitle);
            target.fields.push({
              key,
              label: elementLabel(element, formatFallbackLabel(key)),
              type,
              value,
              // A value that held no rows keeps its own row rather than an
              // empty table: whatever is stored against the question is what
              // the record has to show, even when it cannot be read as a list.
              kind: rows.length > 0 ? "matrix" : "field",
              matrixColumns: repeaterColumns(element),
              matrixRows: rows.length > 0 ? rows : undefined,
            });
          }
          continue;
        }
        // Nothing stored: the panel is a heading over the questions it asks,
        // which is what a blank record printed for signing by hand needs.
        const emptyPanelTitle = elementLabel(element, currentSectionTitle || fallbackSectionTitle);
        visitElements(children, emptyPanelTitle, { current: null, titled: false });
        run.current = null;
        continue;
      }

      // A plain panel, and a repeating one with no name of its own to store an
      // answer under — both are headings over the questions they hold.
      if (type === "panel" || type === "paneldynamic") {
        const nextSectionTitle = elementLabel(element, currentSectionTitle || fallbackSectionTitle);
        visitElements(children, nextSectionTitle, { current: null, titled: false });
        // Whatever follows the panel was asked after it, so it opens a section
        // of its own instead of joining the one this level had open.
        run.current = null;
        continue;
      }

      if (children.length > 0 && (type === "columns" || !key)) {
        // A column set or an unnamed wrapper is a layout device, not a heading:
        // its fields belong to the run their parent already has open.
        visitElements(children, currentSectionTitle, run);
        continue;
      }

      if (!key || LAYOUT_TYPES.has(type) || isManagedCompanyQuestion(element)) continue;

      const { value, usedKeys: matchedResponseKeys } = responseValueForElement(element, responseData, responseKeyLookup);
      if (!hasDisplayValue(value) && !includeUnansweredFields) continue;
      if (options.shouldIncludeField && !options.shouldIncludeField(key, value, element)) continue;

      usedKeys.add(key);
      for (const matchedKey of matchedResponseKeys) usedKeys.add(matchedKey);
      usedKeys.add(`${key}_Response`);
      usedKeys.add(`${key}_Html`);
      usedKeys.add(`${key}_Json`);
      usedKeys.add(`${key}_RowIds`);
      usedKeys.add(`${key}_childRows`);

      const rows = MATRIX_TYPES.has(type) ? matrixRows(key, responseData, responseKeyLookup) : [];
      const target = run.current ?? openSection(sections, run, currentSectionTitle || fallbackSectionTitle);
      target.fields.push({
        key,
        label: elementLabel(element, formatFallbackLabel(key)),
        type,
        inputType: textValue(element.inputType) || undefined,
        choices: Array.isArray(element.choices) ? element.choices : undefined,
        rateValues: Array.isArray(element.rateValues) ? element.rateValues : undefined,
        rateMin: numberValue(element.rateMin),
        rateMax: numberValue(element.rateMax),
        minRateDescription: textValue(element.minRateDescription) || undefined,
        maxRateDescription: textValue(element.maxRateDescription) || undefined,
        min: numberValue(element.min),
        max: numberValue(element.max),
        prefix: textValue(element.prefix) || undefined,
        suffix: textValue(element.suffix) || undefined,
        rows: numberValue(element.rows),
        labelTrue: textValue(element.labelTrue) || undefined,
        labelFalse: textValue(element.labelFalse) || undefined,
        value,
        kind: MATRIX_TYPES.has(type) && rows.length > 0 ? "matrix" : "field",
        matrixColumns: MATRIX_TYPES.has(type) ? matrixColumns(element) : undefined,
        matrixRows: rows.length > 0 ? rows : undefined,
      });
    }
  };

  pages.forEach((page, pageIndex) => {
    const defaultTitle = pageIndex === 0 ? fallbackSectionTitle : `Page ${pageIndex + 1}`;
    const title = pageTitle(page, defaultTitle);
    const elements = Array.isArray(page.elements) ? page.elements.filter(isRecord) : [];
    visitElements(elements, title, { current: null, titled: false });
  });

  if (includeAdditionalFields) {
    const extra: SectionRun = { current: null, titled: false };
    for (const [key, value] of Object.entries(responseData)) {
      if (usedKeys.has(key) || shouldSkipAdditionalKey(key) || !hasDisplayValue(value)) continue;
      if (options.shouldIncludeField && !options.shouldIncludeField(key, value)) continue;
      const target = extra.current ?? openSection(sections, extra, "Additional data");
      target.fields.push({
        key,
        label: formatFallbackLabel(key),
        type: "",
        value,
        kind: "field",
      });
    }
  }

  // A section is opened by the field that goes into it, so none of them can be
  // empty and there is nothing to filter out.
  return sections;
}
