import type { FormStatus, LayerStatus } from "../types";

/**
 * SharePoint-compatible layer status values.
 * These are stored in L{n}_Status columns and used for SP list queries.
 */
export const SP_LAYER_STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  CONFIRMED: "Confirmed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
} as const;

/**
 * SharePoint-compatible form-level status values.
 * Stored in the FormStatus column of response lists.
 */
export const SP_FORM_STATUS = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In Review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
} as const;

/**
 * Standard column suffixes for approval layer fields.
 * Used to build column names: L{layerNumber}_{suffix}
 */
export const SP_LAYER_COLUMN_SUFFIXES = {
  STATUS: "Status",
  EMAIL: "Email",
  SIGNED_AT: "SignedAt",
  REJECTION: "Rejection",
  SIGNATURE: "Signature",
} as const;

/**
 * Build a layer column name, e.g. layerColumn(1, "Status") => "L1_Status"
 */
export function layerColumn(layerNumber: number, suffix: string): string {
  return `L${layerNumber}_${suffix}`;
}

/**
 * Column names used on response lists for the enhanced layer system.
 */
export const RESPONSE_COLUMNS = {
  CURRENT_LAYER: "CurrentLayer",
  FORM_STATUS: "FormStatus",
  EVALUATION_DATA: "EvaluationData",
} as const;

// ── Migration Helpers ───────────────────────────────────────────────────────

/**
 * Maps legacy status string values to canonical SP_LAYER_STATUS / SP_FORM_STATUS.
 * Covers all known old values so reads of pre-migration data work correctly.
 */
export const LEGACY_STATUS_MAP: Record<string, string> = {
  "Pending": SP_LAYER_STATUS.PENDING,
  "Waiting": SP_LAYER_STATUS.PENDING,
  "Pending Approval": SP_LAYER_STATUS.PENDING,
  "approved": SP_LAYER_STATUS.APPROVED,
  "rejected": SP_LAYER_STATUS.REJECTED,
  "Approved Layer 1": SP_LAYER_STATUS.APPROVED,
  "Approved Layer 2": SP_LAYER_STATUS.APPROVED,
  "Approved Layer 3": SP_LAYER_STATUS.APPROVED,
  "Fully Approved": SP_FORM_STATUS.COMPLETED,
};

/**
 * Normalize a raw status string from SP to a canonical LayerStatus.
 * Unknown values default to "pending" for forward compatibility.
 */
export function normalizeLayerStatus(raw: string | null | undefined): LayerStatus {
  if (!raw) return "pending";
  const mapped = LEGACY_STATUS_MAP[raw];
  if (mapped === SP_LAYER_STATUS.APPROVED) return "approved";
  if (mapped === SP_LAYER_STATUS.REJECTED) return "rejected";
  if (mapped === SP_FORM_STATUS.COMPLETED) return "approved";
  if (mapped === SP_LAYER_STATUS.PENDING) return "pending";
  const lower = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (lower.includes("pending") || lower.includes("waiting")) return "pending";
  if (lower === "approved" || lower.includes("fullyapproved") || lower.includes("approve")) return "approved";
  if (lower === "confirmed") return "confirmed";
  if (lower === "inprogress" || lower.includes("progress") || lower.includes("review")) return "in_progress";
  if (lower.includes("skip")) return "skipped";
  if (lower.includes("cancel")) return "cancelled";
  if (lower.includes("reject")) return "rejected";
  return "pending";
}

/**
 * Derive the form-level FormStatus from the ordered list of layer statuses.
 */
export function deriveFormStatus(layerStatuses: LayerStatus[]): FormStatus {
  if (layerStatuses.length === 0) return "submitted";

  const hasRejected = layerStatuses.some((s) => s === "rejected");
  if (hasRejected) return "rejected";

  const allDone = layerStatuses.every(
    (s) => s === "approved" || s === "confirmed" || s === "skipped" || s === "cancelled"
  );
  if (allDone) return "completed";

  const anyActive = layerStatuses.some(
    (s) => s === "pending" || s === "in_progress"
  );
  if (anyActive) return "in_review";

  return "submitted";
}

/**
 * Get human-readable label for a layer status.
 */
export function layerStatusLabel(status: LayerStatus): string {
  const labels: Record<LayerStatus, string> = {
    pending: "Pending",
    in_progress: "In Progress",
    confirmed: "Confirmed",
    approved: "Approved",
    rejected: "Rejected",
    skipped: "Skipped",
    cancelled: "Cancelled",
  };
  return labels[status] ?? "Pending";
}

/**
 * Get human-readable label for a form status.
 */
export function formStatusLabel(status: FormStatus): string {
  const labels: Record<FormStatus, string> = {
    draft: "Draft",
    submitted: "Submitted",
    in_review: "In Review",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return labels[status] ?? "Submitted";
}
