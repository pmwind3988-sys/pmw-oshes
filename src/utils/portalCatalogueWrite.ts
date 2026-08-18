import type { CatalogueEntry, LayerConfig, SharePointClient } from "../types";

const MASTER_FORM_LIST = "Master Form";

/**
 * SLA lives on the form's own LayerConfig — the catalogue is an editor for
 * existing form-builder data, not a parallel store.
 *
 * SLA is the only thing this module writes. Creating a form type is not done
 * here, and neither is the public flag: the pmw-hrform builder owns both, and a
 * second writer for `isPublic` is how `LayerConfig.isPublic` and the `IsPublic`
 * column came to hold different answers. The catalogue reports that flag now.
 */
export interface CatalogueSettingsPatch {
  slaDays?: number;
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
    layers: base.layers.map((layer) => {
      const override = patch.layerSlaDays?.[layer.layerNumber];
      return override === undefined ? layer : { ...layer, slaDays: override };
    }),
  };

  await spClient.upsertListItem(MASTER_FORM_LIST, masterFormFilter(entry.listTitle), {
    Title: entry.listTitle,
    LayerConfig: JSON.stringify(next),
  });

  return next;
}
