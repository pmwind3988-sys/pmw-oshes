import { describe, expect, it } from "vitest";
import { formatPdfDateTimeValue, formatPdfFieldValue, getPdfMeasureContext } from "./pdfFieldFormatting";
import { buildFormSubmissionSections } from "./formSubmissionLayout";
import { __test__ as generateFormPdfTest } from "./generateFormPdf";

describe("PDF field formatting", () => {
  it("formats empty field values as blank text", () => {
    expect(formatPdfFieldValue("")).toBe("");
    expect(formatPdfFieldValue(null)).toBe("");
    expect(formatPdfFieldValue(undefined)).toBe("");
  });

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

  it("uses custom rating value labels in formatted values and measure rulers", () => {
    const rateValues = [
      { value: 1, text: "Disagree" },
      { value: 2, text: "Neutral" },
      { value: 3, text: "Agree" },
      { value: 4, text: "Very Agree" },
    ];

    expect(formatPdfFieldValue(4, { type: "rating", rateValues })).toBe("Very Agree");
    expect(getPdfMeasureContext({ type: "rating", rateMin: 1, rateMax: 4, rateValues }, 4)?.valueLabel).toBe("4 of 4 - Very Agree");
  });

  it("matches SharePoint internal response keys back to survey labels and metadata", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "page1",
        elements: [
          { type: "text", inputType: "date", name: "Travel Date", title: "Actual Travel Date" },
          { type: "rating", name: "Satisfaction Score", title: "Satisfaction", rateMin: 1, rateMax: 10, rateValues: [{ value: 8, text: "Great" }] },
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
      rateValues: field.rateValues,
    }))).toEqual([
      { key: "Travel Date", label: "Actual Travel Date", value: "2026-06-17", inputType: "date", rateMax: undefined },
      { key: "Satisfaction Score", label: "Satisfaction", value: 8, inputType: undefined, rateMax: 10, rateValues: [{ value: 8, text: "Great" }] },
    ]);
  });

  it("preserves PDF control metadata for long text and boolean fields", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "Evaluation",
        elements: [
          { type: "comment", name: "managerNotes", title: "Manager notes", rows: 6 },
          { type: "boolean", name: "accepted", title: "Accepted", labelTrue: "Yes", labelFalse: "No" },
        ],
      }],
    }, {
      managerNotes: "Detailed note",
      accepted: true,
    }, {
      includeAdditionalFields: false,
    });

    expect(sections[0]?.fields.map((field) => ({
      key: field.key,
      rows: field.rows,
      labelTrue: field.labelTrue,
      labelFalse: field.labelFalse,
    }))).toEqual([
      { key: "managerNotes", rows: 6, labelTrue: undefined, labelFalse: undefined },
      { key: "accepted", rows: undefined, labelTrue: "Yes", labelFalse: "No" },
    ]);
  });

  // The page's own questions used to share one section per title, so a question
  // asked after a panel was pulled back up into the section its page opened
  // before that panel — printing it above answers that were given first.
  it("keeps questions asked between panels between them", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "trainingDate", title: "Training Date" },
          { type: "panel", name: "employee", title: "Employee Details", elements: [
            { type: "text", name: "employeeName", title: "Employee Name" },
          ] },
          { type: "radiogroup", name: "overallRating", title: "Overall Rating" },
          { type: "comment", name: "comments", title: "Comments / Feedback" },
          { type: "panel", name: "ack", title: "Acknowledgement", elements: [
            { type: "signaturepad", name: "employeeSignature", title: "Employee Signature" },
          ] },
        ],
      }],
    }, {
      trainingDate: "2026-06-17",
      employeeName: "Aisyah",
      overallRating: "Excellent",
      comments: "Well run.",
      employeeSignature: "signature.png",
    }, {
      fallbackSectionTitle: "Main Page",
      includeAdditionalFields: false,
    });

    expect(sections.map((section) => [section.title, section.fields.map((field) => field.key)])).toEqual([
      ["Main Page", ["trainingDate"]],
      ["Employee Details", ["employeeName"]],
      ["", ["overallRating", "comments"]],
      ["Acknowledgement", ["employeeSignature"]],
    ]);
  });

  it("resumes a panel after a nested one without repeating its heading", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "page1",
        elements: [
          { type: "panel", name: "training", title: "Training", elements: [
            { type: "text", name: "courseTitle", title: "Course title" },
            { type: "panel", name: "effectiveness", title: "Effectiveness", elements: [
              { type: "rating", name: "objectivesMet", title: "Objectives met" },
            ] },
            { type: "text", name: "trainer", title: "Trainer" },
          ] },
        ],
      }],
    }, {
      courseTitle: "Forklift safety",
      objectivesMet: 4,
      trainer: "Lim",
    }, {
      includeAdditionalFields: false,
    });

    expect(sections.map((section) => [section.title, section.fields.map((field) => field.key)])).toEqual([
      ["Training", ["courseTitle"]],
      ["Effectiveness", ["objectivesMet"]],
      ["", ["trainer"]],
    ]);
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
  });

  it("uses Main Page instead of default SurveyJS page names", () => {
    const sections = buildFormSubmissionSections({
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "overallRating", title: "Overall Rating" },
        ],
      }],
    }, {
      overallRating: "Excellent",
    }, {
      fallbackSectionTitle: "Main Page",
      includeAdditionalFields: false,
    });

    expect(sections[0]?.title).toBe("Main Page");
  });

  it("recognizes SharePoint Teams signature image URLs with description suffixes", () => {
    const url = "https://contoso.sharepoint.com/teams/hr/Signature%20Images/submission-123.png, Signature";

    expect(generateFormPdfTest.imageSourceFromString(url, "https://contoso.sharepoint.com/teams/hr"))
      .toBe("https://contoso.sharepoint.com/teams/hr/Signature%20Images/submission-123.png");
    expect(generateFormPdfTest.sharePointServerRelativePath("/teams/hr/Signature%20Images/submission-123.png, Signature"))
      .toBe("/teams/hr/Signature Images/submission-123.png");
  });
});
