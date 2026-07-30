import { describe, expect, it } from "vitest";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
import { buildFormSubmissionSections } from "./formSubmissionLayout";

describe("PDF field formatting", () => {
  it("formats date and date-time values with dd/mm/yyyy and uppercase AM/PM", () => {
    expect(formatPdfFieldValue("2026-06-17", { type: "text", inputType: "date" })).toBe("17/06/2026");
    expect(formatPdfFieldValue("2026-06-17T09:05:00", { type: "text", inputType: "datetime-local" })).toBe("17/06/2026 09:05 AM");
    expect(formatPdfDateTimeValue("2026-06-17T21:05:00", true)).toBe("17/06/2026 09:05 PM");
  });

  it("uses choice labels instead of stored variable values", () => {
    const choices = [
      { value: "hod_review", text: "HOD Review" },
      { value: "finance_review", text: "Finance Review" },
    ];

    expect(formatPdfFieldValue("hod_review", { type: "dropdown", choices })).toBe("HOD Review");
    expect(formatPdfFieldValue(["hod_review", "finance_review"], { type: "checkbox", choices })).toBe("HOD Review, Finance Review");
  });

  it("builds a measure ruler context for ratings", () => {
    expect(getPdfMeasureContext({
      type: "rating",
      rateMin: 1,
      rateMax: 5,
      minRateDescription: "Poor",
      maxRateDescription: "Excellent",
    }, 4)).toEqual({
      value: 4,
      min: 1,
      max: 5,
      percent: 75,
      valueLabel: "4 of 5",
      minLabel: "Poor",
      maxLabel: "Excellent",
    });
  });

  it("matches SharePoint internal response keys back to survey labels and metadata", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "page1",
        elements: [
          { type: "text", inputType: "date", name: "Travel Date", title: "Actual Travel Date" },
          { type: "rating", name: "Satisfaction Score", title: "Satisfaction", rateMin: 1, rateMax: 10 },
        ],
      }],
    }, {
      Travel_x0020_Date: "2026-06-17",
      Satisfaction_x0020_Score: 8,
    }, {
      includeAdditionalFields: false,
    });

    expect(sections[0]?.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      inputType: field.inputType,
      rateMax: field.rateMax,
    }))).toEqual([
      { key: "Travel Date", label: "Actual Travel Date", value: "2026-06-17", inputType: "date", rateMax: undefined },
      { key: "Satisfaction Score", label: "Satisfaction", value: 8, inputType: undefined, rateMax: 10 },
    ]);
  });
});
