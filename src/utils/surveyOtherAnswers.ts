/**
 * "Other — let me type my own" answers on dropdown / radio / checkbox questions.
 *
 * SurveyJS splits such an answer across two data keys: the question itself holds the
 * literal string `"other"`, and a companion `{name}-Comment` key holds what the
 * respondent actually typed. (survey-core 2.5 does this regardless of the survey's
 * `storeOthersAsComment` setting, so that property is not a way out.)
 *
 * Neither half survives a SharePoint write. `{name}-Comment` matches no provisioned
 * column, so column resolution rejects the whole submission, and the question column
 * would have stored the meaningless word "other" anyway.
 *
 * Folding rewrites the pair into the single free-text answer the respondent gave.
 * Reading it back needs no counterpart: SurveyJS treats a value that is absent from
 * `choices` as the "Other" answer whenever the question has "Other" enabled, and the
 * plain renderers (read-only preview, PDF) already print an unmatched value verbatim.
 */

const COMMENT_SUFFIX = "-Comment";
const OTHER_VALUE = "other";

/**
 * Fold "Other" answers into their question's value, in place.
 *
 * Comment keys left by `showCommentArea` — where the answer is a real choice
 * rather than "other" — are deliberately untouched, so an existing form that
 * pairs a note column with a question keeps behaving exactly as before.
 */
export function foldOtherAnswers(data: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(data)) {
    if (!key.endsWith(COMMENT_SUFFIX)) continue;

    const baseKey = key.slice(0, -COMMENT_SUFFIX.length);
    if (!baseKey || !(baseKey in data)) continue;

    const answer = data[baseKey];
    const rawComment = data[key];
    const typed = typeof rawComment === "string" ? rawComment.trim() : "";

    if (answer === OTHER_VALUE) {
      if (typed) data[baseKey] = typed;
      delete data[key];
    } else if (Array.isArray(answer) && answer.includes(OTHER_VALUE)) {
      if (typed) {
        data[baseKey] = answer.map((entry) => (entry === OTHER_VALUE ? typed : entry));
      }
      delete data[key];
    }
  }
  return data;
}
