import { describe, expect, it } from "vitest";

import { filePreviewKind, filePreviewType } from "./filePreview";

describe("filePreviewKind", () => {
  it("previews pictures, PDFs and Word documents", () => {
    expect(filePreviewKind("site photo.JPG")).toBe("image");
    expect(filePreviewKind("https://x.sharepoint.com/sites/a/Files/permit.pdf?web=1")).toBe("pdf");
    expect(filePreviewKind("method statement.docx")).toBe("word");
  });

  it("offers everything else as a download only", () => {
    expect(filePreviewKind("page.html")).toBe("none");
    expect(filePreviewKind("drawing.svg")).toBe("none");
    expect(filePreviewKind("old.doc")).toBe("none");
    expect(filePreviewKind("folder.v2/README")).toBe("none");
  });
});

describe("filePreviewType", () => {
  it("names the type from the extension", () => {
    expect(filePreviewType("a.pdf")).toBe("application/pdf");
    expect(filePreviewType("a.exe")).toBe("application/octet-stream");
  });
});
