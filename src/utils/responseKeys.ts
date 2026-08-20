/**
 * Reading a record's keys as the questions they were asked under, and back.
 *
 * A SharePoint list item comes back keyed by its columns' internal names, and
 * those are not always the question names the form was authored with. Three
 * things happen to a name on its way into a column, and a reader that matches
 * by string equality alone loses the answer to every one of them.
 *
 * Both directions are needed. A reader laying a record out walks the published
 * form and asks where each question's answer went; a reader sorting the stored
 * keys — which of them are signatures, which are answers — holds a key and asks
 * which question it came from.
 */

/**
 * SharePoint cuts a column's internal name down to 32 characters.
 *
 * A question named `workPerformerNameInternalExternal` is therefore stored as
 * `workPerformerNameInternalExterna`, and the answer to it goes unrecognised —
 * printed as a stray key nobody asked for rather than under the question that
 * asked it.
 */
const SP_INTERNAL_NAME_LIMIT = 32;

/**
 * How short a stored key may be and still be read as a shortened name.
 *
 * A name is only cut because it ran past the limit, so what is left sits at the
 * limit — give or take the trailing fragment the encoder dropped. Holding
 * candidates to that length is what keeps `workPerformerName` from being read
 * as the shortened form of `workPerformerNameInternalExternal`.
 */
const SHORTENED_KEY_MIN_LENGTH = 30;

/** `_x0020_` and friends: how SharePoint spells a character a name may not hold. */
export function decodeSharePointKey(key: string): string {
  return key.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/** A name reduced to what survives spelling, spacing and case. */
export function normalizeResponseKey(value: string): string {
  return decodeSharePointKey(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Long enough that SharePoint had to cut it. */
function canBeShortened(name: string): boolean {
  return decodeSharePointKey(name).length > SP_INTERNAL_NAME_LIMIT;
}

/** Close enough to the limit to be what was left of a longer name. */
function looksShortened(key: string): boolean {
  return decodeSharePointKey(key).length >= SHORTENED_KEY_MIN_LENGTH;
}

export type ResponseKeyResolver = (name: string) => string | undefined;

/**
 * Resolve a question name to the key its answer is stored under.
 *
 * Tried in order: the name itself; the name normalized, which absorbs the
 * `_x0020_` spelling and any difference of case or punctuation; and finally the
 * longest stored key the name begins with, which is the name as SharePoint
 * shortened it. Longest wins so that a form asking both a long question and the
 * shorter one its name starts with reads each under its own key.
 */
export function createResponseKeyResolver(responseData: Record<string, unknown> | null | undefined): ResponseKeyResolver {
  const data = responseData ?? {};
  const byNormalizedName = new Map<string, string>();
  const shortenedCandidates: { normalized: string; key: string }[] = [];

  for (const key of Object.keys(data)) {
    const normalized = normalizeResponseKey(key);
    if (!normalized) continue;
    if (!byNormalizedName.has(normalized)) byNormalizedName.set(normalized, key);
    if (looksShortened(key)) shortenedCandidates.push({ normalized, key });
  }
  // Longest first, so the first prefix found is the closest fit.
  shortenedCandidates.sort((a, b) => b.normalized.length - a.normalized.length);

  return (name: string) => {
    if (!name) return undefined;
    if (Object.prototype.hasOwnProperty.call(data, name)) return name;

    const normalized = normalizeResponseKey(name);
    if (!normalized) return undefined;
    const exact = byNormalizedName.get(normalized);
    if (exact) return exact;

    if (!canBeShortened(name)) return undefined;
    return shortenedCandidates.find(
      (candidate) => candidate.normalized.length < normalized.length && normalized.startsWith(candidate.normalized),
    )?.key;
  };
}

export type QuestionNameResolver = (storedKey: string) => string | undefined;

/**
 * The other direction: which authored question a stored key came from.
 *
 * A reader holding a record's keys — sorting the signatures from the answers,
 * say — has to get back to what the form called each one, because the form is
 * what says whether a key is ink or text. Matching by string equality alone
 * leaves a long-named question unaccounted for, and a key no question accounts
 * for is then identified by what it happens to be called: a text question named
 * `contractorSignatureConfirmationName` read as a signature and drawn as a
 * picture that will never load.
 *
 * The shortest matching name wins, which is the closest fit — the mirror of the
 * longest stored key winning in {@link createResponseKeyResolver}.
 */
export function createQuestionNameResolver(names: Iterable<string>): QuestionNameResolver {
  const authored = new Set<string>();
  const byNormalizedName = new Map<string, string>();
  const shortenable: { normalized: string; name: string }[] = [];

  for (const name of names) {
    if (!name) continue;
    authored.add(name);
    const normalized = normalizeResponseKey(name);
    if (!normalized) continue;
    if (!byNormalizedName.has(normalized)) byNormalizedName.set(normalized, name);
    if (canBeShortened(name)) shortenable.push({ normalized, name });
  }
  // Shortest first, so the first name found is the closest fit.
  shortenable.sort((a, b) => a.normalized.length - b.normalized.length);

  return (storedKey: string) => {
    if (!storedKey) return undefined;
    if (authored.has(storedKey)) return storedKey;

    const normalized = normalizeResponseKey(storedKey);
    if (!normalized) return undefined;
    const exact = byNormalizedName.get(normalized);
    if (exact) return exact;

    if (!looksShortened(storedKey)) return undefined;
    return shortenable.find(
      (candidate) => normalized.length < candidate.normalized.length && candidate.normalized.startsWith(normalized),
    )?.name;
  };
}
