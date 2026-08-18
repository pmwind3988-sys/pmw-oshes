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

/**
 * Where each string was drawn, by running the content stream's transform stack.
 *
 * Composition is a claim about position, so it is checked as one. The `q`/`Q`
 * pairs push and pop the graphics state and every `1 0 0 1 x y cm` translates
 * within it, which is enough to say whether the reference leads on the left and
 * the submitter sits on the right.
 */
function placedText(raw: string): { x: number; y: number; text: string }[] {
  const placed: { x: number; y: number; text: string }[] = [];
  for (const content of contentStreams(raw)) {
    if (!content.includes("BT")) continue;
    let x = 0;
    let y = 0;
    const stack: { x: number; y: number }[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "q") { stack.push({ x, y }); continue; }
      if (trimmed === "Q") { const popped = stack.pop(); if (popped) { x = popped.x; y = popped.y; } continue; }
      const move = trimmed.match(/^1 0 0 1 ([\d.-]+) ([\d.-]+) cm$/);
      if (move) { x += Number(move[1]); y += Number(move[2]); continue; }
      const draw = trimmed.match(/^\[(.*)\]\s*TJ$/);
      if (!draw) continue;
      let text = "";
      for (const [, hex] of draw[1].matchAll(/<([0-9a-fA-F]*)>/g)) text += Buffer.from(hex, "hex").toString("latin1");
      if (text.trim()) placed.push({ x, y, text });
    }
  }
  return placed;
}

