import { describe, expect, it } from "vitest";
import { buildAuditCsv, buildPortalRecordsCsv } from "./portalExport";
import { parseCsv } from "./csv";
import { toPortalRecord } from "./portalRecords";
import { describeWorkflow, resolveFormVisibility } from "./formWorkflow";
import type {
  ApprovalLayer,
  AuditEntry,
  CatalogueEntry,
  LayerConfigItem,
  ListMetaEntry,
  PortalRecord,
  Submission,
} from "../types";

/**
 * What the portal hands over when somebody exports a screen.
 *
 * The old file was the thirteen columns of the table, so an incident report left
 * the portal without its answers, its photographs or its signatures. These assert
 * the record is now whole: the answers in form order, the trail, the portal's own
 * derived columns, Malaysian time, and numbers a spreadsheet can add up.
 */

const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "Safety" };
const NOW = new Date("2026-08-18T15:00:00.000Z");

const LAYERS: LayerConfigItem[] = [
  {
    layerNumber: 1,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "nurul@pmw.gov.my" },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel: "Safety Officer",
    title: "Safety review",
  },
  {
    layerNumber: 2,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "hafiz@pmw.gov.my" },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel: "Yard Manager",
  },
];

const SIGNED_LAYER: ApprovalLayer = {
  status: "approved",
  outcome: "approved",
  email: "nurul@pmw.gov.my",
  signedAt: "2026-08-18T10:02:00.000Z",
  rejectionReason: null,
  signature: "/sites/OSHES/Signature Images/16-1.png",
};

function entry(slaDays = 3): CatalogueEntry {
  const workflow = describeWorkflow(LAYERS);
  const visibility = resolveFormVisibility({ masterFormIsPublic: false });
  return {
    listTitle: "Incident Report",
    code: "INC",
    name: "Incident Report",
    slug: "incident-report",
    chain: LAYERS.map((layer) => layer.roleLabel ?? ""),
    layers: LAYERS,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays,
    hasSla: slaDays > 0,
    visibility,
    isPublic: visibility.isPublic,
    volume: 0,
    today: 0,
    firstApprover: "Nurul Aziz",
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "16",
    submissionId: "16",
    listTitle: "Incident Report",
    formId: "INC",
    formVersion: "2",
    referenceNo: "INC-180826-0016",
    title: "Pallet fell at Berth 4",
    submittedByEmail: "ashraf@pmw-group.com",
    submitterName: "Ashraf Azahari",
    submittedAt: "2026-08-18T03:30:00.000Z",
    modifiedAt: "2026-08-18T10:02:00.000Z",
    formStatus: "In Review",
    totalLayers: 2,
    layers: [SIGNED_LAYER],
    meta: META,
    submissionData: {
      WhatHappened: "Pallet fell from the second tier",
      Location: "Berth 4",
      InjuredCount: 2,
      StaffIc: "0123456789",
      ReporterSign: "data:image/png;base64,iVBORw0KGgo=",
      HappenedAt: "2026-08-18T02:15:00.000Z",
      Status: "Approved Layer 1",
      // Bookkeeping the dashboard's reader leaves on the item. It belongs in the
      // identity block or nowhere, never as an answer column.
      RawJSON: "{}",
      PDPAConsent: "Accepted",
      PDPAConsentAt: "2026-08-18T03:29:00.000Z",
      PdfUrl: "/sites/OSHES/Form PDFs/INC-16.pdf",
    },
    surveyJson: {
      pages: [
        {
          name: "page1",
          elements: [
            { type: "comment", name: "WhatHappened", title: "What happened" },
            { type: "text", name: "Location", title: "Where" },
            { type: "text", name: "InjuredCount", title: "People injured", inputType: "number" },
            { type: "text", name: "StaffIc", title: "Reporter IC" },
            { type: "signaturepad", name: "ReporterSign", title: "Reporter signature" },
            { type: "text", name: "HappenedAt", title: "When it happened", inputType: "datetime-local" },
          ],
        },
      ],
    } as unknown as Submission["surveyJson"],
    currentLayer: 2,
    ...overrides,
  };
}

