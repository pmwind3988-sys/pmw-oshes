/**
 * pdfStyle.ts — which of the two printed layouts a PDF is drawn with.
 *
 * "classic" is the layout every stored and downloaded PDF has always had, and
 * stays the default everywhere: submissions, approvals and the automatic
 * rebuilds never change their look on their own. "soft" is the redesigned
 * permit layout (summary card, journey strip, sign-off cards, page footers and
 * a QR code to the live record). An administrator picks it per download or
 * rebuild from the record drawer.
 */
import type { ReactElement } from "react";
import type { PdfFormData } from "./FormPdfDocument";
import { appBaseUrl } from "../config/appBaseUrl";

export type PdfStyle = "classic" | "soft";

export const DEFAULT_PDF_STYLE: PdfStyle = "classic";

export const PDF_STYLE_LABELS: Record<PdfStyle, { title: string; detail: string }> = {
  classic: { title: "Classic design", detail: "The layout every PDF has used so far" },
  soft: { title: "New design", detail: "Summary card, sign-off cards, page numbers and a QR code to the live record" },
};

/** The document component for a style, loaded only when it is drawn. */
export async function pdfDocumentFor(style: PdfStyle = DEFAULT_PDF_STYLE): Promise<(data: PdfFormData) => ReactElement> {
  if (style === "soft") return (await import("./FormPdfDocumentSoft")).default;
  return (await import("./FormPdfDocument")).default;
}

/** Where a printed record's QR code points: the public, sign-in-free tracking page. */
export function trackingUrl(reference: string): string {
  return `${appBaseUrl()}/track?ref=${encodeURIComponent(reference)}`;
}

/**
 * Give the new design its QR code. Only the new design draws one, and only a
 * record with a reference number has something to point at, so classic PDFs
 * and unreferenced forms are left exactly as they were. A QR that cannot be
 * made is left out rather than failing the PDF.
 */
export async function preparePdfStyle(data: PdfFormData, style: PdfStyle): Promise<void> {
  if (style !== "soft" || data.qrDataUrl || !data.meta.referenceNo) return;
  try {
    const QRCode = (await import("qrcode")).default;
    data.qrDataUrl = await QRCode.toDataURL(trackingUrl(data.meta.referenceNo), { margin: 0, width: 240, errorCorrectionLevel: "M" });
  } catch {
    // The permit still prints; the reference on every page is the fallback.
  }
}
