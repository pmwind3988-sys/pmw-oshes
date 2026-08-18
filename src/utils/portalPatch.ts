import type { ApprovalLayer, Submission } from "../types";
import { normalizeLayerStatus } from "./statusConstants";

/**
 * Apply a SharePoint field patch to an in-memory submission.
 *
 * Signing must be visible immediately — the point of the flow is that you watch
 * the item leave your queue — so state moves locally rather than waiting for the
 * next full reload.
 */
export function applySubmissionPatch(submission: Submission, fields: Record<string, unknown>): Submission {
  const next: Submission = {
    ...submission,
    layers: submission.layers.map((layer) => (layer ? { ...layer } : layer)),
  };

  for (const [key, value] of Object.entries(fields)) {
    if (key === "CurrentLayer") {
      next.currentLayer = Number(value) || next.currentLayer;
      continue;
    }
    if (key === "FormStatus") {
      next.formStatus = value === null || value === undefined ? null : String(value);
      continue;
    }
    if (key === "WorkflowEmailSchedule") {
      next.workflowEmailScheduleRaw = String(value);
      continue;
    }
    if (key === "WorkflowAssignmentData") {
      next.workflowAssignmentRaw = String(value);
      continue;
    }
    if (key === "EvaluationData") {
      next.evaluationDataRaw = String(value);
      continue;
    }
    if (key === "PdfUrl") {
      // A regenerated PDF replaces the one it was built from, so the next
      // regeneration has to delete the new file rather than the old one.
      next.pdfUrl = value === null || value === undefined ? undefined : String(value);
      continue;
    }

    const layerMatch = /^L(\d+)_(Status|SignedAt|Email|Rejection|Signature)$/.exec(key);
    if (!layerMatch) continue;

    const index = Number(layerMatch[1]) - 1;
    if (index < 0) continue;

    const existing: ApprovalLayer = next.layers[index] ?? {
      status: "pending",
      outcome: undefined,
      email: null,
      signedAt: null,
      rejectionReason: null,
      signature: null,
    };
    const text = value === null || value === undefined ? null : String(value);

    switch (layerMatch[2]) {
      case "Status": {
        const status = normalizeLayerStatus(text);
        existing.status = status;
        existing.outcome = status === "approved" ? "approved" : status === "rejected" ? "rejected" : undefined;
        break;
      }
      case "SignedAt":
        existing.signedAt = text;
        break;
      case "Email":
        existing.email = text;
        break;
      case "Rejection":
        existing.rejectionReason = text;
        break;
      case "Signature":
        existing.signature = text;
        break;
    }

    next.layers[index] = existing;
  }

  return next;
}
