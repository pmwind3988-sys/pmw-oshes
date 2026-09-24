import { appBaseUrl } from "../../config/appBaseUrl";
import { generateQrWithLogo } from "../../utils/qrWithLogo";
import type { SmokingArea } from "../../utils/smoking/schema";

export function smokingScanUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/smoke?area=${encodeURIComponent(code)}`;
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function posterHtml(areaName: string, qrDataUrl: string, scanUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(areaName)} — smoking log poster</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  body { font-family: system-ui, sans-serif; text-align: center; color: #111; margin: 0; }
  .kicker { font-size: 14pt; letter-spacing: .12em; text-transform: uppercase; color: #555; margin-top: 10mm; }
  h1 { font-size: 40pt; margin: 6mm 0 10mm; }
  img { width: 120mm; height: 120mm; }
  .how { font-size: 22pt; font-weight: 700; margin: 10mm 0 4mm; }
  .sub { font-size: 13pt; color: #444; }
  .url { font-size: 9pt; color: #777; margin-top: 12mm; word-break: break-all; }
</style></head><body>
  <div class="kicker">OSHES · Smoking log</div>
  <h1>${escape(areaName)}</h1>
  <img src="${qrDataUrl}" alt="QR code">
  <div class="how">Scan when you arrive, scan again when you leave</div>
  <div class="sub">First time? Sign in with Google and fill in your details once.</div>
  <div class="url">${escape(scanUrl)}</div>
</body></html>`;
}

/**
 * File name for a downloaded QR PNG: the area name lower-cased with runs of
 * non-alphanumeric characters collapsed to a single dash, trimmed of leading
 * and trailing dashes, plus the area's code (kept as-is, since codes are
 * already a short uppercase alphabet).
 */
export function qrFileName(area: SmokingArea): string {
  const slug = area.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `smoking-qr-${slug}-${area.code}.png`;
}

export async function printSmokingPoster(area: SmokingArea): Promise<void> {
  const scanUrl = smokingScanUrl(appBaseUrl(), area.code);
  const qr = await generateQrWithLogo(scanUrl, { width: 1200, logoUrl: "/logo-128.png" });
  const win = window.open("", "_blank", "width=820,height=1100");
  if (!win) throw new Error("Allow pop-ups for this site to print the poster.");
  win.document.write(posterHtml(area.name, qr, scanUrl));
  win.document.close();
  win.onload = () => win.print();
}
