import { afterEach, describe, expect, it, vi } from "vitest";
import { collectExportImageData } from "./exportImageData";
import type { ResponseCsvRow } from "./formResponseCsv";

/**
 * Fetching the pictures a spreadsheet carries.
 *
 * What matters here is which references are looked for and how few requests it
 * takes: a signature that appears on forty rows is one picture, ink already
 * stored inline needs no request at all, and a picture SharePoint will not hand
 * over has to leave the export standing rather than fail it.
 */

/** A one-pixel PNG, header intact, so the reader recognises the bytes. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

function row(overrides: Partial<ResponseCsvRow> = {}): ResponseCsvRow {
  return { record: {}, answers: {}, ...overrides };
}

/** Answers every request with the same PNG, and counts what was asked for. */
function servePng(): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (input: string | URL) => {
    urls.push(String(input));
    return Promise.resolve(new Response(PNG_BYTES, { headers: { "content-type": "image/png" } }));
  });
  return { urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectExportImageData", () => {
  it("fetches a signature stored as a SharePoint path and hands back its base64", async () => {
    servePng();
    const { imageData, warnings } = await collectExportImageData("token", [
      row({ layers: [{ layerNumber: 1, signature: "/sites/OSHES/Signature Images/16-1.png" }] }),
    ]);

    expect(imageData.get("/sites/OSHES/Signature Images/16-1.png")).toMatch(/^data:image\/png;base64,/);
    expect(warnings).toEqual([]);
  });

  it("looks in the answers, the matrix rows and the evaluation answers too", async () => {
    servePng();
    const { imageData } = await collectExportImageData("token", [
      row({
        answers: { Photo: "/sites/OSHES/Lists/Incident/1_.000/site.png" },
        matrixRows: { Checks: [{ Evidence: "/sites/OSHES/Lists/Incident/2_.000/row.png" }] },
        layers: [{ layerNumber: 1, evaluationFields: { Closeout: "/sites/OSHES/Lists/Incident/3_.000/eval.png" } }],
      }),
    ]);

    expect([...imageData.keys()].sort()).toEqual([
      "/sites/OSHES/Lists/Incident/1_.000/site.png",
      "/sites/OSHES/Lists/Incident/2_.000/row.png",
      "/sites/OSHES/Lists/Incident/3_.000/eval.png",
    ]);
  });

  it("asks once for a signature that appears on every row", async () => {
    const { urls } = servePng();
    const signature = "/sites/OSHES/Signature Images/hod.png";
    await collectExportImageData(
      "token",
      Array.from({ length: 5 }, () => row({ layers: [{ layerNumber: 1, signature }] })),
    );

    // One picture, one request. Otherwise a hundred-row export of one approver's
    // work is a hundred downloads of the same signature.
    expect(urls.length).toBe(1);
  });

  it("fetches nothing for ink already stored inline", async () => {
    const { urls } = servePng();
    const { imageData, warnings } = await collectExportImageData("token", [
      row({ answers: { Sign: "data:image/png;base64,iVBORw0KGgo=" } }),
    ]);

    expect(urls).toEqual([]);
    expect(imageData.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("fetches nothing for a typed answer that merely looks like a path", async () => {
    const { urls } = servePng();
    await collectExportImageData("token", [
      row({ answers: { Location: "Berth 4", Task: "Hot Work", Injured: "3" } }),
    ]);

    expect(urls).toEqual([]);
  });

  it("says how many pictures it could not read rather than failing the export", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 404 })));
    const { imageData, warnings } = await collectExportImageData("token", [
      row({ layers: [{ layerNumber: 1, signature: "/sites/OSHES/Signature Images/gone.png" }] }),
    ]);

    expect(imageData.size).toBe(0);
    expect(warnings).toEqual(["1 picture is exported as a link: SharePoint refused the download."]);
  });

  it("survives a request that throws", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    const { imageData, warnings } = await collectExportImageData("token", [
      row({ layers: [{ layerNumber: 1, signature: "/sites/OSHES/Signature Images/16-1.png" }] }),
    ]);

    expect(imageData.size).toBe(0);
    expect(warnings.length).toBe(1);
  });
});
