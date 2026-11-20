/**
 * What kind of in-page preview an attached file gets.
 *
 * Decided by the file's name only. Anything not listed — web pages, SVG,
 * spreadsheets, old .doc files — is offered as a download, never drawn in the
 * page, because drawing an unknown file is how a malicious upload would run
 * script on this site.
 */
export type FilePreviewKind = "image" | "pdf" | "word" | "none";

const KIND_BY_EXTENSION: Record<string, { kind: FilePreviewKind; type: string }> = {
  png: { kind: "image", type: "image/png" },
  jpg: { kind: "image", type: "image/jpeg" },
  jpeg: { kind: "image", type: "image/jpeg" },
  gif: { kind: "image", type: "image/gif" },
  webp: { kind: "image", type: "image/webp" },
  bmp: { kind: "image", type: "image/bmp" },
  pdf: { kind: "pdf", type: "application/pdf" },
  docx: { kind: "word", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};

function extensionOf(fileName: string): string {
  const base = (fileName.split(/[?#]/)[0] ?? fileName).split("/").pop() ?? "";
  return base.includes(".") ? (base.split(".").pop() ?? "").toLowerCase() : "";
}

export function filePreviewKind(fileName: string): FilePreviewKind {
  return KIND_BY_EXTENSION[extensionOf(fileName)]?.kind ?? "none";
}

/** The type to give the downloaded bytes, so the browser treats them as what the name says and nothing else. */
export function filePreviewType(fileName: string): string {
  return KIND_BY_EXTENSION[extensionOf(fileName)]?.type ?? "application/octet-stream";
}
