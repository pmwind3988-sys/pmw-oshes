/**
 * Whether one submission may be reached through one workflow layer.
 *
 * A public approval/evaluation link used to carry a token identifying the
 * *layer*, with the submission id beside it in the query string. One token was
 * minted per layer and reused for every submission to that form, so the id was
 * the only thing separating the submission a recipient was sent from every
 * other one — and counting it up read the lot.
 *
 * The link now carries a third part: a value minted for that one submission
 * when it arrived at that layer and stored on the record as `L{n}_LinkToken`
 * (`k` in the URL — see `workflowLink.ts`). The id is still in the link, but it
 * is no longer a key: it says which record to fetch, and the fetched record has
 * to agree. Point it at a neighbour and the neighbour's own token will not
 * match, so the link opens the submission it was issued for and nothing else.
 *
 * Read and act both come through here so that what a link may show can never
 * drift from what it may approve. They differ in one respect, and only once the
 * binding above has been proved: a reviewer returning to a decision they have
 * already recorded may *see* it, but may not record another. Before the link
 * was bound to its submission that could not be allowed — being able to read a
 * finished record was itself how completed submissions leaked.
 *
 * Links minted before any of this exist without a `k` and cannot be made to
 * carry one retrospectively. They never reach this function: `evaluate.ts`
 * turns them into a fresh link mailed to the record's own reviewer.
 */
import { timingSafeEqual } from "node:crypto";

import { isLayerExpired, type ExpirableLayer } from "./layerExpiry.js";

export type LayerItemAccessDenial =
  | "already-completed"
  | "not-current-layer"
  | "link-mismatch"
  | "expired";

/** What the caller is trying to do with the submission. */
export type LayerItemIntent = "read" | "act";

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** Outcomes recorded in `L{n}_Status` that mean the layer is finished with. */
export function isTerminalLayerStatus(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return ["approved", "confirmed", "rejected", "skipped", "cancelled"].includes(normalized)
    || normalized.includes("reject");
}

/** States in `FormStatus`/`Status` that mean the submission itself is closed. */
export function isTerminalFormStatus(value: unknown): boolean {
  return ["completed", "rejected", "cancelled", "fullyapproved"].includes(normalizeStatus(value));
}

function tokenText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Compared without an early exit on the first differing byte. The token is a
 * random value rather than a derived MAC, so this is belt-and-braces — but it
 * is the one comparison standing between a link and somebody else's submission.
 */
function tokensMatch(supplied: string, stored: string): boolean {
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface LayerItemAccessParams {
  layerNumber: number;
  currentLayer: unknown;
  layerStatus: unknown;
  formStatus: unknown;
  /** Defaults to the stricter of the two, so a caller that forgets cannot widen access. */
  intent?: LayerItemIntent;
  /** `k` from the link. */
  linkToken?: unknown;
  /** `L{n}_LinkToken` as stored on the submission. */
  storedLinkToken?: unknown;
  /** The layer's expiry configuration — fixed date, or a field to read. */
  layer?: ExpirableLayer;
  /** The submission's answers, for a field-driven expiry. */
  fields?: Record<string, unknown>;
  now?: Date;
}

/**
 * `null` means the caller may proceed. Anything else names why not, leaving the
 * wording to the caller: a refused read is a 403, a refused write a 409.
 */
export function denyLayerItemAccess(params: LayerItemAccessParams): LayerItemAccessDenial | null {
  const supplied = tokenText(params.linkToken);
  const stored = tokenText(params.storedLinkToken);

  // Either side present obliges both. A link offering a token for a record that
  // holds none cannot be verified, which is a refusal and not a free pass.
  if ((supplied || stored) && !(supplied && stored && tokensMatch(supplied, stored))) {
    return "link-mismatch";
  }

  if (isLayerExpired(params.layer, params.fields, params.now)) return "expired";

  // Past this point the link has proved which submission it belongs to, so a
  // reviewer may look at their own record whatever state it has reached.
  if ((params.intent ?? "act") === "read") return null;

  if (isTerminalFormStatus(params.formStatus) || isTerminalLayerStatus(params.layerStatus)) {
    return "already-completed";
  }

  // Rows written before `CurrentLayer` existed carry nothing here. A missing
  // marker has always been read as "no opinion" rather than a refusal.
  const currentLayer = Number(params.currentLayer) || 0;
  if (currentLayer && currentLayer !== params.layerNumber) return "not-current-layer";

  return null;
}
