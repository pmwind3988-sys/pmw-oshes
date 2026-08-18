import type { AuditEntry, HardDeleteSubmissionResult, PortalRecord, SharePointClient, SurveyJson } from "../types";
import { writeAuditEntry } from "./portalAudit";
import { regenerateRecordPdf } from "./portalPdf";
import { claimLayerEmail } from "./layerAssignees";
import { normalizeEmail } from "./portalPeople";
import { SP_FORM_STATUS, SP_LAYER_STATUS } from "./statusConstants";
import { setWorkflowAssignmentOverride } from "./workflowAssignmentData";
import { cancelScheduledWorkflowEmails, getScheduledWorkflowEmail, setScheduledWorkflowEmail } from "./workflowEmailSchedule";

/**
 * "Return for more information" has no agreed SharePoint status yet (open
 * question with the team). We write `Returned` where the column accepts it and
 * fall back to `Rejected` + the note, which is what carries it today.
 */
const RETURNED_STATUS = "Returned";

export interface PortalActionContext {
  spClient: SharePointClient;
  /** Display name of the person taking the action — what the trail records. */
  actorName: string;
  actorEmail: string;
}

export interface PortalActionResult {
  /** Field patch applied to the SharePoint item, so callers can update state optimistically. */
  fields: Record<string, unknown>;
  audit: AuditEntry;
  toast: string;
}

/** A delete patches nothing — the row it would have patched is gone. */
export interface PortalDeleteResult {
  removed: HardDeleteSubmissionResult;
  audit: AuditEntry;
  toast: string;
}

function itemFilter(record: PortalRecord): string {
  return `Id eq ${Number(record.itemId)}`;
}

async function patch(
  context: PortalActionContext,
  record: PortalRecord,
  fields: Record<string, unknown>,
): Promise<void> {
  await context.spClient.upsertListItem(record.listTitle, itemFilter(record), fields);
}

/** Merge a note into the per-layer EvaluationData JSON — the column that already holds layer notes. */
function withLayerNote(record: PortalRecord, layerNumber: number, note: string, actor: PortalActionContext): string {
  const raw = record.submission.evaluationDataRaw;
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const existing = (parsed[String(layerNumber)] ?? {}) as Record<string, unknown>;
  parsed[String(layerNumber)] = {
    ...existing,
    status: "approved",
    confirmerEmail: actor.actorEmail,
    confirmerName: actor.actorName,
    confirmedAt: new Date().toISOString(),
    fields: existing.fields ?? {},
    ...(note ? { notes: note } : {}),
  };
  return JSON.stringify(parsed);
}

/**
 * Sign the current layer. A signature moves the record to the next layer — out
 * of your queue and into theirs — or closes it when it was the last layer.
 */
export async function signLayer(
  context: PortalActionContext,
  record: PortalRecord,
  note: string,
): Promise<PortalActionResult> {
  const step = record.chain[record.at];
  const layerNumber = step?.layerNumber ?? record.at + 1;
  const isLast = record.at >= record.totalLayers - 1;
  const next = record.chain[record.at + 1];
  const now = new Date().toISOString();

  const fields: Record<string, unknown> = {
    [`L${layerNumber}_Status`]: step?.type === "evaluation" ? SP_LAYER_STATUS.CONFIRMED : SP_LAYER_STATUS.APPROVED,
    [`L${layerNumber}_SignedAt`]: now,
  };
  // Claims a shared layer for whoever actually signed it.
  const claimedBy = claimLayerEmail(record.layers[record.at], step?.email, context.actorEmail);
  if (claimedBy) fields[`L${layerNumber}_Email`] = claimedBy;
  if (note) fields.EvaluationData = withLayerNote(record, layerNumber, note, context);

  if (isLast) {
    fields.FormStatus = SP_FORM_STATUS.COMPLETED;
  } else {
    const nextLayerNumber = next?.layerNumber ?? layerNumber + 1;
    fields.CurrentLayer = nextLayerNumber;
    fields.FormStatus = SP_FORM_STATUS.IN_REVIEW;
    fields[`L${nextLayerNumber}_Status`] = SP_LAYER_STATUS.PENDING;
    if (next?.email) fields[`L${nextLayerNumber}_Email`] = next.email;
    fields.WorkflowEmailSchedule = JSON.stringify(
      setScheduledWorkflowEmail(record.submission.workflowEmailScheduleRaw, {
        layer: nextLayerNumber,
        recipient: next?.email ?? "",
        dueAt: now,
        status: "scheduled",
        updatedAt: now,
        layerType: next?.type ?? "approval",
        totalLayers: record.totalLayers,
      }),
    );
  }

  await patch(context, record, fields);

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Signed layer ${record.at + 1} of ${record.totalLayers} — ${step?.roleLabel ?? ""}${note ? ` · ${note}` : ""}`,
  });

  return {
    fields,
    audit,
    toast: isLast
      ? `${record.reference} approved and closed — the submitter is told.`
      : `${record.reference} moves to layer ${record.at + 2}, ${next?.who ?? "the next approver"} (${next?.roleLabel ?? ""}).`,
  };
}

/**
 * Return for more information. Refuses an empty note — the submitter only gets
 * your note, so there has to be one.
 */
export async function returnForInformation(
  context: PortalActionContext,
  record: PortalRecord,
  note: string,
): Promise<PortalActionResult> {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Say what is missing before returning it — the submitter only gets your note.");
  }

  const layerNumber = record.chain[record.at]?.layerNumber ?? record.at + 1;
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    [`L${layerNumber}_Rejection`]: trimmed,
    [`L${layerNumber}_SignedAt`]: now,
    FormStatus: RETURNED_STATUS,
  };

  try {
    await patch(context, record, fields);
  } catch {
    // The FormStatus column may not offer "Returned" as a choice yet.
    fields.FormStatus = SP_FORM_STATUS.REJECTED;
    fields[`L${layerNumber}_Status`] = SP_LAYER_STATUS.REJECTED;
    await patch(context, record, fields);
  }

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Returned to submitter — ${trimmed}`,
  });

  return {
    fields,
    audit,
    toast: `${record.reference} returned to the submitter. It leaves your queue until they answer.`,
  };
}

