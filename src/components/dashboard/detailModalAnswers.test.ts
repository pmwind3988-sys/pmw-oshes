import { describe, expect, it } from "vitest";
import { buildAnswerClassifier, isGeneratedPdfColumn } from "./answerClassification";

/**
 * Which of a record's keys are answers, and which are the workflow's own marks.
 *
 * The modal used to decide by name alone: anything containing "signature" was
 * drawn as ink, and anything reading like a PDF was promoted to "the generated
 * submission PDF". Both guesses take a filled-in question out of the answers,
 * and the published form has already said what each question is.
 */

const surveyJson = {
  pages: [
    {
      name: "page1",
      elements: [
        { type: "signaturepad", name: "supervisorSignature", title: "Supervisor signature" },
        { type: "text", name: "signatureBriefingAttendedBy", title: "Signature briefing attended by" },
        { type: "file", name: "methodStatementPdfFile", title: "Method statement (PDF)" },
        { type: "text", name: "workPerformerName", title: "Name of work performer" },
      ],
    },
  ],
};

describe("classifying a record's keys", () => {
  const answers = buildAnswerClassifier(surveyJson);

  it("treats the question the form declared a signature as ink", () => {
    expect(answers.isSignature("supervisorSignature")).toBe(true);
  });

  it("leaves a question merely named after a signature as an answer", () => {
    expect(answers.isSignature("signatureBriefingAttendedBy")).toBe(false);
  });

  it("leaves a question about a PDF alone", () => {
    expect(answers.isSignature("methodStatementPdfFile")).toBe(false);
    expect(isGeneratedPdfColumn("methodStatementPdfFile")).toBe(false);
  });

  it("leaves the work performer's name alone", () => {
    expect(answers.isSignature("workPerformerName")).toBe(false);
    expect(isGeneratedPdfColumn("workPerformerName")).toBe(false);
  });

  it("reserves the generated-PDF slot for the column this app writes", () => {
    expect(isGeneratedPdfColumn("PdfUrl")).toBe(true);
    expect(isGeneratedPdfColumn("methodStatementPdfFile")).toBe(false);
  });

  it("still guesses by name for a record whose form schema could not be loaded", () => {
    const unschooled = buildAnswerClassifier(null);
    expect(unschooled.isSignature("supervisorSignature")).toBe(true);
  });
});
