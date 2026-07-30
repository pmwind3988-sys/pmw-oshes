import { describe, expect, it } from "vitest";
import { getWorkflowEmailStatus } from "./workflowEmailLog";

describe("getWorkflowEmailStatus", () => {
  it("returns the current layer delivery state for dashboard verification", () => {
    const raw = JSON.stringify({
      "1": {
        layer: 1,
        recipient: "first@example.com",
        status: "sent",
        attempts: 1,
        lastAttemptAt: "2026-06-24T01:00:00.000Z",
        sentAt: "2026-06-24T01:00:00.000Z",
      },
      "2": {
        layer: 2,
        recipient: "evaluator@example.com",
        status: "failed",
        attempts: 2,
        lastAttemptAt: "2026-06-24T02:00:00.000Z",
        error: "Email delivery failed",
      },
    });

    expect(getWorkflowEmailStatus(raw, 2)).toMatchObject({
      status: "failed",
      recipient: "evaluator@example.com",
      attempts: 2,
    });
  });

  it("returns not_sent when no delivery attempt is recorded", () => {
    expect(getWorkflowEmailStatus("", 3)).toEqual({ status: "not_sent" });
  });
});
