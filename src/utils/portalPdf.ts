import type { PortalRecord, SurveyJson } from "../types";
import type { PdfFormData, PdfLayerResult } from "./FormPdfDocument";

/**
 * "Download PDF" from the drawer: the form as submitted, with the approval
 * trail. Rendered client-side from the record already in memory rather than
 * regenerating and re-storing the server copy — this button is a read.
 */
export async function downloadRecordPdf(record: PortalRecord, surveyJson: SurveyJson | null): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { default: FormPdfDocument } = await import("./FormPdfDocument");
  const { createElement } = await import("react");

  const layerResults: PdfLayerResult[] = record.chain.map((step, index) => {
    const layer = record.submission.layers[index];
    return {
      layerNumber: step.layerNumber,
      type: step.type,
      status: layer?.status ?? "pending",
      email: step.email,
      ...(layer?.signedAt ? { signedAt: layer.signedAt } : {}),
      ...(layer?.rejectionReason ? { rejection: layer.rejectionReason } : {}),
      ...(layer?.signature ? { signature: layer.signature } : {}),
    };
  });

  const data: PdfFormData = {
    surveyJson: surveyJson ?? record.submission.surveyJson ?? { pages: [] },
    responseData: record.submission.submissionData,
    meta: {
      submittedBy: record.submitter,
      submittedAt: record.submission.submittedAt ?? "",
      formTitle: record.formName,
      formVersion: record.submission.formVersion,
      formStatus: record.status,
    },
    layerResults,
  };

  const pdfDocument = createElement(FormPdfDocument, data) as Parameters<typeof pdf>[0];
  const blob = await pdf(pdfDocument).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.reference}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
