import type { AuditEntry, PortalRecord, SharePointClient } from "../types";
import { writeAuditEntry } from "./portalAudit";
import { claimLayerEmail } from "./layerAssignees";
import { normalizeEmail } from "./portalPeople";
import { SP_FORM_STATUS, SP_LAYER_STATUS } from "./statusConstants";
import { setWorkflowAssignmentOverride } from "./workflowAssignmentData";
import { getScheduledWorkflowEmail, setScheduledWorkflowEmail } from "./workflowEmailSchedule";

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
 */
export async function cancelSubmission(
  context: PortalActionContext,
  record: PortalRecord,
  reason: string,
): Promise<PortalActionResult> {
  const trimmed = reason.trim();
  const fields = { FormStatus: SP_FORM_STATUS.CANCELLED };

  await patch(context, record, fields);

  const audit = await writeAuditEntry(context.spClient, {
    reference: record.reference,
    who: context.actorName,
    event: `Marked cancelled${trimmed ? ` — ${trimmed}` : ""}`,
  });

  return {
    fields,
    audit,
    toast: `${record.reference} marked cancelled. Everyone in the chain has been told.`,
  };
}
