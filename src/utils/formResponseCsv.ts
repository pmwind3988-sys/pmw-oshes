/**
 * formResponseCsv.ts — a form's responses as a spreadsheet.
 *
 * The old export wrote the seven columns the admin table happened to show, so
 * the file answered "who submitted what, when" and nothing else. A response is
 * the answers plus the trail of decisions taken on them, and that is what a
 * spreadsheet of responses has to carry — otherwise the only complete copy of a
 * submission is its PDF, one file per record, unsortable.
 *
 * Four rules decide every cell:
 *
 *  1. **Columns come from the form, not from the data.** Answers are laid out in
 *     the order the questions were asked, under the titles their author wrote,
 *     through the same `buildFormSubmissionSections` the detail panel and the
 *     PDF read. A column an admin recognises from the form is worth more than
 *     the SharePoint internal name behind it.
 *  2. **Times are Malaysian.** Every stored instant is converted and its header
 *     says so; `malaysiaTime.ts` holds why a file cannot just use the clock of
 *     whoever exported it.
 *  3. **Numbers are numbers.** A question whose *type* is numeric emits a bare
 *     numeric cell — no quotes, no prefix, no thousands separator — so a column
 *     of ratings can be summed. Text stays text however numeric it looks: an IC
 *     or a phone number is an identifier, and `0123456789` turned into
 *     123456789 is a wrong answer, not a tidier one.
 *  4. **Nothing is silently dropped.** A picture becomes the base64 that carries
 *     it — the same bytes the PDF embeds, fetched by `collectExportImageData`
 *     before this runs — falling back to its link only when the base64 will not
 *     fit a cell. A matrix becomes its rows, a value nothing can parse is passed
 *     through as stored. A column empty in every row is the one thing left out,
 *     because it says nothing and costs a screen of scrolling.
 */
import { csvCell } from "./csv";
import { buildFormSubmissionSections, type FormSubmissionField, type FormSubmissionSection } from "./formSubmissionLayout";
import { formatPdfFieldValue } from "./pdfFieldFormatting";
import { collectImageSources } from "./pdfImageSources";
import { MALAYSIA_TIME_LABEL, formatMalaysiaDate, formatMalaysiaDateTime, formatMalaysiaTime } from "./malaysiaTime";

/** One decision in the chain, however it was recorded. */
export interface ResponseCsvLayer {
  layerNumber: number;
  type?: string;
  /** The layer's own name from `LayerConfig` — "HOD Review", "Safety Officer". */
  label?: string;
  status?: string;
  /** Whoever actually acted, which on a shared layer is not the routed mailbox. */
  actedBy?: string;
  decidedAt?: unknown;
  /** A rejection reason, or an evaluator's note. */
  remarks?: string;
  signature?: unknown;
  /** Answers an evaluation layer collected. */
  evaluationFields?: Record<string, unknown>;
  /** That layer's published questions, for their titles and their order. */
  evaluationSchema?: Record<string, unknown>[];
}

/** The identity block — what the response is, rather than what it says. */
export interface ResponseCsvRecord {
  id?: unknown;
  reference?: string;
  form?: string;
  category?: string;
  version?: string;
  company?: string;
  submittedBy?: string;
  submitterEmail?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
  status?: string;
  /**
   * The workflow's own status. Kept beside `status` because the two disagree on
   * purpose: the list's `Status` is the legacy per-layer string ("Approved Layer
   * 1") and `FormStatus` is where the submission is as a whole.
   */
  formStatus?: string;
  currentLayer?: unknown;
  totalLayers?: unknown;
  branch?: string;
  /** "Accepted", or whatever the form recorded. Blank on a form that asks nothing. */
  pdpaConsent?: unknown;
  pdpaNoticeVersion?: string;
  pdpaConsentAt?: unknown;
  /** When the record may be deleted — the PDPA schedule, per submission. */
  retentionUntil?: unknown;
  pdfUrl?: string;
}

/**
 * One column a screen adds beside the identity block.
 *
 * The portal's tables carry things no response list holds — which layer a record
 * is stuck on, how long it has sat there, whether that is past its SLA — all of
 * it derived when the submissions were read. An export of that screen has to
 * carry them or it is not an export of that screen, and inventing a second
 * opinion about dates and numbers to do it is exactly what this module exists to
 * prevent. So the screen names its columns and hands over the values; every rule
 * about quoting, clocks and bare numbers still lives here.
 */
