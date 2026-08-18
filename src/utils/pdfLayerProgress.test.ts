import { describe, expect, it } from "vitest";
import { chainProgress, isAwaitingLayer, PDF_LAYER_AWAITING, PDF_LAYER_NOT_REACHED } from "./pdfLayerProgress";

/**
 * The rule the printed record leans on: which layers have actually been
 * decided. Everything the document does differently for an unfinished chain —
 * the notice at the top, the missing signature cards, the list of who has not
 * signed — follows from these two functions, so they are pinned here rather
 * than only through a rendered PDF.
 */

function layer(status: string) {
  return { layerNumber: 1, type: "approval" as const, status, email: "a@b.com" };
}

describe("isAwaitingLayer", () => {
  it("counts every way of saying nobody has acted yet", () => {
    expect(isAwaitingLayer(layer(PDF_LAYER_AWAITING))).toBe(true);
    expect(isAwaitingLayer(layer(PDF_LAYER_NOT_REACHED))).toBe(true);
    expect(isAwaitingLayer(layer("In Progress"))).toBe(true);
    expect(isAwaitingLayer(layer("Pending Approval"))).toBe(true);
    // A layer nothing has ever been written against has certainly not signed.
    expect(isAwaitingLayer(layer(""))).toBe(true);
  });

  it("counts every decision as a decision, including the unhappy ones", () => {
    expect(isAwaitingLayer(layer("Approved"))).toBe(false);
    expect(isAwaitingLayer(layer("Confirmed"))).toBe(false);
    expect(isAwaitingLayer(layer("Rejected"))).toBe(false);
    expect(isAwaitingLayer(layer("Rejected at Layer 1"))).toBe(false);
    expect(isAwaitingLayer(layer("Cancelled"))).toBe(false);
    expect(isAwaitingLayer(layer("Skipped"))).toBe(false);
    // Signed on paper: a decision that happens to carry no ink here.
    expect(isAwaitingLayer(layer("Manual paper evaluation"))).toBe(false);
  });
});

describe("chainProgress", () => {
  it("says nothing about a chain that finished", () => {
    expect(chainProgress([layer("Approved"), layer("Confirmed")], "Completed")).toBeNull();
    expect(chainProgress([], "Submitted")).toBeNull();
    expect(chainProgress(undefined, "Submitted")).toBeNull();
  });

  it("reports an in-flight chain as an interim copy, counted", () => {
    const progress = chainProgress(
      [layer("Approved"), layer(PDF_LAYER_AWAITING), layer(PDF_LAYER_NOT_REACHED)],
      "In approval",
    );
    expect(progress).not.toBeNull();
    expect(progress!.signed).toBe(1);
    expect(progress!.total).toBe(3);
    expect(progress!.awaiting).toHaveLength(2);
    expect(progress!.headline).toBe("Interim copy");
    expect(progress!.note).toContain("1 of 3 layers signed");
  });

  it("says a withdrawn record stopped rather than that it is still coming", () => {
    const progress = chainProgress([layer("Cancelled"), layer(PDF_LAYER_NOT_REACHED)], "Cancelled");
    expect(progress!.headline).toBe("Closed before the chain finished");
    expect(progress!.note).toContain("never reached");
  });

  it("treats a rejection the same way — the rest of the chain never happened", () => {
    const progress = chainProgress([layer("Rejected"), layer("Rejected at Layer 1")], "Rejected");
    // Both layers carry a decision, so there is nothing left unsigned to report.
    expect(progress).toBeNull();
  });
});
