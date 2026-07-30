import { describe, expect, it } from "vitest";
import {
  recordWorkflowEmailAttempt,
  resolveWorkflowEmailDueAt,
  getDueWorkflowEmailSchedules,
  setWorkflowEmailSchedule,
} from "./workflowEmail.js";

describe("recordWorkflowEmailAttempt", () => {
  it("replaces a failed delivery with a successful forced resend while preserving the attempt count", () => {
    const failed = recordWorkflowEmailAttempt("", {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "failed",
      attemptedAt: "2026-06-24T01:00:00.000Z",
      error: "Email delivery failed",
    });

    const resent = recordWorkflowEmailAttempt(JSON.stringify(failed), {
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attemptedAt: "2026-06-24T01:05:00.000Z",
    });

    expect(resent["2"]).toEqual({
      layer: 2,
      recipient: "evaluator@example.com",
      status: "sent",
      attempts: 2,
      lastAttemptAt: "2026-06-24T01:05:00.000Z",
      sentAt: "2026-06-24T01:05:00.000Z",
    });
  });
});

describe("workflow email schedules", () => {
  it("supports a three-month deferred evaluator email", () => {
    expect(resolveWorkflowEmailDueAt(
      { mode: "three_months" },
      new Date("2026-01-31T08:00:00.000Z"),
    )).toBe("2026-04-30T08:00:00.000Z");
  });

  it("replaces the schedule for one item layer without changing other layers", () => {
    const initial = setWorkflowEmailSchedule("", {
      layer: 1,
      recipient: "first@example.com",
      dueAt: "2026-07-01T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/1",
      submittedBy: "submitter@example.com",
    });
    const updated = setWorkflowEmailSchedule(JSON.stringify(initial), {
      layer: 2,
      recipient: "hod@example.com",
      dueAt: "2026-09-24T00:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-24T00:00:00.000Z",
      layerType: "evaluation",
      totalLayers: 2,
      reviewLink: "https://example.com/eval/2",
      submittedBy: "submitter@example.com",
    });

    expect(Object.keys(updated)).toEqual(["1", "2"]);
  });

  it("returns only due scheduled entries", () => {
    const raw = JSON.stringify({
      "1": {
        layer: 1,
        recipient: "due@example.com",
        dueAt: "2026-06-24T07:59:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/1",
        submittedBy: "submitter@example.com",
      },
      "2": {
        layer: 2,
        recipient: "later@example.com",
        dueAt: "2026-06-25T08:00:00.000Z",
        status: "scheduled",
        updatedAt: "2026-06-24T00:00:00.000Z",
        layerType: "evaluation",
        totalLayers: 2,
        reviewLink: "https://example.com/2",
        submittedBy: "submitter@example.com",
      },
    });

    expect(getDueWorkflowEmailSchedules(raw, new Date("2026-06-24T08:00:00.000Z")))
      .toHaveLength(1);
  });
});
