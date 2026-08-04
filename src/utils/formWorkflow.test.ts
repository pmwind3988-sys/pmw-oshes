import { describe, expect, it } from "vitest";
import { describeWorkflow, hasWorkflow, resolveFormVisibility, workflowLayers } from "./formWorkflow";
import type { LayerConfig, LayerConfigItem } from "../types";

function layer(layerNumber: number, type: "approval" | "evaluation"): LayerConfigItem {
  const base = {
    layerNumber,
    authMode: "365" as const,
    assignee: { type: "user" as const, value: `l${layerNumber}@pmw.gov.my` },
  };
  return type === "evaluation"
    ? { ...base, type: "evaluation", surveyElements: [] }
    : { ...base, type: "approval", confirmationType: "signature", allowRejectionReason: true };
}

describe("describeWorkflow", () => {
  it("calls an empty chain what it is, rather than one approval layer", () => {
    const shape = describeWorkflow([]);
    expect(shape.kind).toBe("none");
    expect(shape.hasWorkflow).toBe(false);
    expect(shape.totalLayers).toBe(0);
    expect(shape.shortLabel).toBe("No approval");
  });

  it("counts approval layers", () => {
    const shape = describeWorkflow([layer(1, "approval"), layer(2, "approval")]);
    expect(shape.kind).toBe("approval");
    expect(shape.approvalLayers).toBe(2);
    expect(shape.shortLabel).toBe("2 approvals");
  });

  it("does not call an evaluation-only form an approval form — nobody signs it", () => {
    const shape = describeWorkflow([layer(1, "evaluation")]);
    expect(shape.kind).toBe("evaluation");
    expect(shape.approvalLayers).toBe(0);
    expect(shape.evaluationLayers).toBe(1);
  });

  it("names both halves of a mixed chain", () => {
    const shape = describeWorkflow([layer(1, "evaluation"), layer(2, "approval"), layer(3, "approval")]);
    expect(shape.kind).toBe("mixed");
    expect(shape.shortLabel).toBe("1 evaluation + 2 approvals");
  });
});

describe("workflowLayers", () => {
  it("has no layers for a form configured with none", () => {
    const config: LayerConfig = { version: "1.0", layers: [] };
    expect(workflowLayers(config)).toEqual([]);
    expect(hasWorkflow(config)).toBe(false);
  });

  it("sorts a chain by layer number, whatever order it was stored in", () => {
    const config: LayerConfig = { version: "1.0", layers: [layer(2, "approval"), layer(1, "evaluation")] };
    expect(workflowLayers(config).map((item) => item.layerNumber)).toEqual([1, 2]);
  });

  it("falls back to the first manual branch when the top-level chain is empty", () => {
    const config: LayerConfig = {
      version: "1.0",
      layers: [],
      manualBranches: [{ name: "a", label: "A", layers: [layer(1, "approval")] }],
    };
    expect(workflowLayers(config)).toHaveLength(1);
    expect(hasWorkflow(config)).toBe(true);
  });
});

describe("resolveFormVisibility", () => {
  it("reports an explicitly public form as public", () => {
    const visibility = resolveFormVisibility({ masterFormIsPublic: true, layerConfigIsPublic: true });
    expect(visibility.isPublic).toBe(true);
    expect(visibility.label).toBe("Public");
    expect(visibility.unset).toBe(false);
  });

  it("reports an explicitly internal form as internal", () => {
    const visibility = resolveFormVisibility({ masterFormIsPublic: false, layerConfigIsPublic: false });
    expect(visibility.isPublic).toBe(false);
    expect(visibility.label).toBe("Internal");
  });

  it("reports an unset form as open, because that is what the form page does with it", () => {
    const visibility = resolveFormVisibility({});
    expect(visibility.isPublic).toBe(true);
    expect(visibility.unset).toBe(true);
    expect(visibility.label).toBe("Public — not set");
  });

  it("follows the column, not the catalogue flag, and says the two disagree", () => {
    const visibility = resolveFormVisibility({ masterFormIsPublic: false, layerConfigIsPublic: true });
    expect(visibility.isPublic).toBe(false);
    expect(visibility.mismatch).toBe(true);
    expect(visibility.label).toBe("Internal — mismatch");
  });

  it("accepts the string and numeric booleans SharePoint returns", () => {
    expect(resolveFormVisibility({ masterFormIsPublic: "false" }).isPublic).toBe(false);
    expect(resolveFormVisibility({ masterFormIsPublic: 0 }).isPublic).toBe(false);
    expect(resolveFormVisibility({ masterFormIsPublic: "true" }).isPublic).toBe(true);
  });

  it("flags a form the catalogue calls internal while the column leaves it open", () => {
    // The most dangerous shape: someone set it internal in one place, the link
    // is open in the other, and the badge must not report the intention.
    const visibility = resolveFormVisibility({ layerConfigIsPublic: false });
    expect(visibility.isPublic).toBe(true);
    expect(visibility.mismatch).toBe(true);
    expect(visibility.label).toBe("Public — mismatch");
  });

  it("does not flag a catalogue-only public form, which is what the link already does", () => {
    const visibility = resolveFormVisibility({ layerConfigIsPublic: true });
    expect(visibility.isPublic).toBe(true);
    expect(visibility.mismatch).toBe(false);
    expect(visibility.unset).toBe(false);
  });
});
