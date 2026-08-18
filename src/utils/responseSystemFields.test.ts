import { describe, it, expect } from "vitest";
import { isResponseSystemField, responseAnswerFields } from "./responseSystemFields";

describe("isResponseSystemField", () => {
  it("knows the workflow's own columns", () => {
    for (const key of ["Id", "Title", "SubmittedBy", "Status", "FormStatus", "RawJSON", "EvaluationData", "PdfUrl", "ReferenceNo"]) {
      expect(isResponseSystemField(key)).toBe(true);
    }
  });

  it("matches a layer column at any depth, not just the first three", () => {
    // The lists this replaces spelled out L1 to L3, so a fourth approver's
    // columns came through as if they were questions somebody had asked.
    expect(isResponseSystemField("L1_Status")).toBe(true);
    expect(isResponseSystemField("L4_SignedAt")).toBe(true);
    expect(isResponseSystemField("L7_Signature")).toBe(true);
    expect(isResponseSystemField("L2_ActedBy")).toBe(true);
  });

  it("matches SharePoint's escaped spelling of a name", () => {
    expect(isResponseSystemField("Submitted_x0020_By")).toBe(true);
    expect(isResponseSystemField("Selected_x0020_Branch")).toBe(true);
  });

  it("drops the OData bookkeeping the REST layer adds", () => {
    expect(isResponseSystemField("odata.etag")).toBe(true);
    expect(isResponseSystemField("@odata.id")).toBe(true);
  });

  it("leaves a question alone even when its name reads like plumbing", () => {
    expect(isResponseSystemField("StatusOfWork")).toBe(false);
    expect(isResponseSystemField("L1_Location")).toBe(false);
    expect(isResponseSystemField("StaffName")).toBe(false);
  });
});

describe("responseAnswerFields", () => {
  it("keeps the answers and nothing else", () => {
    const answers = responseAnswerFields({
      Id: 7,
      Title: "Incident Report",
      SubmittedBy: "ali@pmw.com",
      RawJSON: '{"StaffName":"Ali"}',
      L1_Status: "Approved",
      L1_Signature: "data:image/png;base64,AAA",
      "odata.etag": '"3"',
      StaffName: "Ali Bakar",
      Severity: 4,
    });

    expect(answers).toEqual({ StaffName: "Ali Bakar", Severity: 4 });
  });

  it("drops a column SharePoint returned empty rather than exporting a blank", () => {
    expect(responseAnswerFields({ StaffName: "Ali", Witness: null, Injury: undefined })).toEqual({ StaffName: "Ali" });
  });
});
