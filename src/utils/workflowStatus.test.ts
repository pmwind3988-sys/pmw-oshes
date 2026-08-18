import { describe, expect, it } from "vitest";

import {
  buildRejectedWorkflowPatch,
  rejectedAtLayerStatus,
  resolveWorkflowDisplayState,
  shouldGenerateTerminalPdf,
} from "./workflowStatus";

describe("workflowStatus", () => {
  it("records a rejection on the current layer and propagates it to remaining layers", () => {
    expect(buildRejectedWorkflowPatch(1, 3, "2026-06-17T01:00:00.000Z", "Missing details")).toEqual({
      Status: "Rejected",
      FormStatus: "Rejected",
      CurrentLayer: 1,
      CurrentApprovalLayer: 1,
      L1_Status: "Rejected",
      L1_SignedAt: "2026-06-17T01:00:00.000Z",
      L1_Rejection: "Missing details",
      L2_Status: "Rejected at Layer 1",
      L3_Status: "Rejected at Layer 1",
    });
  });

  it("treats final completion and any rejection as PDF-worthy terminal states", () => {
    expect(rejectedAtLayerStatus(2)).toBe("Rejected at Layer 2");
    expect(shouldGenerateTerminalPdf({ formStatus: "Completed", totalLayers: 3 })).toBe(true);
    expect(shouldGenerateTerminalPdf({ formStatus: "In Review", totalLayers: 3, layerStatuses: ["Approved", "Rejected at Layer 2"] })).toBe(true);
    expect(shouldGenerateTerminalPdf({ formStatus: "In Review", totalLayers: 3, layerStatuses: ["Approved", "Pending"] })).toBe(false);
  });

  it("moves dashboard display past a stale current layer when later layers are complete", () => {
    expect(
      resolveWorkflowDisplayState({
        formStatus: "In Review",
        currentLayer: 1,
        totalLayers: 2,
        layerStatuses: ["Approved", "Approved"],
      }),
    ).toEqual({
      formStatus: "Completed",
      currentLayer: 2,
    });
  });

  it("shows final rejection when current layer was not advanced after the first approval", () => {
    expect(
      resolveWorkflowDisplayState({
        formStatus: "In Review",
        currentLayer: 1,
        totalLayers: 2,
        layerStatuses: ["Approved", "Rejected"],
      }),
    ).toEqual({
      formStatus: "Rejected",
      currentLayer: 2,
    });
  });

  it("keeps a withdrawal, instead of deriving it back out of the layer it stopped on", () => {
    // A withdrawn record still has an unsigned layer, because nobody ever
    // signed it. Reading the layers instead of the record reported that as work
    // in progress — which is how a withdrawal was written to SharePoint,
    // acknowledged on screen, and then undone by the next page load.
    expect(
      resolveWorkflowDisplayState({
        formStatus: "Cancelled",
        currentLayer: 1,
        totalLayers: 3,
        layerStatuses: ["Cancelled", null, null],
      }),
    ).toEqual({
      formStatus: "Cancelled",
      currentLayer: 1,
    });
  });

  it("keeps a withdrawal recorded before the layer was closed too", () => {
    // Records cancelled by the older code have FormStatus and nothing else.
    expect(
      resolveWorkflowDisplayState({
        formStatus: "Cancelled",
        currentLayer: 2,
        totalLayers: 3,
        layerStatuses: ["Approved", "Pending", null],
      }),
    ).toEqual({
      formStatus: "Cancelled",
      currentLayer: 2,
    });
  });

  it("keeps a record returned to its submitter with the submitter", () => {
    expect(
      resolveWorkflowDisplayState({
        formStatus: "Returned",
        currentLayer: 1,
        totalLayers: 2,
        layerStatuses: ["Pending", null],
      }).formStatus,
    ).toBe("Returned");
  });

  it("keeps the rejected layer current when rejection happens before later propagated statuses", () => {
    expect(
      resolveWorkflowDisplayState({
        formStatus: "Rejected",
        currentLayer: 1,
        totalLayers: 2,
        layerStatuses: ["Rejected", "Rejected at Layer 1"],
      }),
    ).toEqual({
      formStatus: "Rejected",
      currentLayer: 1,
    });
  });
});
