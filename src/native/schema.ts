/**
 * Published SurveyJSON → the engine's own element model.
 *
 * The builder keeps writing SurveyJSON, and every form already published is
 * stored in that shape, so this reads it rather than replacing it. What it does
 * not do is carry SurveyJS's vocabulary any further inward: past this file a
 * field is a `NativeElement` with a `kind`, and the renderer never asks what
 * `inputType` a `text` question had or whether a panel is "native".
 *
 * The union is deliberately small. Thirty-nine builder types collapse to
 * sixteen published SurveyJS types, and those collapse again to the fourteen
 * kinds below — which is the real reason the output can look consistent: there
 * are only fourteen things to draw.
 */

export type NativeKind =
  | "text"
  | "textarea"
  | "select"
  | "single-choice"
  | "multi-choice"
  | "boolean"
  | "rating"
  | "slider"
  | "file"
  | "signature"
  | "table"
  | "ranking"
  | "repeater"
  | "readout"
  | "section"
  | "static";

/** The HTML input type a `text` kind resolves to. */
export type NativeInputType =
  | "text"
  | "number"
  | "email"
  | "tel"
  | "url"
  | "password"
  | "date"
  | "datetime-local"
  | "time";

export interface NativeChoice {
  value: string;
  text: string;
}

/**
 * One step on a rating scale, with the label its author gave it.
 *
 * The value stays a number when the published one is. A rating answer lands in
 * a SharePoint Number column, so turning `4` into `"4"` on the way through —
 * which `NativeChoice` would, being all strings — would submit the wrong type.
 */
export interface NativeRateStep {
  value: number | string;
  text: string;
}

export interface NativeColumn {
  name: string;
  title: string;
  cellType: "text" | "number" | "select" | "date" | "boolean";
  choices: NativeChoice[];
}

export interface NativeValidator {
  type: string;
  text: string;
  regex: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface NativeElement {
  /** Stable key for React and for scroll targets. Unique within a form. */
  id: string;
  kind: NativeKind;
  /** Data key. Empty for static content, which stores nothing. */
  name: string;
  title: string;
  description: string;
  required: boolean;
  requiredMessage: string;
  readOnly: boolean;
  /** Shares a row with the element before it (SurveyJS `startWithNewLine`). */
  inline: boolean;

  inputType: NativeInputType;
  placeholder: string;
  rows: number;
  maxLength: number;
  /**
   * `words | sentences | characters`, or "" to leave typing alone.
   *
   * A custom property the builder registers on SurveyJS `text` questions, so it
   * only ever appears on published JSON — but it appears on plenty of it, and a
   * name field that stopped capitalising itself would be a visible regression.
   */
  autocapitalize: string;
  min?: number;
  max?: number;
  step?: number;
  prefix: string;
  suffix: string;

  choices: NativeChoice[];
  colCount: number;
  hasOther: boolean;
  otherText: string;
  hasNone: boolean;
  noneText: string;
  maxSelections: number;

  labelTrue: string;
  labelFalse: string;

  rateMin: number;
  rateMax: number;
  /** Per-step labels. Empty means the scale is drawn as bare numbers. */
  rateValues: NativeRateStep[];
  minRateDescription: string;
  maxRateDescription: string;

  acceptedTypes: string;
  allowMultiple: boolean;
  maxSizeMb: number;

  columns: NativeColumn[];
  minRows: number;
  maxRows: number;
  addRowText: string;

  rankItems: NativeChoice[];

  /** Formula source, from the custom `_expression` prop or SurveyJS's own. */
  expression: string;
  decimals: number;
  displayStyle: "decimal" | "currency" | "percent";
  currency: string;

  /** Raw HTML for `static` elements. Sanitised at render time, never before. */
  html: string;
  imageUrl: string;
  /** `info | warning | error | success` when the static block is a callout. */
  tone: string;

  validators: NativeValidator[];
  visibleIf: string;
  enableIf: string;
  defaultValue: unknown;
  defaultValueExpression: string;

  /** Children — sections and repeaters only. */
  elements: NativeElement[];
  collapsible: boolean;
  startCollapsed: boolean;
}

export interface NativePage {
  id: string;
  name: string;
  title: string;
  description: string;
  elements: NativeElement[];
}

export interface NativeForm {
  title: string;
  description: string;
  pages: NativePage[];
  /** Every question in document order, sections flattened away. */
  questions: NativeElement[];
  /** `questions` keyed by name, for expression and validation lookups. */
  byName: Map<string, NativeElement>;
}

type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v === undefined || v === null ? fallback : String(v);

const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const optNum = (v: unknown): number | undefined => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * SurveyJS accepts three shapes for a choice — a bare string, `{value, text}`,
 * and `{value}` with no text. Published forms contain all three, because the
 * SharePoint choice enrichment writes `{value, text}` while the builder writes
 * strings.
 */
function toChoices(raw: unknown): NativeChoice[] {
  if (!Array.isArray(raw)) return [];
  const out: NativeChoice[] = [];
  for (const entry of raw) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === "object") {
      const o = entry as Raw;
      const value = str(o.value ?? o.text);
      if (!value) continue;
      out.push({ value, text: str(o.text ?? o.value, value) });
      continue;
    }
    const value = String(entry);
    if (!value) continue;
    out.push({ value, text: value });
  }
  return out;
}

