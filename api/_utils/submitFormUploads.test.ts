import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test__ as submitForm } from "../submit-form.ts";
import { textFieldSchemaAsNote } from "./sharepointRest.ts";

const SITE = "https://tenant.sharepoint.com/sites/OSHES";
const CHUNK = 320 * 1024 * 8;

beforeEach(() => {
  vi.stubEnv("SP_SITE_URL", SITE);
  vi.stubEnv("VITE_SP_SITE_URL", SITE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public form uploads", () => {
  it("keeps the file's name and extension but stamps it, so two uploads of one name never collide", () => {
    expect(submitForm.uniqueUploadFileName("quote.pdf", "s1")).toBe("quote_s1.pdf");
    expect(submitForm.uniqueUploadFileName("Site plan #2 (final).PDF", "s")).toBe("Site_plan_2_final_s.PDF");
    expect(submitForm.uniqueUploadFileName("README", "s")).toBe("README_s");
  });

  it("accepts Word and Excel files, whose types contain dots", () => {
    const parsed = submitForm.parseDataUri(
      "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==",
    );
    expect(parsed?.base64).toBe("UEsDBA==");
  });

  it("accepts a file the browser could not put a type on", () => {
    expect(submitForm.parseDataUri("data:;base64,QUJD")?.ext).toBe("octetstream");
  });
});

describe("files uploaded ahead of a public submission", () => {
  const survey = {
    pages: [{ elements: [
      { type: "file", name: "docs", title: "Supporting documents" },
      { type: "text", name: "location" },
    ] }],
  };

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      getGraphToken: vi.fn(async () => "graph-token"),
      queryMasterFormByTitle: vi.fn(async () => ({ fields: { Title: "Permit", IsPublic: true } })),
      getPublishedSurveyJson: vi.fn(async () => survey),
      resolveUploadLibrary: vi.fn(async () => "Permit Files"),
      createDriveUploadSession: vi.fn(async () => "https://tenant.sharepoint.com/_api/v2.0/uploadSession?guid=1"),
      fetch: vi.fn(),
      now: () => 1_700_000_000_000,
      ...overrides,
    } as unknown as NonNullable<Parameters<typeof submitForm.handlePublicUpload>[1]>;
  }

  it("opens an upload for a file question on a public form, under a unique name", async () => {
    const d = deps();
    const result = await submitForm.handlePublicUpload(
      { action: "upload-start", listTitle: "Permit", fieldName: "docs", fileName: "quote.pdf", size: 6_000_000 },
      d,
    );
    expect(result.status).toBe(200);
    expect(result.body.chunkBytes).toBe(CHUNK);
    expect(String(result.body.fileName)).toMatch(/^quote_[0-9a-z]+\.pdf$/);
    expect(d.createDriveUploadSession).toHaveBeenCalledWith("graph-token", "Permit Files", result.body.fileName);
  });

  it("refuses a question that does not take files, a form that is not public, and a file over 10 MB", async () => {
    const start = { action: "upload-start", listTitle: "Permit", fileName: "x.pdf", size: 100 };
    expect((await submitForm.handlePublicUpload({ ...start, fieldName: "location" }, deps())).status).toBe(400);
    const privateForm = deps({ queryMasterFormByTitle: vi.fn(async () => ({ fields: { IsPublic: false } })) });
    expect((await submitForm.handlePublicUpload({ ...start, fieldName: "docs" }, privateForm)).status).toBe(403);
    expect((await submitForm.handlePublicUpload({ ...start, fieldName: "docs", size: 11 * 1024 * 1024 }, deps())).status).toBe(413);
  });

  it("sends each piece to the upload address and returns the stored file's address at the end", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ webUrl: `${SITE}/Permit%20Files/quote_x.pdf` }), { status: 201 }));
    const d = deps({ fetch: fetchMock });
    const size = CHUNK + 10;
    const uploadUrl = "https://tenant.sharepoint.com/_api/v2.0/uploadSession?guid=1";

    const first = await submitForm.handlePublicUpload(
      { action: "upload-chunk", uploadUrl, offset: 0, size, data: Buffer.alloc(CHUNK).toString("base64") },
      d,
    );
    expect(first.body).toEqual({ done: false });
    expect(fetchMock.mock.calls[0][1].headers["Content-Range"]).toBe(`bytes 0-${CHUNK - 1}/${size}`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();

    const last = await submitForm.handlePublicUpload(
      { action: "upload-chunk", uploadUrl, offset: CHUNK, size, data: Buffer.alloc(10).toString("base64") },
      d,
    );
    expect(last.body).toEqual({ done: true, url: `${SITE}/Permit%20Files/quote_x.pdf` });
  });

  it("never sends a piece anywhere but our own SharePoint, or out of place", async () => {
    const d = deps();
    const piece = { action: "upload-chunk", offset: 0, size: 10, data: Buffer.alloc(10).toString("base64") };
    expect((await submitForm.handlePublicUpload({ ...piece, uploadUrl: "https://evil.example.com/x" }, d)).status).toBe(400);
    expect((await submitForm.handlePublicUpload({ ...piece, uploadUrl: "http://tenant.sharepoint.com/x" }, d)).status).toBe(400);
    const uploadUrl = "https://tenant.sharepoint.com/x";
    expect((await submitForm.handlePublicUpload({ ...piece, uploadUrl, offset: 5 }, d)).status).toBe(400);
    // A middle piece must be a whole chunk.
    expect((await submitForm.handlePublicUpload({ ...piece, uploadUrl, size: CHUNK * 2 }, d)).status).toBe(400);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("files only addresses on our own site", () => {
    expect(submitForm.fileAnswerUrls([`${SITE}/Permit%20Files/a.pdf`, `${SITE}/Permit Files/b.png`])).toHaveLength(2);
    expect(submitForm.fileAnswerUrls(JSON.stringify([`${SITE}/Permit%20Files/a.pdf`]))).toHaveLength(1);
    expect(submitForm.fileAnswerUrls(["https://evil.example.com/sites/OSHES/a.pdf"])).toBeNull();
    expect(submitForm.fileAnswerUrls(["https://tenant.sharepoint.com/sites/Other/a.pdf"])).toBeNull();
    expect(submitForm.fileAnswerUrls([])).toEqual([]);
  });
});

describe("a file column too short for several files", () => {
  it("becomes multi-line text, keeping its identity", () => {
    const xml = '<Field Type="Text" DisplayName="Docs" MaxLength="255" ID="{1}" StaticName="docs" Name="docs" />';
    const widened = textFieldSchemaAsNote(xml);
    expect(widened).toContain('Type="Note"');
    expect(widened).not.toContain("MaxLength");
    expect(widened).toContain('ID="{1}"');
    expect(widened).toContain('NumLines="6"');
    expect(widened.endsWith("/>")).toBe(true);
  });

  it("leaves every other kind of column alone", () => {
    expect(textFieldSchemaAsNote('<Field Type="Note" Name="x" />')).toBe("");
    expect(textFieldSchemaAsNote('<Field Type="Number" Name="x" />')).toBe("");
  });
});
