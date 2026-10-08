import { describe, expect, it } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { inflateSync } from "node:zlib";
import type { PdfFormData } from "./FormPdfDocument";
import FormPdfDocumentSoft from "./FormPdfDocumentSoft";

/** A 4x2 PNG: the logo and signature ratio the layout must preserve. */
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
  const blob = await pdf(FormPdfDocumentSoft(data)).toBlob();
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

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

/** Every string the page draws, in draw order (react-pdf sets text as hex TJ arrays). */
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

/** The page's words as one line, upper-cased, so wrapping and case do not matter. */
function flatText(raw: string): string {
  return pdfText(raw).replace(/\s+/g, " ").trim().toUpperCase();
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

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

function xOf(raw: string, needle: string): number {
  const hit = placedText(raw).find((item) => item.text.includes(needle));
  if (!hit) throw new Error(`"${needle}" was not drawn on the page`);
  return hit.x;
}

function drawnImageBoxes(raw: string): { width: number; height: number }[] {
  const boxes: { width: number; height: number }[] = [];
  for (const content of contentStreams(raw)) {
    for (const [, width, height] of content.matchAll(/([\d.-]+) 0 0 ([\d.-]+) [\d.-]+ [\d.-]+ cm\s*\n\s*\/I\d+ Do/g)) {
      boxes.push({ width: Math.abs(Number(width)), height: Math.abs(Number(height)) });
    }
  }
  return boxes;
}

const PERMIT_BASE = { title: "Permit To Work" };

describe("the soft layout's header, footer and pages", () => {
  it("prints the reference and a page count on every page", async () => {
    const many = baseData({
      surveyJson: {
        ...PERMIT_BASE,
        pages: [{ name: "page1", elements: Array.from({ length: 60 }, (_, i) => ({ type: "text", name: `Q${i}`, title: `Question ${i}` })) }],
      },
      responseData: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`Q${i}`, `Answer ${i}`])),
      meta: { ...baseData().meta, referenceNo: "PTW-180826-0015" },
    });
    const text = flatText(await renderPdf(many));
    const total = Number(text.match(/PAGE 1 OF (\d+)/)?.[1] ?? 0);
    expect(total).toBeGreaterThanOrEqual(2);
    for (let page = 1; page <= total; page++) {
      expect(text).toContain(`PAGE ${page} OF ${total}`);
    }
    // The reference is on the footer of every page, so a loose page can be matched.
    expect(occurrences(text, "PTW-180826-0015")).toBeGreaterThanOrEqual(total);
    // The running header repeats the title on pages 2 and up.
    expect(occurrences(text, "PERMIT TO WORK")).toBeGreaterThanOrEqual(total + 1);
  });

  it("keeps the company and address on the left, and the title and reference on the right", async () => {
    const raw = await renderPdf(baseData({
      meta: { ...baseData().meta, referenceNo: "PTW-180826-0015" },
    }));
    expect(xOf(raw, "Lot 133077")).toBeLessThan(297);
    expect(xOf(raw, "PTW-180826-0015")).toBeGreaterThan(297);
  });

  it("prints the form version and an uncontrolled-copy notice in the footer", async () => {
    const text = flatText(await renderPdf(baseData()));
    expect(text).toContain("V1.3");
    expect(text).toContain("PRINTED COPIES ARE UNCONTROLLED");
  });

  it("prints the configured footer text alongside the generation time", async () => {
    const text = flatText(await renderPdf(baseData({
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", footerText: "Controlled by OSHES" },
    })));
    expect(text).toContain("CONTROLLED BY OSHES");
    expect(text).toContain("GENERATED");
  });

  it("scales the logo from its own proportions", async () => {
    const boxes = drawnImageBoxes(await renderPdf(baseData()));
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0]!.width / boxes[0]!.height).toBeCloseTo(SOURCE_RATIO, 2);
  });
});

