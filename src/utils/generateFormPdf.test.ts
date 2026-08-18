import { describe, expect, it } from "vitest";
import { __test__ } from "./generateFormPdf";

/** A one-pixel PNG, header intact — enough for the sniffer to identify. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe("PDF image hydration", () => {
  it("recognizes SharePoint image URLs even when the download URL has no file extension", () => {
    expect(__test__.imageSourceFromString(
      "https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc",
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("https://tenant.sharepoint.com/sites/hr/_layouts/15/download.aspx?UniqueId=abc");
  });

  it("recognizes SharePoint URL field JSON values", () => {
    expect(__test__.imageSourceFromString(
      JSON.stringify({ Url: "/sites/hr/Signature%20Images/signed.png", Description: "Signature" }),
      "https://tenant.sharepoint.com/sites/hr",
    )).toBe("/sites/hr/Signature%20Images/signed.png");
  });
});

describe("image type sniffing", () => {
  it("identifies rasters from their leading bytes", () => {
    expect(__test__.sniffImageMimeType(PNG_BYTES)).toBe("image/png");
    expect(__test__.sniffImageMimeType(JPEG_BYTES)).toBe("image/jpeg");
    expect(__test__.sniffImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    expect(__test__.sniffImageMimeType(new Uint8Array([0x42, 0x4d, 0x36]))).toBe("image/bmp");
  });

  it("does not mistake a sign-in page for an image", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>Sign in</body></html>");
    expect(__test__.sniffImageMimeType(html)).toBe("");
    expect(__test__.looksLikeSvg(html)).toBe(false);
  });

  it("identifies WEBP and SVG, which browsers render and PDFs cannot embed", () => {
    const webp = new Uint8Array(16);
    webp.set([...("RIFF")].map((c) => c.charCodeAt(0)), 0);
    webp.set([...("WEBP")].map((c) => c.charCodeAt(0)), 8);
    expect(__test__.sniffRiffWebp(webp)).toBe(true);
    expect(__test__.looksLikeSvg(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true);
  });
});

describe("hydrating a fetched image", () => {
  // The failure that put an empty box where a signature should have been:
  // SharePoint serves a stored PNG as a generic download, and the old
  // Content-Type check discarded it.
  it("accepts a PNG that SharePoint serves as application/octet-stream", async () => {
    const response = new Response(PNG_BYTES, {
      headers: { "content-type": "application/octet-stream" },
    });
    await expect(__test__.responseToPdfImageDataUrl(response)).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("accepts a JPEG whose type header is missing entirely", async () => {
    const response = new Response(JPEG_BYTES);
    await expect(__test__.responseToPdfImageDataUrl(response)).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects the HTML sign-in page an expired session returns with a 200", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Sign in</body></html>", {
      headers: { "content-type": "text/html" },
    });
    await expect(__test__.responseToPdfImageDataUrl(response)).resolves.toBe("");
  });

  it("rejects an empty body rather than embedding a zero-byte image", async () => {
    await expect(__test__.responseToPdfImageDataUrl(new Response(new Uint8Array()))).resolves.toBe("");
  });

  // Outside a browser there is no canvas to re-encode with, so the caller gets
  // "" and the document prints a labelled placeholder instead of a blank tile.
  it("returns nothing for a format the PDF cannot embed and cannot be converted here", async () => {
    const gif = new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
    await expect(__test__.responseToPdfImageDataUrl(gif)).resolves.toBe("");
  });
});
