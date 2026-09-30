import { describe, expect, it } from "vitest";

import { appendTestRunStep, parseTestRunTrail } from "./testRunTrail";
import { computeTestRunProgress, isTestRunFinished, mergeTestRunSteps, testRunVerdict } from "./testRunProgress";

const NOW = new Date("2026-08-26T09:00:00Z");

describe("a rejected run with an empty trail", () => {
  const fields = {
    FormStatus: "Rejected",
    L1_Status: "Rejected",
    L1_ActedBy: "manager@pmw-group.com",
    L1_SignedAt: "2026-08-26T09:00:00Z",
  };

  it("reads as finished rather than running", () => {
    expect(testRunVerdict({}, fields)).not.toBe("running");
    expect(isTestRunFinished({}, fields)).toBe(true);
  });

  it("is not reported as a failed run — the rejection was a legitimate outcome", () => {
    expect(testRunVerdict({}, fields)).toBe("passed");
  });

  it("shows the layer's decision even though the trail never wrote it", () => {
    const { steps } = computeTestRunProgress({}, fields);
    const layerStep = steps.find((step) => step.step === "layer-1-decision");
    expect(layerStep).toMatchObject({ status: "pass", detail: "Rejected by manager@pmw-group.com" });
  });
});

describe("a run whose trail recorded a genuine failure", () => {
  it("is reported as failed even though the row reached a terminal stage", () => {
    const raw = appendTestRunStep("", { step: "row", label: "Row created", status: "fail", detail: "Graph 500", order: 4 }, NOW);
    const trail = parseTestRunTrail(raw);
    const fields = { FormStatus: "Rejected" };
    expect(testRunVerdict(trail, fields)).toBe("failed");
  });

  it("is reported as failed on a still-open submission too", () => {
    const raw = appendTestRunStep("", { step: "row", label: "Row created", status: "fail", order: 4 }, NOW);
    const trail = parseTestRunTrail(raw);
    expect(testRunVerdict(trail, { FormStatus: "In Review" })).toBe("failed");
  });
});

describe("a run still mid-workflow", () => {
  it("still reads as running", () => {
    const fields = {
      FormStatus: "In Review",
      L1_Status: "Approved",
      L1_ActedBy: "manager@pmw-group.com",
      L2_Status: "Pending",
    };
    expect(testRunVerdict({}, fields)).toBe("running");
    expect(isTestRunFinished({}, fields)).toBe(false);
  });

  it("shows the still-open layer as pending, not passed", () => {
    const fields = { FormStatus: "In Review", L2_Status: "Pending", L2_Email: "hr@pmw-group.com" };
    const { steps } = computeTestRunProgress({}, fields);
    const step = steps.find((s) => s.step === "layer-2-decision");
    expect(step).toMatchObject({ status: "pending", detail: "Routed to hr@pmw-group.com" });
  });

  it("omits a layer the workflow never reached, rather than showing it as skipped", () => {
    const fields = { FormStatus: "In Review", L1_Status: "Approved" };
    const { steps } = computeTestRunProgress({}, fields);
    expect(steps.some((s) => s.step === "layer-2-decision")).toBe(false);
  });
});

describe("merging row-derived steps with the real trail", () => {
  it("adds a row-derived step for a layer the trail has nothing for", () => {
    const fields = { L1_Status: "Approved", L1_ActedBy: "manager@pmw-group.com" };
    const steps = mergeTestRunSteps({}, fields);
    expect(steps.map((s) => s.step)).toContain("layer-1-decision");
  });

  it("prefers the trail's own entry over the row-derived one for the same step", () => {
    const raw = appendTestRunStep(
      "",
      { step: "layer-1-decision", label: "Layer 1 decision recorded", status: "pass", detail: "approve by manager@pmw-group.com (diverted from real@pmw-group.com)", order: 12 },
      NOW,
    );
    const trail = parseTestRunTrail(raw);
    const fields = { L1_Status: "Approved", L1_ActedBy: "manager@pmw-group.com" };
    const steps = mergeTestRunSteps(trail, fields);
    const layerStep = steps.find((s) => s.step === "layer-1-decision");
    expect(layerStep?.detail).toContain("diverted from");
  });

  it("keeps checklist order by run sequence after merging", () => {
    const raw = appendTestRunStep("", { step: "ticket", label: "Test ticket validated", status: "pass", order: 1 }, NOW);
    const trail = parseTestRunTrail(raw);
    const fields = { L1_Status: "Approved" };
    const steps = mergeTestRunSteps(trail, fields);
    expect(steps.map((s) => s.step)).toEqual(["ticket", "layer-1-decision"]);
  });
});

describe("a completed run", () => {
  it("reads as finished once the row shows the form fully approved", () => {
    const fields = { FormStatus: "Completed", L1_Status: "Approved" };
    expect(testRunVerdict({}, fields)).toBe("passed");
  });
});
