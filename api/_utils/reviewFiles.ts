/**
 * reviewFiles.ts — which attached files a public review link may hand over.
 *
 * A public reviewer holds no SharePoint account, so a file on the record can
 * only reach them through the server. The server fetches it with its own
 * credential, which can read every file on the site, so the check here is the
 * whole boundary: a link may fetch a file only when that file's address is one
 * of the values the link is already shown. Anything else — another record's
 * upload, a file somewhere else on the site, a later layer's answer — is not
 * found, whatever the address says.
 */

/**
 * Vercel caps a function's response at about 4.5 MB. Files over this are
 * refused with a clear reason rather than cut off part-way.
 */
export const REVIEW_FILE_MAX_BYTES = 4 * 1024 * 1024;

/** SharePoint paths are case-insensitive, so two spellings of one file match. */
function pathKey(path: string): string {
  return path.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * The server-relative path of `requested`, if it is one of `candidates`.
 *
 * `toServerPath` turns an address (absolute or server-relative) into a
 * server-relative path on this site, or "" when it is not on this site — so an
 * address on another host can never match, even if a record names it.
 */
export function findReviewFile(
  requested: string,
  candidates: string[],
  toServerPath: (value: string) => string,
): string | null {
  const wanted = toServerPath(requested);
  if (!wanted) return null;
  const wantedKey = pathKey(wanted);
  for (const candidate of candidates) {
    const path = toServerPath(candidate);
    if (path && pathKey(path) === wantedKey) return path;
  }
  return null;
}

const PREVIEW_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * The type the file is served as, decided by its name and never by what
 * SharePoint reports. Only kinds the page knows how to show safely get their
 * own type; everything else (including web pages and SVG, which could carry
 * script) goes out as a plain download.
 */
export function reviewFileContentType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEW_TYPES[extension] ?? "application/octet-stream";
}

/** The last part of a path, decoded, for the download name. */
export function reviewFileName(serverPath: string): string {
  return serverPath.split("/").filter(Boolean).pop() ?? "file";
}