export interface ResponseCsvExtra {
  /** Unique within the row. Becomes the column's identity, not its heading. */
  key: string;
  header: string;
  value: unknown;
  /** Emit bare when the whole value is a number, so the column can be summed. */
  numeric?: boolean;
  /** A stored instant. Converted to Malaysian time, and its header says so. */
  datetime?: boolean;
}

export interface ResponseCsvRow {
  record: ResponseCsvRecord;
  /** Columns this row's screen derived. Same order in the file as in the array. */
  extra?: ResponseCsvExtra[];
  /** The response's answer columns, as SharePoint returns them. */
  answers: Record<string, unknown>;
  /** The published schema this response was answered against. */
  surveyJson?: unknown;
  /** Matrix rows read from the child lists, keyed by question name. */
  matrixRows?: Record<string, Record<string, unknown>[]>;
  layers?: ResponseCsvLayer[];
}

export interface ResponseCsvOptions {
  /**
   * Site origin, for turning a server-relative attachment path into a link that
   * still opens from a file sitting in somebody's Downloads folder.
   */
  siteUrl?: string;
  /**
   * Pictures already fetched and re-encoded, keyed by the source they were read
   * from — what `collectExportImageData` hands back.
   *
   * A signature stored in SharePoint is a link nobody outside the site can
   * follow, so a spreadsheet that carries only the link has not exported the
   * signature. With this the cell carries the base64 instead, and the file shows
   * the ink to whoever opens it. Absent, every picture falls back to its link,
   * which is what a pure test and an export with no token both get.
   */
  imageData?: Map<string, string>;
}

/**
 * Excel refuses a cell longer than this, and base64 truncated halfway is
 * neither an image nor an honest blank.
 */
const EXCEL_CELL_LIMIT = 32_767;

const IMAGE_TYPES = new Set(["signaturepad", "signature", "file", "imageupload", "image"]);
const NUMERIC_TYPES = new Set(["rating", "slider", "counter", "duration"]);
const NUMERIC_INPUT_TYPES = new Set(["number", "range"]);
const DATE_TYPES = new Set(["date", "datetime"]);
const MATRIX_TYPES = new Set(["dynamicmatrix", "matrixdynamic", "tableinput"]);

/**
 * Named tags rather than `<\w+>`: an answer reading "load < 30kg" is text, and
 * a rule that treats it as markup would delete part of it.
 */
const MARKUP_RE = /<(table|thead|tbody|tr|td|th|p|div|br|hr|ul|ol|li|span|strong|em|b|i|a|h[1-6])\b[^>]*>/i;

/**
 * A cell knows whether it holds a number, because that decides whether it is
 * quoted, and whether it is empty, because that decides whether its column
 * survives at all.
 */
interface Cell {
  csv: string;
  empty: boolean;
}

const BLANK_CELL: Cell = { csv: "", empty: true };

/**
 * Leading characters Excel reads as the start of a formula. A submitter typing
 * `=HYPERLINK(...)` into a public form should not have it executed on an
 * admin's machine when the export is opened, so such a value is pushed back
 * into plain text — except where the lead is arithmetic rather than code, which
 * is every phone number written `+60...` and every negative quantity.
 */
const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;
const NUMBER_SHAPED_RE = /^[+-]?[\d\s()+-]*\d[\d\s()+-]*$/;

function guardFormula(text: string): string {
  return FORMULA_LEAD_RE.test(text) && !NUMBER_SHAPED_RE.test(text) ? `'${text}` : text;
}

function textCell(value: unknown): Cell {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return BLANK_CELL;
  return { csv: csvCell(guardFormula(text)), empty: false };
}

/** Bare, so the spreadsheet can sum the column. */
function numberCell(value: number): Cell {
  return { csv: String(value), empty: false };
}

/**
 * A number only when the whole value is one. `"12 boxes"` is a sentence, so it
 * keeps its text and nothing is invented.
 *
 * A leading zero disqualifies it whatever the question type says: `0123` typed
 * into a number input is an extension, a unit code or a phone number, and the
 * zero is part of the answer rather than a way of writing 123.
 */
function strictNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/,/g, "");
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
  if (/^[+-]?0\d/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrText(value: unknown): Cell {
  const numeric = strictNumber(value);
  return numeric === null ? textCell(value) : numberCell(numeric);
}

// ── Columns ────────────────────────────────────────────────────────────────

/**
 * Column groups, emitted in this order however the rows arrive.
 *
 * Without them a second form version that adds a question would append it after
 * the whole approval trail, because columns are discovered row by row. The group
 * keeps the answers together and the trail to the right of them.
 *
 * `extra` sits beside the identity block rather than out past the answers: a
 * screen's own columns are what its reader recognises the row by, and they are
 * useless as filters at column BQ.
 */
const GROUPS = ["record", "extra", "history", "answer", "layer"] as const;
type Group = (typeof GROUPS)[number];

interface Column {
  key: string;
  header: string;
  group: Group;
  /** Sorts within a group; ties fall back to the order columns were found in. */
  rank: number;
  index: number;
}

interface Sheet {
  columns: Map<string, Column>;
  headersTaken: Set<string>;
  rows: Map<string, Cell>[];
}

function newSheet(): Sheet {
  return { columns: new Map(), headersTaken: new Set(), rows: [] };
}

interface ColumnSpec {
  key: string;
  header: string;
  group: Group;
  rank?: number;
}

/** What a column is, for a reader who has two of them under one title. */
const GROUP_WORDS: Record<Group, string> = {
  record: "record",
  extra: "view",
  history: "history",
  answer: "answer",
  layer: "layer",
};

/**
 * What to put in brackets after a repeated title.
 *
 * The internal name, normally: a form asking "Date" twice has a `Start` and an
 * `End` behind it, and those are the words that tell them apart. Where the
 * internal name *is* the title — a question called `Location` beside the screen's
 * own Location column — repeating it says nothing, so the column is named by what
 * it is instead.
 */
function disambiguator(spec: ColumnSpec): string {
  const internal = spec.key.split(":").pop() ?? spec.key;
  const human = humanizeKey(internal);
  return human && human.toLowerCase() !== spec.header.trim().toLowerCase() ? internal : GROUP_WORDS[spec.group];
}

/**
 * Two questions can carry one title — a form asking "Date" in three sections is
 * ordinary — and two columns under one header is a spreadsheet nobody can read.
 */
function uniqueHeader(sheet: Sheet, spec: ColumnSpec): string {
  if (!sheet.headersTaken.has(spec.header)) return spec.header;
  const labelled = `${spec.header} (${disambiguator(spec)})`;
  if (!sheet.headersTaken.has(labelled)) return labelled;
  let suffix = 2;
  while (sheet.headersTaken.has(`${labelled} ${suffix}`)) suffix++;
  return `${labelled} ${suffix}`;
}

function declare(sheet: Sheet, spec: ColumnSpec): void {
  if (sheet.columns.has(spec.key)) return;
  const header = uniqueHeader(sheet, spec);
  sheet.headersTaken.add(header);
  sheet.columns.set(spec.key, { key: spec.key, header, group: spec.group, rank: spec.rank ?? 0, index: sheet.columns.size });
}

function put(sheet: Sheet, row: Map<string, Cell>, spec: ColumnSpec, cell: Cell): void {
  declare(sheet, spec);
  if (!cell.empty) row.set(spec.key, cell);
}

function orderedColumns(sheet: Sheet, keep: (key: string) => boolean): Column[] {
  return [...sheet.columns.values()]
    .filter((column) => keep(column.key))
    .sort((a, b) => {
      const group = GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group);
      if (group !== 0) return group;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.index - b.index;
    });
}

// ── Values ─────────────────────────────────────────────────────────────────

/** SharePoint escapes what it cannot put in a column name: `Staff_x0020_Name`. */
function humanizeKey(key: string): string {
  const decoded = key
    .replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/_/g, " ")
    .trim();
  return decoded || key;
}

function absoluteUrl(url: string, siteUrl?: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || !siteUrl) return trimmed;
  try {
    return `${new URL(siteUrl).origin}${trimmed}`;
  } catch {
    return trimmed;
  }
}

/** Base64 carries three bytes per four characters. */
function approximateKb(source: string): number {
  return Math.max(1, Math.round((source.length * 3) / 4 / 1024));
}

