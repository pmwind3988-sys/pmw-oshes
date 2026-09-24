import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendAttachmentsToPdf } from "./pdfAttachmentMerge";
import type { RecordAttachment } from "./fileAttachments";

/** A 4x2 PNG. */
const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAGElEQVR4nGNgUPXKn7LzHrOGb9F0BmQOAG/ICRVMLNvzAAAAAElFTkSuQmCC",
  "base64",
));

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([300, 400]);
  return doc.save();
}

function attachment(name: string): RecordAttachment {
  return { fieldLabel: "Supporting documents", fieldKey: "docs", name, url: `/sites/a/Files/${name}` };
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("the PDF with attachments", () => {
  it("adds every page of an attached PDF, then each picture on a page of its own", async () => {
    const record = await pdfWithPages(2);
    const quote = await pdfWithPages(3);
    const files: Record<string, Uint8Array> = { "quote.pdf": quote, "photo.png": PNG };

    const result = await appendAttachmentsToPdf(
      record,
      [attachment("quote.pdf"), attachment("photo.png")],
      async (file) => files[file.name] ?? null,
    );

    // 2 record pages + 3 quote pages + 1 photo page, in that order.
    expect(await pageCount(result.bytes)).toBe(6);
    const pages = (await PDFDocument.load(result.bytes)).getPages();
    expect(pages[4].getSize()).toEqual({ width: 300, height: 400 });
    expect(pages[5].getWidth()).toBeCloseTo(595.28);
    expect(result.included).toBe(2);
    expect(result.notIncluded).toEqual([]);
  });

  it("gives a file it cannot draw a page that links to it, rather than dropping it", async () => {
    const result = await appendAttachmentsToPdf(
      await pdfWithPages(1),
      [attachment("register.xlsx"), attachment("missing.pdf")],
      async (file) => (file.name === "register.xlsx" ? new TextEncoder().encode("PK\u0003\u0004 not a picture") : null),
      { toAbsoluteUrl: (url) => `https://t.sharepoint.com${url}` },
    );

    expect(await pageCount(result.bytes)).toBe(3);
    expect(result.included).toBe(0);
    expect(result.notIncluded.map((file) => file.name)).toEqual(["register.xlsx", "missing.pdf"]);
    // Saved without object streams so the link annotation is readable as text.
    const plain = await (await PDFDocument.load(result.bytes)).save({ useObjectStreams: false });
    const raw = Buffer.from(plain).toString("latin1");
    expect(raw).toContain("/URI (https://t.sharepoint.com/sites/a/Files/register.xlsx)");
  });

  it("converts a picture the PDF cannot embed through the converter it is given", async () => {
    const webp = new TextEncoder().encode("RIFF....WEBPVP8 ");
    const result = await appendAttachmentsToPdf(
      await pdfWithPages(1),
      [attachment("photo.webp")],
      async () => webp,
      { imageToPng: async () => PNG },
    );
    expect(result.included).toBe(1);
    expect(await pageCount(result.bytes)).toBe(2);
  });

  it("survives a file name the standard PDF font cannot draw", async () => {
    const result = await appendAttachmentsToPdf(
      await pdfWithPages(1),
      [{ ...attachment("x.png"), name: "现场照片.png" }],
      async () => PNG,
    );
    expect(result.included).toBe(1);
  });
});
