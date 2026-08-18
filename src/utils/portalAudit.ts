import { OSHE_LISTS } from "../config/oshe";
import type { AuditEntry, PortalRecord, SharePointClient } from "../types";
import { formatAuditWhen, parseDate } from "./portalTime";

export interface AuditWriteInput {
  reference: string;
  who: string;
  event: string;
}

function toEntry(at: Date, reference: string, who: string, event: string): AuditEntry {
  return { at: at.toISOString(), whenLabel: formatAuditWhen(at), reference, who, event };
}

/**
 * The trail the records themselves already prove: filings and signatures.
 * This is the floor the audit list is layered on top of, so a site whose trail
 * list does not exist yet still shows a truthful history rather than nothing.
 */
export function deriveAuditFromRecords(records: PortalRecord[]): AuditEntry[] {
  const entries: AuditEntry[] = [];

  for (const record of records) {
    if (record.filedAt) {
      const severityNote = record.severity ? ` · severity ${record.severity}` : "";
      // A form with no chain was routed nowhere, and the trail must not say it was.
      const routing = record.hasWorkflow
        ? ` · routed to ${record.chain[0]?.who ?? "the first approver"}`
        : " · recorded, no approval step";
      entries.push(
        toEntry(
          record.filedAt,
          record.reference,
          record.submitter || "Public submitter",
          `Filed via ${record.source}${severityNote}${routing}`,
        ),
      );
    }

    record.chain.forEach((step, index) => {
      if (step.state !== "signed") return;
      const signedAt = parseDate(record.submission.layers[index]?.signedAt ?? null);
      if (!signedAt) return;
      const note = step.note ? ` · ${step.note}` : "";
      entries.push(
        toEntry(
          signedAt,
          record.reference,
          step.who,
          `Signed layer ${index + 1} of ${record.totalLayers} — ${step.roleLabel}${note}`,
        ),
      );
    });
  }

  return entries;
}

/** Newest first. */
export function sortAudit(entries: AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Read the append-only trail list. A missing list is not an error — the portal
 * falls back to what the records themselves prove.
 */
export async function readAuditTrail(spClient: SharePointClient): Promise<AuditEntry[]> {
  try {
    const items = await spClient.queryList(OSHE_LISTS.auditTrail, {
      select: ["Title", "EventAt", "Reference", "Actor", "EventSummary"],
      orderby: "EventAt desc",
      top: 500,
    });

    return items
      .map((item) => {
        const at = parseDate(String(item.EventAt ?? "")) ?? null;
        if (!at) return null;
        return toEntry(
          at,
          String(item.Reference ?? item.Title ?? ""),
          String(item.Actor ?? ""),
          String(item.EventSummary ?? ""),
        );
      })
      .filter((entry): entry is AuditEntry => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Append one row. Called from the same code path as the action it records —
 * never separately — so an action that lands always leaves a trace.
 */
export async function writeAuditEntry(
  spClient: SharePointClient,
  input: AuditWriteInput,
): Promise<AuditEntry> {
  const at = new Date();
  const entry = toEntry(at, input.reference, input.who, input.event);

  try {
    await spClient.upsertListItem(OSHE_LISTS.auditTrail, `Title eq '${at.toISOString()}-${input.reference}'`, {
      Title: `${at.toISOString()}-${input.reference}`,
      EventAt: at.toISOString(),
      Reference: input.reference,
      Actor: input.who,
      EventSummary: input.event,
    });
  } catch {
    // The trail list may not be provisioned yet. The in-session entry still
    // renders so the actor sees what they did; provisioning is an admin task.
  }

  return entry;
}