function record(overrides: Partial<Submission> = {}, slaDays = 3): PortalRecord {
  return toPortalRecord(submission(overrides), entry(slaDays), {}, {}, NOW);
}

function readBack(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headers, ...rest] = parseCsv(csv);
  return {
    headers,
    rows: rest.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))),
  };
}

describe("buildPortalRecordsCsv", () => {
  it("exports every answer, not the columns the table happened to draw", () => {
    const { headers, rows } = readBack(buildPortalRecordsCsv([record()]));

    expect(headers).toEqual(expect.arrayContaining(["What happened", "Where", "People injured", "Reporter signature"]));
    expect(rows[0]["What happened"]).toBe("Pallet fell from the second tier");
    expect(rows[0]["Reporter IC"]).toBe("0123456789");
  });

  it("carries the approval trail as columns and as one readable history", () => {
    const { headers, rows } = readBack(buildPortalRecordsCsv([record()]));

    expect(headers).toEqual(expect.arrayContaining(["Approval History", "L1 Status", "L1 Decided By", "L2 Status"]));
    expect(rows[0]["L1 Status"]).toBe("Approved");
    expect(rows[0]["L1 Decided By"]).toBe("nurul@pmw.gov.my");
    expect(rows[0]["Approval History"]).toContain("L1 Safety Officer (approval) — Approved — nurul@pmw.gov.my");
  });

  it("reports the layer it is waiting on, rather than leaving it out of the file", () => {
    const { headers, rows } = readBack(buildPortalRecordsCsv([record()]));

    // Only layer 1 has a stored decision row. Exporting the stored rows alone —
    // which is what the dashboard's translation does — filed a permit waiting on
    // its second approver as though it had one layer and was finished.
    expect(rows[0]["L2 Layer"]).toBe("Yard Manager (approval)");
    expect(rows[0]["L2 Status"]).toBe("Pending");
    // Nobody has acted on it, so there is no name and no date to report — and a
    // column empty in every row of the file is not written at all.
    expect(headers).not.toContain("L2 Decided By");
    expect(headers).not.toContain("L2 Decided At (MYT)");
    expect(rows[0]["Approval History"]).toContain("L2 Yard Manager (approval) — Pending");
  });

  it("stamps every instant in Malaysian time, with AM/PM and a labelled header", () => {
    const { rows } = readBack(buildPortalRecordsCsv([record()]));

    expect(rows[0]["Submitted At (MYT)"]).toBe("18/08/2026 11:30 AM");
    expect(rows[0]["L1 Decided At (MYT)"]).toBe("18/08/2026 06:02 PM");
    expect(rows[0]["When it happened"]).toBe("18/08/2026 10:15 AM");
    expect(rows[0]["PDPA Consent At (MYT)"]).toBe("18/08/2026 11:29 AM");
  });

  it("keeps a numeric answer bare and an identifier as text", () => {
    const csv = buildPortalRecordsCsv([record()]);
    const body = csv.split("\r\n")[1];

    // A number the form declared numeric is unquoted, so the column sums; an IC
    // with a leading zero stays quoted text, because 123456789 is a wrong answer.
    expect(body).toContain(",2,");
    expect(body).toContain('"0123456789"');
  });

  it("adds what the portal derived, beside the identity block rather than past the answers", () => {
    const { headers, rows } = readBack(buildPortalRecordsCsv([record()]));

    expect(rows[0].Stage).toBe("Layer 2 of 2");
    expect(rows[0]["Portal Status"]).toBe("In approval");
    expect(rows[0].Awaiting).toBe("Hafiz");
    expect(rows[0]["SLA (days)"]).toBe("3");
    expect(rows[0]["Past SLA"]).toBe("No");
    expect(headers.indexOf("Stage")).toBeLessThan(headers.indexOf("What happened"));
  });

  it("says nothing about an SLA on a form that never had one", () => {
    const { headers } = readBack(buildPortalRecordsCsv([record({}, 0)]));

    // A nought here reads as a target of nought, and "No" claims a deadline was
    // met that was never set. With no SLA anywhere in the selection the columns
    // are empty in every row, so they are left out altogether.
    expect(headers).not.toContain("SLA (days)");
    expect(headers).not.toContain("Past SLA");
  });

  it("leaves the SLA cells of an SLA-less form blank beside a form that has one", () => {
    const withSla = record();
    const withoutSla = toPortalRecord(
      submission({ id: "17", submissionId: "17", referenceNo: "INC-180826-0017" }),
      entry(0),
      {},
      {},
      NOW,
    );
    const { rows } = readBack(buildPortalRecordsCsv([withSla, withoutSla]));

    expect(rows[0]["SLA (days)"]).toBe("3");
    expect(rows[1]["SLA (days)"]).toBe("");
    expect(rows[1]["Past SLA"]).toBe("");
  });

  it("carries ink stored inline as the base64 it is", () => {
    const { rows } = readBack(buildPortalRecordsCsv([record()]));
    expect(rows[0]["Reporter signature"]).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("carries a signature fetched from SharePoint as base64 rather than as a link", () => {
    const csv = buildPortalRecordsCsv([record()], {
      siteUrl: "https://pmw.sharepoint.com/sites/OSHES",
      imageData: new Map([["/sites/OSHES/Signature Images/16-1.png", "data:image/png;base64,SIGNED"]]),
    });
    expect(readBack(csv).rows[0]["L1 Signature"]).toBe("data:image/png;base64,SIGNED");
  });

  it("falls back to the link when nothing fetched the picture", () => {
    const csv = buildPortalRecordsCsv([record()], { siteUrl: "https://pmw.sharepoint.com/sites/OSHES" });
    expect(readBack(csv).rows[0]["L1 Signature"]).toBe(
      "https://pmw.sharepoint.com/sites/OSHES/Signature Images/16-1.png",
    );
  });

  it("reports the list status and the workflow status under their own headings", () => {
    const { rows } = readBack(buildPortalRecordsCsv([record()]));
    expect(rows[0].Status).toBe("Approved Layer 1");
    expect(rows[0]["Form Status"]).toBe("In Review");
  });

  it("does not repeat the bookkeeping columns as though they were questions", () => {
    const { headers } = readBack(buildPortalRecordsCsv([record()]));

    // `RawJSON` is the whole submission again in one cell, and `PdfUrl` is
    // already the "Signed PDF" column.
    expect(headers).not.toContain("RawJSON");
    expect(headers).not.toContain("PdfUrl");
    expect(headers).toContain("Signed PDF");
    expect(headers).toContain("PDPA Consent");
  });
});

describe("buildAuditCsv", () => {
  const entries: AuditEntry[] = [
    {
      at: "2026-08-18T10:02:00.000Z",
      whenLabel: "18 Aug, 6:02 pm",
      reference: "INC-180826-0016",
      who: "Nurul Aziz",
      event: "Signed layer 1 of 2 — Safety Officer",
    },
  ];

  it("converts the stored instant to Malaysian time and says so in the header", () => {
    const [headers, row] = parseCsv(buildAuditCsv(entries));
    expect(headers[0]).toBe("When (MYT)");
    expect(row[0]).toBe("18/08/2026 06:02 PM");
    expect(row[3]).toBe("Signed layer 1 of 2 — Safety Officer");
  });

  it("writes a header even when the trail is empty, so the file identifies itself", () => {
    expect(parseCsv(buildAuditCsv([]))).toEqual([["When (MYT)", "Reference", "Who", "Event"]]);
  });
});
