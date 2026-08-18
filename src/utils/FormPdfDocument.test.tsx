import { describe, expect, it } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { inflateSync } from "node:zlib";
import FormPdfDocument, { type PdfFormData } from "./FormPdfDocument";
import { collectImageSources, imageCaption, isEmbeddableImage, isSignatureField } from "./pdfImageSources";

/**
 * A 4x2 PNG. The dimensions matter: the header lays the logo out from the
 * raster's own proportions, so the test needs a source whose ratio is known and
 * is not 1:1.
 */
const WIDE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAGElEQVR4nGNgUPXKn7LzHrOGb9F0BmQOAG/ICRVMLNvzAAAAAElFTkSuQmCC";
const SOURCE_RATIO = 4 / 2;

function baseData(overrides: Partial<PdfFormData> = {}): PdfFormData {
  return {
    surveyJson: {
      title: "Permit To Work",
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "Location", title: "Location of Work" },
          { type: "signaturepad", name: "ReqSig", title: "Requester Signature" },
        ],
      }],
    },
    responseData: { Location: "Bay 3", ReqSig: WIDE_PNG },
    meta: {
      submittedBy: "ahmad@example.com",
      submittedAt: "2026-08-18T09:12:00",
      formTitle: "Permit To Work",
      formVersion: "1.3",
      formStatus: "Approved",
    },
    logoUrl: WIDE_PNG,
    ...overrides,
  };
}

