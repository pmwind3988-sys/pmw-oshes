/**
 * sharepointImageData.ts — turning an image reference into the bytes themselves.
 *
 * An answer names its picture, it does not carry it: a signature pad stores a
 * path into `Signature Images`, a file question stores a SharePoint URL value, a
 * rich-text answer stores an `<img src>`. None of those open for a reader
 * without our credentials, so anything that has to *contain* the picture rather
 * than point at it has to fetch it first and re-encode it as a data URI.
 *
 * Two things need that, for the same reason. `@react-pdf/renderer` has no
 * credentials, so a PDF whose signature is a URL prints an empty box. A CSV gets
 * mailed on and opened in Excel by somebody outside the site, so a spreadsheet
 * whose signature is a URL shows them a link they cannot follow. Both want the
 * base64, and they must not disagree about how it is obtained — which is why
 * this lives here and neither of them keeps its own copy.
 *
 * Everything here fetches with the caller's bearer token and returns "" rather
 * than throwing: an image that cannot be reached is a picture the caller has to
 * report as missing, not an export that fails.
 */
import { fetchWithAuthRecovery } from "./authRecovery";
import { isRecord, parseMaybeJson } from "./pdfImageSources";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

export function isImageSource(value: string): boolean {
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(trimmed);
}

/**
 * Whether this string addresses a file on our own SharePoint site.
 *
 * The candidate has to already look like an address. This used to resolve it
 * against the site origin as a *relative* URL, and `new URL("Hot Work", origin)`
 * succeeds - it yields `https://…/Hot%20Work`, whose origin matches, so every
 * plain-text answer on the form was classified as a picture. Hydration then
 * fetched it, got a 404, and wrote the answer back as an empty string: a permit
 * reached the page with its ticks unlabelled and its text fields blank, and the
 * document could only report them as questions nobody had answered.
 */
export function isSharePointSource(value: string, siteUrl = SP_SITE_URL): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return false;
  if (/^\/(sites|teams)\//i.test(trimmed)) return true;
  // Anything that is not already absolute is prose, not a path we serve.
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const site = new URL(siteUrl);
    return new URL(trimmed).origin.toLowerCase() === site.origin.toLowerCase();
  } catch {
    return false;
  }
}

function extractImageSrcFromHtml(value: string): string {
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i);
  return match?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/,\s+/);
  if (separatorIndex === -1) return trimmed;
  return trimmed.slice(0, separatorIndex).trim();
}

function toAbsoluteSharePointUrl(url: string): string {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  if (!/^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(url)) return url;
  try {
    return `${new URL(SP_SITE_URL).origin}${url}`;
  } catch {
    return url;
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(escapeODataString(serverRelativeUrl)).replace(/%2F/gi, "/");
}

export function sharePointServerRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  const cleanValue = splitSharePointUrlFieldValue(trimmed).split(/[?#]/)[0] ?? trimmed;
  const isSharePointRelativePath = /^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(cleanValue);

  try {
    if (/^https?:\/\//i.test(cleanValue)) {
      const siteUrl = new URL(SP_SITE_URL);
      const imageUrl = new URL(cleanValue);
      if (siteUrl.origin.toLowerCase() !== imageUrl.origin.toLowerCase()) return "";
      if (!/^(\/sites\/|\/teams\/|\/SiteAssets\/|\/Shared%20Documents\/|\/Shared Documents\/|\/Lists\/)/i.test(imageUrl.pathname)) return "";
      return decodeURIComponent(imageUrl.pathname);
    }
  } catch {
    return "";
  }

  return isSharePointRelativePath ? decodeURIComponent(cleanValue) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverRelativePath = sharePointServerRelativePath(value);
  if (!serverRelativePath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverRelativePath)}')/$value`;
}

/**
 * Some SharePoint Online tenants don't honor bearer-token auth on the
 * getFileByServerRelativePath `/$value` endpoint (it can 401 or redirect to
 * an HTML sign-in page while returning 200). `_layouts/15/download.aspx` is
 * a second, independently-authed download route that reliably accepts the
 * same bearer token, so we fall back to it before giving up.
 */
function sharePointDownloadAspxUrl(value: string): string {
  const serverRelativePath = sharePointServerRelativePath(value);
  if (!serverRelativePath) return "";
  return `${SP_SITE_URL}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(serverRelativePath)}`;
}

/**
 * What the bytes actually are, ignoring what the server said they are.
 *
 * SharePoint serves files from `/$value` and `download.aspx` as
 * `application/octet-stream` about as often as it serves them with a real image
 * type, so trusting `Content-Type` threw away perfectly good PNGs — which is
 * how a signature became an empty box on the page. The first bytes of a raster
 * do not lie, and they also catch the failure that matters: an expired session
 * answers `200` with a sign-in page, and `<!DOCTYPE` is not an image.
 */
export function sniffImageMimeType(bytes: Uint8Array): string {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x42, 0x4d)) return "image/bmp";
  return "";
}

export function sniffRiffWebp(bytes: Uint8Array): boolean {
  const ascii = (offset: number, text: string): boolean =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  return ascii(0, "RIFF") && ascii(8, "WEBP");
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}

/**
 * The only two rasters `@react-pdf/renderer` can embed directly, and the two
 * every browser renders from a `data:` URI without argument. Anything else is
 * re-encoded, so a caller never has to know which it was handed.
 */
const PDF_NATIVE_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Re-encode to PNG through a canvas.
 *
 * GIF, BMP, WEBP and SVG all display in the browser and none of them embed in a
 * PDF, so a site photo saved as a WEBP would silently vanish from the record.
 * The browser already knows how to decode them; this borrows that decoder and
 * hands the PDF the one format it takes. Returns "" outside a DOM, where the
 * caller falls back to a printed placeholder rather than a hole in the page.
 */
