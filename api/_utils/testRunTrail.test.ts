import { describe, expect, it } from "vitest";

import {
  appendTestRunStep,
  orderedTestRunSteps,
  parseTestRunTrail,
  testRunOutcome,
} from "./testRunTrail.js";

const NOW = new Date("2026-08-26T09:00:00Z");

describe("test run trail", () => {
  it("reads a row that has never been written to as an empty trail", () => {
    expect(parseTestRunTrail(undefined)).toEqual({});
    expect(parseTestRunTrail("")).toEqual({});
    expect(parseTestRunTrail("not json")).toEqual({});
    expect(parseTestRunTrail("[1,2]")).toEqual({});
  });

  it("records a step with the time it happened", () => {
    const raw = appendTestRunStep("", { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    expect(parseTestRunTrail(raw).ticket).toMatchObject({
      step: "ticket",
      label: "Ticket validated",
      status: "pass",
      at: "2026-08-26T09:00:00.000Z",
    });
  });

  it("keeps earlier steps when a later one is added", () => {
    const first = appendTestRunStep("", { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    const second = appendTestRunStep(first, { step: "row", label: "Response row created", status: "pass", order: 4 }, NOW);
    expect(Object.keys(parseTestRunTrail(second)).sort()).toEqual(["row", "ticket"]);
  });

  it("replaces a step that runs again rather than listing it twice", () => {
    const pending = appendTestRunStep("", { step: "pdf", label: "PDF rendered", status: "pending", order: 9 }, NOW);
    const done = appendTestRunStep(pending, { step: "pdf", label: "PDF rendered", status: "pass", order: 9 }, NOW);
    const steps = orderedTestRunSteps(parseTestRunTrail(done));
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("pass");
  });

  it("orders steps by the run's sequence, not by insertion", () => {
    const later = appendTestRunStep("", { step: "pdf", label: "PDF rendered", status: "pass", order: 9 }, NOW);
    const earlier = appendTestRunStep(later, { step: "ticket", label: "Ticket validated", status: "pass", order: 1 }, NOW);
    expect(orderedTestRunSteps(parseTestRunTrail(earlier)).map((entry) => entry.step)).toEqual(["ticket", "pdf"]);
  });

  it("carries the reason a step failed", () => {
    const raw = appendTestRunStep(
      "",
      { step: "layer-2-email", label: "Layer 2 email", status: "fail", detail: "Mailbox not found", order: 72 },
      NOW,
    );
    expect(parseTestRunTrail(raw)["layer-2-email"].detail).toBe("Mailbox not found");
  });

  it("calls a run failed when any step failed, even if later ones passed", () => {
    const failed = appendTestRunStep("", { step: "a", label: "A", status: "fail", order: 1 }, NOW);
    const then = appendTestRunStep(failed, { step: "b", label: "B", status: "pass", order: 2 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(then))).toBe("failed");
  });

  it("calls a run running while any step is still pending", () => {
    const raw = appendTestRunStep("", { step: "a", label: "A", status: "pending", order: 1 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(raw))).toBe("running");
  });

  it("does not let a warning fail a run", () => {
    const raw = appendTestRunStep("", { step: "a", label: "A", status: "warn", order: 1 }, NOW);
    expect(testRunOutcome(parseTestRunTrail(raw))).toBe("passed");
  });

  it("does not call an empty trail passed", () => {
    // A trail that never wrote a step is not evidence of a pass — showing
    // green here would be the false positive this feature exists to avoid.
    expect(testRunOutcome({})).toBe("running");
    expect(testRunOutcome(parseTestRunTrail(undefined))).toBe("running");
  });

  it("drops entries that are not steps rather than rendering junk", () => {
    expect(parseTestRunTrail(JSON.stringify({ ok: { step: "ok" }, bad: 7 }))).toEqual({});
  });
});
