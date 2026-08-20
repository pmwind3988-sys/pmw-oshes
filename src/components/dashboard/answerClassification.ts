/**
 * answerClassification.ts — which of a record's keys are answers, and which are
 * the workflow's own marks on it.
 *
 * Schema first, name second. A form that published its questions has already
 * said what each one is, and that is taken as final; only a key no question
 * accounts for — an older record whose version could not be loaded — is
 * identified by what it is called.
 *
 * Reading the name first is what let a question called "Signature briefing
 * attended by" be lifted out of the answers and drawn as ink that would never
 * load, and a question asking for a method statement be relabelled as the
 * document this app generates. Both guesses take a filled-in answer off the
 * page, which is the one thing a record must never do.
 */

const CONTAINER_TYPES = new Set(["panel", "paneldynamic", "page", "columns"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The column holding the document this app generated for the record.
 *
 * Exactly one name, because it is a column this app writes rather than anything
 * an author could ask for.
 */
export function isGeneratedPdfColumn(key: string): boolean {
  return /^pdfurl$/i.test(key);
}

/** Reads like a signature, for a record whose form schema could not be loaded. */
function looksLikeSignatureName(key: string): boolean {
  return /signature/i.test(key);
}

function textRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Question names the published form declares, optionally narrowed to a type.
 *
 * `null` collects every question, which is what tells an answer apart from a
 * guess: a key the form asked about is an answer whatever it happens to be
 * called, and only a key the form has no question for is open to being
 * identified by its name alone.
 */
export function collectSurveyFieldKeysByType(surveyJson: unknown, targetTypes: Set<string> | null): Set<string> {
  const keys = new Set<string>();
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const pages = isRecord(root) && Array.isArray(root.pages) ? root.pages.filter(isRecord) : [];
  const childKeys = ["elements", "templateElements", "questions"] as const;

  const visit = (element: Record<string, unknown>) => {
    const type = textRecordValue(element, "type").toLowerCase();
    const name = textRecordValue(element, "name");
    if (name && (targetTypes ? targetTypes.has(type) : !CONTAINER_TYPES.has(type))) keys.add(name);

    for (const childKey of childKeys) {
      const children = element[childKey];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }

    if (type !== "dynamicmatrix" && type !== "matrixdynamic" && type !== "tableinput") {
      const columns = element.columns;
      if (Array.isArray(columns)) {
        for (const column of columns.filter(isRecord)) {
          const columnElements = column.elements;
          if (Array.isArray(columnElements)) columnElements.filter(isRecord).forEach(visit);
        }
      }
    }
  };

  for (const page of pages) {
    const elements = page.elements;
    if (Array.isArray(elements)) elements.filter(isRecord).forEach(visit);
  }

  return keys;
}

/**
 * How this record's keys are sorted into answers, signatures and documents.
 *
 * Schema first, name second. A form that published its questions says what
 * each one is, and that is taken as final; only a key no question accounts for
 * — an older record whose version could not be loaded — is identified by what
 * it is called. Reading the name first is what let a question called
 * "Signature briefing attended" be pulled out of the answers and drawn as a
 * picture that would never load.
 */
export interface AnswerClassifier {
  isSignature: (key: string) => boolean;
}

export function buildAnswerClassifier(surveyJson: unknown): AnswerClassifier {
  const questionKeys = collectSurveyFieldKeysByType(surveyJson, null);
  const signatureKeys = collectSurveyFieldKeysByType(surveyJson, new Set(["signaturepad", "signature"]));
  return {
    isSignature: (key) => signatureKeys.has(key) || (!questionKeys.has(key) && looksLikeSignatureName(key)),
  };
}
