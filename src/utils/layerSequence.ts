/**
 * layerSequence.ts — which layers one submission actually went through.
 *
 * Lifted out of `generateFormPdf.ts` so that reading a chain does not drag
 * `@react-pdf/renderer` in with it. The PDF and the CSV export both have to
 * answer this question, and they must not answer it differently: a layer the PDF
 * prints and the spreadsheet omits reads as data loss.
 *
 * Pure. `LayerConfig` arrives either as the parsed object or as the JSON string
 * still on the `Master Form` row, because both callers exist.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLayerConfig(layerConfig: unknown): Record<string, unknown> | null {
  if (typeof layerConfig === "string" && layerConfig.trim()) {
    try {
      const parsed = JSON.parse(layerConfig) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(layerConfig) ? layerConfig : null;
}

export function layerNumberFromValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function branchMatches(branch: Record<string, unknown>, selectedBranch: string): boolean {
  const selected = selectedBranch.trim().toLowerCase();
  if (!selected) return false;
  return [branch.name, branch.label].some((value) => typeof value === "string" && value.trim().toLowerCase() === selected);
}

/**
 * The chain, in layer order.
 *
 * A manual branch replaces the sequence outright, so the branch the submitter
 * chose decides which chain the record is read against. When no branch was
 * recorded, every branch's layers are merged by number rather than returning
 * nothing — a record whose branch is missing still has a history, and the
 * layers are only being read here, never acted on.
 */
export function layerSequenceFromConfig(layerConfig: unknown, selectedBranchRaw: unknown): Record<string, unknown>[] {
  const parsed = parseLayerConfig(layerConfig);
  if (!parsed) return [];

  const selectedBranch = typeof selectedBranchRaw === "string" ? selectedBranchRaw : "";
  const manualBranches = Array.isArray(parsed.manualBranches) ? parsed.manualBranches.filter(isRecord) : [];
  const selectedManualBranch = manualBranches.find((branch) => branchMatches(branch, selectedBranch));
  if (selectedManualBranch && Array.isArray(selectedManualBranch.layers)) {
    return selectedManualBranch.layers.filter(isRecord);
  }

  const layers = Array.isArray(parsed.layers) ? parsed.layers.filter(isRecord) : [];
  const byLayerNumber = new Map<number, Record<string, unknown>>();
  for (const layer of layers) {
    const layerNumber = layerNumberFromValue(layer.layerNumber);
    if (layerNumber !== null) byLayerNumber.set(layerNumber, layer);
  }
  for (const branch of manualBranches) {
    if (!Array.isArray(branch.layers)) continue;
    for (const layer of branch.layers.filter(isRecord)) {
      const layerNumber = layerNumberFromValue(layer.layerNumber);
      if (layerNumber !== null && !byLayerNumber.has(layerNumber)) byLayerNumber.set(layerNumber, layer);
    }
  }

  return [...byLayerNumber.values()].sort((a, b) => (layerNumberFromValue(a.layerNumber) ?? 0) - (layerNumberFromValue(b.layerNumber) ?? 0));
}
