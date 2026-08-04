import { describe, expect, it } from "vitest";
import { bottlenecks, queueFor, severeRecords, severityTone, stuckRecords, toPortalRecord } from "./portalRecords";
import { describeWorkflow, resolveFormVisibility } from "./formWorkflow";
import type { ApprovalLayerConfig, CatalogueEntry, ListMetaEntry, Submission } from "../types";

const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "General" };

function layer(layerNumber: number, email: string, roleLabel: string, slaDays?: number): ApprovalLayerConfig {
  return {
    layerNumber,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: email },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel,
    ...(slaDays === undefined ? {} : { slaDays }),
  };
}

function entry(overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const layers = overrides.layers ?? [
    layer(1, "nurul@pmw.gov.my", "Safety Officer"),
    layer(2, "faizal@pmw.gov.my", "Ops Manager"),
  ];
  const workflow = describeWorkflow(layers);
  const visibility = resolveFormVisibility({ masterFormIsPublic: true });
  return {
    listTitle: "Incident Report",
    code: "INC",
    name: "Incident Report",
    slug: "incident-report",
    chain: layers.map((l) => l.roleLabel ?? ""),
    layers,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays: 3,
    visibility,
    isPublic: visibility.isPublic,
    severityCapture: "required",
    volume: 0,
    today: 0,
    firstApprover: "Nurul Aziz",
    ...overrides,
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "142",
    submissionId: "142",
    listTitle: "Incident Report",
    formId: "INC",
    formVersion: "1",
    title: "Fall from height",
    submittedByEmail: "sazali@marinekita.com",
    submittedAt: "2026-07-30T09:00:00.000Z",
    formStatus: "In Review",
    totalLayers: 2,
    layers: [],
    meta: META,
    submissionData: {},
    currentLayer: 1,
    ...overrides,
  };
}

const NOW = new Date("2026-07-30T15:00:00.000Z");

describe("severityTone", () => {
  it("weights the worst outcomes highest so the pill survives greyscale", () => {
    expect(severityTone("Major · LTI")).toBe("high");
    expect(severityTone("Serious")).toBe("mid");
    expect(severityTone("Minor")).toBe("low");
    expect(severityTone("")).toBe("none");
  });
});

