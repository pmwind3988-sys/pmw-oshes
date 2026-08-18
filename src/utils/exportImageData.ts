/**
 * exportImageData.ts — fetching the pictures a spreadsheet has to carry.
 *
 * `formResponseCsv.ts` is pure: it decides what a cell looks like and fetches
 * nothing. But a signature is stored as a path into `Signature Images`, and a
 * path is not a signature — mail that file to an auditor and the column shows
 * them a link they cannot open. The PDF solved this years ago by downloading
 * every picture and embedding it; this does the same walk for the rows of a CSV,
 * through the same `sharepointImageData.ts`, so the two exports of one submission
 * cannot show different ink.
 *
 * What comes back is a lookup from the source a row stored to the base64 that
 * carries it, which is what `ResponseCsvOptions.imageData` takes. A picture that
 * could not be fetched is simply absent from the lookup, and its cell falls back
 * to the link — the export still happens, and its warnings say what is missing
 * rather than leaving the reader to notice.
 */
import type { ResponseCsvRow } from "./formResponseCsv";
import { collectImageSources } from "./pdfImageSources";
import { imageSourceToDataUrl } from "./sharepointImageData";

export interface ExportImageData {
  /** Source as stored → base64 data URI. Handed straight to the CSV builder. */
  imageData: Map<string, string>;
  /** What could not be carried. The file is still written. */
  warnings: string[];
}

/**
 * What an export says when it had no token to fetch pictures with.
 *
 * Said once, here, because every export can end up in this state and a reader
 * comparing two files should not have to work out whether they mean the same
 * thing.
 */
export const IMAGES_WITHOUT_TOKEN =
  "Pictures are exported as links rather than images: the export could not obtain a SharePoint token.";

/**
 * How many pictures one export will fetch.
 *
 * A year of incident reports with three site photographs each is a thousand
 * downloads and a file too large to mail, from one click on "Export". The
 * remainder keep their links and the export says how many did — a slow export
 * nobody can cancel is worse than a complete one that names its limit.
 */
const MAX_IMAGES = 400;

/** Requests in flight at once. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 6;

/** "1 picture is exported as a link: <why>." */
function asLinks(count: number, why: string): string {
  const subject = count === 1 ? "1 picture is exported as a link" : `${count} pictures are exported as links`;
  return `${subject}: ${why}.`;
}

function isDataUri(source: string): boolean {
  return /^data:/i.test(source.trim());
}

/** Every image reference in one row, answers and decisions alike. */
function rowImageSources(row: ResponseCsvRow): string[] {
  const values: unknown[] = [...Object.values(row.answers ?? {})];

  for (const rows of Object.values(row.matrixRows ?? {})) {
    for (const matrixRow of rows) values.push(...Object.values(matrixRow));
  }

  for (const layer of row.layers ?? []) {
    values.push(layer.signature);
    if (layer.evaluationFields) values.push(...Object.values(layer.evaluationFields));
  }

  return values.flatMap((value) => collectImageSources(value));
}

/**
 * Runs `work` over `items`, `CONCURRENCY` at a time.
 *
 * Sequentially, forty signatures on a SharePoint round-trip each is a visibly
 * frozen button; all at once is a hundred parallel requests and a throttled
 * tenant. Workers pulling from one shared index is neither.
 */
async function inPool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      await work(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * The base64 for every picture in these rows.
 *
 * `token` is a SharePoint bearer token. Without one the caller should not call
 * this at all: the rows still export, with links where the pictures would be.
 */
export async function collectExportImageData(token: string, rows: ResponseCsvRow[]): Promise<ExportImageData> {
  const imageData = new Map<string, string>();
  const warnings: string[] = [];

  // A signature reused across a hundred rows is one source and one request.
  const sources = [...new Set(rows.flatMap(rowImageSources).map((source) => source.trim()))]
    // Ink already stored inline needs nothing fetched; the cell carries it as is.
    .filter((source) => source && !isDataUri(source));

  const wanted = sources.slice(0, MAX_IMAGES);
  const skipped = sources.length - wanted.length;

  const cache = new Map<string, string>();
  let unreachable = 0;

  await inPool(wanted, async (source) => {
    const data = await imageSourceToDataUrl(token, source, cache);
    if (data) imageData.set(source, data);
    else unreachable++;
  });

  if (skipped > 0) {
    warnings.push(asLinks(skipped, `one export fetches at most ${MAX_IMAGES}`));
  }
  if (unreachable > 0) {
    warnings.push(asLinks(unreachable, "SharePoint refused the download"));
  }

  return { imageData, warnings };
}