/** Where a string starts, by the first draw that carries it. */
function xOf(raw: string, needle: string): number {
  const hit = placedText(raw).find((item) => item.text.includes(needle));
  if (!hit) throw new Error(`"${needle}" was not drawn on the page`);
  return hit.x;
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

describe("a question that was answered by ticking boxes", () => {
  const ticked = (value: unknown, choices: unknown[] = ["Hot Work", "Working at Height", "Confined Space"]): PdfFormData =>
    baseData({
      surveyJson: {
        title: "Permit To Work",
        pages: [{ name: "page1", elements: [{ type: "checkbox", name: "Nature", title: "Nature of Work", choices }] }],
      },
      responseData: { Nature: value },
    });

  it("prints the options as boxes, ticking the ones that were chosen", async () => {
    const text = flatText(await renderPdf(ticked(["Hot Work", "Confined Space"])));
    // Every option is on the page, chosen or not: a reader checking a permit
    // needs to see the work that was ruled out as much as the work allowed.
    expect(text).toContain("HOT WORK");
    expect(text).toContain("WORKING AT HEIGHT");
    expect(text).toContain("CONFINED SPACE");
  });

  it("matches a tick against the option's label as well as its value", async () => {
    // SharePoint hands multi-value columns back as one ";#"-delimited string,
    // and what it holds is the label, not the value the form submitted.
    const choices = [{ value: "helmet", text: "Safety Helmet" }, { value: "gloves", text: "Gloves" }];
    const text = flatText(await renderPdf(ticked("Safety Helmet;#Gloves", choices)));
    expect(text).toContain("SAFETY HELMET");
    expect(text).toContain("GLOVES");
  });

  it("never prints an answer as bare punctuation", async () => {
    // Three ticks whose labels did not survive submission printed as ", ,",
    // which reads as a broken renderer rather than as missing data.
    const text = flatText(await renderPdf(ticked(["", "", ""])));
    expect(text).not.toContain(", ,");
    expect(text).toContain("3 TICKS WERE STORED AGAINST THIS ITEM WITH NO LABEL THE RECORD COULD MATCH.");
  });

  it("matches a tick stored in the shape of a column name", async () => {
    // A tick that went through a data schema comes back spelled as the schema
    // spells it. It is the same tick, and the reader is owed the same box.
    const text = flatText(await renderPdf(ticked(["Working_x0020_at_x0020_Height", "confinedSpace"])));
    expect(text).toContain("WORKING AT HEIGHT");
    // Neither spelling should have fallen through to the fill-in line.
    expect(text).not.toContain("ALSO:");
  });

  it("reads a tick stored as a map of every option to true or false", async () => {
    const text = flatText(await renderPdf(ticked({ "Hot Work": true, "Working at Height": false, "Confined Space": true })));
    expect(text).not.toContain("ALSO:");
    expect(text).not.toContain("WITH NO LABEL");
  });

  it("reads the generated option values a form writes when the author typed only labels", async () => {
    const text = flatText(await renderPdf(ticked(["item1", "item3"])));
    expect(text).not.toContain("ALSO: ITEM1");
    expect(text).not.toContain("WITH NO LABEL");
  });

  it("prints the boxes of a question nobody answered, and claims no ticks for it", async () => {
    // The record carries the whole form, so an untouched tick panel is on the
    // page as an untouched tick panel - what it must not do is report silence
    // as a fault, or as ticks it could not read.
    const text = flatText(await renderPdf(ticked([])));
    expect(text).toContain("HOT WORK");
    expect(text).not.toContain("WITH NO LABEL");
  });

  it("keeps an answer the option list does not cover", async () => {
    const text = flatText(await renderPdf(ticked(["Hot Work", "Rope access"])));
    expect(text).toContain("ALSO: ROPE ACCESS");
  });

  it("leaves a one-answer question as a sentence", async () => {
    const data = baseData({
      surveyJson: {
        title: "Permit To Work",
        pages: [{ name: "page1", elements: [{ type: "radiogroup", name: "Shift", title: "Shift", choices: ["Day", "Night"] }] }],
      },
      responseData: { Shift: "Day" },
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("DAY");
    // "Night" would only appear as the unticked half of a two-box list.
    expect(text).not.toContain("NIGHT");
  });
});

describe("an evaluation that signed inside its own answers", () => {
  const evaluated = (): PdfFormData => baseData({
    layerResults: [{
      layerNumber: 1,
      type: "evaluation",
      status: "Confirmed",
      email: "ashraf@example.com",
      signedAt: "2026-08-18T10:42:00",
      confirmerName: "Muhammad Ashraf",
      evaluationFields: { AreaSig: WIDE_PNG },
      evaluationSurveyElements: [{ type: "signaturepad", name: "AreaSig", title: "Working Area Inspected (Signature)" }],
    }],
  });

  it("does not draw a second, empty signature rule above the real one", async () => {
    const text = flatText(await renderPdf(evaluated()));
    // The layer card used to print the signatory's name under an empty rule a
    // centimetre above their actual signature, which reads as ink that failed
    // to load rather than as ink that was never asked for.
    expect(occurrences(text, "MUHAMMAD ASHRAF")).toBe(1);
    expect(text).toContain("WORKING AREA INSPECTED (SIGNATURE)");
  });

  it("still draws the well for a layer that signs on the layer itself", async () => {
    const data = baseData({
      layerResults: [{
        layerNumber: 1,
        type: "approval",
        status: "Approved",
        email: "hafiz@example.com",
        signedAt: "2026-08-18T10:42:00",
        signature: WIDE_PNG,
      }],
    });
    // Once in the chain table, once in the card's facts, once as the reference
    // mark under the ink — the last of those is the one being guarded.
    expect(occurrences(flatText(await renderPdf(data)), "HAFIZ@EXAMPLE.COM")).toBe(3);
  });

  it("gathers every picture the layer collected under that layer", async () => {
    const data = baseData({
      layerResults: [{
        layerNumber: 2,
        type: "evaluation",
        status: "Confirmed",
        email: "ashraf@example.com",
        signedAt: "2026-08-18T10:42:00",
        confirmerName: "Muhammad Ashraf",
        signature: WIDE_PNG,
        evaluationFields: { AreaSig: WIDE_PNG, SitePhoto: WIDE_PNG, Safe: "Yes" },
        evaluationSurveyElements: [
          { type: "signaturepad", name: "AreaSig", title: "Working Area Inspected" },
          { type: "file", name: "SitePhoto", title: "Site Photograph" },
          { type: "text", name: "Safe", title: "Working area has been checked" },
        ],
      }],
    });
    const text = flatText(await renderPdf(data));
    // The layer's own ink, the signature asked for inside the evaluation and
    // the photograph are one layer's evidence, so they are set together.
    expect(text).toContain("SIGNATURES & ATTACHMENTS");
    expect(text).toContain("SITE PHOTOGRAPH");
    // …and the answer rows point at them rather than drawing them twice.
    expect(text).toContain("SHOWN UNDER SIGNATURES & ATTACHMENTS");
  });

  it("names the person on the signature and keeps the address as a reference", async () => {
    const data = baseData({
      layerResults: [{
        layerNumber: 1,
        type: "approval",
        status: "Approved",
        email: "hafiz@example.com",
        signedAt: "2026-08-18T10:42:00",
        confirmerName: "Hafiz bin Omar",
        signature: WIDE_PNG,
      }],
    });
    const placed = placedText(await renderPdf(data));
    const name = placed.filter((item) => item.text.includes("Hafiz bin Omar"));
    const address = placed.filter((item) => item.text.includes("hafiz@example.com"));
    // The name is on the decision and under the ink; the routing address is
    // still recorded, but it is no longer what the signature is captioned with.
    expect(name.length).toBeGreaterThanOrEqual(2);
    expect(address.length).toBeGreaterThanOrEqual(1);
  });
});

describe("a record of the whole form, not only the parts that were filled in", () => {
  const partlyFilled = (responseData: Record<string, unknown>): PdfFormData => baseData({
    surveyJson: {
      title: "Permit To Work",
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "Location", title: "Location of Work" },
          { type: "text", name: "Hazards", title: "Hazards Identified" },
          { type: "signaturepad", name: "ReqSig", title: "Requester Signature" },
        ],
      }],
    },
    responseData,
  });

  it("prints a question nobody answered rather than leaving it off the page", async () => {
    const text = flatText(await renderPdf(partlyFilled({ Location: "Bay 3" })));
    expect(text).toContain("HAZARDS IDENTIFIED");
    expect(text).toContain("NO ANSWER RECORDED");
  });

  it("says a signature was not given rather than drawing an empty rule for it", async () => {
    // An empty well is indistinguishable from ink that failed to load, and the
    // difference between those two is the whole point of the page.
    const text = flatText(await renderPdf(partlyFilled({ Location: "Bay 3" })));
    expect(text).toContain("NOT SIGNED");
  });

  it("keeps a stored answer the published survey no longer asks about", async () => {
    // A form edited after this record was filed leaves answers behind that no
    // element claims. They were still given, so they are still printed.
    const text = flatText(await renderPdf(partlyFilled({ Location: "Bay 3", Supervisor_x0020_Notes: "Isolated at 08:40" })));
    expect(text).toContain("ISOLATED AT 08:40");
    expect(text).toContain("SUPERVISOR NOTES");
  });

  it("leaves the plumbing off the page", async () => {
    const text = flatText(await renderPdf(partlyFilled({
      Location: "Bay 3",
      PdfUrl: "https://tenant.sharepoint.com/sites/hr/Form%20PDFs/x.pdf",
      L1_Status: "Approved",
      ContentType: "Item",
    })));
    expect(text).not.toContain("PDFURL");
    expect(text).not.toContain("L1 STATUS");
    expect(text).not.toContain("CONTENTTYPE");
  });
});

