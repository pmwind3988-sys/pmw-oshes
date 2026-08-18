/**
 * pdfChoiceMatching.ts — reading a ticked question back off a stored answer.
 *
 * A tick is the answer stored in more shapes than any other. The same three
 * boxes reach the printed page as an array of labels, as an array of option
 * *values* that look nothing like the labels, as SharePoint's `;#`-joined
 * multi-value string, inside a `{ results: [...] }` envelope, as a map of every
 * option to true/false, or as a run of `item1`/`item2` placeholders that get
 * generated when the author only ever typed the display text. All of them are
 * the same claim about the same boxes, so all of them are read the same way
 * here — and the comparison is made on a schema-normalised spelling, because an
 * answer stored as `Working_x0020_at_x0020_height` and an option labelled
 * "Working at height" are not two different answers.
 *
 * What still cannot be resolved is counted rather than dropped: a record that
 * quietly prints an empty box for a tick somebody made is worse than one that
 * says it could not read the tick.
 */

import { isRecord, parseMaybeJson } from "./pdfImageSources";

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface TickedOption extends ChoiceOption {
  ticked: boolean;
}

export interface TickReading {
  options: TickedOption[];
  /** Answers naming something the option list does not have. */
  extras: string[];
  /** Entries that were stored and carried nothing readable at all. */
  unresolved: number;
}

/** The field facts this module needs; a subset of `FormSubmissionField`. */
export interface ChoiceField {
  type: string;
  choices?: unknown[];
  labelTrue?: string;
  labelFalse?: string;
  value: unknown;
}

const CHOICE_TYPES = new Set([
  "boolean",
  "consent",
  "dropdown",
  "radiogroup",
  "checkbox",
  "tagbox",
  "buttongroup",
  "multiselect",
  "checkboxgroup",
]);

const MULTI_CHOICE_TYPES = new Set(["checkbox", "tagbox", "multiselect", "checkboxgroup"]);

/** The property names an option object hides its stored value behind. */
const VALUE_KEYS = ["value", "Value", "itemValue", "id", "Id", "ID", "key", "Key", "code", "Code", "name", "Name"];
/** …and the ones it hides its human label behind. */
const LABEL_KEYS = [
  "text", "Text", "title", "Title", "label", "Label", "caption", "Caption",
  "description", "Description", "displayName", "DisplayName", "LookupValue", "lookupValue",
];

