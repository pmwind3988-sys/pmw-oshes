import { describe, expect, it } from "vitest";
import {
  getWorkflowAssignment,
  setWorkflowAssignmentOverride,
} from "./workflowAssignmentData";

describe("workflow assignment overrides", () => {
  it("stores one layer override without changing another layer", () => {
    const existing = JSON.stringify({
      version: 1,
      layers: {
        "1": {
          email: "first@pmw.com",
          displayName: "First Approver",
          source: "resolved",
          updatedBy: "system",
          updatedAt: "2026-06-01T00:00:00.000Z",
          history: [],
        },
      },
    });

    const result = setWorkflowAssignmentOverride(existing, {
      layer: 2,
      email: "second@pmw.com",
      displayName: "Second Evaluator",
      position: "HR Manager",
      workflowRole: "Evaluator",
      notes: "Temporary coverage",
      reason: "Original evaluator is on leave",
      updatedBy: "superuser@pmw.com",
      updatedAt: "2026-06-25T08:00:00.000Z",
    });

    expect(getWorkflowAssignment(result, 1)?.email).toBe("first@pmw.com");
    expect(getWorkflowAssignment(result, 2)).toMatchObject({
      email: "second@pmw.com",
      displayName: "Second Evaluator",
      position: "HR Manager",
      workflowRole: "Evaluator",
      notes: "Temporary coverage",
      reason: "Original evaluator is on leave",
      source: "manual-override",
      updatedBy: "superuser@pmw.com",
    });
  });

  it("keeps the previous assignment in that layer's audit history", () => {
    const first = setWorkflowAssignmentOverride(null, {
      layer: 1,
      email: "first@pmw.com",
      displayName: "First Approver",
      reason: "Initial manual assignment",
      updatedBy: "admin@pmw.com",
      updatedAt: "2026-06-24T08:00:00.000Z",
    });

    const second = setWorkflowAssignmentOverride(first, {
      layer: 1,
      email: "replacement@pmw.com",
      displayName: "Replacement Approver",
      reason: "Coverage change",
      updatedBy: "superuser@pmw.com",
      updatedAt: "2026-06-25T08:00:00.000Z",
    });

    expect(getWorkflowAssignment(second, 1)?.history).toEqual([
      expect.objectContaining({
        email: "first@pmw.com",
        displayName: "First Approver",
        updatedBy: "admin@pmw.com",
      }),
    ]);
  });

  it("retains the resolved assignment when the first manual override is saved", () => {
    const result = setWorkflowAssignmentOverride(null, {
      layer: 3,
      email: "replacement@pmw.com",
      reason: "Coverage change",
      updatedBy: "superuser@pmw.com",
      updatedAt: "2026-06-25T08:00:00.000Z",
      previous: {
        email: "original@pmw.com",
        source: "resolved",
        updatedBy: "SYSTEM",
        updatedAt: "2026-06-20T08:00:00.000Z",
      },
    });

    expect(getWorkflowAssignment(result, 3)?.history).toEqual([
      expect.objectContaining({
        email: "original@pmw.com",
        source: "resolved",
      }),
    ]);
  });
});
