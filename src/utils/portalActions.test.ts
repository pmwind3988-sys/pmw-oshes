import { describe, expect, it, vi } from "vitest";
import { cancelSubmission, deleteSubmission, type PortalActionContext } from "./portalActions";
import { describeWorkflow, resolveFormVisibility } from "./formWorkflow";
import { toPortalRecord } from "./portalRecords";
import { OSHES_LISTS } from "../config/oshes";
import type {
  ApprovalLayerConfig,
  CatalogueEntry,
  HardDeleteSubmissionResult,
  ListMetaEntry,
  PortalRecord,
  SharePointClient,
  Submission,
} from "../types";

/**
 * Deleting a record is the one portal action with nothing left to inspect
 * afterwards, so what is asserted here is the pair: the whole submission goes
 * to the SharePoint client, and the trail entry that survives it names the
 * reference, the actor, and what was swept up with it.
 */

const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "General" };
const NOW = new Date("2026-07-30T15:00:00.000Z");

function entry(): CatalogueEntry {
  const layers: ApprovalLayerConfig[] = [
    {
      layerNumber: 1,
      type: "approval",
      authMode: "365",
      assignee: { type: "user", value: "nurul@pmw.gov.my" },
      confirmationType: "signature",
      allowRejectionReason: true,
      roleLabel: "Safety Officer",
    },
  ];
  const workflow = describeWorkflow(layers);
  const visibility = resolveFormVisibility({ masterFormIsPublic: true });
  return {
    listTitle: "Incident Report",
    code: "INC",
    name: "Incident Report",
    slug: "incident-report",
    chain: ["Safety Officer"],
    layers,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays: 0,
    hasSla: false,
    visibility,
    isPublic: visibility.isPublic,
    volume: 0,
    today: 0,
    firstApprover: "Nurul Aziz",
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
    totalLayers: 1,
    layers: [],
    meta: META,
    submissionData: {},
    currentLayer: 1,
    referenceNo: "INC-300726-0142",
    ...overrides,
  };
}

function record(overrides: Partial<Submission> = {}): PortalRecord {
  return toPortalRecord(submission(overrides), entry(), { "sazali@marinekita.com": "Sazali Rahim" }, {}, NOW);
}

function context(removed: Partial<HardDeleteSubmissionResult> = {}): {
  actor: PortalActionContext;
  hardDeleteSubmission: ReturnType<typeof vi.fn>;
  upsertListItem: ReturnType<typeof vi.fn>;
} {
  const hardDeleteSubmission = vi.fn(
    async (): Promise<HardDeleteSubmissionResult> => ({
      deletedItem: true,
      deletedFiles: 3,
      deletedMatrixRows: 2,
      warnings: [],
      ...removed,
    }),
  );
  const upsertListItem = vi.fn(async () => ({ updated: false, id: "9" }));
  const spClient = { hardDeleteSubmission, upsertListItem } as unknown as SharePointClient;

  return {
    actor: { spClient, actorName: "Aina Zulkifli", actorEmail: "aina@pmw.gov.my" },
    hardDeleteSubmission,
    upsertListItem,
  };
}

