import { describe, expect, it } from "vitest";
import { collectManagedFileUrls, readSharePointErrorDetail } from "./sharepointClient";
import type { ListMetaEntry, Submission } from "../types";

/**
 * What a hard delete sweeps up.
 *
 * The rule these cases pin down is the one that makes "delete everything" safe
 * to mean literally: the sweep looks everywhere a file reference can hide on a
 * submission, and then deletes only what sits in a library this app created.
 * Widening where it looks is cheap; widening what it deletes is not.
 */

const SITE = "https://pmw.sharepoint.com/sites/oshes";
const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "General" };

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
    ...overrides,
  };
}

describe("collectManagedFileUrls", () => {
  it("takes the photos and attachments filed with the answers", () => {
    const item = submission({
      submissionData: {
        SitePhoto: `${SITE}/Incident Report Files/photo-142.png`,
        MethodStatement: JSON.stringify([{ url: "/sites/oshes/Incident Report Files/method.pdf" }]),
      },
    });

    expect(collectManagedFileUrls(item, SITE)).toEqual(
      expect.arrayContaining([
        "/sites/oshes/Incident Report Files/photo-142.png",
        "/sites/oshes/Incident Report Files/method.pdf",
      ]),
    );
  });

  it("takes every signature on the approval chain", () => {
    const item = submission({
      layers: [
        {
          status: "approved",
          outcome: "approved",
          email: "nurul@pmw.gov.my",
          signedAt: "2026-07-30T10:00:00.000Z",
          rejectionReason: null,
          signature: "/sites/oshes/Signature Images/142-layer1.png",
        },
      ],
    });

    expect(collectManagedFileUrls(item, SITE)).toContain("/sites/oshes/Signature Images/142-layer1.png");
  });

  it("takes an evaluator's uploaded answer, not only their signature", () => {
    const item = submission({
      enhancedLayers: [
        {
          layerNumber: 1,
          type: "evaluation",
          status: "confirmed",
          email: "faizal@pmw.gov.my",
          confirmedAt: "2026-07-30T12:00:00.000Z",
          fields: { CorrectiveActionPhoto: "/sites/oshes/Incident Report Files/after-142.jpg" },
        },
      ],
    });

    expect(collectManagedFileUrls(item, SITE)).toContain("/sites/oshes/Incident Report Files/after-142.jpg");
  });

  it("reads the raw evaluation column, so a form whose config is gone still gives its files up", () => {
    const item = submission({
      evaluationDataRaw: JSON.stringify({
        1: { fields: { Evidence: "/sites/oshes/Signature Images/eval-142.png" } },
      }),
    });

    expect(collectManagedFileUrls(item, SITE)).toContain("/sites/oshes/Signature Images/eval-142.png");
  });

  it("takes the generated PDF", () => {
    const item = submission({ submissionData: { PdfUrl: "/sites/oshes/Form PDFs/INC-142.pdf" } });

    expect(collectManagedFileUrls(item, SITE)).toContain("/sites/oshes/Form PDFs/INC-142.pdf");
  });

  it("leaves alone anything outside this app's own libraries", () => {
    const item = submission({
      submissionData: {
        // A link someone typed into an answer, and a file in a library this app
        // did not create. Neither belongs to the submission.
        Reference: "https://pmw.sharepoint.com/sites/oshes/Shared Documents/policy.pdf",
        External: "https://example.com/Signature Images/not-ours.png",
        OtherForm: "/sites/oshes/Permit To Work Files/ptw-9.png",
      },
    });

    expect(collectManagedFileUrls(item, SITE)).toEqual([]);
  });

  it("does not follow a file on another SharePoint site", () => {
    const item = submission({
      submissionData: { Photo: "https://pmw.sharepoint.com/sites/hr/Signature Images/142.png" },
    });

    expect(collectManagedFileUrls(item, SITE)).toEqual([]);
  });

  it("returns each file once, however many answers point at it", () => {
    const item = submission({
      submissionData: {
        Photo: `${SITE}/Incident Report Files/photo-142.png`,
        PhotoCopy: "/sites/oshes/Incident Report Files/photo-142.png",
      },
    });

    expect(collectManagedFileUrls(item, SITE)).toEqual(["/sites/oshes/Incident Report Files/photo-142.png"]);
  });
});

/**
 * Why a write failed is only ever in the response body. Every SharePoint write
 * in this app used to throw the status code alone, so a withdraw that failed
 * because a Choice column does not offer "Cancelled" — a nameable, fixable
 * thing — reached the person as "400" and nothing else.
 */
describe("readSharePointErrorDetail", () => {
  const body = (payload: unknown, ok = false): Response =>
    new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status: ok ? 200 : 400 });

  it("digs the sentence out of an odata=nometadata error", async () => {
    const response = body({
      "odata.error": {
        code: "-2130575163, Microsoft.SharePoint.SPException",
        message: { lang: "en-US", value: "The specified value is not valid for the field FormStatus." },
      },
    });

    expect(await readSharePointErrorDetail(response)).toBe(
      "The specified value is not valid for the field FormStatus.",
    );
  });

  it("digs it out of an odata=verbose error too", async () => {
    const response = body({ error: { message: { value: "Column 'WorkflowEmailSchedule' does not exist." } } });

    expect(await readSharePointErrorDetail(response)).toBe("Column 'WorkflowEmailSchedule' does not exist.");
  });

  it("passes a plain-text body through", async () => {
    expect(await readSharePointErrorDetail(body("Access denied."))).toBe("Access denied.");
  });

  it("drops an HTML error page — a page of markup in a toast is worse than nothing", async () => {
    expect(await readSharePointErrorDetail(body("<html><body>Runtime Error</body></html>"))).toBe("");
  });

  it("returns nothing rather than throwing on an empty body", async () => {
    expect(await readSharePointErrorDetail(body(""))).toBe("");
  });
});
