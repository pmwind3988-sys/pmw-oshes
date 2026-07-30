import { describe, expect, it } from "vitest";

import {
  formatLayerProgress,
  getActiveLayers,
  resolveCurrentLayer,
  resolveCurrentLayerNumber,
  resolveTotalLayerCount,
} from "./approvalDashboardLayerProgress";
import type { LayerConfigItem } from "../../types";

function approvalLayer(layerNumber: number): LayerConfigItem {
  return {
    layerNumber,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: `approver${layerNumber}@example.com` },
    confirmationType: "signature",
    allowRejectionReason: true,
  };
}

describe("approval dashboard layer progress", () => {
  it("falls back to legacy NumberOfApprovalLayer when no LayerConfig layers exist", () => {
    expect(resolveTotalLayerCount({ layers: [] }, undefined, 2)).toBe(2);
    expect(formatLayerProgress({ CurrentLayer: 1, totalLayers: 2 })).toBe("Layer 1 of 2");
  });

  it("prefers the active configured layer sequence over the legacy count", () => {
    expect(
      resolveTotalLayerCount(
        { layers: [approvalLayer(1), approvalLayer(2), approvalLayer(3)] },
        undefined,
        2,
      ),
    ).toBe(3);
  });

  it("uses a selected manual branch as the active layer sequence", () => {
    const config = {
      layers: [approvalLayer(1)],
      manualBranches: [
        { name: "short", label: "Short", layers: [approvalLayer(1)] },
        { name: "long", label: "Long", layers: [approvalLayer(1), approvalLayer(2)] },
      ],
    };

    expect(getActiveLayers(config, "long")).toHaveLength(2);
    expect(resolveTotalLayerCount(config, "long", 1)).toBe(2);
  });

  it("matches manual branches by label as well as name", () => {
    const config = {
      layers: [approvalLayer(1)],
      manualBranches: [
        { name: "finance-path", label: "Finance Path", layers: [approvalLayer(1), approvalLayer(2)] },
      ],
    };

    expect(getActiveLayers(config, "finance path")).toHaveLength(2);
    expect(resolveCurrentLayer(config, { SelectedBranch: "Finance Path", CurrentLayer: 2 }).currentLayer?.layerNumber).toBe(2);
  });

  it("preserves the old L1 status current-layer inference", () => {
    expect(formatLayerProgress({ L1_Status: "Approved", totalLayers: 2 })).toBe("Layer 2 of 2");
    expect(formatLayerProgress({ L1_Status: "Pending", totalLayers: 2 })).toBe("Layer 1 of 2");
    expect(resolveCurrentLayerNumber({ L1_Status: "Rejected" }, 2)).toBe(1);
  });
});
