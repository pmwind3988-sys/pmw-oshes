/**
 * formResponseExport.ts — gathering what a form's responses need to become a
 * spreadsheet, and naming the file that comes out.
 *
 * The screen this serves loads seven columns per submission, because seven
 * columns is what it draws. A full export needs the rest: every answer column,
 * every `L{n}_*` decision, the published schema each response was answered
 * against, and the matrix rows that live in their own child lists. So the export
 * re-reads the list rather than exporting what the table already had — the
 * alternative is a file that is missing whatever the screen did not need.
 *
 * Reads only. `formResponseCsv.ts` decides what every cell looks like, and
 * `exportImageData.ts` fetches the pictures it needs to carry.
 */
import { spGet } from "./formBuilderSP";
import { OSHES_LISTS } from "../config/oshes";
import { getDynamicMatrixFields } from "./matrixData";
import { layerSequenceFromConfig } from "./layerSequence";
import { getSelectedCompany } from "./companySelection";
import { REFERENCE_NO_FIELD } from "./referenceNumber";
import { buildFormResponseCsv, type ResponseCsvLayer, type ResponseCsvRow } from "./formResponseCsv";
import { collectExportImageData } from "./exportImageData";
import { malaysiaDateStamp } from "./malaysiaTime";
import { responseAnswerFields } from "./responseSystemFields";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

/** Hard ceiling on how far a paged read will walk, so a bad list cannot spin. */
const MAX_PAGES = 20;
const PAGE_SIZE = 500;

/** Layers are numbered from one and the response columns stop at ten. */
const MAX_LAYERS = 10;

export interface FormResponseExportRequest {
  token: string;
  /** Response list title, which is the form title. */
  formTitle: string;
  /** The responses on screen, in the order they are shown. */
  ids: number[];
  /** Layer sequence from `Master Form`, for layer names and evaluation schemas. */
  layerConfig?: unknown;
}

export interface FormResponseExportResult {
  csv: string;
  fileName: string;
  rowCount: number;
  /** What could not be read. The export still happens; the file says less. */
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function listItemsUrl(listTitle: string, query: string): string {
  return `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items?${query}`;
}

/**
 * Every page of a list read, followed through `odata.nextLink`.
 *
 * A response list holds one row per submission and a matrix child list holds one
 * per matrix row, so the child lists are the ones that overflow a single page —
 * and a matrix export that silently stopped at row 500 would look complete.
 *
 * `limit` stops the walk once the caller has what it asked for. Without it a
 * read of the newest hundred responses would keep following the link into every
 * response the form has ever had, fetching them in full to throw them away.
 */
async function readAllPages(token: string, firstUrl: string, limit?: number): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let url: string | null = firstUrl;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const data = (await spGet(token, url)) as Record<string, unknown>;
    const value = Array.isArray(data.value) ? data.value.filter(isRecord) : [];
    items.push(...value);
    if (limit !== undefined && items.length >= limit) break;

    const next = data["odata.nextLink"];
    url = typeof next === "string" && next ? (/^https?:\/\//i.test(next) ? next : `${SP_SITE_URL}/_api/${next.replace(/^\/+/, "")}`) : null;
  }

  return items;
}

/**
 * The full response rows. No `$select`, deliberately: the columns a form has are
 * whatever its author published, and naming them here would mean this file
 * needed editing every time somebody added a question.
 *
 * Ordered the way the screen orders them, so the rows the admin filtered are in
 * the page this reads rather than somewhere past it.
 */
async function readResponseItems(token: string, formTitle: string, wanted: number): Promise<Record<string, unknown>[]> {
  const top = Math.min(Math.max(wanted, 100), PAGE_SIZE);
  return readAllPages(token, listItemsUrl(formTitle, `$orderby=SubmittedAt desc&$top=${top}`), top);
}

/** Published schema per form version, so each response is read against its own. */
async function readVersionSchemas(token: string, formTitle: string): Promise<Map<string, unknown>> {
  const schemas = new Map<string, unknown>();
  const items = await readAllPages(
    token,
    listItemsUrl(
      OSHES_LISTS.versions,
      `$filter=FormTitle eq '${encodeURIComponent(formTitle)}'&$select=FormVersion,SurveyJSON&$top=100`,
    ),
  );

  for (const item of items) {
    const version = text(item.FormVersion);
    const raw = text(item.SurveyJSON);
    if (!version || !raw || schemas.has(version)) continue;
    try {
      schemas.set(version, JSON.parse(raw) as unknown);
    } catch {
      // A version whose snapshot will not parse exports under its SharePoint
      // column names instead of its question titles, which is still readable.
    }
  }

  return schemas;
}

