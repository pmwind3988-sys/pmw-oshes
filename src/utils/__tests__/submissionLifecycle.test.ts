import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_STAGES,
  NEEDS_ROUTING_LAYER_STATUS,
  isManualPaperStatus,
  isNeedsRoutingStatus,
  lifecycleLabel,
  resolveLifecycleStage,
} from "../submissionLifecycle";

describe("isNeedsRoutingStatus", () => {
  it("matches the sentinel the submit paths write", () => {
    expect(isNeedsRoutingStatus(NEEDS_ROUTING_LAYER_STATUS)).toBe(true);
    expect(isNeedsRoutingStatus("needs routing")).toBe(true);
    expect(isNeedsRoutingStatus("  Needs Routing  ")).toBe(true);
  });

  it("does not collide with the other statuses", () => {
    expect(isNeedsRoutingStatus("Pending")).toBe(false);
    expect(isNeedsRoutingStatus("Manual Approval Required")).toBe(false);
    expect(isNeedsRoutingStatus(null)).toBe(false);
  });

  it("gives an unroutable layer its own stage, without hiding a finished form", () => {
    expect(resolveLifecycleStage({
      formStatus: "Submitted",
      currentLayerStatus: NEEDS_ROUTING_LAYER_STATUS,
    })).toBe("needs_routing");

    // A completed or rejected submission stays terminal even if some earlier
    // layer was parked along the way.
    expect(resolveLifecycleStage({
      formStatus: "Completed",
      currentLayerStatus: NEEDS_ROUTING_LAYER_STATUS,
    })).toBe("completed");
    expect(resolveLifecycleStage({
      formStatus: "Rejected",
      currentLayerStatus: NEEDS_ROUTING_LAYER_STATUS,
    })).toBe("rejected");
  });

  it("is labelled and ordered alongside the other stages", () => {
    expect(LIFECYCLE_STAGES).toContain("needs_routing");
    expect(lifecycleLabel("needs_routing")).toBe("Needs routing");
  });
});

describe("isManualPaperStatus", () => {
  it("matches both manual paper sentinels case-insensitively", () => {
    expect(isManualPaperStatus("Manual Approval Required")).toBe(true);
    expect(isManualPaperStatus("manual evaluation required")).toBe(true);
    expect(isManualPaperStatus("  Manual Approval Required  ")).toBe(true);
  });

  it("rejects other statuses", () => {
    expect(isManualPaperStatus("Pending")).toBe(false);
    expect(isManualPaperStatus("Approved")).toBe(false);
    expect(isManualPaperStatus(null)).toBe(false);
    expect(isManualPaperStatus(undefined)).toBe(false);
  });
});

describe("resolveLifecycleStage", () => {
  it("treats rejection as terminal, ahead of everything else", () => {
    expect(resolveLifecycleStage({ formStatus: "Rejected" })).toBe("rejected");
    expect(resolveLifecycleStage({ formStatus: "Rejected at Layer 2" })).toBe("rejected");
    // Rejection wins even when the current layer is a manual paper layer.
    expect(
      resolveLifecycleStage({
        formStatus: "Rejected",
        currentLayerStatus: "Manual Approval Required",
      }),
    ).toBe("rejected");
  });

  it("treats completion as terminal", () => {
    expect(resolveLifecycleStage({ formStatus: "Completed" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Approved" })).toBe("completed");
    expect(resolveLifecycleStage({ formStatus: "Fully Approved" })).toBe("completed");
  });

  it("reports manual paper when the live layer needs offline handling", () => {
    expect(
      resolveLifecycleStage({
        formStatus: "In Review",
        currentLayerStatus: "Manual Evaluation Required",
      }),
    ).toBe("manual_paper");
  });

  it("distinguishes in-review from untouched submissions", () => {
    expect(resolveLifecycleStage({ formStatus: "In Review" })).toBe("in_review");
    expect(resolveLifecycleStage({ formStatus: "Submitted" })).toBe("pending");
  });

  it("falls back to the legacy Status column and defaults to pending", () => {
    expect(resolveLifecycleStage({ status: "Approved Layer 1" })).toBe("in_review");
    expect(resolveLifecycleStage({})).toBe("pending");
    expect(resolveLifecycleStage({ formStatus: null, status: null })).toBe("pending");
  });
});

describe("lifecycleLabel", () => {
  it("labels every stage", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(lifecycleLabel(stage).length).toBeGreaterThan(0);
    }
    expect(lifecycleLabel("manual_paper")).toBe("Manual / paper");
  });
});
