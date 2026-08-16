/**
 * The SurveyJS expression subset that published forms actually contain.
 *
 * Two languages share one syntax here. `visibleIf` / `enableIf` are boolean
 * conditions (`{dept} = 'HR' and {years} > 3`); formula fields are arithmetic
 * (`{basic} + {allowance} * 0.1`). Both are evaluated without `new Function`,
 * because the published form runs under SharePoint's CSP, which blocks
 * `unsafe-eval` — the same constraint that produced `safeEvalArithmetic`, which
 * this reuses for the arithmetic half rather than growing a second parser.
 *
 * Anything outside the subset returns `undefined` from `evaluateCondition`, and
 * every caller treats that as "no condition" — an unparsed rule shows the field
 * rather than hiding a question the respondent was meant to answer.
 */

import { safeEvalArithmetic } from "../utils/FormBuilderEngine";

export type ValueBag = Record<string, unknown>;

/** `{field}` placeholders referenced by an expression, deduplicated. */
export function referencedFields(expression: string): string[] {
  const found = expression.match(/\{([^}]+)\}/g) ?? [];
  return [...new Set(found.map((ref) => ref.slice(1, -1).trim()))].filter(Boolean);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asComparable(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  return String(value);
}

/** Strip quotes from a literal, or read a `{field}` out of the value bag. */
function resolveOperand(token: string, values: ValueBag): unknown {
  const raw = token.trim();
  if (raw.startsWith("{") && raw.endsWith("}")) return values[raw.slice(1, -1).trim()];
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "undefined") return null;
  const asNumber = Number(raw);
  return raw !== "" && Number.isFinite(asNumber) ? asNumber : raw;
}

function looseEquals(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) return left.some((entry) => String(entry) === String(right));
  // Deliberately string-compares: a numeric SharePoint choice arrives as "3"
  // from a `<select>` and as 3 from a default value, and a rule written against
  // either one has to match both.
  return String(asComparable(left)) === String(asComparable(right));
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  switch (operator) {
    case "=":
    case "==":
      return looseEquals(left, right);
    case "<>":
    case "!=":
      return !looseEquals(left, right);
    case ">":
    case "<":
    case ">=":
    case "<=": {
      const a = Number(asComparable(left));
      const b = Number(asComparable(right));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (operator === ">") return a > b;
      if (operator === "<") return a < b;
      if (operator === ">=") return a >= b;
      return a <= b;
    }
    case "contains": {
      if (Array.isArray(left)) return left.some((entry) => String(entry) === String(right));
      return String(asComparable(left)).toLowerCase().includes(String(asComparable(right)).toLowerCase());
    }
    case "notcontains": {
      if (Array.isArray(left)) return !left.some((entry) => String(entry) === String(right));
      return !String(asComparable(left)).toLowerCase().includes(String(asComparable(right)).toLowerCase());
    }
    case "anyof": {
      const wanted = Array.isArray(right) ? right : [right];
      const held = Array.isArray(left) ? left : [left];
      return wanted.some((w) => held.some((h) => String(h) === String(w)));
    }
    case "allof": {
      const wanted = Array.isArray(right) ? right : [right];
      const held = Array.isArray(left) ? left : [left];
      return wanted.every((w) => held.some((h) => String(h) === String(w)));
    }
    default:
      return false;
  }
}

const BINARY_OPERATORS = [
  "notcontains",
  "contains",
  "anyof",
  "allof",
  ">=",
  "<=",
  "<>",
  "!=",
  "==",
  "=",
  ">",
  "<",
];

/** `{a} anyof ['x', 'y']` — the only list literal SurveyJS emits. */
function parseListLiteral(token: string, values: ValueBag): unknown {
  const raw = token.trim();
  if (!raw.startsWith("[") || !raw.endsWith("]")) return resolveOperand(raw, values);
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner, [","]).map((part) => resolveOperand(part, values));
}

/**
 * Split on the given separators, ignoring any that sit inside quotes or
 * brackets.
 *
 * The word separators are passed in already surrounded by spaces (`" and "`),
 * which is what keeps a field named `{brandName}` from being split on the `and`
 * inside it — no separate word-boundary check is needed.
 */