/**
 * Nudge the approver holding the current layer. Idempotent per session: the
 * button becomes "Nudged". Reuses the existing workflow-email schedule rather
 * than a second mailer — the cron picks the entry up on its next pass.
 */
export async function nudgeApprover(
  context: PortalActionContext,
  record: PortalRecord,
): Promise<PortalActionResult> {
  const step = record.chain[record.at];
  const layerNumber = step?.layerNumber ?? record.at + 1;
  const now = new Date().toISOString();
  const existing = getScheduledWorkflowEmail(record.submission.workflowEmailScheduleRaw, layerNumber);

  const fields = {
    WorkflowEmailSchedule: JSON.stringify(
      setScheduledWorkflowEmail(record.submission.workflowEmailScheduleRaw, {
        ...(existing ?? {}),
        layer: layerNumber,
        recipient: step?.email ?? "",
        dueAt: now,
        status: "scheduled" as const,
        updatedAt: now,
        layerType: step?.type ?? "approval",
        totalLayers: record.totalLayers,
      }),
    ),
  };

  await patch(context, record, fields);

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Reminder sent to ${step?.who ?? "the approver"} — ${record.slaNote}`,
  });

  return {
    fields,
    audit,
    toast: `Reminder sent to ${step?.who ?? "the approver"} for ${record.reference}. Next automatic reminder in 24 h.`,
  };
}

/**
 * Reassign the current layer to a different approver. The change is per
 * submission — the form's LayerConfig assignee is untouched — and the age on
 * the layer keeps running, because reassignment moves state, not the clock.
 */
export async function reassignLayer(
  context: PortalActionContext,
  record: PortalRecord,
  toEmail: string,
  toName: string,
): Promise<PortalActionResult> {
  const email = normalizeEmail(toEmail);
  if (!email) throw new Error("Pick who the layer moves to.");

  const step = record.chain[record.at];
  const layerNumber = step?.layerNumber ?? record.at + 1;
  const now = new Date().toISOString();

  const assignmentData = setWorkflowAssignmentOverride(record.submission.workflowAssignmentRaw, {
    layer: layerNumber,
    email,
    displayName: toName,
    workflowRole: step?.roleLabel,
    reason: `Reassigned from ${step?.who ?? "the previous approver"}`,
    updatedBy: context.actorName,
    updatedAt: now,
  });

  const fields: Record<string, unknown> = {
    [`L${layerNumber}_Email`]: email,
    WorkflowAssignmentData: JSON.stringify(assignmentData),
    WorkflowEmailSchedule: JSON.stringify(
      setScheduledWorkflowEmail(record.submission.workflowEmailScheduleRaw, {
        layer: layerNumber,
        recipient: email,
        dueAt: now,
        status: "scheduled",
        updatedAt: now,
        layerType: step?.type ?? "approval",
        totalLayers: record.totalLayers,
      }),
    ),
  };

  await patch(context, record, fields);

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Layer reassigned to ${toName} (${record.layerLabel})`,
  });

  return {
    fields,
    audit,
    toast: `${record.layerLabel} of ${record.reference} reassigned to ${toName}.`,
  };
}

