import type { CatalogueEntry, LayerConfig, SeverityCapture, SharePointClient } from "../types";

const MASTER_FORM_LIST = "Master Form";

/**
 * SLA and the public flag live on the form's own LayerConfig — the catalogue is
 * an editor for existing form-builder data, not a parallel store.
 *
 * Creating a form type is not done here. The pmw-hrform builder owns every write
 * that brings a form into existence; this module only edits settings on forms
 * that already exist.
 */
export interface CatalogueSettingsPatch {
  slaDays?: number;
  isPublic?: boolean;
  severityCapture?: SeverityCapture;
  /** SLA overrides keyed by layer number, when a layer differs from the form default. */
  layerSlaDays?: Record<number, number>;
}

function masterFormFilter(listTitle: string): string {
  return `Title eq '${listTitle.replace(/'/g, "''")}'`;
}

async function readLayerConfig(spClient: SharePointClient, listTitle: string): Promise<LayerConfig | null> {
  const items = await spClient.queryList(MASTER_FORM_LIST, {
    select: ["Id", "Title", "LayerConfig"],
    filter: masterFormFilter(listTitle),
    top: 1,
  });
  const raw = items[0]?.LayerConfig;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as LayerConfig;
  } catch {
    return null;
  }
}

export async function saveCatalogueSettings(
  spClient: SharePointClient,
  entry: CatalogueEntry,
  patch: CatalogueSettingsPatch,
): Promise<LayerConfig> {
  const existing = await readLayerConfig(spClient, entry.listTitle);
  const base: LayerConfig = existing ?? { version: "1.0", layers: entry.layers };

  const next: LayerConfig = {
    ...base,
    code: entry.code,
    ...(patch.slaDays !== undefined ? { slaDays: patch.slaDays } : {}),
    ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
    ...(patch.severityCapture !== undefined ? { severityCapture: patch.severityCapture } : {}),
    layers: base.layers.map((layer) => {
      const override = patch.layerSlaDays?.[layer.layerNumber];
      return override === undefined ? layer : { ...layer, slaDays: override };
    }),
  };

  await spClient.upsertListItem(MASTER_FORM_LIST, masterFormFilter(entry.listTitle), {
    Title: entry.listTitle,
    LayerConfig: JSON.stringify(next),
    ...(patch.isPublic !== undefined ? { IsPublic: patch.isPublic } : {}),
  });

  return next;
}
