import type { LayerConfigItem, ManualBranch } from "../../types";

export interface LayerConfigSource {
  layers?: LayerConfigItem[];
  manualBranches?: ManualBranch[];
}

export interface LayerProgressItem {
  CurrentApprovalLayer?: number;
  CurrentLayer?: number;
  L1_Status?: string;
  totalLayers?: number;
}

export interface CurrentLayerItem extends LayerProgressItem {
  SelectedBranch?: string;
}

function normalizeLayerCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizeBranchKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Get the active layer sequence, respecting manual branch selection. */
export function getActiveLayers(
  layerConfig: LayerConfigSource | null | undefined,
  selectedBranch?: string,
): LayerConfigItem[] {
  if (!layerConfig) return [];
  if (layerConfig.manualBranches?.length && selectedBranch) {
    const normalizedBranch = normalizeBranchKey(selectedBranch);
    const branch = layerConfig.manualBranches.find((b) =>
      [b.name, b.label].some((candidate) => normalizeBranchKey(candidate) === normalizedBranch)
    );
    if (branch) return branch.layers;
  }
  return layerConfig.layers || [];
}

export function resolveCurrentLayerNumber(item: LayerProgressItem, activeLayerCount = 0): number {
  const rawLayer = item.CurrentLayer || item.CurrentApprovalLayer;
  let currentLayer = rawLayer || 0;
  if (currentLayer <= 1 && activeLayerCount > 1 && item.L1_Status && ["Approved", "Confirmed"].includes(item.L1_Status)) {
    currentLayer = 2;
  }
  return currentLayer > 0 ? currentLayer : 1;
}

export function resolveCurrentLayer(
  layerConfig: LayerConfigSource | null | undefined,
  item: CurrentLayerItem,
): { activeLayers: LayerConfigItem[]; currentLayerNumber: number; currentLayer?: LayerConfigItem } {
  const activeLayers = getActiveLayers(layerConfig, item.SelectedBranch);
  const currentLayerNumber = resolveCurrentLayerNumber(item, activeLayers.length);
  return {
    activeLayers,
    currentLayerNumber,
    currentLayer: activeLayers.find((layer) => layer.layerNumber === currentLayerNumber),
  };
}

export function resolveTotalLayerCount(
  layerConfig: LayerConfigSource | null | undefined,
  selectedBranch: string | undefined,
  legacyLayerCount: number | null | undefined,
): number {
  const activeLayers = getActiveLayers(layerConfig, selectedBranch);
  if (activeLayers.length > 0) return activeLayers.length;
  return normalizeLayerCount(legacyLayerCount);
}

export function formatLayerProgress(item: LayerProgressItem): string {
  const currentLayer = resolveCurrentLayerNumber(item, item.totalLayers);
  const totalLayers = normalizeLayerCount(item.totalLayers);
  return `Layer ${currentLayer} of ${totalLayers || "?"}`;
}