/** What one picture can be put in a cell as. */
interface Picture {
  /** Base64 that carries the image itself. Blank when nothing fetched it. */
  data: string;
  /** Where it lives, for a reader who has access. Blank when it was only ever base64. */
  link: string;
}

function pictures(value: unknown, options: ResponseCsvOptions): Picture[] {
  return collectImageSources(value).map((raw) => {
    // Trimmed on both sides of the lookup, so a source with stray whitespace
    // cannot fetch under one key and be read back under another.
    const source = raw.trim();
    if (/^data:/i.test(source)) return { data: source, link: "" };
    const link = absoluteUrl(source, options.siteUrl);
    // Keyed either way: the collector reads the source as it was stored, and the
    // fetcher resolves it to its absolute address before caching it.
    return { data: options.imageData?.get(source) || options.imageData?.get(link) || "", link };
  });
}

function tooLargeNote(data: string): string {
  return `[image not exported: ${approximateKb(data)} KB of base64 exceeds one spreadsheet cell — see the PDF]`;
}

/**
 * A picture, in the only forms a CSV can hold one.
 *
 * The base64 is preferred, because it *is* the picture. The file gets mailed on
 * and opened by somebody with no access to the site, so a spreadsheet whose
 * signature column holds links has not exported the signatures: pasted into a
 * browser address bar the base64 cell shows the ink, where SharePoint's own link
 * shows that reader a sign-in page.
 *
 * Base64 that will not fit a cell gives way to the address it came from, since a
 * reader with access can open that and nobody can open half an image. A picture
 * that never had an address — ink drawn on a phone and stored inline — has
 * nothing to fall back to, so the cell says how big it was and where the
 * rendered copy is.
 */
