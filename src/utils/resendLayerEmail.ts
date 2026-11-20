/**
 * resendLayerEmail.ts — send the current layer's action email again.
 *
 * Either to the people the layer was already addressed to, or to addresses the
 * sender types in. The email itself is drawn by the server from the same
 * layer-email template every other route uses (`/api/send-email` with
 * `layerEmail`), so a resend looks exactly like the original, and a test-run
 * row is still redirected to its test address there.
 *
 * Nothing about who holds the layer changes: sending a copy to someone else
 * does not reassign it. That is what "Change who signs" is for.
 */
import type { AuditEntry, PortalRecord, SharePointClient } from "../types";
import { appBaseUrl } from "../config/appBaseUrl";
import { ensureWorkflowColumns, sendSpEmail } from "./formBuilderSP";
import { buildLayerReviewLink } from "./layerReviewLink";
import { parseValidEmailList } from "./layerRecipients";
import { ensureLinkToken } from "./linkToken";
import { writeAuditEntry } from "./portalAudit";

export interface ResendContext {
  spClient: SharePointClient;
  actorName: string;
  actorEmail: string;
}

export interface ResendResult {
  /** Fields written to the record (a freshly minted link binding), if any. */
  fields: Record<string, unknown>;
  audit: AuditEntry;
  toast: string;
  recipients: string[];
}

/** The layer currently waiting, or null when there is nothing to resend. */
function currentLayer(record: PortalRecord) {
  if (!record.hasWorkflow || record.done || record.returned) return null;
  const step = record.chain[record.at];
  if (!step) return null;
  const config = record.layers.find((layer) => layer.layerNumber === step.layerNumber) ?? null;
  return { step, config };
}

/** Whether this record has a live layer whose email can be sent again. */
export function canResendLayerEmail(record: PortalRecord): boolean {
  return currentLayer(record) !== null;
}

/**
 * Reads the record's own columns for the waiting layer. The binding and notify
 * columns only exist on lists provisioned after they were introduced, and a
 * SharePoint `$select` naming a missing column fails the whole query — so the
 * full read is tried first and a plain one is the fallback.
 */
async function readLayerFields(
  spClient: SharePointClient,
  record: PortalRecord,
  layerNumber: number,
): Promise<Record<string, unknown>> {
  const filter = `Id eq ${Number(record.itemId)}`;
  const full = ["Id", `L${layerNumber}_Email`, `L${layerNumber}_Emails`, `L${layerNumber}_NotifyEmails`, `L${layerNumber}_LinkToken`];
  for (const select of [full, ["Id", `L${layerNumber}_Email`]]) {
    try {
      const [item] = await spClient.queryList(record.listTitle, { select, filter, top: 1 });
      if (item) return item;
    } catch {
      // Narrow the select and try again.
    }
  }
  return {};
}

/**
 * Who the layer's email normally goes to: the notify list a shared layer keeps,
 * then its assignee list, then the single holder — the same order the server
 * reads them in. Falls back to the holder the portal already shows.
 */
export async function usualLayerRecipients(
  spClient: SharePointClient,
  record: PortalRecord,
): Promise<string[]> {
  const layer = currentLayer(record);
  if (!layer) return [];
  const fields = await readLayerFields(spClient, record, layer.step.layerNumber);
  const n = layer.step.layerNumber;
  const stored = parseValidEmailList(fields[`L${n}_NotifyEmails`] || fields[`L${n}_Emails`] || fields[`L${n}_Email`]);
  return stored.length ? stored : parseValidEmailList(layer.step.email || record.currentAssigneeEmail);
}

export async function resendLayerEmail(
  context: ResendContext,
  record: PortalRecord,
  recipients: string[],
  formSlug: string,
): Promise<ResendResult> {
  const layer = currentLayer(record);
  if (!layer) throw new Error("This record has no layer waiting, so there is no email to resend.");
  const to = parseValidEmailList(recipients);
  if (to.length === 0) throw new Error("Add at least one valid email address.");

  const layerNumber = layer.step.layerNumber;
  const isPublic = layer.config?.authMode === "public";
  const fields = await readLayerFields(context.spClient, record, layerNumber);

  // A public link must carry this record's binding. Reuse the stored one so the
  // link already in someone's inbox keeps working; mint one only if the record
  // predates bindings.
  const patch: Record<string, unknown> = {};
  const linkToken = ensureLinkToken(layer.config ?? undefined, fields, layerNumber, patch);
  if (Object.keys(patch).length) {
    const token = await context.spClient.acquireToken();
    await ensureWorkflowColumns(token, record.listTitle, Math.max(record.totalLayers, layerNumber));
    await context.spClient.upsertListItem(record.listTitle, `Id eq ${Number(record.itemId)}`, patch);
  }

  const reviewLink = buildLayerReviewLink({
    baseUrl: appBaseUrl(),
    layer: layer.config ?? { layerNumber, authMode: "365" },
    formSlug,
    responseItemId: record.itemId,
    linkToken,
  });
  if (!reviewLink) {
    throw new Error(
      isPublic
        ? `Layer ${layerNumber} has no public link. Republish the form, then try again.`
        : "This form has no web address yet. Republish the form, then try again.",
    );
  }

  const layerType = layer.step.type === "evaluation" ? "evaluation" : "approval";
  const reference = (record.submission.referenceNo ?? "").trim();
  await sendSpEmail("", {
    to,
    // The server draws the email from `layerEmail`; these two are only its
    // fallback for an older deployment.
    subject: `${layerType === "evaluation" ? "To evaluate" : "To approve"}: ${record.formName}${reference ? ` · ${reference}` : ""}`,
    body: `<p>${record.formName} is waiting for your ${layerType}.</p><p><a href="${reviewLink}">Open it here</a></p>`,
    workflow: { listTitle: record.listTitle, responseItemId: Number(record.itemId), layer: layerNumber },
    layerEmail: {
      formTitle: record.formName,
      submittedBy: record.submitter,
      totalLayers: record.totalLayers,
      layerType,
      reviewLink,
      authMode: isPublic ? "public" : "365",
      ...(record.submission.submittedAt ? { submittedAt: record.submission.submittedAt } : {}),
      ...(reference ? { referenceNo: reference } : {}),
    },
  });

  const who = to.length === 1 ? to[0] : `${to.length} people`;
  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Layer email resent to ${to.join(", ")} (${record.layerLabel})`,
  });

  return {
    fields: patch,
    audit,
    recipients: to,
    toast: `Email for ${record.layerLabel} of ${record.reference} sent to ${who}.`,
  };
}