/**
 * SurveyJS's `rateValues` — the same three shapes `toChoices` accepts, but
 * parsed separately so a numeric step keeps its number. See `NativeRateStep`.
 */
function toRateSteps(raw: unknown): NativeRateStep[] {
  if (!Array.isArray(raw)) return [];
  const out: NativeRateStep[] = [];
  for (const entry of raw) {
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry === "number") {
      out.push({ value: entry, text: String(entry) });
      continue;
    }
    if (typeof entry === "object") {
      const o = entry as Raw;
      const declared = o.value ?? o.text;
      if (declared === undefined || declared === null || declared === "") continue;
      const value = typeof declared === "number" ? declared : String(declared);
      out.push({ value, text: str(o.text ?? o.value, String(value)) });
      continue;
    }
    const text = String(entry);
    out.push({ value: text, text });
  }
  return out;
}

const CELL_TYPES: Record<string, NativeColumn["cellType"]> = {
  text: "text",
  comment: "text",
  number: "number",
  dropdown: "select",
  radiogroup: "select",
  checkbox: "select",
  date: "date",
  datetime: "date",
  boolean: "boolean",
};

function toValidators(raw: unknown): NativeValidator[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): NativeValidator[] => {
    if (!entry || typeof entry !== "object") return [];
    const o = entry as Raw;
    return [
      {
        type: str(o.type).toLowerCase(),
        text: str(o.text),
        regex: str(o.regex),
        minValue: optNum(o.minValue),
        maxValue: optNum(o.maxValue),
        minLength: optNum(o.minLength),
        maxLength: optNum(o.maxLength),
      },
    ];
  });
}

function toColumns(raw: unknown): NativeColumn[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, i): NativeColumn[] => {
    // A matrix authored as a plain list of headers — the `dynamicmatrix`
    // builder default — carries no cell type, so it is a text column.
    if (typeof entry === "string") {
      return [{ name: entry || `col${i + 1}`, title: entry || `Column ${i + 1}`, cellType: "text", choices: [] }];
    }
    if (!entry || typeof entry !== "object") return [];
    const o = entry as Raw;
    const name = str(o.name, `col${i + 1}`);
    const declared = str(o.cellType ?? o.type ?? o.inputType).toLowerCase();
    const choices = toChoices(o.choices);
    // A column with choices but no declared type is a dropdown in every
    // published form that has one; treating it as text would silently drop the
    // list the author configured.
    const cellType = CELL_TYPES[declared] ?? (choices.length > 0 ? "select" : "text");
    return [{ name, title: str(o.title, name), cellType, choices }];
  });
}

/** `text` questions carry their real type in `inputType`. */
function toInputType(raw: Raw): NativeInputType {
  const declared = str(raw.inputType).toLowerCase();
  switch (declared) {
    case "number":
    case "email":
    case "tel":
    case "url":
    case "password":
    case "date":
    case "time":
      return declared;
    case "datetime":
    case "datetime-local":
      return "datetime-local";
    default:
      return "text";
  }
}

/**
 * The capitalisation rule a `text` question was published with.
 *
 * "none" and anything unrecognised both mean leave typing alone, and are
 * flattened to "" so the control has one thing to test rather than two.
 */
function toAutocapitalize(raw: Raw): string {
  const declared = str(raw.autocapitalize).toLowerCase();
  return ["words", "sentences", "characters"].includes(declared) ? declared : "";
}

function alertTone(raw: Raw): string {
  const declared = str(raw.alertType).toLowerCase();
  return ["info", "warning", "error", "success"].includes(declared) ? declared : "";
}

