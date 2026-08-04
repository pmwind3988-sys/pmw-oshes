/**
 * Loose enough for both the typed `SurveyJson` and the raw JSON the form page
 * holds before it is validated — the walk tolerates anything unexpected.
 */
type SurveyLike = { pages?: unknown } | null | undefined;

/**
 * Find a question in a published form by what it is likely called.
 *
 * This is the one honest use for name guessing: filling a field in as a
 * convenience, against the real schema, where a miss simply leaves the field
 * empty for the person to complete. It must never be used to decide where a
 * submitted answer gets stored — a wrong guess there silently drops data,
 * which is exactly what the built-in quick-report form used to do.
 */
const LOCATION_HINTS = [
  "location",
  "wherehappened",
  "where",
  "site",
  "area",
  "berth",
  "jetty",
  "place",
  "premise",
];

/** Question types that cannot meaningfully be pre-filled from a string. */
const UNFILLABLE_TYPES = new Set([
  "file",
  "html",
  "image",
  "imageupload",
  "signaturepad",
  "expression",
  "matrixdynamic",
  "dynamicmatrix",
  "tableinput",
  "checkbox",
  "boolean",
]);

function normalize(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function walkElements(
  elements: Record<string, unknown>[],
  visit: (element: Record<string, unknown>) => void,
): void {
  for (const element of elements) {
    visit(element);
    const nested = element.elements;
    if (Array.isArray(nested)) walkElements(nested as Record<string, unknown>[], visit);
  }
}

/** Name of the first question whose name or title matches one of the hints. */
export function findSurveyFieldByHints(surveyJson: SurveyLike, hints: readonly string[]): string {
  const pages = surveyJson?.pages;
  if (!Array.isArray(pages)) return "";
  let found = "";

  for (const page of pages as { elements?: unknown }[]) {
    const elements = page?.elements;
    walkElements(Array.isArray(elements) ? (elements as Record<string, unknown>[]) : [], (element) => {
      if (found) return;
      const fieldName = typeof element.name === "string" ? element.name : "";
      if (!fieldName) return;
      const type = typeof element.type === "string" ? element.type.toLowerCase() : "";
      if (UNFILLABLE_TYPES.has(type)) return;

      const title = typeof element.title === "string" ? element.title : "";
      const haystack = normalize(`${fieldName} ${title}`);
      if (hints.some((hint) => haystack.includes(hint))) found = fieldName;
    });
    if (found) break;
  }

  return found;
}

/** The question a QR poster's `?location=` should land in, if the form has one. */
export function findLocationField(surveyJson: SurveyLike): string {
  return findSurveyFieldByHints(surveyJson, LOCATION_HINTS);
}