async function renderPdf(data: PdfFormData): Promise<string> {
  const blob = await pdf(FormPdfDocument(data)).toBlob();
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

/** Every decompressed content stream in the file. */
function contentStreams(raw: string): string[] {
  const streams: string[] = [];
  for (const [, body] of raw.matchAll(/\d+ 0 obj([\s\S]*?)endobj/g)) {
    if (!/\/Filter\s*\/FlateDecode/.test(body)) continue;
    const start = body.indexOf("stream");
    if (start < 0) continue;
    let offset = start + "stream".length;
    if (body[offset] === "\r") offset++;
    if (body[offset] === "\n") offset++;
    try {
      streams.push(inflateSync(Buffer.from(body.slice(offset, body.lastIndexOf("endstream")), "latin1")).toString("latin1"));
    } catch {
      continue;
    }
  }
  return streams;
}

/**
 * Every string the page draws, in draw order.
 *
 * react-pdf sets text as hex-encoded `TJ` arrays, so the words are not legible
 * in the raw file — which is exactly why this is worth having: what the reader
 * is told about an unfinished chain can be asserted rather than eyeballed.
 */
function pdfText(raw: string): string {
  let text = "";
  for (const content of contentStreams(raw)) {
    for (const [, array] of content.matchAll(/\[(.*?)\]\s*TJ/g)) {
      for (const [, hex] of array.matchAll(/<([0-9a-fA-F]*)>/g)) {
        text += Buffer.from(hex, "hex").toString("latin1");
      }
      text += "\n";
    }
  }
  return text;
}

/**
 * The page's words as one line, upper-cased.
 *
 * Text is wrapped by the layout and some of it is set in small caps by the
 * stylesheet, so a phrase can arrive split across two draws or in a case the
 * source never wrote. Neither is what any of these tests is about.
 */
function flatText(raw: string): string {
  return pdfText(raw).replace(/\s+/g, " ").trim().toUpperCase();
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The `w 0 0 h x y cm` transforms applied immediately before each image draw. */
function drawnImageBoxes(raw: string): { width: number; height: number }[] {
  const boxes: { width: number; height: number }[] = [];
  for (const content of contentStreams(raw)) {
    for (const [, width, height] of content.matchAll(/([\d.-]+) 0 0 ([\d.-]+) [\d.-]+ [\d.-]+ cm\s*\n\s*\/I\d+ Do/g)) {
      boxes.push({ width: Math.abs(Number(width)), height: Math.abs(Number(height)) });
    }
  }
  return boxes;
}

describe("what the document is willing to draw", () => {
  it("treats only the two rasters a PDF can embed as drawable", () => {
    expect(isEmbeddableImage(WIDE_PNG)).toBe(true);
    expect(isEmbeddableImage("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    // A URL that hydration could not resolve. Drawing it produces an empty box
    // with no explanation, which is the defect this guards against.
    expect(isEmbeddableImage("https://tenant.sharepoint.com/sites/hr/Signature%20Images/a.png")).toBe(false);
    expect(isEmbeddableImage("/sites/hr/Signature Images/a.png")).toBe(false);
    expect(isEmbeddableImage("data:image/webp;base64,UklGRg==")).toBe(false);
  });

  it("names an unresolved picture by its file name so the gap is readable", () => {
    expect(imageCaption("https://tenant.sharepoint.com/sites/hr/Signature%20Images/submission-12.png"))
      .toBe("submission-12.png");
    expect(imageCaption(WIDE_PNG)).toBe("");
  });

  it("sets a signature field as ink rather than as a photograph", () => {
    expect(isSignatureField({ type: "signaturepad" })).toBe(true);
    expect(isSignatureField({ type: "Signature" })).toBe(true);
    expect(isSignatureField({ type: "file" })).toBe(false);
  });
});

describe("the rendered document", () => {
  it("scales the logo from its own proportions instead of stretching it to a box", async () => {
    const boxes = drawnImageBoxes(await renderPdf(baseData()));
    expect(boxes.length).toBeGreaterThan(0);
    const logo = boxes[0]!;
    expect(logo.width / logo.height).toBeCloseTo(SOURCE_RATIO, 2);
  });

  it("resizes the logo with the layout, still undistorted", async () => {
    const comfortable = drawnImageBoxes(await renderPdf(baseData({
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", density: "comfortable" },
    })));
    const compact = drawnImageBoxes(await renderPdf(baseData()));
    expect(comfortable[0]!.height).toBeGreaterThan(compact[0]!.height);
    expect(comfortable[0]!.width / comfortable[0]!.height).toBeCloseTo(SOURCE_RATIO, 2);
  });

  it("embeds a signature drawn on the form rather than leaving its box empty", async () => {
    const raw = await renderPdf(baseData());
    expect((raw.match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThan(0);
    expect(drawnImageBoxes(raw).length).toBeGreaterThanOrEqual(2);
  });

  it("renders every layer, including one that carries no signature", async () => {
    const data = baseData({
      layerResults: [
        { layerNumber: 1, type: "approval", status: "Approved", email: "a@example.com", signedAt: "2026-08-18T10:02:00", signature: WIDE_PNG },
        { layerNumber: 2, type: "approval", status: "Approved", email: "b@example.com", signedAt: "2026-08-18T13:44:00" },
      ],
    });
    // Two drawn images for layer 1's page (logo + form signature + layer ink);
    // layer 2 contributes a card with a rule and no raster, and must not throw.
    const boxes = drawnImageBoxes(await renderPdf(data));
    expect(boxes.length).toBeGreaterThanOrEqual(3);
  });

  it("draws a placeholder, not an empty box, for a picture that could not be fetched", async () => {
    const unresolved = "https://tenant.sharepoint.com/sites/hr/Signature%20Images/missing.png";
    const data = baseData({ responseData: { Location: "Bay 3", ReqSig: unresolved } });
    const boxes = drawnImageBoxes(await renderPdf(data));
    // Only the logo is drawn; the unfetchable signature becomes ruled text.
    expect(boxes).toHaveLength(1);
  });
});

describe("a record printed before its chain has finished", () => {
  const inFlight = (): PdfFormData => baseData({
    meta: { ...baseData().meta, formStatus: "In approval" },
    layerResults: [
      { layerNumber: 1, type: "approval", status: "Approved", email: "one@example.com", signedAt: "2026-08-18T10:02:00", signature: WIDE_PNG },
      { layerNumber: 2, type: "evaluation", status: "Pending", email: "two@example.com" },
      { layerNumber: 3, type: "approval", status: "Not started", email: "three@example.com" },
    ],
  });

  it("says on its face that it is not the final record", async () => {
    const text = flatText(await renderPdf(inFlight()));
    expect(text).toContain("INTERIM COPY");
    expect(text).toContain("1 OF 3 LAYERS SIGNED");
  });

  it("draws a signature block only for the layer that signed one", async () => {
    const text = flatText(await renderPdf(inFlight()));
    // One detail card, so one "Actioned by". Empty wells under the names of two
    // people who have not signed is the thing this replaces: an unfilled well
    // is indistinguishable from a signature whose image failed to load.
    expect(occurrences(text, "ACTIONED BY")).toBe(1);
    expect(text).toContain("ONE@EXAMPLE.COM");
  });

  it("names the layers still to sign instead of leaving them off the page", async () => {
    const text = flatText(await renderPdf(inFlight()));
    expect(text).toContain("NOT SIGNED");
    expect(text).toContain("TWO@EXAMPLE.COM");
    expect(text).toContain("THREE@EXAMPLE.COM");
  });

  it("does not report an evaluation nobody has opened as confirmed", async () => {
    // The remarks column printed "Confirmed" against every evaluation layer
    // whatever its status said, which is a claim about a decision that had not
    // been taken.
    expect(flatText(await renderPdf(inFlight()))).not.toContain("CONFIRMED");
  });

  it("says a withdrawn record stopped, rather than that it is still coming", async () => {
    const withdrawn = inFlight();
    withdrawn.meta.formStatus = "Cancelled";
    withdrawn.layerResults![1] = { layerNumber: 2, type: "evaluation", status: "Cancelled", email: "two@example.com" };
    const text = flatText(await renderPdf(withdrawn));
    expect(text).toContain("CLOSED BEFORE THE CHAIN FINISHED");
    expect(text).toContain("NEVER REACHED");
  });

  it("prints a finished chain exactly as it always did — no notice, every card", async () => {
    const complete = baseData({
      layerResults: [
        { layerNumber: 1, type: "approval", status: "Approved", email: "one@example.com", signedAt: "2026-08-18T10:02:00", signature: WIDE_PNG },
        { layerNumber: 2, type: "approval", status: "Approved", email: "two@example.com", signedAt: "2026-08-18T13:44:00" },
      ],
    });
    const text = flatText(await renderPdf(complete));
    expect(text).not.toContain("INTERIM COPY");
    expect(text).not.toContain("NOT SIGNED");
    expect(occurrences(text, "ACTIONED BY")).toBe(2);
  });

  it("keeps the blank-form mode blank, which is the one place empty fields belong", async () => {
    const paper = inFlight();
    paper.pdfConfig = {
      enabled: true,
      title: "Permit To Work",
      deliveryMethod: "sharepoint",
      includeEmptyEvaluationFields: true,
    };
    // Printing an unsigned evaluation for someone to fill in by hand is the
    // whole point of that setting, so its cards survive the filter above.
    expect(occurrences(flatText(await renderPdf(paper)), "ACTIONED BY")).toBe(3);
  });
});

describe("layer signatures and pictures survive the trip", () => {
  it("finds the image inside a SharePoint URL field value", () => {
    expect(collectImageSources(
      "https://tenant.sharepoint.com/sites/hr/Signature%20Images/submission-12.png, Signature",
    )).toEqual(["https://tenant.sharepoint.com/sites/hr/Signature%20Images/submission-12.png"]);
  });

  it("finds every picture in a multi-file answer", () => {
    expect(collectImageSources([WIDE_PNG, WIDE_PNG])).toHaveLength(2);
  });
});