/**
 * Which of the fourteen kinds this element is drawn as.
 *
 * The `dynamicmatrix` / `tableinput` / `columns` / `repeater` cases are the
 * builder's own type names: `buildSurveyJson` maps them to SurveyJS types on
 * publish, but forms published before a given mapping existed still carry the
 * raw name, and those forms must keep rendering.
 */
function toKind(type: string, raw: Raw): NativeKind {
  switch (type) {
    case "text":
      return "text";
    case "comment":
    case "jsoneditor":
      return "textarea";
    case "dropdown":
    case "hierarchy":
      return "select";
    case "radiogroup":
      return "single-choice";
    case "checkbox":
      return "multi-choice";
    case "boolean":
    case "consent":
      return "boolean";
    case "rating":
      return "rating";
    case "slider":
      return "slider";
    case "file":
    case "imageupload":
      return "file";
    case "signaturepad":
      return "signature";
    case "matrixdynamic":
    case "dynamicmatrix":
    case "tableinput":
      return "table";
    case "ranking":
      return "ranking";
    case "paneldynamic":
    case "repeater":
      return "repeater";
    case "expression":
      return "readout";
    case "panel":
    case "columns":
      return "section";
    case "html":
    case "image":
    case "alert":
    case "spacer":
    case "divider":
    case "videoembed":
    case "countdown":
    case "datatable":
    case "chartdisplay":
      return "static";
    default:
      // An unmapped type is far more likely to be a text variant than anything
      // else — every fallback in `mapFieldToSurveyJs` lands on `text` too —
      // and a plain input keeps the answer collectable either way.
      return raw.choices ? "single-choice" : "text";
  }
}

let seq = 0;

function toElement(raw: Raw, parentId: string, index: number): NativeElement {
  const type = str(raw.type, "text");
  const kind = toKind(type, raw);
  const name = str(raw.name);
  const choices = toChoices(raw.choices);
  const rankItems = toChoices(raw.rankItems ?? raw.choices);

  const el: NativeElement = {
    id: `${parentId}.${index}-${name || type}-${(seq += 1)}`,
    kind,
    name: kind === "static" || kind === "section" ? "" : name,
    title: str(raw.title, name),
    description: str(raw.description),
    required: bool(raw.isRequired),
    requiredMessage: str(raw.requiredErrorText),
    readOnly: bool(raw.readOnly),
    inline: raw.startWithNewLine === false,

    inputType: toInputType(raw),
    autocapitalize: toAutocapitalize(raw),
    placeholder: str(raw.placeholder ?? raw.placeHolder),
    rows: num(raw.rows, 4),
    maxLength: num(raw.maxLength, 0),
    min: optNum(raw.min ?? raw.minValue ?? raw.minDate),
    max: optNum(raw.max ?? raw.maxValue ?? raw.maxDate),
    step: optNum(raw.step ?? raw.stepValue),
    prefix: str(raw.prefix ?? raw.currencySymbol),
    suffix: str(raw.suffix),

    choices,
    colCount: num(raw.colCount, 1),
    hasOther: bool(raw.hasOther ?? raw.showOtherItem),
    // "Other (describe)" rather than "Other": an author who never set a label
    // published no `otherText` at all and got SurveyJS's built-in default, so
    // that string is what every such form has always shown. It is also what the
    // builder puts on the row while the author is looking at it.
    otherText: str(raw.otherText, "Other (describe)"),
    hasNone: bool(raw.hasNone ?? raw.showNoneItem),
    noneText: str(raw.noneText, "None"),
    maxSelections: num(raw.maxSelections, 0),

    labelTrue: str(raw.labelTrue, "Yes"),
    labelFalse: str(raw.labelFalse, "No"),

    rateMin: num(raw.rateMin, 1),
    rateMax: num(raw.rateMax, 5),
    rateValues: toRateSteps(raw.rateValues),
    minRateDescription: str(raw.minRateDescription),
    maxRateDescription: str(raw.maxRateDescription),

    acceptedTypes: str(raw.acceptedTypes ?? raw.acceptedTypes ?? raw.accept),
    allowMultiple: bool(raw.allowMultiple),
    maxSizeMb: num(raw.maxSize, 0),

    columns: toColumns(raw.columns ?? raw.tableConfigColumns ?? raw.matrixColumns),
    minRows: num(raw.minRows ?? raw.rowCount, 1),
    maxRows: num(raw.maxRows, 0),
    addRowText: str(raw.addRowText ?? raw.addRowButtonText ?? raw.addButtonText, "Add row"),

    rankItems,

    // `_expression` first: SurveyJS's native `expression` is also used by the
    // builder for scorecards, and forms published on either convention exist.
    expression: str(raw._expression ?? raw.expression),
    decimals: num(raw.maximumFractionDigits ?? raw.decimalPlaces, 2),
    displayStyle:
      str(raw.displayStyle) === "currency" ? "currency" : str(raw.displayStyle) === "percent" ? "percent" : "decimal",
    currency: str(raw.currency, "MYR"),

    html: str(raw.html),
    imageUrl: str(raw.imageLink ?? raw.imageUrl),
    tone: alertTone(raw),

    validators: toValidators(raw.validators),
    visibleIf: str(raw.visibleIf),
    enableIf: str(raw.enableIf),
    defaultValue: raw.defaultValue,
    defaultValueExpression: str(raw.defaultValueExpression),

    elements: [],
    collapsible: bool(raw.collapsible) || str(raw.state) !== "",
    startCollapsed: str(raw.state) === "collapsed",
  };

  const children = raw.elements ?? raw.templateElements;
  if (Array.isArray(children)) {
    el.elements = children
      .filter((c): c is Raw => !!c && typeof c === "object")
      .map((c, i) => toElement(c, el.id, i));
  }

  // A repeater keeps its own name — it stores an array — but it needs its
  // template elements, which SurveyJS puts under `templateElements`.
  if (kind === "repeater" && el.elements.length === 0 && Array.isArray(raw.templateElements)) {
    el.elements = (raw.templateElements as Raw[]).map((c, i) => toElement(c, el.id, i));
  }

  return el;
}

