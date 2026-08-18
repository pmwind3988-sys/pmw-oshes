import { describe, it, expect } from "vitest";
import { buildDashboardSubmissionCsv } from "./dashboardResponseCsv";
import { parseCsv } from "./csv";
import type { LayerConfig, Submission } from "../types";

function readBack(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const [headers, ...rest] = parseCsv(csv);
  return {
    headers,
    rows: rest.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))),
  };
}

const LAYER_CONFIG: LayerConfig = {
  version: "1.0",
  layers: [
    {
      layerNumber: 1,
      type: "approval",
      title: "HOD Review",
      authMode: "365",
      assignee: { type: "user", value: "hod@pmw.com" },
      confirmationType: "signature",
      allowRejectionReason: true,
    },
    {
      layerNumber: 2,
      type: "evaluation",
      title: "Three-month review",
      authMode: "365",
      assignee: { type: "user", value: "hr@pmw.com" },
      surveyElements: [{ type: "dropdown", name: "Outcome", title: "Outcome", choices: [{ value: "kept", text: "Kept on" }] }],
    },
  ],
};

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "12",
    submissionId: "12",
    listTitle: "Incident Report",
    formId: "INC",
    formVersion: "3",
    referenceNo: "INC-180826-0001",
    title: "Pallet fell",
    submittedByEmail: "ali@pmw.com",
    submitterName: "Ali Bakar",
    submittedAt: "2026-08-12T15:31:00Z",
    modifiedAt: "2026-08-13T01:05:00Z",
    formStatus: "In Review",
    totalLayers: 2,
    layers: [],
    meta: { icon: "", color: "", pale: "", category: "Safety" },
    submissionData: {
      StaffName: "Ali Bakar",
      Severity: 4,
      PdfUrl: "/sites/OSHES/Form PDFs/incident-12.pdf",
    },
    surveyJson: {
      pages: [
        {
          name: "page1",
          elements: [
            { type: "text", name: "StaffName", title: "Staff name" },
            { type: "rating", name: "Severity", title: "Severity" },
          ],
        },
      ],
    } as unknown as Submission["surveyJson"],
    currentLayer: 2,
    layerConfig: LAYER_CONFIG,
    enhancedLayers: [
      {
        layerNumber: 1,
        type: "approval",
        status: "approved",
        outcome: "approved",
        email: "hod@pmw.com",
        signedAt: "2026-08-13T01:05:00Z",
        rejectionReason: null,
        signature: "data:image/png;base64,iVBORw0KGgo=",
        confirmedVia: "signature",
      },
      {
        layerNumber: 2,
        type: "evaluation",
        status: "in_progress",
        email: "hr@pmw.com",
        confirmedAt: null,
        fields: {},
      },
    ],
    ...overrides,
  };
}

describe("buildDashboardSubmissionCsv", () => {
  it("exports the answers, the trail and the identity block together", () => {
    const { headers, rows } = readBack(buildDashboardSubmissionCsv([submission()], { "Incident Report": { category: "Safety" } }));

    expect(headers).toEqual(expect.arrayContaining(["Reference", "Category", "Staff name", "Severity", "L1 Status", "L2 Status"]));
    expect(rows[0].Reference).toBe("INC-180826-0001");
    expect(rows[0].Category).toBe("Safety");
    expect(rows[0]["Staff name"]).toBe("Ali Bakar");
    expect(rows[0].Severity).toBe("4");
  });

  it("stamps the dashboard's timestamps in Malaysian time", () => {
    const { rows } = readBack(buildDashboardSubmissionCsv([submission()]));
    expect(rows[0]["Submitted At (MYT)"]).toBe("12/08/2026 11:31 PM");
    expect(rows[0]["Last Updated (MYT)"]).toBe("13/08/2026 09:05 AM");
    expect(rows[0]["L1 Decided At (MYT)"]).toBe("13/08/2026 09:05 AM");
  });

  it("names each layer and reads its canonical status as a label", () => {
    const { rows } = readBack(buildDashboardSubmissionCsv([submission()]));
    expect(rows[0]["L1 Layer"]).toBe("HOD Review (approval)");
    expect(rows[0]["L1 Status"]).toBe("Approved");
    expect(rows[0]["L2 Layer"]).toBe("Three-month review (evaluation)");
    // `in_progress` is what the workflow stores; "In Progress" is what it means.
    expect(rows[0]["L2 Status"]).toBe("In Progress");
  });

  it("carries the signature and links the stored PDF once", () => {
    const { headers, rows } = readBack(
      buildDashboardSubmissionCsv([submission()], {}, { siteUrl: "https://pmw.sharepoint.com/sites/OSHES" }),
    );
    expect(rows[0]["L1 Signature"]).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(rows[0]["Signed PDF"]).toBe("https://pmw.sharepoint.com/sites/OSHES/Form PDFs/incident-12.pdf");
    // Promoted to the identity block, so it is not also an answer column.
    expect(headers).not.toContain("PdfUrl");
  });

  it("falls back to the positional layers when there is no typed reading", () => {
    const { rows } = readBack(
      buildDashboardSubmissionCsv([
        submission({
          enhancedLayers: undefined,
          layers: [
            { status: "approved", outcome: "approved", email: "hod@pmw.com", signedAt: "2026-08-13T01:05:00Z", rejectionReason: null, signature: null },
            { status: "rejected", outcome: "rejected", email: "safety@pmw.com", signedAt: "2026-08-14T02:00:00Z", rejectionReason: "Photos missing", signature: null },
          ],
        }),
      ]),
    );

    expect(rows[0]["L1 Status"]).toBe("Approved");
    expect(rows[0]["L2 Status"]).toBe("Rejected");
    expect(rows[0]["L2 Remarks"]).toBe("Photos missing");
  });

  it("gives two forms in one export a column each without mixing their answers", () => {
    const other = submission({
      submissionId: "13",
      listTitle: "Hazard Report",
      submissionData: { Hazard: "Oil spill" },
      surveyJson: {
        pages: [{ name: "page1", elements: [{ type: "text", name: "Hazard", title: "Hazard seen" }] }],
      } as unknown as Submission["surveyJson"],
      enhancedLayers: undefined,
      layers: [],
    });
    const { rows } = readBack(buildDashboardSubmissionCsv([submission(), other]));

    expect(rows[0]["Staff name"]).toBe("Ali Bakar");
    expect(rows[0]["Hazard seen"]).toBe("");
    expect(rows[1]["Staff name"]).toBe("");
    expect(rows[1]["Hazard seen"]).toBe("Oil spill");
  });
});