describe("cancelSubmission", () => {
  const scheduled = JSON.stringify({
    "1": {
      layer: 1,
      recipient: "nurul@pmw.gov.my",
      dueAt: "2026-07-30T09:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-07-30T09:00:00.000Z",
      layerType: "approval",
      totalLayers: 1,
    },
  });

  function fieldsOf(upsert: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const [, , body] = upsert.mock.calls[0] as [string, string, Record<string, unknown>];
    return body;
  }

  it("closes the layer it stopped on, not only the record's label", async () => {
    const { actor, upsertListItem } = context();

    const result = await cancelSubmission(actor, record({ workflowEmailScheduleRaw: scheduled }), "Duplicate report");

    // The list item write comes first, the audit row second.
    expect(fieldsOf(upsertListItem).FormStatus).toBe("Cancelled");
    expect(fieldsOf(upsertListItem).L1_Status).toBe("Cancelled");
    expect(String(fieldsOf(upsertListItem).L1_Rejection)).toContain("Duplicate report");
    expect(result.fields.FormStatus).toBe("Cancelled");
  });

  it("stands the queued reminder down, so nobody is chased for a signature nobody wants", async () => {
    const { actor, upsertListItem } = context();

    await cancelSubmission(actor, record({ workflowEmailScheduleRaw: scheduled }), "");

    const schedule = JSON.parse(String(fieldsOf(upsertListItem).WorkflowEmailSchedule)) as Record<string, { status: string }>;
    // The cron sends anything still marked "scheduled" and never looks at
    // FormStatus, so leaving this alone kept a withdrawn permit in the post.
    expect(schedule["1"].status).toBe("cancelled");
  });

  it("names the actor's own action: the person who filed it withdraws it", async () => {
    const { actor, upsertListItem } = context();
    const mine = { ...actor, actorEmail: "sazali@marinekita.com", actorName: "Sazali Rahim" };

    const result = await cancelSubmission(mine, record(), "Filed twice");

    expect(String(fieldsOf(upsertListItem).L1_Rejection)).toContain("Withdrawn by Sazali Rahim");
    expect(result.audit.event).toContain("Withdrawn");
    expect(result.toast).toContain("withdrawn");
  });

  it("leaves a settled record's layer alone — its decision is already recorded", async () => {
    const { actor, upsertListItem } = context();

    await cancelSubmission(actor, record({ formStatus: "Completed", currentLayer: 1 }), "Filed in error");

    expect(fieldsOf(upsertListItem).FormStatus).toBe("Cancelled");
    expect(fieldsOf(upsertListItem).L1_Status).toBeUndefined();
    expect(fieldsOf(upsertListItem).WorkflowEmailSchedule).toBeUndefined();
  });
});

describe("deleteSubmission", () => {
  it("hands the whole submission to the client, so its files go with the row", async () => {
    const { actor, hardDeleteSubmission } = context();
    const target = record();

    await deleteSubmission(actor, target);

    expect(hardDeleteSubmission).toHaveBeenCalledTimes(1);
    expect(hardDeleteSubmission).toHaveBeenCalledWith(target.submission);
  });

  it("leaves a trail entry naming who deleted it and what went with it", async () => {
    const { actor, upsertListItem } = context();

    const result = await deleteSubmission(actor, record());

    expect(upsertListItem).toHaveBeenCalledTimes(1);
    const [listTitle, , body] = upsertListItem.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(listTitle).toBe(OSHES_LISTS.auditTrail);
    expect(body.Reference).toBe("INC-300726-0142");
    expect(body.Actor).toBe("Aina Zulkifli");
    expect(String(body.EventSummary)).toContain("Deleted permanently");
    expect(String(body.EventSummary)).toContain("3 files and 2 table rows");
    expect(result.audit.reference).toBe("INC-300726-0142");
  });

  it("counts one file as a file, not as 1 files", async () => {
    const { actor } = context({ deletedFiles: 1, deletedMatrixRows: 1 });

    const result = await deleteSubmission(actor, record());

    expect(result.toast).toContain("1 file and 1 table row");
    expect(result.toast).not.toContain("1 files");
  });

  it("says so when cleanup was incomplete rather than reporting a clean delete", async () => {
    const { actor } = context({ warnings: ["File was already missing: /sites/oshes/Form PDFs/142.pdf"] });

    const result = await deleteSubmission(actor, record());

    expect(result.toast).toContain("some cleanup did not complete");
    expect(result.removed.warnings).toHaveLength(1);
  });

  it("does not swallow a failed delete — nothing is claimed to have happened", async () => {
    const { actor, upsertListItem } = context();
    (actor.spClient.hardDeleteSubmission as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Failed to delete submission item: 403"),
    );

    await expect(deleteSubmission(actor, record())).rejects.toThrow("403");
    expect(upsertListItem).not.toHaveBeenCalled();
  });
});