describe("dates", () => {
  it("prints dates as day, month in words, year, and a 24-hour time", async () => {
    const text = flatText(await renderPdf(baseData()));
    expect(text).toContain("18 AUG 2026, 09:12");
    expect(text).not.toContain("18/08/2026");
    expect(text).not.toMatch(/(AM|PM)/);
  });
});

describe("the summary card", () => {
  const withWindow = (): PdfFormData => baseData({
    surveyJson: {
      ...PERMIT_BASE,
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "StartDate", title: "Start date and time", inputType: "datetime-local" },
          { type: "text", name: "EndDate", title: "End date and time", inputType: "datetime-local" },
          { type: "radiogroup", name: "Risk", title: "Risk level", choices: ["Low", "Medium", "High"] },
        ],
      }],
    },
    responseData: { StartDate: "2026-10-08T08:00", EndDate: "2026-10-08T17:00", Risk: "High" },
  });

  it("states the validity window in the summary, on one line when it is one day", async () => {
    const text = flatText(await renderPdf(withWindow()));
    expect(text).toContain("VALID");
    expect(text).toContain("8 OCT 2026, 08:00 TO 17:00");
  });

  it("states a high risk with a word and a mark, not colour alone", async () => {
    const text = flatText(await renderPdf(withWindow()));
    expect(text).toContain("RISK");
    expect(text).toContain("HIGH");
  });

  it("still shows who filed it and the status when nothing is detectable", async () => {
    const text = flatText(await renderPdf(baseData()));
    expect(text).not.toContain("VALID");
    expect(text).not.toContain("RISK");
    expect(text).toContain("FILED BY");
    expect(text).toContain("AHMAD@EXAMPLE.COM");
    expect(text).toContain("STATUS");
  });

  it("leaves the status out of the card when the config hides status badges", async () => {
    const text = flatText(await renderPdf(baseData({
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", showStatusBadge: false },
    })));
    expect(text).not.toContain("STATUS");
  });

  it("prints a QR code in the summary only when one is supplied", async () => {
    // A 1x1 PNG stands in for the QR image the caller renders.
    const qr = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const without = await renderPdf(baseData());
    const withQr = await renderPdf(baseData({ qrDataUrl: qr }));
    expect(drawnImageBoxes(withQr).length).toBeGreaterThan(drawnImageBoxes(without).length);
    expect(flatText(withQr)).toContain("SCAN TO CHECK IT'S STILL VALID");
    expect(flatText(without)).not.toContain("SCAN TO CHECK IT'S STILL VALID");
  });
});

describe("the journey strip", () => {
  const chain = (): PdfFormData => baseData({
    layerResults: [
      { layerNumber: 1, type: "evaluation", status: "Confirmed", email: "hafiz@example.com", signedAt: "2026-08-18T10:42:00", confirmerName: "Hafiz bin Omar" },
      { layerNumber: 2, type: "approval", status: "Pending", email: "weiling@example.com" },
    ],
  });

  it("shows Filed, then each layer with its name and time", async () => {
    const text = flatText(await renderPdf(chain()));
    expect(text).toContain("FILED");
    expect(text).toContain("EVALUATED");
    expect(text).toContain("HAFIZ BIN OMAR");
    expect(text).toContain("18 AUG 2026, 10:42");
  });

  it("reads a layer still to sign as waiting, not as done", async () => {
    const text = flatText(await renderPdf(chain()));
    expect(text).toContain("WAITING");
  });

  it("shows a rejection as rejected", async () => {
    const rejected = chain();
    rejected.layerResults![1] = { layerNumber: 2, type: "approval", status: "Rejected", email: "weiling@example.com", signedAt: "2026-08-18T13:00:00", confirmerName: "Chan Wei Ling" };
    expect(flatText(await renderPdf(rejected))).toContain("REJECTED");
  });

  it("is left out when the config hides the approver chain", async () => {
    const text = flatText(await renderPdf({
      ...chain(),
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", showApproverChain: false },
    }));
    expect(text).not.toContain("EVALUATED");
    // The unfinished chain is still named, in the signature section.
    expect(text).toContain("NOT SIGNED");
  });
});

