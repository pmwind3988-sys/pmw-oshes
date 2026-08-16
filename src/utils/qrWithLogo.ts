/**
 * qrWithLogo.ts — render a QR code as a PNG data URL with an optional company
 * logo composited in the centre.
 *
 * The encoded text (URL) is never altered here, so QR codes generated before
 * this helper existed keep resolving exactly as they did. Adding a centre logo
 * only changes the *appearance* of newly generated codes; to keep those
 * scannable the QR is generated at the highest error-correction level ("H",
 * ~30% recovery) and the logo is capped to a small share of the code area.
 *
 * Every logo step is defensive: if the logo cannot be loaded or the canvas is
 * unavailable, the plain (still perfectly valid) QR data URL is returned so
 * generation never fails.
 */

export interface QrWithLogoOptions {
  /** Output width/height in pixels. */
  width?: number;
  /** Quiet-zone margin in modules. */
  margin?: number;
  /** Foreground (module) colour. */
  dark?: string;
  /** Background colour. */
  light?: string;
  /** Logo image source. Omit to render a plain QR. */
  logoUrl?: string;
  /** Logo box size as a fraction of the QR width (kept small to stay scannable). */
  logoSizeRatio?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function generateQrWithLogo(
  text: string,
  options: QrWithLogoOptions = {},
): Promise<string> {
  const {
    width = 320,
    margin = 2,
    dark = "#000000",
    light = "#FFFFFF",
    logoUrl,
    logoSizeRatio = 0.22,
  } = options;

  const { default: QRCode } = await import("qrcode");

  // High error correction so the centred logo does not stop the QR from scanning.
  const baseDataUrl = await QRCode.toDataURL(text, {
    width,
    margin,
    errorCorrectionLevel: "H",
    color: { dark, light },
  });

  if (!logoUrl) return baseDataUrl;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return baseDataUrl;

    const qrImage = await loadImage(baseDataUrl);
    ctx.drawImage(qrImage, 0, 0, width, width);

    const logo = await loadImage(logoUrl);

    const logoBox = Math.round(width * logoSizeRatio);
    // White rounded backing plate so the logo reads cleanly and keeps its own
    // quiet zone away from the surrounding modules.
    const pad = Math.round(logoBox * 0.16);
    const plate = logoBox + pad * 2;
    const platePos = Math.round((width - plate) / 2);
    const radius = Math.round(plate * 0.24);

    ctx.fillStyle = light;
    roundRect(ctx, platePos, platePos, plate, plate, radius);
    ctx.fill();

    // Contain the logo within the box while preserving its aspect ratio.
    const scale = Math.min(logoBox / logo.width, logoBox / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    ctx.drawImage(logo, (width - drawW) / 2, (width - drawH) / 2, drawW, drawH);

    return canvas.toDataURL("image/png");
  } catch {
    return baseDataUrl;
  }
}
