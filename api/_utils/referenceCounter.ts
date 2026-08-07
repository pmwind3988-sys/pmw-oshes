/**
 * referenceCounter.ts — hands out the daily sequence behind a submission's
 * reference number.
 *
 * ## Why this is not "count today's rows + 1"
 *
 * Two submissions arriving in the same second would both read the same count
 * and both claim `040826-0003`. A reference the user treats as a primary ID
 * cannot collide, so the number is allocated from a counter row using
 * SharePoint's own optimistic concurrency: read the row with its ETag, write
 * back with `IF-MATCH`, and treat the resulting 412 as "someone else took that
 * number, take the next one".
 *
 * ## Why one row per form rather than one row per form per day
 *
 * A row-per-day scheme has to create a row on the first submission after
 * midnight, and two submissions racing that create both end up holding
 * number 1. Keeping a single permanent row per form and storing the day
 * *inside* it turns the daily reset into part of the same compare-and-swap:
 * if the stored day is not today, the next number is 1. There is no create on
 * the hot path at all, so there is no create to race.
 *
 * ## Gaps
 *
 * The number is claimed before the response item is written, so a submission
 * that fails afterwards leaves its number unused. Rolling the counter back
 * would reintroduce the race it exists to prevent, so gaps are accepted —
 * references are unique and ordered, not contiguous.
 */

import { getGraphToken, getSharePointToken } from "./graphClient.js";
import { ensureGraphListSchema, makeGraphListSchema } from "./provisioning.js";
import {
  mergeListItemIfMatch,
  queryListItemsViaSPRest,
  readListItemWithEtag,
  createListItemViaSPRest,
  spRestTextEquals,
} from "./sharepointRest.js";
import { logWarn } from "./logger.js";
import {
  formatReferenceNumber,
  malaysiaDateKey,
  type ReferenceNumberConfig,
} from "./referenceNumber.js";

export const REFERENCE_COUNTER_LIST = "Form Reference Counters";

const COUNTER_COLUMNS = [
  { name: "FormTitleKey", displayName: "FormTitleKey", type: "text" as const },
  { name: "LastDateKey", displayName: "LastDateKey", type: "text" as const },
  { name: "LastNumber", displayName: "LastNumber", type: "number" as const },
];

const MAX_ATTEMPTS = 8;

/** Provisioning is idempotent but slow; once per cold start is enough. */
let counterListEnsured = false;

export class ReferenceAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceAllocationError";
  }
}

function counterTitleKey(formTitle: string): string {
  return formTitle.trim().toLowerCase();
}

function toPositiveInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full jitter, so retrying callers spread out instead of colliding again. */
function backoffDelay(attempt: number): number {
  return Math.floor(Math.random() * Math.min(20 * 2 ** attempt, 400));
}

export async function ensureReferenceCounterList(): Promise<void> {
  if (counterListEnsured) return;
  const graphToken = await getGraphToken();
  await ensureGraphListSchema(graphToken, makeGraphListSchema(REFERENCE_COUNTER_LIST, COUNTER_COLUMNS));
  counterListEnsured = true;
}

async function findCounterItemId(token: string, titleKey: string): Promise<string | null> {
  const items = await queryListItemsViaSPRest(token, REFERENCE_COUNTER_LIST, {
    filter: spRestTextEquals("FormTitleKey", titleKey),
    select: ["Id"],
    top: 1,
  });
  const id = items[0]?.Id ?? items[0]?.ID;
  return id === undefined || id === null ? null : String(id);
}

/**
 * Creates the counter row for a form. Safe to call concurrently: a duplicate
 * row is clutter, not a correctness problem, because lookups always take the
 * lowest Id and therefore always contend on the same row.
 */
async function createCounterItem(token: string, formTitle: string, titleKey: string): Promise<void> {
  await createListItemViaSPRest(token, REFERENCE_COUNTER_LIST, {
    Title: formTitle.slice(0, 255),
    FormTitleKey: titleKey,
    LastDateKey: "",
    LastNumber: 0,
  });
}

export interface AllocateReferenceParams {
  formTitle: string;
  config: Pick<ReferenceNumberConfig, "prefix" | "pad">;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

/**
 * Claims the next reference for `formTitle` and returns it formatted.
 *
 * Throws `ReferenceAllocationError` only after exhausting retries — callers
 * decide whether a submission without a reference is still worth saving.
 */
export async function allocateReferenceNumber(params: AllocateReferenceParams): Promise<string> {
  const { formTitle, config } = params;
  if (!formTitle.trim()) throw new ReferenceAllocationError("A form title is required to allocate a reference.");

  await ensureReferenceCounterList();

  const token = await getSharePointToken();
  const titleKey = counterTitleKey(formTitle);
  const dateKey = malaysiaDateKey(params.now ?? new Date());

  let created = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const itemId = await findCounterItemId(token, titleKey);
    if (!itemId) {
      // Created at most once. Retrying the create would spawn a row per attempt
      // if the row exists but the filtered read cannot see it yet, and every
      // extra row is a second counter this form could later be split across.
      if (created) {
        throw new ReferenceAllocationError(
          `The reference counter for "${formTitle}" was created but could not be read back.`,
        );
      }
      await createCounterItem(token, formTitle, titleKey);
      created = true;
      continue;
    }

    const current = await readListItemWithEtag(token, REFERENCE_COUNTER_LIST, itemId, [
      "Id",
      "LastDateKey",
      "LastNumber",
    ]);
    if (!current) continue;

    const storedDateKey = typeof current.fields.LastDateKey === "string" ? current.fields.LastDateKey : "";
    const next = storedDateKey === dateKey ? toPositiveInt(current.fields.LastNumber) + 1 : 1;

    const written = await mergeListItemIfMatch(
      token,
      REFERENCE_COUNTER_LIST,
      itemId,
      { LastDateKey: dateKey, LastNumber: next },
      current.etag,
    );
    if (written) return formatReferenceNumber(dateKey, next, config);

    logWarn("api:reference-counter", "Reference counter contended; retrying", { formTitle, attempt });
    await sleep(backoffDelay(attempt));
  }

  throw new ReferenceAllocationError(
    `Could not allocate a reference number for "${formTitle}" after ${MAX_ATTEMPTS} attempts.`,
  );
}

export const __test__ = { backoffDelay, counterTitleKey, toPositiveInt };
