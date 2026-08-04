import type { FormVisibility, LayerConfig, LayerConfigItem, WorkflowKind, WorkflowShape } from "../types";

export type { FormVisibility, WorkflowKind, WorkflowShape };

/**
 * What a form actually does after submit, and who can reach it.
 *
 * Both questions used to be answered by guessing. A form with no approval
 * layers was given one anyway — `Number(NumberOfApprovalLayer) || 1` — so a
 * plain record-keeping form rendered "Layer 1 of 1 · In approval" and sat in
 * an SLA it never had. And "public" was read from a flag the form builder
 * rarely writes, while the page that actually serves the anonymous link reads
 * a different column. This module is the one place both are decided.
 */

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Layers in chain order — manual branches contribute their first branch's layers. */
export function workflowLayers(config: LayerConfig | null | undefined): LayerConfigItem[] {
  if (!config) return [];
  if (config.layers.length > 0) return [...config.layers].sort((a, b) => a.layerNumber - b.layerNumber);
  const branchLayers = config.manualBranches?.[0]?.layers ?? [];
  return [...branchLayers].sort((a, b) => a.layerNumber - b.layerNumber);
}

/**
 * Describe a chain by what is in it, not by how many entries it has. A form
 * whose only layer is an evaluation is not "1 approval layer" — nobody signs
 * it, and calling it an approval is what put it in the wrong queue.
 */
export function describeWorkflow(layers: readonly LayerConfigItem[]): WorkflowShape {
  const evaluationLayers = layers.filter((layer) => layer.type === "evaluation").length;
  const approvalLayers = layers.length - evaluationLayers;
  const totalLayers = layers.length;

  if (totalLayers === 0) {
    return {
      kind: "none",
      hasWorkflow: false,
      approvalLayers: 0,
      evaluationLayers: 0,
      totalLayers: 0,
      label: "No approval step — filed straight to the record",
      shortLabel: "No approval",
    };
  }

  if (evaluationLayers === 0) {
    return {
      kind: "approval",
      hasWorkflow: true,
      approvalLayers,
      evaluationLayers: 0,
      totalLayers,
      label: `${plural(approvalLayers, "approval layer")} — signed in order`,
      shortLabel: plural(approvalLayers, "approval"),
    };
  }

  if (approvalLayers === 0) {
    return {
      kind: "evaluation",
      hasWorkflow: true,
      approvalLayers: 0,
      evaluationLayers,
      totalLayers,
      label: `${plural(evaluationLayers, "evaluation layer")} — assessed, never signed`,
      shortLabel: plural(evaluationLayers, "evaluation"),
    };
  }

  return {
    kind: "mixed",
    hasWorkflow: true,
    approvalLayers,
    evaluationLayers,
    totalLayers,
    label: `${plural(evaluationLayers, "evaluation")} then ${plural(approvalLayers, "approval")}`,
    shortLabel: `${plural(evaluationLayers, "evaluation")} + ${plural(approvalLayers, "approval")}`,
  };
}

/** Does this form put anything in anyone's queue after submit? */
export function hasWorkflow(config: LayerConfig | null | undefined): boolean {
  return workflowLayers(config).length > 0;
}

// ── Public / internal ────────────────────────────────────────────────────────

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return null;
}

/**
 * Resolve a form's reachability from the two places it is recorded.
 *
 * `IsPublic` on the Master Form item is authoritative because it is the value
 * the form page reads at request time. `LayerConfig.isPublic` is the catalogue's
 * mirror of it; when the two disagree the effective answer still comes from the
 * column, and the disagreement is reported so it can be fixed rather than hidden.
 */
export function resolveFormVisibility(args: {
  masterFormIsPublic?: unknown;
  layerConfigIsPublic?: boolean | null;
}): FormVisibility {
  const column = asBoolean(args.masterFormIsPublic);
  const stored = asBoolean(args.layerConfigIsPublic);

  // The form page treats "not set" as open, so the effective answer must too.
  const isPublic = column !== false;
  const declared = column ?? stored;
  const unset = declared === null;
  // Two ways to disagree, and both matter: the two stores hold different
  // values, or the one that was set is not what the link actually does.
  const mismatch =
    (column !== null && stored !== null && column !== stored) || (declared !== null && declared !== isPublic);

  if (unset) {
    return {
      isPublic,
      declared: null,
      unset: true,
      mismatch: false,
      label: "Public — not set",
      note: "IsPublic has never been set on this form, and an unset form opens for anyone with the link. Set it either way to make the intent explicit.",
    };
  }

  if (mismatch) {
    return {
      isPublic,
      declared,
      unset: false,
      mismatch: true,
      label: isPublic ? "Public — mismatch" : "Internal — mismatch",
      note: "The catalogue flag and the IsPublic column disagree. The form link follows the column, which is what this badge reports. Toggle it once here to bring both into line.",
    };
  }

  return {
    isPublic,
    declared,
    unset: false,
    mismatch: false,
    label: isPublic ? "Public" : "Internal",
    note: isPublic
      ? "Anyone with the link or the QR poster can file this form without signing in."
      : "Only a signed-in account on this tenant can open this form.",
  };
}
