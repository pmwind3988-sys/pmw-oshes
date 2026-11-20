import { describe, expect, it } from "vitest";

import { findReviewFile, reviewFileContentType, reviewFileName } from "./reviewFiles";

const SITE = "https://contoso.sharepoint.com";
const SITE_PATH = "/sites/OSHES";

function toServerPath(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.origin !== SITE) return "";
    return decodeURIComponent(url.pathname);
  }
  return trimmed.startsWith("/") ? decodeURIComponent(trimmed) : "";
}

const ATTACHED = `${SITE}${SITE_PATH}/PERMIT TO WORK Files/method statement.docx`;

describe("findReviewFile", () => {
  it("hands over a file the record itself names", () => {
    expect(findReviewFile(ATTACHED, [ATTACHED], toServerPath))
      .toBe(`${SITE_PATH}/PERMIT TO WORK Files/method statement.docx`);
  });

  it("matches however the address is spelled", () => {
    const encoded = `${SITE}${SITE_PATH}/PERMIT%20TO%20WORK%20Files/METHOD%20statement.docx`;
    expect(findReviewFile(encoded, [ATTACHED], toServerPath)).not.toBeNull();
    expect(findReviewFile(`${SITE_PATH}/PERMIT TO WORK Files/method statement.docx`, [ATTACHED], toServerPath)).not.toBeNull();
  });

  it("refuses a file on the site that the record does not name", () => {
    expect(findReviewFile(`${SITE}${SITE_PATH}/PERMIT TO WORK Files/someone else.pdf`, [ATTACHED], toServerPath)).toBeNull();
    expect(findReviewFile(`${SITE}${SITE_PATH}/Shared Documents/payroll.xlsx`, [ATTACHED], toServerPath)).toBeNull();
  });

  it("refuses an address on another host even if the record names it", () => {
    const elsewhere = "https://evil.example.com/sites/OSHES/PERMIT TO WORK Files/method statement.docx";
    expect(findReviewFile(elsewhere, [elsewhere], toServerPath)).toBeNull();
  });

  it("refuses an empty or non-path request", () => {
    expect(findReviewFile("", [ATTACHED], toServerPath)).toBeNull();
    expect(findReviewFile("method statement.docx", [ATTACHED], toServerPath)).toBeNull();
  });
});

describe("reviewFileContentType", () => {
  it("serves the kinds the page can preview as themselves", () => {
    expect(reviewFileContentType("a.PDF")).toBe("application/pdf");
    expect(reviewFileContentType("photo.jpg")).toBe("image/jpeg");
    expect(reviewFileContentType("plan.docx")).toContain("wordprocessingml");
  });

  it("serves anything that could carry script as a plain download", () => {
    expect(reviewFileContentType("page.html")).toBe("application/octet-stream");
    expect(reviewFileContentType("drawing.svg")).toBe("application/octet-stream");
    expect(reviewFileContentType("no-extension")).toBe("application/octet-stream");
  });
});

describe("reviewFileName", () => {
  it("takes the last part of the path", () => {
    expect(reviewFileName("/sites/OSHES/Files/a b.pdf")).toBe("a b.pdf");
  });
});