describe("the letterhead and the document band", () => {
  it("leads with the mark on the left and ranges the address to the right margin", async () => {
    const raw = await renderPdf(baseData());
    const logo = drawnImageBoxes(raw)[0]!;
    // A4 is 595pt wide with a 34pt margin, so anything past the middle is
    // ranged right rather than merely sitting somewhere on the page.
    expect(logo.width).toBeGreaterThan(0);
    expect(xOf(raw, "Lot 133077")).toBeGreaterThan(297);
  });

  it("leads the band with what the document is, and puts who filed it on the right", async () => {
    const raw = await renderPdf(baseData({
      meta: { ...baseData().meta, referenceNo: "PTW-180826-0015" },
      company: {
        name: "PMW INDUSTRIES SDN. BHD.",
        addressLines: ["Lot 133077, Jalan Lahat,"],
        phone: "",
        fax: "",
        sstNo: "",
        logoUrl: WIDE_PNG,
      },
    }));
    // A filed permit is looked up by its number, not by whose name is on it.
    expect(xOf(raw, "PTW-180826-0015")).toBeLessThan(297);
    expect(xOf(raw, "Submitted By".toUpperCase())).toBeGreaterThan(297);
    expect(xOf(raw, "ahmad@example.com")).toBeGreaterThan(297);
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