function splitTopLevel(input: string, separators: string[]): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    const sep = separators.find((s) => input.startsWith(s, i));
    if (!sep) continue;
    parts.push(input.slice(start, i));
    i += sep.length - 1;
    start = i + 1;
  }

  parts.push(input.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

function evaluateComparison(input: string, values: ValueBag): boolean | undefined {
  const expr = input.trim();
  if (!expr) return undefined;

  // Unary postfix forms: `{field} empty`, `{field} notempty`.
  const unary = expr.match(/^(.+?)\s+(notempty|empty)$/i);
  if (unary) {
    const value = resolveOperand(unary[1], values);
    return unary[2].toLowerCase() === "empty" ? isEmpty(value) : !isEmpty(value);
  }

  for (const operator of BINARY_OPERATORS) {
    const isWord = /[a-z]/i.test(operator);
    const pattern = isWord
      ? new RegExp(`^(.+?)\\s+${operator}\\s+(.+)$`, "i")
      : new RegExp(`^(.+?)\\s*${operator.replace(/[<>=!]/g, "\\$&")}\\s*(.+)$`);
    const match = expr.match(pattern);
    if (!match) continue;
    // `>=` must not be matched as `>` — BINARY_OPERATORS is ordered longest
    // first, so reaching a short operator means no longer one applied.
    const left = resolveOperand(match[1], values);
    const right = parseListLiteral(match[2], values);
    return compare(left, operator, right);
  }

  // A bare `{field}` is truthy-tested, which is how the builder writes a
  // "show when this checkbox is ticked" rule.
  const solo = resolveOperand(expr, values);
  if (typeof solo === "boolean") return solo;
  return !isEmpty(solo);
}

/**
 * Evaluate a `visibleIf` / `enableIf` condition.
 *
 * Returns `undefined` when the expression cannot be understood, so callers can
 * distinguish "this rule says hide" from "there is no usable rule here".
 */
export function evaluateCondition(expression: string, values: ValueBag): boolean | undefined {
  const expr = expression.trim();
  if (!expr) return undefined;

  try {
    // `or` binds loosest, so it is split first and `and` inside each branch.
    const orParts = splitTopLevel(expr, [" or ", " || "]);
    if (orParts.length > 1) {
      let known = false;
      let result = false;
      for (const part of orParts) {
        const value = evaluateCondition(part, values);
        if (value === undefined) continue;
        known = true;
        result = result || value;
      }
      return known ? result : undefined;
    }

    const andParts = splitTopLevel(expr, [" and ", " && "]);
    if (andParts.length > 1) {
      let known = false;
      let result = true;
      for (const part of andParts) {
        const value = evaluateCondition(part, values);
        if (value === undefined) continue;
        known = true;
        result = result && value;
      }
      return known ? result : undefined;
    }

    const negated = expr.match(/^not\s+(.+)$/i);
    if (negated) {
      const inner = evaluateCondition(negated[1], values);
      return inner === undefined ? undefined : !inner;
    }

    if (expr.startsWith("(") && expr.endsWith(")")) {
      const inner = evaluateCondition(expr.slice(1, -1), values);
      if (inner !== undefined) return inner;
    }

    return evaluateComparison(expr, values);
  } catch {
    return undefined;
  }
}

/**
 * Evaluate a formula field.
 *
 * Field references become their numeric value (a blank counts as 0, matching
 * what the SurveyJS renderer did, so a half-filled form shows a running total
 * rather than an error). Returns `undefined` when the result is not a finite
 * number, and the caller then leaves the previous value in place.
 */
export function evaluateFormula(expression: string, values: ValueBag): number | undefined {
  if (!expression.trim()) return undefined;

  // Published forms exist that were saved by an earlier builder whose operator
  // de-duplication was wrong, leaving `+ +` or `++` in the stored formula.
  let compiled = expression.replace(/([+\-*/])\s+([+\-*/])/g, "$1").replace(/([+\-*/])\1+/g, "$1");

  for (const ref of referencedFields(expression)) {
    const raw = values[ref];
    const numeric = Number(Array.isArray(raw) ? raw.length : raw);
    compiled = compiled.split(`{${ref}}`).join(String(Number.isFinite(numeric) ? numeric : 0));
  }

  try {
    const result = safeEvalArithmetic(compiled);
    return Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

/** Format a formula result for display, matching the published form's style. */
export function formatNumber(
  value: number,
  style: "decimal" | "currency" | "percent",
  decimals: number,
  currency: string,
): string {
  const fixed = value.toFixed(Math.max(0, Math.min(10, decimals)));
  if (style === "percent") return `${fixed}%`;
  if (style !== "currency") return fixed;
  // The SurveyJS renderer rewrote MYR to "RM" by hand; keeping that here means
  // a form's totals read the same in both engines.
  const symbol = currency === "MYR" ? "RM" : currency;
  return `${symbol} ${fixed}`;
}