function imageText(value: unknown, options: ResponseCsvOptions): string {
  const list = pictures(value, options);
  if (list.length === 0) return "";

  const carried = list.map((picture) => picture.data || picture.link).join("\n");
  if (carried.length <= EXCEL_CELL_LIMIT) return carried;
  return list.map((picture) => picture.link || tooLargeNote(picture.data)).join("\n");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * The rich-text copy of a matrix, read back as rows.
 *
 * Responses from before the child lists have no rows to read, only the `_Html`
 * table written for SharePoint's own display. Stripping it to text loses the
 * styling and keeps the data, which is the right trade for a spreadsheet.
 */
function matrixHtmlToText(html: string): string {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const lines: string[] = [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((cell) =>
      decodeHtmlEntities(cell.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
    );
    const line = cells.filter((cell) => cell !== "").join(" | ");
    if (line) lines.push(line);
  }
  if (lines.length > 0) return lines.join("\n");
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

interface MatrixColumnLike {
  name: string;
  title?: string;
  cellType?: string;
  choices?: unknown[];
}

function matrixCellText(column: MatrixColumnLike, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const cellType = (column.cellType ?? "").toLowerCase();
  if (cellType === "date") return formatMalaysiaDate(value);
  if (cellType === "datetime") return formatMalaysiaDateTime(value);
  return formatPdfFieldValue(value, { type: cellType, choices: column.choices });
}

/**
 * A matrix as one cell: a numbered line per row, each column named inside it.
 *
 * A spreadsheet row per matrix row would need a second file and a join to read;
 * naming the columns inside the line keeps a five-row table legible in the one
 * cell the response occupies, and Excel shows the line breaks when the row is
 * given the height.
 */
function matrixText(field: FormSubmissionField, rows: Record<string, unknown>[]): string {
  const declared = (field.matrixColumns ?? []).filter((column) => column.name);
  const lines = rows
    .map((row, index) => {
      const columns: MatrixColumnLike[] = declared.length > 0 ? declared : Object.keys(row).map((name) => ({ name }));
      const parts = columns
        .map((column) => {
          const text = matrixCellText(column, row[column.name]);
          return text ? `${column.title || humanizeKey(column.name)}: ${text}` : "";
        })
        .filter(Boolean);
      return parts.length > 0 ? `${index + 1}. ${parts.join(" | ")}` : "";
    })
    .filter(Boolean);

  const joined = lines.join("\n");
  if (joined.length <= EXCEL_CELL_LIMIT) return joined;

  // A long enough table outgrows the cell. Cut at a row boundary and say how
  // many rows are missing — a spreadsheet that stopped mid-row without saying so
  // reads as a table that ends there.
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    // 200 characters held back for the note that replaces the rows left out.
    if (length + line.length + 1 > EXCEL_CELL_LIMIT - 200) break;
    kept.push(line);
    length += line.length + 1;
  }
  const dropped = lines.length - kept.length;
  return [...kept, `[${dropped} more row${dropped === 1 ? "" : "s"} not exported: one spreadsheet cell holds ${EXCEL_CELL_LIMIT.toLocaleString("en-GB")} characters — see the PDF]`].join("\n");
}

/**
 * Whether the answer is a quantity.
 *
 * Deliberately schema-driven. An NRIC field holds twelve digits and is not a
 * number; a choice question scored 1-5 holds a label, not a quantity. Only a
 * question the author declared numeric loses its quotes.
 */
function isNumericField(field: FormSubmissionField): boolean {
  const type = (field.type ?? "").toLowerCase();
  const inputType = (field.inputType ?? "").toLowerCase();
  if (NUMERIC_TYPES.has(type)) return true;
  if (type !== "" && type !== "text") return false;
  return NUMERIC_INPUT_TYPES.has(inputType);
}

/** One answer, in whatever shape its question stored it. */
function answerCell(field: FormSubmissionField, options: ResponseCsvOptions): Cell {
  const type = (field.type ?? "").toLowerCase();
  const inputType = (field.inputType ?? "").toLowerCase();

  if (field.kind === "matrix" && field.matrixRows?.length) {
    return textCell(matrixText(field, field.matrixRows));
  }
  if (MATRIX_TYPES.has(type)) {
    return textCell(typeof field.value === "string" ? matrixHtmlToText(field.value) : formatPdfFieldValue(field.value, field));
  }
  if (IMAGE_TYPES.has(type)) {
    const image = imageText(field.value, options);
    return textCell(image || formatPdfFieldValue(field.value, field));
  }
  if (isNumericField(field)) {
    return numberOrText(field.value);
  }
  if (inputType === "time") return textCell(formatMalaysiaTime(field.value));
  if (type === "date" || inputType === "date") return textCell(formatMalaysiaDate(field.value));
  if (DATE_TYPES.has(type) || inputType === "datetime-local" || inputType === "datetime") {
    return textCell(formatMalaysiaDateTime(field.value));
  }

  // A choice, a boolean, a list, a plain answer — and a picture that arrived in
  // a question type this file does not know the name of.
  const image = imageText(field.value, options);
  if (image) return textCell(image);
  // Markup reaches here from a rich-text answer, and from a matrix whose schema
  // did not survive so its stored `_Html` table is all that is left. Either way
  // the tags are not the answer.
  if (typeof field.value === "string" && MARKUP_RE.test(field.value)) {
    return textCell(matrixHtmlToText(field.value));
  }
  return textCell(formatPdfFieldValue(field.value, field));
}

function flattenSections(sections: FormSubmissionSection[]): FormSubmissionField[] {
  return sections.flatMap((section) => section.fields);
}

/**
 * The answers of one response, in the order the form asked for them.
 *
 * Matrix rows are folded in under the `_childRows` key the layout module already
 * looks for, so rows read out of the child lists reach the spreadsheet by the
 * same path the detail panel uses.
 */
function responseFields(row: ResponseCsvRow): FormSubmissionField[] {
  const data: Record<string, unknown> = { ...row.answers };
  for (const [name, rows] of Object.entries(row.matrixRows ?? {})) {
    if (rows.length > 0) data[`${name}_childRows`] = { rows };
  }
  return flattenSections(
    buildFormSubmissionSections(row.surveyJson, data, {
      fallbackSectionTitle: "Answers",
      formatFallbackLabel: humanizeKey,
    }),
  );
}

// ── The approval trail ─────────────────────────────────────────────────────

function layerTypeLabel(layer: ResponseCsvLayer): string {
  const type = (layer.type ?? "").toLowerCase();
  if (type === "evaluation") return "Evaluation";
  return !type || type === "approval" ? "Approval" : type;
}

function layerName(layer: ResponseCsvLayer): string {
  const label = (layer.label ?? "").trim();
  const type = layerTypeLabel(layer);
  return label ? `${label} (${type.toLowerCase()})` : type;
}

/**
 * The whole chain in one cell, a line per layer, so the story of a submission
 * reads without scrolling sideways through six columns per layer. The per-layer
 * columns are still there for sorting and filtering.
 */
function historyText(layers: ResponseCsvLayer[]): string {
  return layers
    .map((layer) => {
      const parts = [`L${layer.layerNumber} ${layerName(layer)}`, (layer.status ?? "").trim() || "No decision recorded"];
      const who = (layer.actedBy ?? "").trim();
      if (who) parts.push(who);
      const when = formatMalaysiaDateTime(layer.decidedAt);
      if (when) parts.push(`${when} ${MALAYSIA_TIME_LABEL}`);
      const remarks = (layer.remarks ?? "").trim();
      if (remarks) parts.push(`"${remarks}"`);
      return parts.join(" — ");
    })
    .join("\n");
}

function evaluationFields(layer: ResponseCsvLayer): FormSubmissionField[] {
  const answers = layer.evaluationFields ?? {};
  if (Object.keys(answers).length === 0) return [];
  return flattenSections(
    buildFormSubmissionSections({ pages: [{ elements: layer.evaluationSchema ?? [] }] }, answers, {
      fallbackSectionTitle: "Evaluation",
      formatFallbackLabel: humanizeKey,
    }),
  );
}

// ── The sheet ──────────────────────────────────────────────────────────────

/**
 * The identity block, in this order in every file this module writes.
 *
 * `datetime` rather than a list of date-shaped keys checked inside `recordCell`:
 * the flag is what appends the clock label to the header as well, so a column
 * cannot be converted to Malaysian time without saying so, or say so without
 * being converted.
 */
const RECORD_COLUMNS: { key: keyof ResponseCsvRecord; header: string; numeric?: boolean; datetime?: boolean }[] = [
  { key: "id", header: "ID", numeric: true },
  { key: "reference", header: "Reference" },
  { key: "form", header: "Form" },
  { key: "category", header: "Category" },
  { key: "version", header: "Form Version" },
  { key: "company", header: "Company" },
  { key: "submittedBy", header: "Submitted By" },
  { key: "submitterEmail", header: "Submitter Email" },
  { key: "submittedAt", header: "Submitted At", datetime: true },
  { key: "updatedAt", header: "Last Updated", datetime: true },
  { key: "status", header: "Status" },
  { key: "formStatus", header: "Form Status" },
  { key: "currentLayer", header: "Current Layer", numeric: true },
  { key: "totalLayers", header: "Total Layers", numeric: true },
  { key: "branch", header: "Branch" },
  // The consent the submission was taken under. It is on the item, the detail
  // panel shows it, and a retention date nobody can export is a retention
  // schedule nobody can act on.
  { key: "pdpaConsent", header: "PDPA Consent" },
  { key: "pdpaNoticeVersion", header: "PDPA Notice Version" },
  { key: "pdpaConsentAt", header: "PDPA Consent At", datetime: true },
  { key: "retentionUntil", header: "Retention Until", datetime: true },
  { key: "pdfUrl", header: "Signed PDF" },
];

function recordHeader(column: (typeof RECORD_COLUMNS)[number]): string {
  return column.datetime ? `${column.header} (${MALAYSIA_TIME_LABEL})` : column.header;
}

/** Kept even when every row leaves them blank, so a file always identifies itself. */
const ALWAYS_KEPT = new Set(["record:id", "record:submittedAt", "record:status"]);

const LAYER_FIELDS = ["layer", "status", "actedBy", "decidedAt", "remarks", "signature"] as const;

function recordCell(
  column: (typeof RECORD_COLUMNS)[number],
  value: unknown,
  options: ResponseCsvOptions,
): Cell {
  const { key, numeric, datetime } = column;
  if (datetime) return textCell(formatMalaysiaDateTime(value));
  // SharePoint stores the PDF as a path from the site root, which opens from the
  // app and nowhere else. A spreadsheet gets mailed on, so the link has to carry
  // its host with it.
  if (key === "pdfUrl") return textCell(typeof value === "string" ? absoluteUrl(value, options.siteUrl) : value);
  return numeric ? numberOrText(value) : textCell(value);
}

function extraCell(column: ResponseCsvExtra): Cell {
  if (column.datetime) return textCell(formatMalaysiaDateTime(column.value));
  return column.numeric ? numberOrText(column.value) : textCell(column.value);
}

/**
 * A screen-derived column's heading.
 *
 * The clock label is added here rather than trusted to the caller: a header that
 * does not say whose time it is leaves the reader guessing, and that is not a
 * thing any one screen should be able to forget.
 */
function extraHeader(column: ResponseCsvExtra): string {
  return column.datetime ? `${column.header} (${MALAYSIA_TIME_LABEL})` : column.header;
}

/**
 * The columns one response contributes, and its cells for them. Discovery and
 * filling are one pass: a column exists because some response had something to
 * put in it.
 */
function addRow(sheet: Sheet, row: ResponseCsvRow, options: ResponseCsvOptions): void {
  const cells = new Map<string, Cell>();
  sheet.rows.push(cells);

  for (const column of RECORD_COLUMNS) {
    put(
      sheet,
      cells,
      { key: `record:${column.key}`, header: recordHeader(column), group: "record" },
      recordCell(column, row.record[column.key], options),
    );
  }

  (row.extra ?? []).forEach((column, index) => {
    put(
      sheet,
      cells,
      { key: `extra:${column.key}`, header: extraHeader(column), group: "extra", rank: index },
      extraCell(column),
    );
  });

  const layers = (row.layers ?? []).slice().sort((a, b) => a.layerNumber - b.layerNumber);
  if (layers.length > 0) {
    put(sheet, cells, { key: "history", header: "Approval History", group: "history" }, textCell(historyText(layers)));
  }

  for (const field of responseFields(row)) {
    put(
      sheet,
      cells,
      { key: `answer:${field.key}`, header: field.label || humanizeKey(field.key), group: "answer" },
      answerCell(field, options),
    );
  }

  for (const layer of layers) {
    const prefix = `L${layer.layerNumber}`;
    // A thousand ranks per layer: room for any number of evaluation questions
    // before the next layer's block begins.
    const base = layer.layerNumber * 1_000;
    const values: Record<(typeof LAYER_FIELDS)[number], Cell> = {
      layer: textCell(layerName(layer)),
      status: textCell(layer.status),
      actedBy: textCell(layer.actedBy),
      decidedAt: textCell(formatMalaysiaDateTime(layer.decidedAt)),
      remarks: textCell(layer.remarks),
      signature: textCell(imageText(layer.signature, options)),
    };
    const headers: Record<(typeof LAYER_FIELDS)[number], string> = {
      layer: `${prefix} Layer`,
      status: `${prefix} Status`,
      actedBy: `${prefix} Decided By`,
      decidedAt: `${prefix} Decided At (${MALAYSIA_TIME_LABEL})`,
      remarks: `${prefix} Remarks`,
      signature: `${prefix} Signature`,
    };
    LAYER_FIELDS.forEach((name, index) => {
      const key = `layer:${layer.layerNumber}:${name}`;
      put(sheet, cells, { key, header: headers[name], group: "layer", rank: base + index }, values[name]);
    });

    evaluationFields(layer).forEach((field, index) => {
      put(
        sheet,
        cells,
        {
          key: `layer:${layer.layerNumber}:answer:${field.key}`,
          header: `${prefix} ${field.label || humanizeKey(field.key)}`,
          group: "layer",
          rank: base + LAYER_FIELDS.length + index,
        },
        answerCell(field, options),
      );
    });
  }
}

/**
 * Every response the caller passed, as one CSV. Callers pass rows already
 * filtered and sorted, so the file matches the screen it came from.
 */
export function buildFormResponseCsv(rows: ResponseCsvRow[], options: ResponseCsvOptions = {}): string {
  const sheet = newSheet();
  // Declared before any row is read so that a form with no responses still
  // exports a header an admin can look at, and so the identity block keeps one
  // order no matter which of its values the first response happened to carry.
  for (const column of RECORD_COLUMNS) {
    declare(sheet, { key: `record:${column.key}`, header: recordHeader(column), group: "record" });
  }

  for (const row of rows) addRow(sheet, row, options);

  const filled = new Set<string>();
  for (const row of sheet.rows) for (const key of row.keys()) filled.add(key);

  const columns = orderedColumns(sheet, (key) => filled.has(key) || ALWAYS_KEPT.has(key));
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of sheet.rows) {
    lines.push(columns.map((column) => (row.get(column.key) ?? BLANK_CELL).csv).join(","));
  }
  return lines.join("\r\n");
}
