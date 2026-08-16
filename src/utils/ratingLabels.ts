/**
 * The word an author attached to the rating step someone chose.
 *
 * A rating submits a number, because the SharePoint column behind it is a Number
 * field — but a bare `3` is a scale nobody can read back. What "3" meant lives
 * in SurveyJS's `rateValues`, the same list the form drew its buttons from, so
 * every surface that shows an answer back (the dashboard, the evaluation
 * summary, the PDF) resolves it the same way rather than each inventing a
 * mapping of its own.
 *
 * Values are compared as text: a rating read back from SharePoint can arrive as
 * `"3"` while the published step is `3`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ratingStepLabel(rateValues: unknown, value: unknown): string {
  if (!Array.isArray(rateValues) || value === null || value === undefined || value === "") return "";
  for (const step of rateValues) {
    if (!isRecord(step)) continue;
    const stepValue = step.value ?? step.text;
    if (stepValue === null || stepValue === undefined) continue;
    if (String(stepValue) !== String(value)) continue;
    const text = String(step.text ?? "");
    // A step labelled with its own number carries no word worth repeating.
    return text && text !== String(stepValue) ? text : "";
  }
  return "";
}