function optionText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** SharePoint writes every character its column names cannot hold as `_xHHHH_`. */
export function decodeSchemaEscapes(value: string): string {
  return value.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Comparable form of one answer or one option: case and spacing carry no meaning. */
export function matchKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Comparable form of a spelling that may have been through a data schema.
 *
 * `Working_x0020_at_x0020_height`, `workingAtHeight`, `working-at-height` and
 * "Working at height" all reduce to `workingatheight`, which is what lets a
 * value written for a column be matched against the label an author typed.
 */
export function schemaKey(value: string): string {
  return decodeSchemaEscapes(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * A label fit to print, for a choice whose text never left the data schema.
 *
 * Applied narrowly on purpose: a label carrying a hex escape, or one that is a
 * bare identifier with no spaces in it, was written for a machine. Anything
 * else — including "Full-body harness" and "SWP/Job Instruction" — is what the
 * author typed, and is printed exactly as typed.
 */
export function humanizeChoiceLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const hasEscape = /_x[0-9a-fA-F]{4}_/.test(trimmed);
  const isBareIdentifier = !/\s/.test(trimmed)
    && /^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)
    && /(_|[a-z][A-Z])/.test(trimmed);
  if (!hasEscape && !isBareIdentifier) return trimmed;

  const decoded = decodeSchemaEscapes(trimmed)
    .replace(/_+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return trimmed;
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

function choiceOption(choice: unknown): ChoiceOption | null {
  if (typeof choice === "string" || typeof choice === "number" || typeof choice === "boolean") {
    const value = String(choice).trim();
    return value ? { value, label: humanizeChoiceLabel(value) } : null;
  }
  if (!isRecord(choice)) return null;
  const value = VALUE_KEYS.map((key) => optionText(choice[key])).find((text) => text !== "") ?? "";
  const label = LABEL_KEYS.map((key) => optionText(choice[key])).find((text) => text !== "") ?? "";
  if (!value && !label) return null;
  return { value: value || label, label: humanizeChoiceLabel(label || value) };
}

export function choiceOptionsForField(field: ChoiceField): ChoiceOption[] {
  const type = field.type.toLowerCase();
  if ((type === "boolean" || type === "consent") && !field.choices?.length) {
    return [
      { value: "true", label: field.labelTrue || "Yes" },
      { value: "false", label: field.labelFalse || "No" },
    ];
  }
  return (field.choices ?? []).map(choiceOption).filter((option): option is ChoiceOption => option !== null);
}

/** Whether a map's values read as "ticked / not ticked" rather than as data. */
function isSelectionFlag(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return value === 0 || value === 1;
  if (typeof value !== "string") return false;
  return ["true", "false", "yes", "no", "1", "0", "on", "off", "checked", "unchecked", ""]
    .includes(value.trim().toLowerCase());
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return ["true", "yes", "1", "on", "checked"].includes(value.trim().toLowerCase());
}

/**
 * One stored answer, split into the individual ticks inside it.
 *
 * Unwrapping is recursive so a `{ results: ["a;#b"] }` — an envelope around a
 * delimited string, which is a real shape SharePoint returns — comes apart the
 * whole way rather than one layer deep. An entry that survives as an empty
 * string is kept: three blank entries are three ticks whose labels did not
 * survive submission, which is a different thing from an untouched question.
 */
function entriesOf(value: unknown): unknown[] {
  if (value === null || value === undefined) return [""];
  if (Array.isArray(value)) return value.flatMap(entriesOf);

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = trimmed ? parseMaybeJson(trimmed) : null;
    if (parsed !== null) return entriesOf(parsed);
    // ";#" is SharePoint's multi-value separator; a single value carries none.
    if (trimmed.includes(";#")) return trimmed.split(";#").filter((part) => part.trim() !== "");
    return [trimmed];
  }

  if (!isRecord(value)) return [value];

  // `{ results: [...] }` is how a MultiChoice column arrives under verbose OData.
  if (Array.isArray(value.results)) return entriesOf(value.results);

  const carriesOwnLabel = [...VALUE_KEYS, ...LABEL_KEYS].some((key) => optionText(value[key]) !== "");
  if (carriesOwnLabel) return [value];

  // A map of every option to whether it was ticked. The ticks are its keys.
  const pairs = Object.entries(value);
  if (pairs.length > 0 && pairs.every(([, flag]) => isSelectionFlag(flag))) {
    return pairs.filter(([, flag]) => isTruthyFlag(flag)).map(([key]) => key);
  }

  return [value];
}

export function answerEntries(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" && value.trim() === "") return [];
  return entriesOf(value);
}

/** Every spelling one entry offers, best first. */
function entrySpellings(entry: unknown): string[] {
  if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
    const text = optionText(entry);
    return text ? [text] : [];
  }
  if (!isRecord(entry)) return [];

  const named = [...LABEL_KEYS, ...VALUE_KEYS]
    .map((key) => optionText(entry[key]))
    .filter((text) => text !== "");
  if (named.length > 0) return named;

  // An unrecognised object still names something: a key it flagged true, or a
  // string it holds. Both are only ever compared against the option list.
  const salvaged: string[] = [];
  for (const [key, flag] of Object.entries(entry)) {
    if (isTruthyFlag(flag)) salvaged.push(key);
  }
  for (const nested of Object.values(entry)) {
    const text = optionText(nested);
    if (text) salvaged.push(text);
  }
  return salvaged;
}

/** `item3`, and a bare `3`: a generated option value, and a stored index. */
function positionalIndex(text: string, optionCount: number, allowBareNumber: boolean): number | null {
  const generated = text.trim().match(/^item[\s_-]*(\d+)$/i);
  if (generated) {
    const index = Number(generated[1]) - 1;
    return index >= 0 && index < optionCount ? index : null;
  }
  if (!allowBareNumber || !/^\d+$/.test(text.trim())) return null;
  const oneBased = Number(text.trim()) - 1;
  if (oneBased >= 0 && oneBased < optionCount) return oneBased;
  const zeroBased = Number(text.trim());
  return zeroBased >= 0 && zeroBased < optionCount ? zeroBased : null;
}

/** The two words a yes/no question is stored as when it is not stored as a flag. */
function spokenBooleanIndex(spelling: string): number | null {
  const spoken = matchKey(spelling);
  if (["yes", "checked", "on", "y"].includes(spoken)) return 0;
  if (["no", "unchecked", "off", "n"].includes(spoken)) return 1;
  return null;
}

/**
 * Which options an answer ticked, plus anything it said that no option covers.
 *
 * Matching runs widest-net-last: an exact spelling first, then the same
 * spelling with its schema stripped, then a position — so a genuinely numeric
 * option list is never quietly re-read as a set of indices.
 */
export function readTicks(field: ChoiceField): TickReading {
  const options = choiceOptionsForField(field);
  const entries = answerEntries(field.value);
  const type = field.type.toLowerCase();
  const isBoolean = type === "boolean" || type === "consent";

  const ticked = new Set<number>();
  const extras: string[] = [];
  let unresolved = 0;

  // `[true, false, true]` alongside three boxes is the boxes themselves.
  if (entries.length > 0 && entries.length === options.length && entries.every((entry) => typeof entry === "boolean")) {
    entries.forEach((entry, index) => { if (entry === true) ticked.add(index); });
    return { options: options.map((option, index) => ({ ...option, ticked: ticked.has(index) })), extras: [], unresolved: 0 };
  }

  const exact = new Map<string, number>();
  const loose = new Map<string, number>();
  const numericOptions = options.some((option) => /^\d+$/.test(option.value.trim()));
  options.forEach((option, index) => {
    for (const spelling of [option.value, option.label]) {
      if (!exact.has(matchKey(spelling))) exact.set(matchKey(spelling), index);
      const relaxed = schemaKey(spelling);
      if (relaxed && !loose.has(relaxed)) loose.set(relaxed, index);
    }
  });

  const resolve = (spelling: string): number | null =>
    exact.get(matchKey(spelling))
    ?? loose.get(schemaKey(spelling))
    ?? positionalIndex(spelling, options.length, !numericOptions)
    ?? (isBoolean ? spokenBooleanIndex(spelling) : null);

  for (const entry of entries) {
    const spellings = entrySpellings(entry);
    const hit = spellings.map(resolve).find((index) => index !== null);
    if (hit !== null && hit !== undefined) {
      ticked.add(hit);
      continue;
    }
    // Nothing on the list, but the answer still said something: a fill-in
    // choice, or a list edited after the form was filed.
    if (spellings[0]) extras.push(spellings[0]);
    else unresolved += 1;
  }

  return {
    options: options.map((option, index) => ({ ...option, ticked: ticked.has(index) })),
    extras,
    unresolved,
  };
}

/**
 * Whether this question is printed as its list of boxes rather than a sentence.
 *
 * A "(TICK)" panel on a permit is a column of boxes on the paper form it
 * replaces, and it has to stay one on the printed record: a reader checking a
 * permit needs to see the controls that were *not* taken as much as the ones
 * that were. A single-answer question stays a sentence — one tick among two
 * reads worse than the word "Yes" — and so does a very long option list, where
 * forty empty boxes would bury the answer instead of showing it.
 */
export function shouldListChoices(field: ChoiceField): boolean {
  const type = field.type.toLowerCase();
  const options = choiceOptionsForField(field);
  if (options.length === 0 || options.length > 24) return false;
  if (MULTI_CHOICE_TYPES.has(type)) return true;
  // Whatever the type is called, an answer holding several values is a tick list.
  return answerEntries(field.value).length > 1;
}

/** Whether the question offers a fixed list at all. */
export function isChoiceField(field: ChoiceField): boolean {
  const type = field.type.toLowerCase();
  return CHOICE_TYPES.has(type) || ((field.choices?.length ?? 0) > 0 && ["", "text"].includes(type));
}

export const __test__ = { entriesOf, entrySpellings, positionalIndex };