/** Mirrors `ensureMatrixChildList` — the child list is named after the field. */
function matrixChildListName(formTitle: string, fieldName: string): string {
  return `${formTitle} Matrix ${fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim()}`;
}

/**
 * Matrix rows for the whole export, grouped by the response they belong to.
 *
 * One read per matrix field rather than one per field per response: a hundred
 * submissions with two matrices each is two requests this way and two hundred
 * the other, and the screen does the second because it only ever opens one
 * submission at a time.
 */
async function readMatrixRowsByParent(token: string, childListName: string): Promise<Map<number, Record<string, unknown>[]>> {
  const rows = await readAllPages(token, listItemsUrl(childListName, `$orderby=ParentResponseId asc,RowIndex asc&$top=${PAGE_SIZE}`));
  const byParent = new Map<number, Record<string, unknown>[]>();

  for (const row of rows) {
    const parent = Number(row.ParentResponseId);
    if (!Number.isFinite(parent)) continue;
    const existing = byParent.get(parent);
    if (existing) existing.push(row);
    else byParent.set(parent, [row]);
  }

  return byParent;
}

interface EvaluationEntry {
  confirmerEmail?: string;
  confirmerName?: string | null;
  confirmedAt?: string | null;
  fields?: Record<string, unknown>;
  notes?: string;
  signatureUrl?: string | null;
}

function parseEvaluationData(raw: unknown): Record<string, EvaluationEntry> {
  const value = text(raw);
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, EvaluationEntry>) : {};
  } catch {
    return {};
  }
}

/**
 * The decision trail on one response.
 *
 * Configured layers come first so that a chain still waiting on its second
 * approver exports both layers — the second one saying that nobody has acted
 * rather than not appearing at all. Layers with no configuration but with
 * columns on the item are added after: a response filed before the current
 * workflow was authored still carries its own history, and dropping it would
 * rewrite the record.
 */
function responseLayers(item: Record<string, unknown>, layerConfig: unknown): ResponseCsvLayer[] {
  const configured = layerSequenceFromConfig(layerConfig, item.SelectedBranch);
  const evaluations = parseEvaluationData(item.EvaluationData);
  const byNumber = new Map<number, Record<string, unknown>>();

  for (const layer of configured) {
    const number = Number(layer.layerNumber);
    if (Number.isFinite(number) && number > 0) byNumber.set(number, layer);
  }
  for (let n = 1; n <= MAX_LAYERS; n++) {
    const touched = ["Status", "Email", "ActedBy", "SignedAt", "Rejection", "Signature"].some((suffix) => text(item[`L${n}_${suffix}`]));
    if ((touched || evaluations[String(n)]) && !byNumber.has(n)) byNumber.set(n, {});
  }

  return [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, layer]) => {
      const evaluation = evaluations[String(number)] ?? {};
      const isEvaluation = text(layer.type).toLowerCase() === "evaluation" || Object.keys(evaluation).length > 0;
      const surveyElements = Array.isArray(layer.surveyElements) ? layer.surveyElements.filter(isRecord) : undefined;

      return {
        layerNumber: number,
        type: isEvaluation ? "evaluation" : "approval",
        label: text(layer.title) || text(layer.roleLabel),
        status: text(item[`L${number}_Status`]),
        // The routed mailbox is not necessarily who signed: a shared layer
        // records the actor separately, and that is the name the trail wants.
        actedBy:
          text(item[`L${number}_ActedBy`])
          || text(evaluation.confirmerEmail)
          || text(evaluation.confirmerName)
          || text(item[`L${number}_Email`]),
        decidedAt: text(item[`L${number}_SignedAt`]) || text(evaluation.confirmedAt),
        remarks: text(item[`L${number}_Rejection`]) || text(evaluation.notes),
        signature: text(item[`L${number}_Signature`]) || text(evaluation.signatureUrl),
        evaluationFields: isRecord(evaluation.fields) ? evaluation.fields : undefined,
        evaluationSchema: surveyElements,
      } satisfies ResponseCsvLayer;
    });
}

/** SharePoint refuses several characters in a file name, and so does Windows. */
function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "form";
}

