/**
 * evaluationSummaryRows.ts — which rows an evaluation layer's summary shows.
 *
 * Kept apart from the component so it can be tested directly, the same way
 * `approvalDashboardLayerProgress.ts` sits beside `ApprovalDashboard.tsx`.
 */

export interface EvaluationFieldDefinition {
  name: string;
  title: string;
  type: string;
  inputType?: string;
  choices?: unknown[];
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  currency?: string;
  currencySymbol?: string;
  locale?: string;
  decimalPlaces?: number;
  displayFormat?: string;
}

export interface EvaluationDisplayRow {
  field: EvaluationFieldDefinition;
  value: unknown;
  /** Set when another question stores its answer under this same field name. */
  sharedNameWith?: string;
}

const CONTAINER_TYPES = new Set(["panel", "paneldynamic", "page"]);
const DECORATION_TYPES = new Set(["html", "expression", "formula", "image"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatFieldName(key: string): string {
  return key
    .replace(/_x0020_/gi, " ")
    .replace(/_x002f_/gi, "/")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || key;
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function toFieldDefinition(element: Record<string, unknown>): EvaluationFieldDefinition {
  const name = typeof element.name === "string" ? element.name : "";
  return {
    name,
    title: typeof element.title === "string" && element.title.trim() ? element.title.trim() : formatFieldName(name),
    type: typeof element.type === "string" ? element.type : "text",
    inputType: typeof element.inputType === "string" ? element.inputType : undefined,
    choices: Array.isArray(element.choices) ? element.choices : undefined,
    rateMin: typeof element.rateMin === "number" ? element.rateMin : undefined,
    rateMax: typeof element.rateMax === "number" ? element.rateMax : undefined,
    minRateDescription: typeof element.minRateDescription === "string" ? element.minRateDescription : undefined,
    maxRateDescription: typeof element.maxRateDescription === "string" ? element.maxRateDescription : undefined,
    currency: typeof element.currency === "string" ? element.currency : undefined,
    currencySymbol: typeof element.currencySymbol === "string" ? element.currencySymbol : undefined,
    locale: typeof element.locale === "string" ? element.locale : undefined,
    decimalPlaces: typeof element.decimalPlaces === "number" ? element.decimalPlaces : undefined,
    displayFormat: typeof element.displayFormat === "string" ? element.displayFormat : undefined,
  };
}

/**
 * Declared fields, flattened in declaration order — containers contribute their
 * children, not themselves.
 *
 * Deduping is by name *and* title. Two questions that share a field name but ask
 * different things ("PTW Valid From" / "PTW Valid Till") are two rows the reader
 * needs to see; collapsing them to one silently drops half the permit. Only a
 * genuinely repeated element — same name, same title — is folded away.
 */
export function collectFieldDefinitions(elements: Record<string, unknown>[] | undefined): EvaluationFieldDefinition[] {
  const definitions: EvaluationFieldDefinition[] = [];
  const seen = new Set<string>();

  const visit = (element: Record<string, unknown>) => {
    const type = typeof element.type === "string" ? element.type : "";
    const name = typeof element.name === "string" ? element.name : "";
    if (name && !CONTAINER_TYPES.has(type) && !DECORATION_TYPES.has(type)) {
      const definition = toFieldDefinition(element);
      const identity = `${name} ${definition.title}`;
      if (!seen.has(identity)) {
        seen.add(identity);
        definitions.push(definition);
      }
    }
    for (const key of ["elements", "templateElements", "questions", "pages"]) {
      const children = element[key];
      if (Array.isArray(children)) children.filter(isRecord).forEach(visit);
    }
  };

  elements?.filter(isRecord).forEach(visit);
  return definitions;
}

/**
 * Every row to show: the layer's declared fields first — answered or not — then
 * anything the stored answer holds that the current layer config no longer
 * declares, so a renamed or removed question never takes its answer with it.
 */
export function collectDisplayRows(
  fields: Record<string, unknown>,
  definitions: EvaluationFieldDefinition[],
): EvaluationDisplayRow[] {
  const declared = new Set(definitions.map((definition) => definition.name));
  const titlesByName = new Map<string, string[]>();
  for (const definition of definitions) {
    titlesByName.set(definition.name, [...(titlesByName.get(definition.name) ?? []), definition.title]);
  }

  const rows: EvaluationDisplayRow[] = definitions.map((field) => {
    const sharing = (titlesByName.get(field.name) ?? []).filter((title) => title !== field.title);
    return {
      field,
      value: fields[field.name],
      ...(sharing.length > 0 ? { sharedNameWith: sharing.join(", ") } : {}),
    };
  });

  for (const [key, value] of Object.entries(fields)) {
    if (declared.has(key) || isEmptyValue(value)) continue;
    rows.push({ field: { name: key, title: formatFieldName(key), type: "text" }, value });
  }

  return rows;
}
