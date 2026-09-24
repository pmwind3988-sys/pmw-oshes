/**
 * pdfAttachmentMerge.ts — the "with attachments" copy of a record's PDF.
 *
 * The record itself prints each attached file as a link. This takes that
 * document and adds the files after it, in the order they were attached: every
 * page of an attached PDF, then each picture on a page of its own. A file that
 * cannot be drawn in a PDF (a spreadsheet, a Word document) or could not be
 * fetched still gets a page, saying what it is and where to open it — a copy
 * that silently drops an attachment reads as a record that never had one.
 */
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { looksLikePdf, type RecordAttachment } from "./fileAttachments";
import { sniffImageMimeType } from "./sharepointImageData";

/** A4 in points, the size the record itself is printed at. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;

const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.447, 0.502);
const LINK = rgb(0.169, 0.157, 0.439);

export type AttachmentLoader = (attachment: RecordAttachment) => Promise<Uint8Array | null>;

/**
 * Turn a picture the PDF cannot embed (WEBP, GIF, BMP) into a PNG. Injected so
 * the merge can run outside a browser, where there is no canvas to do it with.
 */
export type ImageToPng = (bytes: Uint8Array) => Promise<Uint8Array | null>;

export interface AttachmentMergeResult {
  bytes: Uint8Array;
  /** Attachments whose content made it into the document. */
  included: number;
  /** Attachments that got a notice page instead, and why. */
  notIncluded: { name: string; reason: string }[];
}

/**
 * Helvetica only carries Latin-1. A file named in another script would make
 * `drawText` throw and take the whole download down with it, so anything the
 * font cannot draw is replaced.
 */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  // Long URLs have no spaces, so a word that is itself too wide is cut by character.
  for (const word of printable(text).split(/(\s+)/)) {
    const next = line + word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    let rest = word.trimStart();
    while (rest && font.widthOfTextAtSize(rest, size) > width) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function addLink(doc: PDFDocument, page: PDFPage, url: string, rect: [number, number, number, number]): void {
  const annotation = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }),
  );
  const existing = page.node.lookup(PDFName.of("Annots"));
  if (existing && "push" in existing && typeof existing.push === "function") {
    existing.push(annotation);
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([annotation]));
  }
}

/** The line at the top of an attachment page: which one it is, and whose question it answers. */
function drawCaption(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  attachment: RecordAttachment,
  position: number,
  total: number,
): number {
  const width = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN - 9;
  page.drawText(printable(`Attachment ${position} of ${total} - ${attachment.fieldLabel}`), {
    x: MARGIN, y, size: 9, font: fonts.bold, color: MUTED,
  });
  for (const line of wrap(attachment.name, fonts.regular, 9, width)) {
    y -= 12;
    page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.regular, color: INK });
  }
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: MUTED });
  return y - 10;
}

function drawNoticePage(
  doc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  attachment: RecordAttachment,
  position: number,
  total: number,
  message: string,
  absoluteUrl: string,
): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const width = PAGE_WIDTH - MARGIN * 2;
  let y = drawCaption(page, fonts, attachment, position, total) - 8;
  for (const line of wrap(message, fonts.regular, 11, width)) {
    page.drawText(line, { x: MARGIN, y, size: 11, font: fonts.regular, color: INK });
    y -= 15;
  }
  y -= 6;
  page.drawText("Open the file:", { x: MARGIN, y, size: 10, font: fonts.bold, color: INK });
  for (const line of wrap(absoluteUrl, fonts.regular, 9, width)) {
    y -= 13;
    page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.regular, color: LINK });
    addLink(doc, page, absoluteUrl, [MARGIN, y - 2, MARGIN + fonts.regular.widthOfTextAtSize(line, 9), y + 9]);
  }
}

/**
 * Append every attachment to `basePdf`, in order.
 *
 * `toAbsoluteUrl` turns a stored server-relative address into one a reader can
 * click from a saved file.
 */
export async function appendAttachmentsToPdf(
  basePdf: Uint8Array | ArrayBuffer,
  attachments: RecordAttachment[],
  load: AttachmentLoader,
  options: { imageToPng?: ImageToPng; toAbsoluteUrl?: (url: string) => string } = {},
): Promise<AttachmentMergeResult> {
  const doc = await PDFDocument.load(basePdf);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const toAbsoluteUrl = options.toAbsoluteUrl ?? ((url: string) => url);
  const notIncluded: AttachmentMergeResult["notIncluded"] = [];
  let included = 0;
  const total = attachments.length;

  for (const [index, attachment] of attachments.entries()) {
    const position = index + 1;
    const absoluteUrl = toAbsoluteUrl(attachment.url);
    const notice = (reason: string, message: string): void => {
      notIncluded.push({ name: attachment.name, reason });
      drawNoticePage(doc, fonts, attachment, position, total, message, absoluteUrl);
    };

    const bytes = await load(attachment).catch(() => null);
    if (!bytes || bytes.length === 0) {
      notice("could not be downloaded", "This file could not be downloaded when this copy was made, so it is not included here. It is still stored with the record.");
      continue;
    }

    if (looksLikePdf(bytes)) {
      try {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        if (source.isEncrypted) throw new Error("encrypted");
        const pages = await doc.copyPages(source, source.getPageIndices());
        for (const page of pages) doc.addPage(page);
        included += 1;
      } catch {
        notice("is password-protected or damaged", "This PDF is password-protected or damaged, so its pages could not be added to this copy.");
      }
      continue;
    }

    let mime = sniffImageMimeType(bytes);
    let imageBytes: Uint8Array | null = bytes;
    if (mime !== "image/png" && mime !== "image/jpeg") {
      // Not a picture the PDF can take as it is. It may still be one the
      // browser can decode (WEBP, GIF, BMP); if not, it is not a picture.
      imageBytes = options.imageToPng ? await options.imageToPng(bytes).catch(() => null) : null;
      mime = imageBytes ? "image/png" : "";
    }
    if (!imageBytes || !mime) {
      notice("cannot be shown inside a PDF", "This type of file cannot be shown inside a PDF. Open it from the link below.");
      continue;
    }

    try {
      const image = mime === "image/png" ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const top = drawCaption(page, fonts, attachment, position, total);
      const boxWidth = PAGE_WIDTH - MARGIN * 2;
      const boxHeight = top - MARGIN;
      // Shrunk to fit, never enlarged: a small picture blown up to the page is
      // a blurrier picture, not a clearer one.
      const scale = Math.min(boxWidth / image.width, boxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: MARGIN + (boxWidth - width) / 2, y: top - height, width, height });
      included += 1;
    } catch {
      notice("could not be read as a picture", "This picture could not be read, so it is not included here.");
    }
  }

  return { bytes: await doc.save(), included, notIncluded };
}
