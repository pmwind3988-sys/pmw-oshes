import { OSHES_LISTS } from "../config/oshes";
import type { CatalogueEntry, LayerConfig, LayerConfigItem, SeverityCapture, SharePointClient } from "../types";
import { slugify } from "./formBuilderSP";

/**
 * SLA and the public flag live on the form's own LayerConfig — the catalogue is
 * an editor for existing form-builder data, not a parallel store.
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
  const items = await spClient.queryList(OSHES_LISTS.masterForm, {
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

  await spClient.upsertListItem(OSHES_LISTS.masterForm, masterFormFilter(entry.listTitle), {
    Title: entry.listTitle,
    LayerConfig: JSON.stringify(next),
    ...(patch.isPublic !== undefined ? { IsPublic: patch.isPublic } : {}),
  });

  return next;
}

export interface NewFormTypeInput {
  name: string;
  code: string;
  layerCount: number;
  slaDays: number;
  /** Roles the new layers point at, in order. */
  roles: string[];
}

/**
 * Add a form type. It appears in the catalogue, in "Inbound today" at zero, in
 * the QR picker once made public, and writes an audit entry — all because those
 * screens read the catalogue rather than a hard-coded list.
 */
export async function addFormType(
  spClient: SharePointClient,
  input: NewFormTypeInput,
): Promise<CatalogueEntry> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the form type a name first.");

  const layerCount = Math.max(1, Math.min(6, input.layerCount));
  const code = (input.code.trim() || name.slice(0, 3)).toUpperCase().slice(0, 4);

  const layers: LayerConfigItem[] = Array.from({ length: layerCount }, (_, index) => ({
    layerNumber: index + 1,
    type: "approval",
    authMode: "365",
    assignee: { type: "field-reference", value: `L${index + 1}_Email` },
    confirmationType: "signature",
    allowRejectionReason: true,
    title: input.roles[index] ?? `Layer ${index + 1}`,
    roleLabel: input.roles[index] ?? `Layer ${index + 1}`,
    slaDays: input.slaDays,
  }));

  const layerConfig: LayerConfig = {
    version: "1.0",
    layers,
    code,
    slaDays: input.slaDays,
    isPublic: false,
    severityCapture: "none",
  };

  await spClient.upsertListItem(OSHES_LISTS.masterForm, masterFormFilter(name), {
    Title: name,
    FormID: code,
    Slug: slugify(name),
    NumberOfApprovalLayer: layerCount,
    CurrentVersion: "1",
    IsPublished: false,
    IsPublic: false,
    LayerConfig: JSON.stringify(layerConfig),
  });

  return {
    listTitle: name,
    code,
    name,
    chain: layers.map((layer) => layer.roleLabel ?? layer.title ?? ""),
    layers,
    slaDays: input.slaDays,
    isPublic: false,
    severityCapture: "none",
    volume: 0,
    today: 0,
    firstApprover: input.roles[0] ?? "the first approver",
  };
}
