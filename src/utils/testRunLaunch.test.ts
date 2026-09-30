import { describe, expect, it } from "vitest";
import { sampleAnswersFor } from "./testRunLaunch";

describe("sampleAnswersFor — typed text inputs", () => {
  const survey = (inputType: string) => ({
    pages: [{ elements: [{ type: "text", name: "q", inputType }] }],
  });

  /**
   * The bug this covers: a Date & Time question was handed the sentence
   * "Test answer — q", and SharePoint rejected the whole submission with
   * "Cannot convert a primitive value to the expected type 'Edm.DateTime'".
   * To the tester that reads as a broken form rather than a broken rehearsal.
   */
  it("gives a datetime-local question a parseable timestamp", () => {
    const value = sampleAnswersFor(survey("datetime-local")).q;
    expect(typeof value).toBe("string");
    expect(Number.isNaN(Date.parse(String(value)))).toBe(false);
  });

  it("gives a time question HH:MM", () => {
    expect(String(sampleAnswersFor(survey("time")).q)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("gives a month question YYYY-MM", () => {
    expect(String(sampleAnswersFor(survey("month")).q)).toMatch(/^\d{4}-\d{2}$/);
  });

  it("gives a week question YYYY-Www", () => {
    expect(String(sampleAnswersFor(survey("week")).q)).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("gives a colour question a hex value", () => {
    expect(String(sampleAnswersFor(survey("color")).q)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("still keeps numbers numeric and dates as dates", () => {
    expect(sampleAnswersFor(survey("number")).q).toBe(1);
    expect(String(sampleAnswersFor(survey("date")).q)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /** A genuinely textual input keeps the recognisably-fake sentence. */
  it("leaves an ordinary text question as a sentence", () => {
    expect(sampleAnswersFor(survey("")).q).toBe("Test answer — q");
  });
});
