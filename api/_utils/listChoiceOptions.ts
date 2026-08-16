/**
 * listChoiceOptions.ts — turning SharePoint list rows into dropdown choices.
 *
 * A question sourced from a list can show one column and store another: the
 * person picks "Ali bin Ahmad", the form stores `ali@pmw-group.com`. That
 * matters wherever an answer is used as a key rather than read by a human —
 * approval routing looks a submitter up by exact email, and no amount of
 * careful matching rescues a name somebody typed as "ali" or "Ahmad, Ali".
 * Removing the typing removes the problem.
 *
 * **A source with no label column behaves exactly as it always did**, down to
 * the ordering: plain strings, de-duplicated, default sort. Every form
 * published before this existed goes through that path untouched.
 *
 * `src/utils/listChoiceOptions.ts` is the browser copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */

/** What SurveyJS accepts in `choices`: a bare value, or a value with a label. */
export type ListChoiceOption = string | { value: string; text: string };

export interface ListChoiceRow {
  value: unknown;
  /** The display column's cell, when the source names one. */
  label?: unknown;
}

/**
 * Reads a cell the way the previous flat-list code did: anything non-null and
 * non-empty becomes its string form, untrimmed, so existing choice lists sort
 * and match byte-for-byte as before.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/**
 * Builds the choice list for one question.
 *
 * Rows arrive in list order and are de-duplicated by *value*, first occurrence
 * winning, so a label typed twice against the same value cannot make the same
 * person appear twice in the dropdown.
 */
export function toListChoiceOptions(rows: ListChoiceRow[]): ListChoiceOption[] {
  const byValue = new Map<string, string>();

  for (const row of rows) {
    const value = cellText(row.value);
    if (!value || byValue.has(value)) continue;
    byValue.set(value, cellText(row.label));
  }

  // No label anywhere means no display column was configured, or the column is
  // empty for every row. Either way there is nothing to show but the values,
  // and this is the path every pre-existing form takes.
  const hasLabels = [...byValue.values()].some((label) => label !== "");
  if (!hasLabels) {
    return [...byValue.keys()].sort();
  }

  return [...byValue.entries()]
    // A row missing its label falls back to the value rather than rendering as
    // a blank line the person cannot identify.
    .map(([value, label]) => ({ value, text: label || value }))
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

/**
 * The stored values behind a choice list.
 *
 * Needed where the choices define a SharePoint column's allowed values: that
 * column holds what a submission stores, so it must be given values and never
 * the labels shown beside them.
 */
export function listChoiceValues(options: ListChoiceOption[]): string[] {
  return options.map((option) => (typeof option === "string" ? option : option.value));
}