describe("the answers", () => {
  it("prints each section and question without numbering or a table header", async () => {
    const text = flatText(await renderPdf(baseData()));
    expect(text).toContain("LOCATION OF WORK");
    expect(text).toContain("BAY 3");
    expect(text).not.toContain("NO.");
    expect(text).not.toContain("ITEM DESCRIPTION");
  });

  it("prints chosen options as ticked pills and the rest as one line", async () => {
    const data = baseData({
      surveyJson: {
        ...PERMIT_BASE,
        pages: [{ name: "page1", elements: [{ type: "checkbox", name: "Nature", title: "Nature of Work", choices: ["Hot Work", "Working at Height", "Confined Space"] }] }],
      },
      responseData: { Nature: ["Hot Work"] },
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("HOT WORK");
    expect(text).toContain("NOT SELECTED: WORKING AT HEIGHT, CONFINED SPACE");
  });

  it("keeps the blank answers of a question nobody answered", async () => {
    const data = baseData({
      surveyJson: { ...PERMIT_BASE, pages: [{ name: "page1", elements: [{ type: "text", name: "Hazards", title: "Hazards identified" }] }] },
      responseData: {},
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("HAZARDS IDENTIFIED");
    expect(text).toContain("NO ANSWER RECORDED");
  });

  it("prints a repeating panel as a list of its entries", async () => {
    const data = baseData({
      surveyJson: {
        ...PERMIT_BASE,
        pages: [{
          name: "page1",
          elements: [{
            type: "paneldynamic", name: "WorkPerformers", title: "Work performers",
            templateElements: [
              { type: "radiogroup", name: "PerformerType", title: "Internal / external", choices: ["Internal", "External"] },
              { type: "text", name: "PerformerName", title: "Name of work performer" },
            ],
          }],
        }],
      } as unknown as PdfFormData["surveyJson"],
      responseData: {
        WorkPerformers: [
          { PerformerType: "Internal", PerformerName: "Ali bin Osman" },
          { PerformerType: "External", PerformerName: "Ah Meng (Acme Scaffold)" },
        ],
      },
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("ALI BIN OSMAN");
    expect(text).toContain("AH MENG (ACME SCAFFOLD)");
    expect(text).not.toContain("PERFORMERNAME");
  });

  it("prints a file question as a link that opens it", async () => {
    const raw = await renderPdf(baseData({
      surveyJson: { ...PERMIT_BASE, pages: [{ name: "page1", elements: [{ type: "file", name: "Docs", title: "Supporting documents", allowMultiple: true }] }] },
      responseData: { Docs: '["https://t.sharepoint.com/sites/a/Files/quote.pdf"]' },
    }));
    expect(raw).toContain("/URI (https://t.sharepoint.com/sites/a/Files/quote.pdf)");
  });

  it("keeps a picture that could not be fetched as a named gap", async () => {
    const unresolved = "https://tenant.sharepoint.com/sites/hr/Signature%20Images/missing.png";
    const boxes = drawnImageBoxes(await renderPdf(baseData({ responseData: { Location: "Bay 3", ReqSig: unresolved } })));
    // Only the logo is drawn; the signature is said in words.
    expect(boxes).toHaveLength(1);
  });
});

describe("sign-off", () => {
  it("draws one card for the requester's signature and one per layer", async () => {
    const data = baseData({
      layerResults: [
        { layerNumber: 1, type: "approval", status: "Approved", email: "one@example.com", signedAt: "2026-08-18T10:02:00", signature: WIDE_PNG, confirmerName: "Ali" },
        { layerNumber: 2, type: "approval", status: "Approved", email: "two@example.com", signedAt: "2026-08-18T13:44:00", confirmerName: "Bala" },
      ],
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("REQUESTER SIGNATURE");
    expect(text).toContain("LAYER 1 · APPROVAL");
    expect(text).toContain("LAYER 2 · APPROVAL");
    // One "Actioned by" per layer card, the requester's card says "Filed by" instead.
    expect(occurrences(text, "ACTIONED BY")).toBe(2);
  });

  it("prints an evaluation's responses inside that layer's card", async () => {
    const data = baseData({
      layerResults: [{
        layerNumber: 1,
        type: "evaluation",
        status: "Confirmed",
        email: "ashraf@example.com",
        signedAt: "2026-08-18T10:42:00",
        confirmerName: "Muhammad Ashraf",
        evaluationFields: { Safe: "Yes" },
        evaluationSurveyElements: [{ type: "radiogroup", name: "Safe", title: "Working area is safe", choices: ["Yes", "No"] }],
      }],
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("EVALUATION RESPONSES");
    expect(text).toContain("WORKING AREA IS SAFE");
    expect(text).toContain("MUHAMMAD ASHRAF");
  });

  it("names the layers still to sign and does not draw them as signed", async () => {
    const data = baseData({
      meta: { ...baseData().meta, formStatus: "In approval" },
      layerResults: [
        { layerNumber: 1, type: "approval", status: "Approved", email: "one@example.com", signedAt: "2026-08-18T10:02:00", signature: WIDE_PNG },
        { layerNumber: 2, type: "approval", status: "Pending", email: "two@example.com" },
      ],
    });
    const text = flatText(await renderPdf(data));
    expect(text).toContain("NOT SIGNED");
    expect(text).toContain("TWO@EXAMPLE.COM");
    expect(text).toContain("1 OF 2 LAYERS SIGNED");
  });

  it("gives no signature block to a layer that captured no signature", async () => {
    const data = baseData({
      responseData: { Location: "Bay 3" },
      layerResults: [{
        layerNumber: 3,
        type: "evaluation",
        status: "Confirmed",
        email: "ashraf@example.com",
        signedAt: "2026-08-18T10:46:00",
        confirmerName: "Muhammad Ashraf Bin Azahari",
        evaluationFields: { Safe: "Yes" },
        evaluationSurveyElements: [{ type: "radiogroup", name: "Safe", title: "Area checked", choices: ["Yes", "No"] }],
      }],
    });
    const raw = await renderPdf(data);
    expect(flatText(raw)).toContain("ACTIONED BY");
    // The logo and nothing else: no well, no rule, no raster for a layer with no ink.
    expect(drawnImageBoxes(raw)).toHaveLength(1);
  });

  it("gives the blank form a card with a rule to sign in pen", async () => {
    const data = baseData({
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", includeEmptyEvaluationFields: true },
      layerResults: [
        { layerNumber: 1, type: "evaluation", status: "Manual paper", email: "a@example.com", evaluationSurveyElements: [{ type: "text", name: "Safe", title: "Area is safe" }] },
        { layerNumber: 2, type: "approval", status: "Manual paper", email: "b@example.com" },
        { layerNumber: 3, type: "approval", status: "Manual paper", email: "c@example.com" },
      ],
    });
    const text = flatText(await renderPdf(data));
    expect(occurrences(text, "ACTIONED BY")).toBe(3);
    expect(text).toContain("AREA IS SAFE");
  });

  it("prints the requester's signature in the answers when signatures are hidden", async () => {
    const boxes = drawnImageBoxes(await renderPdf(baseData({
      pdfConfig: { enabled: true, title: "Permit To Work", deliveryMethod: "sharepoint", showSignatures: false },
    })));
    // The logo plus the requester's ink, which is kept rather than dropped.
    expect(boxes.length).toBeGreaterThanOrEqual(2);
  });

  it("prints the document control header when one is configured", async () => {
    const text = flatText(await renderPdf(baseData({
      documentHeader: {
        documentNumber: "PMW-OSH-F-012",
        issueNumber: "02",
        effectiveDate: "2026-01-05",
        revisionNumber: "1.3",
        revisionDate: "2026-06-14",
      },
    })));
    expect(text).toContain("DOCUMENT NO. PMW-OSH-F-012");
    expect(text).toContain("ISSUE NO. 02");
    expect(text).toContain("EFFECTIVE DATE 5 JAN 2026");
    expect(text).toContain("REVISION DATE 14 JUN 2026");
  });
});
