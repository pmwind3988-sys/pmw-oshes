import { describe, expect, it } from "vitest";
import { applySubmissionPatch } from "./portalPatch";
import type { ListMetaEntry, Submission } from "../types";

const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "General" };

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "16",
    submissionId: "16",
    listTitle: "Permit To Work",
    formId: "PTW",
    formVersion: "1",
    title: "Hot work at Berth 4",
    submittedByEmail: "ashraf@pmw-group.com",
    submittedAt: "2026-08-18T03:30:00.000Z",
    formStatus: "In Review",
    totalLayers: 2,
    layers: [],
    meta: META,
    submissionData: {},
    currentLayer: 1,
    ...overrides,
  };
}

describe("applySubmissionPatch", () => {
  it("moves a signature onto the layer it was written against", () => {
    const next = applySubmissionPatch(submission(), {
      L1_Status: "Approved",
      L1_SignedAt: "2026-08-18T10:02:00.000Z",
      CurrentLayer: 2,
      FormStatus: "In Review",
    });

    expect(next.layers[0]?.status).toBe("approved");
    expect(next.layers[0]?.signedAt).toBe("2026-08-18T10:02:00.000Z");
    expect(next.currentLayer).toBe(2);
  });

  it("repoints the record at a rebuilt PDF, so the next rebuild replaces that one", () => {
    // Without this the second rebuild deletes the file the first one replaced —
    // which no longer exists — and leaves the one actually being shown behind.
    const next = applySubmissionPatch(
      submission({ pdfUrl: "/sites/oshes/Form PDFs/PTW_16_2026-08-18.pdf" }),
      { PdfUrl: "/sites/oshes/Form PDFs/PTW_16_2026-08-19.pdf" },
    );

    expect(next.pdfUrl).toBe("/sites/oshes/Form PDFs/PTW_16_2026-08-19.pdf");
  });

  it("marks a withdrawal on the record and on the layer it stopped", () => {
    const next = applySubmissionPatch(submission(), {
      FormStatus: "Cancelled",
      L1_Status: "Cancelled",
      L1_Rejection: "Withdrawn by Sazali Rahim — filed twice",
    });

    expect(next.formStatus).toBe("Cancelled");
    expect(next.layers[0]?.status).toBe("cancelled");
    expect(next.layers[0]?.rejectionReason).toContain("filed twice");
  });
});