describe("toPortalRecord", () => {
  it("builds a reference from the code, filing month and item id", () => {
    const record = toPortalRecord(submission(), entry(), {}, {}, NOW);
    expect(record.reference).toBe("INC-2607-0142");
  });

  it("measures age on the current layer only, not since filing", () => {
    const record = toPortalRecord(
      submission({
        currentLayer: 2,
        layers: [
          { status: "approved", outcome: "approved", email: "nurul@pmw.gov.my", signedAt: "2026-07-30T13:00:00.000Z", rejectionReason: null, signature: null },
        ],
      }),
      entry(),
      {},
      {},
      NOW,
    );

    expect(Math.round(record.hoursSinceFiled)).toBe(6);
    expect(Math.round(record.hoursOnLayer)).toBe(2);
  });

  it("prefers the layer's own SLA over the form default", () => {
    const layers = [layer(1, "nurul@pmw.gov.my", "Safety Officer", 1), layer(2, "faizal@pmw.gov.my", "Ops Manager")];
    const record = toPortalRecord(submission(), entry({ layers, slaDays: 5 }), {}, {}, NOW);
    expect(record.slaDays).toBe(1);
  });

  it("marks a record past SLA and says by how much", () => {
    const record = toPortalRecord(
      submission({ submittedAt: "2026-07-25T15:00:00.000Z" }),
      entry({ layers: [layer(1, "nurul@pmw.gov.my", "Safety Officer", 1)] }),
      {},
      {},
      NOW,
    );

    expect(record.overdue).toBe(true);
    expect(record.status).toBe("Past SLA");
    expect(record.slaNote).toBe("4 d past a 1-day SLA");
  });

  it("does not call a closed record overdue", () => {
    const record = toPortalRecord(
      submission({ submittedAt: "2026-07-01T00:00:00.000Z", formStatus: "Completed" }),
      entry(),
      {},
      {},
      NOW,
    );

    expect(record.overdue).toBe(false);
    expect(record.status).toBe("Approved");
    expect(record.stage).toBe("Complete");
  });

  it("lets a per-submission reassignment override the configured assignee", () => {
    const record = toPortalRecord(
      submission(),
      entry(),
      { "hafiz@pmw.gov.my": "Hafiz Rahman" },
      { "1": "hafiz@pmw.gov.my" },
      NOW,
    );

    expect(record.currentAssigneeEmail).toBe("hafiz@pmw.gov.my");
    expect(record.currentAssignee).toBe("Hafiz Rahman");
    expect(record.currentRole).toBe("Safety Officer");
  });

  it("does not invent an approval layer for a form that declares none", () => {
    const record = toPortalRecord(
      submission({ totalLayers: 0, currentLayer: 0, formStatus: null }),
      entry({ layers: [], chain: [], firstApprover: "" }),
      {},
      {},
      NOW,
    );

    expect(record.hasWorkflow).toBe(false);
    expect(record.totalLayers).toBe(0);
    expect(record.chain).toEqual([]);
    expect(record.status).toBe("Recorded");
    expect(record.stage).toBe("Recorded");
    expect(record.layerLabel).toBe("No approval step");
    expect(record.currentAssigneeEmail).toBe("");
  });

  it("cannot make a form with no layers overdue, however long ago it was filed", () => {
    const record = toPortalRecord(
      submission({ submittedAt: "2020-01-01T00:00:00.000Z", totalLayers: 0, currentLayer: 0, formStatus: null }),
      entry({ layers: [], chain: [], firstApprover: "" }),
      {},
      {},
      NOW,
    );

    expect(record.overdue).toBe(false);
    expect(record.slaDays).toBe(0);
    expect(record.slaNote).toBe("no approval step to wait on");
  });

  it("still reports a closed outcome on a form with no layers", () => {
    const record = toPortalRecord(
      submission({ totalLayers: 0, currentLayer: 0, formStatus: "Cancelled" }),
      entry({ layers: [], chain: [], firstApprover: "" }),
      {},
      {},
      NOW,
    );

    expect(record.status).toBe("Cancelled");
  });

  it("reconstructs the chain a legacy filing was submitted under when its form no longer configures one", () => {
    const record = toPortalRecord(
      submission({
        totalLayers: 2,
        currentLayer: 2,
        layers: [
          { status: "approved", outcome: "approved", email: "nurul@pmw.gov.my", signedAt: "2026-07-30T13:00:00.000Z", rejectionReason: null, signature: null },
          { status: "pending", outcome: undefined, email: "faizal@pmw.gov.my", signedAt: null, rejectionReason: null, signature: null },
        ],
      }),
      entry({ layers: [], chain: [], firstApprover: "" }),
      {},
      {},
      NOW,
    );

    expect(record.hasWorkflow).toBe(true);
    expect(record.totalLayers).toBe(2);
    expect(record.currentAssigneeEmail).toBe("faizal@pmw.gov.my");
  });

  it("names the chain state per step, including whose turn it is", () => {
    const record = toPortalRecord(
      submission({ currentLayer: 2, layers: [{ status: "approved", outcome: "approved", email: "nurul@pmw.gov.my", signedAt: "2026-07-30T13:00:00.000Z", rejectionReason: null, signature: null }] }),
      entry(),
      { "faizal@pmw.gov.my": "Faizal Mokhtar" },
      {},
      NOW,
    );

    expect(record.chain[0].state).toBe("signed");
    expect(record.chain[0].statusText).toBe("Signed");
    expect(record.chain[1].state).toBe("current");
    expect(record.chain[1].statusText).toBe("Awaiting Faizal");
  });
});

describe("queue and dashboard selectors", () => {
  const open = toPortalRecord(submission(), entry(), {}, {}, NOW);
  const overdueRecord = toPortalRecord(
    submission({ id: "9", submittedAt: "2026-07-20T15:00:00.000Z" }),
    entry(),
    {},
    {},
    NOW,
  );
  const severe = toPortalRecord(
    submission({ id: "7", submissionData: { Severity: "Major · LTI" } }),
    entry(),
    {},
    {},
    NOW,
  );

  it("puts only the current assignee's items in their queue", () => {
    expect(queueFor([open, overdueRecord], "nurul@pmw.gov.my")).toHaveLength(2);
    expect(queueFor([open, overdueRecord], "faizal@pmw.gov.my")).toHaveLength(0);
  });

  it("never queues a form with no approval step", () => {
    const recorded = toPortalRecord(
      submission({ id: "12", totalLayers: 0, currentLayer: 0, formStatus: null }),
      entry({ layers: [], chain: [], firstApprover: "" }),
      {},
      {},
      NOW,
    );

    expect(queueFor([recorded], "nurul@pmw.gov.my")).toHaveLength(0);
    expect(stuckRecords([recorded])).toHaveLength(0);
    expect(bottlenecks([recorded])).toHaveLength(0);
  });

  it("surfaces high-severity filings from the last 24 hours", () => {
    expect(severeRecords([open, severe]).map((record) => record.itemId)).toEqual(["7"]);
  });

  it("sorts stuck approvals oldest first", () => {
    expect(stuckRecords([open, overdueRecord]).map((record) => record.itemId)).toEqual(["9"]);
  });

  it("ranks approvers by their longest wait and scales the bar against it", () => {
    const rows = bottlenecks([open, overdueRecord, severe]);
    expect(rows).toHaveLength(1);
    expect(rows[0].open).toBe(3);
    expect(rows[0].breached).toBe(1);
    expect(rows[0].barPercent).toBe(100);
  });
});
