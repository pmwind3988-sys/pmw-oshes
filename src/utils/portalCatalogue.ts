import { PORTAL_SLA_DEFAULT_DAYS } from "../config/oshes";
import type {
  CatalogueEntry,
  FormVisibility,
  LayerConfig,
  LayerConfigItem,
  SeverityCapture,
  Submission,
} from "../types";
import { describeWorkflow, resolveFormVisibility, workflowLayers } from "./formWorkflow";
import { displayName, layerAssigneeEmail, layerRoleLabel, type PeopleDirectory } from "./portalPeople";
import { parseDate } from "./portalTime";
import { deriveFormAcronym } from "./referenceNumber";

const DAY_MS = 86_400_000;

/**
 * A catalogue code for a form type. Configured on LayerConfig where the admin
 * has set one; otherwise derived from the list title so references stay stable.
 */
export function deriveCode(listTitle: string, config: LayerConfig | null | undefined): string {
  const configured = config?.code?.trim().toUpperCase();
  if (configured) return configured.slice(0, 4);
  return deriveFormAcronym(listTitle);
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
export const chainLayers = workflowLayers;

export interface BuildCatalogueArgs {
  listTitles: string[];
  layerConfigs?: Record<string, LayerConfig | null>;
  submissions: Submission[];
  /** Whether each form's link actually opens anonymously, read from the Master Form column. */
  visibility?: Record<string, FormVisibility>;
  slugs?: Record<string, string>;
  directory?: PeopleDirectory;
  now?: Date;
}

/**
 * Build the form catalogue. The form set, its approval chain, per-layer SLA and
 * whether the link is open are data — nothing downstream may hard-code a form
 * list, and nothing invents a chain for a form that declares none.
 */
export function buildCatalogue({
  listTitles,
  layerConfigs,
  submissions,
  visibility,
  slugs,
  directory = {},
  now = new Date(),
}: BuildCatalogueArgs): CatalogueEntry[] {
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
      const layers = workflowLayers(config);
      const workflow = describeWorkflow(layers);
      const chain = layers.map((layer, index) => layerRoleLabel(layer, index));
      const bucket = counts.get(listTitle) ?? { today: 0, volume: 0 };
      const firstEmail = layerAssigneeEmail(layers[0]);

      // Falls back to the form's own stored flag when the loader could not read
      // the Master Form column, so the badge is never simply absent.
      const formVisibility =
        visibility?.[listTitle]
        ?? resolveFormVisibility({ layerConfigIsPublic: config?.isPublic ?? null });

      return {
        listTitle,
        code: deriveCode(listTitle, config),
        name: listTitle,
        slug: slugs?.[listTitle] ?? "",
        chain,
        layers,
        workflow,
        hasWorkflow: workflow.hasWorkflow,
        slaDays: layerSlaDays(config, layers[0]),
        visibility: formVisibility,
        isPublic: formVisibility.isPublic,
        severityCapture: severityCaptureOf(config),
        volume: bucket.volume,
        today: bucket.today,
        // A form with no chain has nobody to route to. Naming "the first
        // approver" anyway is how the file screen came to promise one.
        firstApprover: !workflow.hasWorkflow
          ? ""
          : firstEmail
            ? displayName(firstEmail, directory)
            : chain[0] ?? "the first approver",
      } satisfies CatalogueEntry;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findCatalogueEntry(catalogue: CatalogueEntry[], listTitle: string): CatalogueEntry | undefined {
  return catalogue.find((entry) => entry.listTitle === listTitle);
}
