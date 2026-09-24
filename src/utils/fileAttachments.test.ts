import { describe, expect, it } from "vitest";
import {
  absoluteAttachmentUrl,
  attachmentName,
  attachmentUrls,
  collectRecordAttachments,
  fileAnswerKeys,
  looksLikePdf,
  uniqueUploadFileName,
  uploadStamp,
} from "./fileAttachments";
import { fileSizeLimitMb } from "../native/schema";

const SURVEY = {
  pages: [{
    name: "page1",
    elements: [
      { type: "text", name: "Location", title: "Location" },
      {
        type: "panel",
        name: "evidence",
        elements: [
          { type: "file", name: "supportingDocuments", title: "Supporting documents", allowMultiple: true },
          { type: "imageupload", name: "sitePhoto", title: "Site photo" },
        ],
      },
    ],
  }],
};

describe("reading attachments out of a stored answer", () => {
  it("reads one URL, a JSON list of URLs, and a URL column value", () => {
    expect(attachmentUrls("/sites/OSHES/Permit Files/quote_ab.pdf")).toEqual(["/sites/OSHES/Permit Files/quote_ab.pdf"]);
    expect(attachmentUrls('["/sites/a/x.pdf","/sites/a/y.png"]')).toEqual(["/sites/a/x.pdf", "/sites/a/y.png"]);
    expect(attachmentUrls("https://t.sharepoint.com/sites/a/x.pdf, Quote")).toEqual(["https://t.sharepoint.com/sites/a/x.pdf"]);
    expect(attachmentUrls({ Url: "/sites/a/z.docx" })).toEqual(["/sites/a/z.docx"]);
  });

  it("leaves out files that were never uploaded and answers that are not addresses", () => {
    expect(attachmentUrls([{ name: "a.pdf", content: "data:application/pdf;base64,QQ==" }])).toEqual([]);
    expect(attachmentUrls("Bay 3")).toEqual([]);
    expect(attachmentUrls(null)).toEqual([]);
  });

  it("names a file by the tail of its address, decoded", () => {
    expect(attachmentName("/sites/a/Permit%20Files/Site%20plan_ab.pdf")).toBe("Site plan_ab.pdf");
    expect(attachmentName("https://t.sharepoint.com/sites/a/x.png?web=1")).toBe("x.png");
  });

  it("gathers every file question's files in form order, nested panels included", () => {
    const attachments = collectRecordAttachments(SURVEY, {
      Location: "Bay 3",
      supportingDocuments: '["/sites/a/Files/quote.pdf","/sites/a/Files/plan.pdf"]',
      sitePhoto: "/sites/a/Files/photo.jpg",
    });
    expect(attachments.map((a) => [a.fieldLabel, a.name])).toEqual([
      ["Supporting documents", "quote.pdf"],
      ["Supporting documents", "plan.pdf"],
      ["Site photo", "photo.jpg"],
    ]);
  });

  it("finds a file answer stored under SharePoint's shortened column name", () => {
    const survey = { pages: [{ elements: [{ type: "file", name: "supportingDocumentsForThisPermitRequest" }] }] };
    const keys = fileAnswerKeys(survey, { supportingDocumentsForThisPermitR: "/sites/a/x.pdf" });
    expect([...keys]).toEqual(["supportingDocumentsForThisPermitR"]);
  });

  it("makes a stored server-relative address clickable from a saved file", () => {
    expect(absoluteAttachmentUrl("/sites/a/Permit Files/x.pdf", "https://t.sharepoint.com/sites/a"))
      .toBe("https://t.sharepoint.com/sites/a/Permit%20Files/x.pdf");
    expect(absoluteAttachmentUrl("https://t.sharepoint.com/sites/a/x.pdf", "https://t.sharepoint.com/sites/a"))
      .toBe("https://t.sharepoint.com/sites/a/x.pdf");
  });

  it("recognises a PDF by its bytes", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<!DOCTYPE html>"))).toBe(false);
  });
});

describe("naming an uploaded file", () => {
  it("keeps the name and extension but makes two uploads of the same file distinct", () => {
    const first = uniqueUploadFileName("quote.pdf", uploadStamp(1_700_000_000_000, 0, 0.1));
    const second = uniqueUploadFileName("quote.pdf", uploadStamp(1_700_000_000_000, 1, 0.1));
    expect(first).toMatch(/^quote_[0-9a-z]+\.pdf$/);
    expect(first).not.toBe(second);
  });

  it("replaces characters SharePoint rejects and survives names with no extension", () => {
    expect(uniqueUploadFileName("Site plan #2 (final).PDF", "s")).toBe("Site_plan_2_final_s.PDF");
    expect(uniqueUploadFileName("README", "s")).toBe("README_s");
    expect(uniqueUploadFileName(".pdf", "s")).toBe("pdf_s");
  });
});

describe("a file question's size limit", () => {
  it("reads the builder's byte figure as megabytes", () => {
    expect(fileSizeLimitMb(10485760)).toBe(10);
    expect(fileSizeLimitMb(5242880)).toBe(5);
  });

  it("reads a small figure as megabytes already", () => {
    expect(fileSizeLimitMb(5)).toBe(5);
  });

  it("never promises more than the submission accepts", () => {
    expect(fileSizeLimitMb(undefined)).toBe(10);
    expect(fileSizeLimitMb(50)).toBe(10);
  });
});
