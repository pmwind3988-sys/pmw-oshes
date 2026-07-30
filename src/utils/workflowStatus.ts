import { deriveFormStatus, formStatusLabel, normalizeLayerStatus, SP_FORM_STATUS, SP_LAYER_STATUS } from "./statusConstants";

export function rejectedAtLayerStatus(layerNumber: number): string {
  return `Rejected at Layer ${layerNumber}`;
}

export function isRejectedStatus(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("reject");
}

export function isCompletedFormStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return normalized === "approved" || normalized === "completed" || normalized === "fullyapproved";
}

export function isTerminalLayerStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return (
    normalized === "approved" ||
    normalized === "confirmed" ||
    normalized === "skipped" ||
    normalized === "cancelled" ||
    normalized.includes("reject")
  );
}

function normalizeLayerNumber(value: number | null | undefined, totalLayers: number): number {
  if (!Number.isFinite(value) || !value || totalLayers <= 0) return 0;
  return Math.min(totalLayers, Math.max(1, Math.trunc(value)));
}

function hasLayerStatusEvidence(status: string | null | undefined): boolean {
  return typeof status === "string" && status.trim().length > 0;
}

export function resolveWorkflowDisplayState(args: {
  formStatus?: string | null;
  currentLayer?: number | null;
  totalLayers: number;
  layerStatuses: (string | null | undefined)[];
}): { formStatus: string | null; currentLayer: number } {
  const totalLayers = Math.max(0, Math.trunc(args.totalLayers));
  if (totalLayers <= 0) {
    return {
      formStatus: args.formStatus ?? null,
      currentLayer: 0,
    };
  }

  const layerStatuses = Array.from({ length: totalLayers }, (_, index) => args.layerStatuses[index]);
  const rawCurrentLayer = normalizeLayerNumber(args.currentLayer, totalLayers);
  const currentLayerStatus = rawCurrentLayer > 0 ? layerStatuses[rawCurrentLayer - 1] : undefined;
  let currentLayer = rawCurrentLayer || 1;

  if (rawCurrentLayer > 0 && isRejectedStatus(currentLayerStatus)) {
    currentLayer = rawCurrentLayer;
  } else if (rawCurrentLayer > 0 && !isTerminalLayerStatus(currentLayerStatus)) {
    currentLayer = rawCurrentLayer;
  } else {
    const nextOpenIndex = layerStatuses.findIndex((status, index) =>
      index + 1 > rawCurrentLayer && !isTerminalLayerStatus(status)
    );
    if (nextOpenIndex >= 0) {
      currentLayer = nextOpenIndex + 1;
    } else {
      const lastTerminalIndex = layerStatuses.reduce((lastIndex, status, index) =>
        hasLayerStatusEvidence(status) && isTerminalLayerStatus(status) ? index : lastIndex,
      -1);
      currentLayer = lastTerminalIndex >= 0 ? lastTerminalIndex + 1 : currentLayer;
    }
  }

  const hasAnyLayerStatus = layerStatuses.some(hasLayerStatusEvidence);
  let formStatus = args.formStatus ?? null;
  if (isRejectedStatus(formStatus)) {
    formStatus = SP_FORM_STATUS.REJECTED;
  } else if (isCompletedFormStatus(formStatus)) {
    formStatus = SP_FORM_STATUS.COMPLETED;
  } else if (hasAnyLayerStatus) {
    formStatus = formStatusLabel(deriveFormStatus(layerStatuses.map(normalizeLayerStatus)));
  }

  return { formStatus, currentLayer };
}

export function buildRejectedWorkflowPatch(
  rejectedLayer: number,
  totalLayers: number,
  signedAt: string,
  reason?: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    Status: SP_FORM_STATUS.REJECTED,
    FormStatus: SP_FORM_STATUS.REJECTED,
    CurrentLayer: rejectedLayer,
    CurrentApprovalLayer: rejectedLayer,
    [`L${rejectedLayer}_Status`]: SP_LAYER_STATUS.REJECTED,
    [`L${rejectedLayer}_SignedAt`]: signedAt,
  };

  if (reason !== undefined) {
    patch[`L${rejectedLayer}_Rejection`] = reason;
  }

  for (let layer = rejectedLayer + 1; layer <= totalLayers; layer++) {
    patch[`L${layer}_Status`] = rejectedAtLayerStatus(rejectedLayer);
  }

  return patch;
}

export function shouldGenerateTerminalPdf(args: {
  formStatus?: string | null;
  currentLayer?: number;
  totalLayers: number;
  layerStatuses?: (string | null | undefined)[];
}): boolean {
  if (isRejectedStatus(args.formStatus) || isCompletedFormStatus(args.formStatus)) return true;
  if (args.layerStatuses?.some(isRejectedStatus)) return true;
  if (args.layerStatuses?.length && args.layerStatuses.every(isTerminalLayerStatus)) return true;
  return args.totalLayers > 0 && (args.currentLayer ?? 0) >= args.totalLayers && isCompletedFormStatus(args.formStatus);
}