/**
 * One form's responses as a CSV, with everything the records hold.
 *
 * `ids` is the filtered, on-screen order, and the file keeps it — an export that
 * silently reordered or included rows the admin had filtered out would not be
 * the thing they were looking at when they clicked.
 */
export async function buildFormResponseExport(request: FormResponseExportRequest): Promise<FormResponseExportResult> {
  const { token, formTitle, ids, layerConfig } = request;
  const warnings: string[] = [];

  const items = await readResponseItems(token, formTitle, ids.length);
  const byId = new Map<number, Record<string, unknown>>();
  for (const item of items) {
    const id = Number(item.Id);
    if (Number.isFinite(id)) byId.set(id, item);
  }

  const selected = ids.map((id) => byId.get(id)).filter((item): item is Record<string, unknown> => Boolean(item));
  if (selected.length < ids.length) {
    warnings.push(`${ids.length - selected.length} submission(s) could not be re-read and were left out of the file.`);
  }

  let schemas = new Map<string, unknown>();
  try {
    schemas = await readVersionSchemas(token, formTitle);
  } catch {
    warnings.push("Published form versions could not be read, so columns are named after their SharePoint fields.");
  }

  // Matrix questions can differ between versions, so every version's are read.
  const matrixFields = new Map<string, ReturnType<typeof getDynamicMatrixFields>[number]>();
  for (const schema of schemas.values()) {
    for (const field of getDynamicMatrixFields(schema)) {
      if (!matrixFields.has(field.name)) matrixFields.set(field.name, field);
    }
  }

  const matrixRowsByField = new Map<string, Map<number, Record<string, unknown>[]>>();
  for (const name of matrixFields.keys()) {
    try {
      matrixRowsByField.set(name, await readMatrixRowsByParent(token, matrixChildListName(formTitle, name)));
    } catch {
      // No child list, or no permission to it. The response's own `_Html` copy
      // of the table is read instead, which is what the detail panel falls back
      // to as well.
      warnings.push(`Matrix rows for "${name}" were read from the stored table copy rather than its child list.`);
    }
  }

  const rows: ResponseCsvRow[] = selected.map((item) => {
    const version = text(item.FormVersion);
    const surveyJson = schemas.get(version) ?? null;
    const matrixRows: Record<string, Record<string, unknown>[]> = {};
    const id = Number(item.Id);
    for (const [name, byParent] of matrixRowsByField) {
      const found = byParent.get(id);
      if (found?.length) matrixRows[name] = found;
    }

    const layers = responseLayers(item, layerConfig);

    return {
      record: {
        id,
        reference: text(item[REFERENCE_NO_FIELD]),
        form: formTitle,
        version,
        company: getSelectedCompany(item, surveyJson),
        // A response list records one identity for its submitter. Whether it is
        // a name or an address, it belongs in one column — repeating it in the
        // next one would only widen the file.
        submittedBy: text(item.SubmittedBy),
        submittedAt: text(item.SubmittedAt) || text(item.Created),
        updatedAt: text(item.Modified),
        status: text(item.Status),
        formStatus: text(item.FormStatus),
        currentLayer: text(item.CurrentLayer) || text(item.CurrentApprovalLayer),
        totalLayers: layers.length || "",
        branch: text(item.SelectedBranch),
        pdpaConsent: item.PDPAConsent,
        pdpaNoticeVersion: text(item.PDPANoticeVersion),
        pdpaConsentAt: item.PDPAConsentAt,
        retentionUntil: item.RetentionUntil,
        pdfUrl: text(item.PdfUrl),
      },
      // The bookkeeping columns are already spread across the identity block and
      // the layer columns; leaving them in would repeat every one of them as if
      // it were a question, `RawJSON` included.
      answers: responseAnswerFields(item),
      surveyJson,
      matrixRows,
      layers,
    };
  });

  // Pictures last, once every row is known: a signature that appears on forty of
  // them is fetched once, and the file carries the ink rather than a link into a
  // site the reader may have no account on.
  const { imageData, warnings: imageWarnings } = await collectExportImageData(token, rows);
  warnings.push(...imageWarnings);

  return {
    csv: buildFormResponseCsv(rows, { siteUrl: SP_SITE_URL, imageData }),
    fileName: `${safeFileName(formTitle)} responses ${malaysiaDateStamp()}.csv`,
    rowCount: rows.length,
    warnings,
  };
}
