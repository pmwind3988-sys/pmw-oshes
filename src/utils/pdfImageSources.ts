/**
 * pdfImageSources.ts — finding the pictures in an answer, and deciding which of
 * them the PDF can actually draw.
 *
 * Both halves matter. A stored answer names its image half a dozen different
 * ways depending on whether it came from a signature pad, a file question, a
 * rich-text field or a SharePoint URL column, and `@react-pdf/renderer` can
 * only embed a base64 PNG or JPEG — everything else it reports by logging a
 * warning and laying out an empty box. So the check has to happen before layout
 * or the failure reaches the reader as an unexplained white rectangle.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMaybeJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isImageSource(value: string): boolean {
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(trimmed);
}

function isSharePointImageCandidate(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:\/\/|\/)/i.test(trimmed) && /(\/sites\/|\/teams\/|\/Signature%20Images\/|\/Signature Images\/|\/Form%20PDFs\/|\/Lists\/)/i.test(trimmed);
}

function extractImageSrcFromHtml(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i);
  return match?.[2]?.trim() ?? "";
}

/** A SharePoint URL column stores `"<url>, <description>"` in one string. */
function splitSharePointUrlFieldValue(value: string): string {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/,\s+/);
  if (separatorIndex === -1) return trimmed;
  return trimmed.slice(0, separatorIndex).trim();
}

export function collectImageSources(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(collectImageSources);

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseMaybeJson(trimmed);
    if (parsed !== null) return collectImageSources(parsed);
    const htmlSrc = extractImageSrcFromHtml(trimmed);
    const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
    return isImageSource(candidate) || isSharePointImageCandidate(candidate) ? [candidate] : [];
  }

  if (!isRecord(value)) return [];

  const directKeys = ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"];
  for (const key of directKeys) {
    const next = value[key];
    if (typeof next === "string") {
      const candidate = splitSharePointUrlFieldValue(next);
      if (isImageSource(candidate) || isSharePointImageCandidate(candidate)) return [candidate];
    }
  }

  const serverUrl = value.serverUrl || value.ServerUrl;
  const relativeUrl = value.serverRelativeUrl || value.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const url = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    return isImageSource(url) || isSharePointImageCandidate(url) ? [url] : [];
  }

  return [];
}

/**
 * Whether `@react-pdf/renderer` will draw this rather than silently skipping it.
 *
 * Deliberately narrow: a plain URL that reached here is one image hydration
 * already tried and failed to fetch, so handing it to the renderer only repeats
 * the failure — this time invisibly, at layout.
 */
export function isEmbeddableImage(src: string): boolean {
  return /^data:image\/(png|jpe?g);base64,/i.test(src.trim());
}

/**
 * Whether the field holds ink rather than a photograph.
 *
 * Ink is set on a ruled line with a name under it; a photograph is set in a
 * bordered tile. Same underlying PNG, different thing on the page.
 */
export function isSignatureField(field: { type: string }): boolean {
  const type = field.type.toLowerCase();
  return type === "signaturepad" || type === "signature";
}

/** The file name at the tail of a URL, for captioning a picture that is missing. */
export function imageCaption(src: string): string {
  const trimmed = src.trim();
  if (trimmed.startsWith("data:")) return "";
  try {
    const path = /^https?:\/\//i.test(trimmed) ? new URL(trimmed).pathname : trimmed.split(/[?#]/)[0] ?? trimmed;
    return decodeURIComponent(path.split("/").pop() ?? "").trim();
  } catch {
    return "";
  }
}