/**
 * Cancel (admin) or withdraw (submitter, own item, still on layer 1). The record
 * keeps its reference and is marked cancelled with the actor's name against it.
 *
 * Cancelling has to stop the chain, not just relabel it. Writing FormStatus on
 * its own left the layer sitting at "Pending" and its reminder still queued, so
 * the cron went on chasing an approver for a signature nobody wanted, the
 * approval dashboard went on listing the item as theirs to sign, and the next
 * page load derived the record's status back out of that pending layer. All
 * three read the layer, so the layer is what has to be closed.
 */
export async function cancelSubmission(
  context: PortalActionContext,
  record: PortalRecord,
  reason: string,
): Promise<PortalActionResult> {
  const trimmed = reason.trim();
  const step = record.chain[record.at];
  const layerNumber = step?.layerNumber ?? record.at + 1;
  const now = new Date().toISOString();
  // The same action by two different people: the person who filed it withdraws
  // it, anyone else cancels it. The trail should say which one happened.
  const verb = normalizeEmail(context.actorEmail) === record.submitterEmail ? "Withdrawn" : "Cancelled";

  const fields: Record<string, unknown> = { FormStatus: SP_FORM_STATUS.CANCELLED };

  // A record with no chain has nothing to stand down, and one that is already
  // settled has a decision recorded against its layer that must not be
  // overwritten by this one.
  if (record.hasWorkflow && !record.done) {
    fields[`L${layerNumber}_Status`] = SP_LAYER_STATUS.CANCELLED;
    fields[`L${layerNumber}_Rejection`] = trimmed
      ? `${verb} by ${context.actorName} — ${trimmed}`
      : `${verb} by ${context.actorName}`;
    fields.WorkflowEmailSchedule = JSON.stringify(
      cancelScheduledWorkflowEmails(record.submission.workflowEmailScheduleRaw, now),
    );
  }

  await patch(context, record, fields);

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `${verb} on ${record.hasWorkflow ? record.layerLabel.toLowerCase() : "a form with no approval step"}${trimmed ? ` — ${trimmed}` : ""}`,
  });

  return {
    fields,
    audit,
    toast: record.hasWorkflow && !record.done
      ? `${record.reference} ${verb.toLowerCase()}. ${step?.who ?? "The approver"} is no longer being asked to sign it.`
      : `${record.reference} ${verb.toLowerCase()}. The record keeps its reference and stays readable.`,
  };
}

/**
 * Rebuild the stored PDF and point the record at the new file.
 *
 * The copy in the Form PDFs library is written at submit time and again as
 * layers are signed, so between those moments it is a photograph of an older
 * version of the record. This is the button for saying "print it again from
 * what it says now" — the old file is deleted, the rebuilt one takes its place,
 * and the reader gets a copy of what was stored.
 */
export async function regenerateSubmissionPdf(
  context: PortalActionContext,
  record: PortalRecord,
  surveyJson: SurveyJson | null,
): Promise<PortalActionResult> {
  const pdfUrl = await regenerateRecordPdf(record, surveyJson, context.spClient);
  const fields = { PdfUrl: pdfUrl };

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `PDF rebuilt from the record as it stands — ${record.stage.toLowerCase()}`,
  });

  return {
    fields,
    audit,
    toast: `${record.reference} PDF rebuilt from the record as it stands and saved over the stored copy.`,
  };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Delete a submission and everything filed with it — the answers, every
 * signature, every photo and uploaded attachment, the generated PDF, the matrix
 * rows, and the SharePoint item itself.
 *
 * This is the one action that leaves nothing behind to read, which is exactly
 * why it writes the trail entry: the appended row becomes the only remaining
 * evidence that the reference ever existed, and it names who removed it. Cancel
 * is the reversible neighbour of this — it keeps the record and marks it — so
 * anything short of "this must not exist" belongs there instead.
 */
export async function deleteSubmission(
  context: PortalActionContext,
  record: PortalRecord,
): Promise<PortalDeleteResult> {
  const removed = await context.spClient.hardDeleteSubmission(record.submission);

  const swept = `${count(removed.deletedFiles, "file")} and ${count(removed.deletedMatrixRows, "table row")}`;
  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Deleted permanently — ${record.formName} filed by ${record.submitter || "a public submitter"}, with ${swept}`,
  });

  return {
    removed,
    audit,
    toast: removed.warnings.length > 0
      ? `${record.reference} deleted, with ${swept} — some cleanup did not complete. See the trail.`
      : `${record.reference} deleted, with ${swept}. Only the trail entry remains.`,
  };
}
