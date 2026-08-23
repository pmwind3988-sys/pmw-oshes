/**
 * linkToken.ts — the value that ties one public review link to one submission.
 *
 * Minted when a submission reaches a public layer and stored on the record as
 * `L{n}_LinkToken`. The link carries it as `k`; `layerItemAccess.ts` refuses
 * anything that does not match. It is a capability, not an identifier: whoever
 * holds it may open that submission at that layer, which is exactly what the
 * emailed link is for.
 *
 * One per layer rather than one per submission, because a submission passing
 * through three public layers hands its link to three different people and
 * finishing with one of them should not open the next.
 */
import { randomUUID } from "node:crypto";

/** Column holding a submission's binding for one layer. */
export function linkTokenField(layerNumber: number): string {
  return `L${layerNumber}_LinkToken`;
}

export function mintLinkToken(): string {
  return randomUUID();
}

/** The stored binding for a layer, or "" when the submission predates this. */
export function readLinkToken(fields: Record<string, unknown> | undefined, layerNumber: number): string {
  const value = fields?.[linkTokenField(layerNumber)];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * List column holding when each layer last had a replacement link mailed out.
 *
 * A link issued before bindings existed cannot be repaired in place, so opening
 * one mails a fresh link to the address the layer was sent to. That is an
 * unauthenticated request that causes an email, which without a limit is a tool
 * for mailing a reviewer a thousand times. One column for the whole list rather
 * than one per layer, and deliberately apart from `WorkflowEmailLog` so the
 * cron's own bookkeeping cannot be disturbed by it.
 */
export const LINK_REISSUE_LOG_FIELD = "LinkReissueLog";

/** How long one layer must wait before another replacement link may be sent. */
export const LINK_REISSUE_COOLDOWN_MS = 15 * 60 * 1000;

export type LinkReissueLog = Record<string, string>;

export function parseLinkReissueLog(raw: unknown): LinkReissueLog {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const log: LinkReissueLog = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") log[key] = value;
    }
    return log;
  } catch {
    return {};
  }
}

export function isReissueAllowed(raw: unknown, layerNumber: number, now: Date = new Date()): boolean {
  const last = Date.parse(parseLinkReissueLog(raw)[String(layerNumber)] ?? "");
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= LINK_REISSUE_COOLDOWN_MS;
}

export function recordReissue(raw: unknown, layerNumber: number, now: Date = new Date()): string {
  return JSON.stringify({
    ...parseLinkReissueLog(raw),
    [String(layerNumber)]: now.toISOString(),
  });
}
