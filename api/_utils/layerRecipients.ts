/**
 * Layer recipient helpers.
 *
 * A workflow layer distinguishes two sets of addresses:
 *   - **actors**    — who may approve/evaluate. Any one of them completes the
 *                     layer; the first to act wins and the rest go stale.
 *   - **recipients** — who receives the notification email. This can include a
 *                     shared mailbox that must NOT be able to act.
 *
 * Server-side mirror of `src/utils/layerRecipients.ts` — keep the two in sync
 * (same duplication pattern as `workflowLink.ts`).
 */

export type NotifyRecipientMode = "both" | "notify-only";

export interface LayerNotifyConfig {
  /** Mailboxes that receive the layer notification but can never act on it. */
  notifyEmails?: string[];
  /** "both" (default) mails actors + notifyEmails; "notify-only" mails only notifyEmails. */
  notifyRecipientMode?: NotifyRecipientMode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEPARATORS = /[,;\r\n]+/;

export function isLayerEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

/**
 * Splits a stored/typed address list into normalized addresses.
 * Accepts a delimited string or an array; dedupes case-insensitively while
 * preserving the author's original casing and order.
 */
export function parseEmailList(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? entry.split(SEPARATORS) : []))
    : typeof value === "string"
      ? value.split(SEPARATORS)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Same as `parseEmailList` but drops anything that is not a valid address. */
export function parseValidEmailList(value: unknown): string[] {
  return parseEmailList(value).filter(isLayerEmail);
}

/** Canonical storage form for the `L{n}_Emails` / `L{n}_NotifyEmails` columns. */
export function joinEmailList(emails: readonly string[]): string {
  return emails.join("; ");
}

export function emailListsMatch(a: unknown, b: unknown): boolean {
  const left = parseEmailList(a).map((entry) => entry.toLowerCase()).sort();
  const right = parseEmailList(b).map((entry) => entry.toLowerCase()).sort();
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

/**
 * True when `candidate` is allowed to act on a layer whose actor list is
 * `actorEmails`. Falls back to the legacy single `L{n}_Email` value when the
 * multi-actor column is absent on older submissions.
 */
export function isLayerActor(candidate: unknown, actorEmails: unknown, primaryEmail?: unknown): boolean {
  const normalized = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!normalized) return false;
  const actors = parseEmailList(actorEmails);
  const pool = actors.length > 0 ? actors : parseEmailList(primaryEmail);
  return pool.some((entry) => entry.toLowerCase() === normalized);
}

/**
 * The mail `to:` list for a layer. Notification-only mailboxes are appended, or
 * replace the actors entirely when the layer is configured "notify-only" — the
 * shared-mailbox case, where the reviewer is reached through the mailbox rather
 * than at their own address.
 */
export function resolveLayerRecipients(
  actorEmails: readonly string[],
  layer: LayerNotifyConfig | undefined,
): string[] {
  const notify = parseEmailList(layer?.notifyEmails);
  const base = layer?.notifyRecipientMode === "notify-only" && notify.length > 0
    ? []
    : parseEmailList(actorEmails as unknown);
  return parseEmailList([...base, ...notify]);
}

/**
 * Writes one layer's actor/recipient columns onto a submission body or patch.
 *
 * `L{n}_Email` stays the single primary actor — every existing reader, the
 * dashboard and the PDF still key off it. The two extra columns carry the
 * any-one-of actor set and where the notification was actually aimed.
 * Returns the delivery list so the caller can address the mail.
 */
export function writeLayerRecipientFields(
  target: Record<string, unknown>,
  layer: { layerNumber: number } & LayerNotifyConfig,
  actorEmails: readonly string[],
  primaryFallback = "",
): string[] {
  const actors = parseEmailList(actorEmails as unknown);
  const recipients = resolveLayerRecipients(actors, layer);
  target[`L${layer.layerNumber}_Email`] = actors[0] ?? primaryFallback;
  target[`L${layer.layerNumber}_Emails`] = joinEmailList(actors);
  target[`L${layer.layerNumber}_NotifyEmails`] = joinEmailList(recipients);
  return recipients;
}