async function reencodeImageToPng(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return "";
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decode failed"));
      element.src = dataUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return "";
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export async function responseToImageDataUrl(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) return "";

  const sniffed = sniffImageMimeType(bytes)
    || (sniffRiffWebp(bytes) ? "image/webp" : "")
    || (looksLikeSvg(bytes) ? "image/svg+xml" : "");
  // The declared type is only consulted when the bytes are unrecognised, and
  // even then only if it claims to be an image — an HTML sign-in page reaches
  // here as `text/html` and is correctly rejected.
  const mimeType = sniffed || (response.headers.get("content-type") ?? "").split(";")[0]?.trim() || "";
  if (!mimeType.startsWith("image/")) return "";

  const dataUrl = bytesToDataUrl(bytes, mimeType);
  return PDF_NATIVE_IMAGE_TYPES.has(mimeType) ? dataUrl : reencodeImageToPng(dataUrl);
}

/**
 * Resolve an image reference to the base64 that carries it.
 *
 * Returns "" when the image cannot be reached or cannot be encoded. It used to
 * return the unreachable URL, which `@react-pdf/renderer` then failed to fetch
 * a second time — and it swallows that failure with a `console.warn` and lays
 * out an empty box. An empty result is honest: the document draws a labelled
 * placeholder for it, and a spreadsheet keeps the link it already had.
 *
 * `cache` belongs to the caller, and is what makes one signature reused down
 * forty rows of an export a single request rather than forty.
 */
export async function imageSourceToDataUrl(token: string, source: string, cache: Map<string, string>): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) {
    const mimeType = trimmed.slice(5).split(";")[0]?.toLowerCase() ?? "";
    return PDF_NATIVE_IMAGE_TYPES.has(mimeType) ? trimmed : reencodeImageToPng(trimmed);
  }

  const absolute = toAbsoluteSharePointUrl(trimmed);
  const cached = cache.get(absolute);
  if (cached !== undefined) return cached;

  const authHeaders = { Authorization: `Bearer ${token}`, Accept: "*/*" };
  const candidateUrls = [
    sharePointFileValueUrl(absolute),
    sharePointDownloadAspxUrl(absolute),
  ].filter((url): url is string => !!url);
  candidateUrls.push(absolute);

  for (const requestUrl of candidateUrls) {
    try {
      const response = await fetchWithAuthRecovery(requestUrl, {
        headers: requestUrl !== absolute || isSharePointSource(absolute) ? authHeaders : undefined,
      });
      if (!response.ok) continue;
      const dataUrl = await responseToImageDataUrl(response);
      if (!dataUrl) continue;
      cache.set(absolute, dataUrl);
      return dataUrl;
    } catch {
      continue;
    }
  }
  console.warn(`Image could not be fetched from any candidate URL; the export reports it as missing rather than carrying it: ${absolute}`);
  cache.set(absolute, "");
  return "";
}

export function imageSourceFromString(value: string, siteUrl = SP_SITE_URL): string {
  const trimmed = value.trim();
  const parsed = parseMaybeJson(trimmed);
  if (parsed !== null) {
    if (typeof parsed === "string") return imageSourceFromString(parsed, siteUrl);
    if (isRecord(parsed)) {
      for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
        const nested = parsed[key];
        if (typeof nested === "string") {
          const source = imageSourceFromString(nested, siteUrl);
          if (source) return source;
        }
      }
    }
    return "";
  }
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  return isImageSource(candidate) || isSharePointSource(candidate, siteUrl) ? candidate : "";
}

/** The keys a SharePoint URL/Hyperlink value hides its address behind. */
const URL_VALUE_KEYS = new Set([
  "Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl",
]);

export async function hydrateImageValue(token: string, value: unknown, cache: Map<string, string>): Promise<unknown> {
  if (typeof value === "string") {
    const parsed = parseMaybeJson(value);
    if (parsed !== null) return hydrateImageValue(token, parsed, cache);
    const source = imageSourceFromString(value);
    if (!source) return value;
    // A picture that could not be fetched keeps its address. Blanking it here
    // would reach the page as an answer nobody gave; keeping it lets the
    // document draw the labelled placeholder it has for exactly this case.
    return (await imageSourceToDataUrl(token, source, cache)) || value;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => hydrateImageValue(token, entry, cache)));
  }

  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = { ...value };
  for (const key of URL_VALUE_KEYS) {
    const raw = next[key];
    if (typeof raw === "string") {
      const source = imageSourceFromString(raw);
      if (source) next[key] = (await imageSourceToDataUrl(token, source, cache)) || raw;
    }
  }

  const serverUrl = next.serverUrl || next.ServerUrl;
  const relativeUrl = next.serverRelativeUrl || next.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    const combined = `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
    if (isImageSource(combined) || isSharePointSource(combined)) {
      next.url = (await imageSourceToDataUrl(token, combined, cache)) || combined;
    }
  }

  // Anything still nested gets the same treatment. A photo column inside a
  // dynamic matrix arrives as `{ columns, rows: [{ Photo: "<url>" }] }`, which
  // the URL-key pass above walks straight past — so the picture reached the PDF
  // as an unfetchable link and printed as nothing at all.
  for (const [key, raw] of Object.entries(next)) {
    if (URL_VALUE_KEYS.has(key)) continue;
    if (typeof raw !== "string" && !Array.isArray(raw) && !isRecord(raw)) continue;
    next[key] = await hydrateImageValue(token, raw, cache);
  }

  return next;
}