/**
 * `pagebreak` is a question in the builder's model but a page boundary in the
 * rendered form, so it is resolved here rather than being carried into the
 * renderer as an element nobody draws.
 */
function splitOnPageBreaks(raw: Raw[]): { title: string; description: string; elements: Raw[] }[] {
  const pages: { title: string; description: string; elements: Raw[] }[] = [
    { title: "", description: "", elements: [] },
  ];
  for (const el of raw) {
    if (str(el.type) === "pagebreak") {
      pages.push({
        title: str(el.pageTitle ?? el.title),
        description: str(el.pageDescription ?? el.description),
        elements: [],
      });
      continue;
    }
    pages[pages.length - 1].elements.push(el);
  }
  return pages.filter((p, i) => p.elements.length > 0 || i === 0);
}

function collectQuestions(elements: NativeElement[], out: NativeElement[]): void {
  for (const el of elements) {
    // A repeater's template fields are not questions of the form — their
    // answers live inside the repeater's own array value.
    if (el.kind === "repeater") {
      out.push(el);
      continue;
    }
    if (el.kind === "section") {
      collectQuestions(el.elements, out);
      continue;
    }
    if (el.name) out.push(el);
  }
}

/** Parse a published SurveyJSON document into the engine's model. */
export function parseForm(json: unknown): NativeForm {
  const root = (json && typeof json === "object" ? json : {}) as Raw;
  const rawPages = Array.isArray(root.pages) ? (root.pages as Raw[]) : [];

  const pages: NativePage[] = [];
  for (const rawPage of rawPages) {
    const rawElements = Array.isArray(rawPage.elements) ? (rawPage.elements as Raw[]) : [];
    const chunks = splitOnPageBreaks(rawElements.filter((e) => !!e && typeof e === "object"));
    for (const chunk of chunks) {
      const id = `p${pages.length}`;
      pages.push({
        id,
        name: str(rawPage.name, id),
        // A page break's own title wins over the SurveyJS page's, since the
        // break is what the author edited when they split the form.
        title: chunk.title || str(rawPage.title),
        description: chunk.description || str(rawPage.description),
        elements: chunk.elements.map((e, i) => toElement(e, id, i)),
      });
    }
  }

  const questions: NativeElement[] = [];
  for (const page of pages) collectQuestions(page.elements, questions);

  const byName = new Map<string, NativeElement>();
  for (const q of questions) if (q.name) byName.set(q.name, q);

  return {
    title: str(root.title),
    description: str(root.description),
    pages: pages.length > 0 ? pages : [{ id: "p0", name: "page1", title: "", description: "", elements: [] }],
    questions,
    byName,
  };
}
