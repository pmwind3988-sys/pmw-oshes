/**
 * referenceNumber.ts — the human-facing reference a submission is known by.
 *
 * Format is `ACRONYM-DDMMYY-NNNN`: the form's acronym, the *Malaysian* calendar
 * day, and a counter over submissions of that one form on that day, restarting
 * at 1 after midnight MYT. `PTW-070826-0001` is the first Permit To Work filed
 * on 7 August 2026. The day is fixed to UTC+8 rather than read from the machine
 * clock because the two things that allocate a reference — a browser in an
 * unknown timezone and a Vercel function running in UTC — would otherwise
 * disagree about which day it is for eight hours out of every twenty-four.
 *
 * The acronym is never optional. A reference is treated as the item's primary
 * ID, and `070826-0001` on its own says nothing about *what* was filed, so a
 * form that has no acronym configured gets one derived from its title.
 *
 * This file only *formats*. Handing out a sequence number is a stateful,
 * concurrent operation and lives server-side in `api/_utils/referenceCounter.ts`.
 *
 * `api/_utils/referenceNumber.ts` is the server-side copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */

/** Response-list column holding the allocated reference. */
export const REFERENCE_NO_FIELD = "ReferenceNo";

/** Master Form column holding the per-form JSON config. */
export const REFERENCE_CONFIG_FIELD = "ReferenceConfig";

const MALAYSIA_UTC_OFFSET_MINUTES = 8 * 60;

const MIN_PAD = 3;
const MAX_PAD = 8;
const MAX_PREFIX_LENGTH = 12;
const MAX_ACRONYM_LENGTH = 4;
const FALLBACK_ACRONYM = "FRM";

export interface ReferenceNumberConfig {
  enabled: boolean;
  /**
   * Acronym override. Blank means "work it out from the form", which is the
   * usual case — see `resolveReferencePrefix`.
   */
  prefix: string;
  /** Digits the daily counter is padded to. */
  pad: number;
}

export const DEFAULT_REFERENCE_CONFIG: ReferenceNumberConfig = {
  enabled: false,
  prefix: "",
  pad: 4,
};

/**
 * Prefixes end up in URLs, file names and SharePoint search queries, so they are
 * restricted to characters that survive all three untouched.
 */
export function normalizeReferencePrefix(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_PREFIX_LENGTH);
}

/**
 * The acronym a form is known by, worked out from its title: "Permit To Work"
 * becomes "PTW", "Hazard" becomes "HAZ".
 *
 * `src/utils/portalCatalogue.ts` derives its catalogue code from this same
 * function, so the acronym in a reference and the code the portal labels the
 * same form with cannot drift apart.
 */
export function deriveFormAcronym(formTitle: string): string {
  const words = String(formTitle ?? "")
    .replace(/responses?$/i, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return FALLBACK_ACRONYM;
  const acronym =
    words.length === 1
      ? words[0].slice(0, 3)
      : words.slice(0, MAX_ACRONYM_LENGTH).map((word) => word.charAt(0)).join("");
  return acronym.toUpperCase();
}

/**
 * The acronym a reference is actually issued under.
 *
 * An author's explicit prefix wins, then the catalogue code the portal already
 * labels the form with, then the title-derived acronym. The result is never
 * empty, so every reference carries an acronym whether or not anyone configured
 * one.
 */
export function resolveReferencePrefix(
  config: Pick<ReferenceNumberConfig, "prefix">,
  formTitle: string,
  catalogueCode?: string | null,
): string {
  return (
    normalizeReferencePrefix(config.prefix)
    || normalizeReferencePrefix(catalogueCode).slice(0, MAX_ACRONYM_LENGTH)
    || deriveFormAcronym(formTitle)
  );
}

/**
 * Pulls the catalogue code out of a Master Form row's stored LayerConfig blob.
 *
 * Returns "" for absent or unparseable config — a missing code is normal, and
 * `resolveReferencePrefix` has a further fallback behind it.
 */
export function catalogueCodeFromLayerConfig(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as { code?: unknown } | null;
    return typeof parsed?.code === "string" ? parsed.code : "";
  } catch {
    return "";
  }
}

function clampPad(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_REFERENCE_CONFIG.pad;
  return Math.min(Math.max(Math.trunc(parsed), MIN_PAD), MAX_PAD);
}

export function parseReferenceNumberConfig(raw: unknown): ReferenceNumberConfig {
  const source =
    typeof raw === "string"
      ? (() => {
          if (!raw.trim()) return null;
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { ...DEFAULT_REFERENCE_CONFIG };
  }

  const record = source as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    prefix: normalizeReferencePrefix(record.prefix),
    pad: clampPad(record.pad),
  };
}

export function serializeReferenceNumberConfig(config: ReferenceNumberConfig): string {
  return JSON.stringify({
    enabled: config.enabled === true,
    prefix: normalizeReferencePrefix(config.prefix),
    pad: clampPad(config.pad),
  });
}

/**
 * The DDMMYY the given instant falls on in Malaysia.
 *
 * Shifting the epoch and then reading UTC parts avoids `getDate()` entirely, so
 * the answer does not depend on where the code runs.
 */
export function malaysiaDateKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + MALAYSIA_UTC_OFFSET_MINUTES * 60_000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = String(shifted.getUTCFullYear() % 100).padStart(2, "0");
  return `${day}${month}${year}`;
}

/**
 * Builds the display form. `formTitle` is required rather than optional so a
 * call site cannot quietly drop the acronym.
 *
 * A sequence wider than `pad` is rendered in full rather than truncated — the
 * 10,000th submission of a day is `...-10000`, never a silent collision with
 * `...-0000`.
 */
export function formatReferenceNumber(
  dateKey: string,
  sequence: number,
  config: Pick<ReferenceNumberConfig, "prefix" | "pad">,
  formTitle: string,
  catalogueCode?: string | null,
): string {
  const padded = String(Math.max(Math.trunc(sequence), 0)).padStart(clampPad(config.pad), "0");
  return `${resolveReferencePrefix(config, formTitle, catalogueCode)}-${dateKey}-${padded}`;
}

/** Preview shown in the builder so authors see the shape before publishing. */
export function previewReferenceNumber(
  config: ReferenceNumberConfig,
  formTitle: string,
  date: Date = new Date(),
): string {
  return formatReferenceNumber(malaysiaDateKey(date), 1, config, formTitle);
}

/** Key identifying one form's counter for one Malaysian day. */
export function referenceCounterKey(formTitle: string, dateKey: string): string {
  return `${formTitle.trim().toLowerCase()}::${dateKey}`;
}
