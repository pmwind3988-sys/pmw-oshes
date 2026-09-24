import { describe, expect, it } from "vitest";
import { uploadPublicAttachments } from "./publicFileUpload";
import { textFieldSchemaAsNote } from "./formBuilderSP";

const SURVEY = { pages: [{ elements: [{ type: "file", name: "docs", allowMultiple: true }, { type: "text", name: "location" }] }] };
const CHUNK = 1000;

function dataUri(size: number): string {
  return `data:application/pdf;base64,${Buffer.alloc(size, 7).toString("base64")}`;
}

describe("a public form's attachments", () => {
  it("uploads each file in pieces and submits only where they were stored", async () => {
    const calls: Record<string, unknown>[] = [];
    const received = new Map<string, number>();
    const post = async (payload: Record<string, unknown>) => {
      calls.push(payload);
      if (payload.action === "upload-start") return { uploadUrl: `u:${payload.fileName}`, chunkBytes: CHUNK };
      const url = String(payload.uploadUrl);
      const bytes = Buffer.from(String(payload.data), "base64").length;
      received.set(url, (received.get(url) ?? 0) + bytes);
      const done = received.get(url) === payload.size;
      return done ? { done: true, url: `https://t.sharepoint.com/sites/a/Files/${url.slice(2)}` } : { done: false };
    };

    const body: Record<string, unknown> = {
      location: "Bay 3",
      docs: [
        { name: "quote.pdf", size: 2500, type: "application/pdf", content: dataUri(2500) },
        { name: "photo.png", size: 10, type: "image/png", content: dataUri(10) },
      ],
    };
    await uploadPublicAttachments(body, SURVEY, { listTitle: "Permit" }, post);

    expect(body.docs).toEqual([
      "https://t.sharepoint.com/sites/a/Files/quote.pdf",
      "https://t.sharepoint.com/sites/a/Files/photo.png",
    ]);
    expect(body.location).toBe("Bay 3");
    // quote.pdf: start + 3 pieces (1000, 1000, 500); photo.png: start + 1 piece.
    expect(calls.map((call) => call.action)).toEqual([
      "upload-start", "upload-chunk", "upload-chunk", "upload-chunk", "upload-start", "upload-chunk",
    ]);
    expect(calls[3].offset).toBe(2000);
    expect(calls[0]).toMatchObject({ fieldName: "docs", fileName: "quote.pdf", size: 2500 });
  });

  it("leaves a submission with nothing attached untouched", async () => {
    const body: Record<string, unknown> = { location: "Bay 3" };
    await uploadPublicAttachments(body, SURVEY, { listTitle: "Permit" }, async () => {
      throw new Error("should not upload");
    });
    expect(body).toEqual({ location: "Bay 3" });
  });

  it("stops the submission when a file fails to upload", async () => {
    const body: Record<string, unknown> = { docs: [{ name: "q.pdf", content: dataUri(10) }] };
    await expect(uploadPublicAttachments(body, SURVEY, { listTitle: "Permit" }, async () => {
      throw new Error("\"q.pdf\" is over the 10 MB limit.");
    })).rejects.toThrow("10 MB");
  });
});

describe("the signed-in path's column widening", () => {
  it("rewrites the same way the server does", () => {
    const xml = '<Field Type="Text" DisplayName="Docs" MaxLength="255" ID="{1}" Name="docs" />';
    expect(textFieldSchemaAsNote(xml)).toBe(
      '<Field NumLines="6" RichText="FALSE" UnlimitedLengthInDocumentLibrary="TRUE" Type="Note" DisplayName="Docs" ID="{1}" Name="docs" />',
    );
  });
});
