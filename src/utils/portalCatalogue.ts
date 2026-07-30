import { PORTAL_SLA_DEFAULT_DAYS } from "../config/oshes";
import type { CatalogueEntry, LayerConfig, LayerConfigItem, SeverityCapture, Submission } from "../types";
import { displayName, layerAssigneeEmail, layerRoleLabel, type PeopleDirectory } from "./portalPeople";
import { parseDate } from "./portalTime";

const DAY_MS = 86_400_000;

/**
 * A catalogue code for a form type. Configured on LayerConfig where the admin
 * has set one; otherwise derived from the list title so references stay stable.
 */
export function deriveCode(listTitle: string, config: LayerConfig | null | undefined): string {
  const configured = config?.code?.trim().toUpperCase();
  if (configured) return configured.slice(0, 4);

  const words = listTitle
    .replace(/responses?$/i, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "FRM";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 4)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

/** SLA for a specific layer: the layer's own, then the form's, then the global fallback. */
export function layerSlaDays(config: LayerConfig | null | undefined, layer: LayerConfigItem | undefined): number {
  const fromLayer = Number(layer?.slaDays);
  if (Number.isFinite(fromLayer) && fromLayer > 0) return fromLayer;
  const fromForm = Number(config?.slaDays);
  if (Number.isFinite(fromForm) && fromForm > 0) return fromForm;
  return PORTAL_SLA_DEFAULT_DAYS;
}

export function severityCaptureOf(config: LayerConfig | null | undefined): SeverityCapture {
  return config?.severityCapture ?? "none";
}

export function severityCaptureLabel(capture: SeverityCapture): string {
  if (capture === "required") return "Required";
  if (capture === "optional") return "Optional";
  return "—";
}

/** Layers in chain order — manual branches contribute their layers once, in order. */
export function chainLayers(config: LayerConfig | null | undefined): LayerConfigItem[] {
  if (!config) return [];
  if (config.layers.length > 0) return [...config.layers].sort((a, b) => a.layerNumber - b.layerNumber);
  const branchLayers = config.manualBranches?.[0]?.layers ?? [];
  return [...branchLayers].sort((a, b) => a.layerNumber - b.layerNumber);
}

/**
 * Build the form catalogue. The form set, its approval chain, per-layer SLA and
 * the public flag are data — nothing downstream may hard-code a form list.
 */
export function buildCatalogue(
  listTitles: string[],
  layerConfigs: Record<string, LayerConfig | null> | undefined,
  submissions: Submission[],
  directory: PeopleDirectory = {},
  now: Date = new Date(),
): CatalogueEntry[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;

  const counts = new Map<string, { today: number; volume: number }>();
  for (const submission of submissions) {
    const filed = parseDate(submission.submittedAt)?.getTime();
    const bucket = counts.get(submission.listTitle) ?? { today: 0, volume: 0 };
    if (filed !== undefined) {
      if (filed >= startOfToday) bucket.today += 1;
      if (filed >= thirtyDaysAgo) bucket.volume += 1;
    }
    counts.set(submission.listTitle, bucket);
  }

  return listTitles
    .map((listTitle) => {
      const config = layerConfigs?.[listTitle] ?? null;
      const layers = chainLayers(config);
      const chain = layers.map((layer, index) => layerRoleLabel(layer, index));
      const bucket = counts.get(listTitle) ?? { today: 0, volume: 0 };
      const firstEmail = layerAssigneeEmail(layers[0]);

      return {
        listTitle,
        code: deriveCode(listTitle, config),
        name: listTitle,
        chain,
        layers,
        slaDays: layerSlaDays(config, layers[0]),
        isPublic: config?.isPublic ?? false,
        severityCapture: severityCaptureOf(config),
        volume: bucket.volume,
        today: bucket.today,
        firstApprover: firstEmail ? displayName(firstEmail, directory) : chain[0] ?? "the first approver",
      } satisfies CatalogueEntry;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findCatalogueEntry(catalogue: CatalogueEntry[], listTitle: string): CatalogueEntry | undefined {
  return catalogue.find((entry) => entry.listTitle === listTitle);
}
