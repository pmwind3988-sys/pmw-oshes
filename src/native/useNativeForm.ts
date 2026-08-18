/**
 * The engine's runtime: answers, conditional visibility, formulas, validation
 * and page state, in one hook.
 *
 * The whole form is one `values` object and one render. There is no per-question
 * model object, no event bus, and nothing to dispose — which is what makes
 * conditional visibility trivial here: a rule is just a function of `values`,
 * recomputed on the same render that changed them.
 *
 * The two behaviours worth stating because they are not obvious:
 *
 * - **Hidden answers are dropped on collect, not on hide.** Someone who fills a
 *   branch, switches away and switches back finds their answers still there,
 *   but a branch that is hidden when they submit contributes nothing. This is
 *   what SurveyJS's default `clearInvisibleValues: "onComplete"` does, and
 *   submitted data has to keep matching it — the SharePoint column mapping
 *   rejects a payload carrying a key it has no column for.
 *
 * - **Validation only applies to what is on screen.** A required question
 *   inside a hidden branch cannot block submission, or a conditional form
 *   becomes unsubmittable for the people the condition excludes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeElement, NativeForm, NativePage } from "./schema";
import { evaluateCondition, evaluateFormula, referencedFields, type ValueBag } from "./expression";

export interface FieldState {
  visible: boolean;
  enabled: boolean;
}

export interface NativeFormRuntime {
  form: NativeForm;
  values: ValueBag;
  errors: Record<string, string>;

  setValue: (name: string, value: unknown) => void;
  getValue: (name: string) => unknown;
  /** Replace every answer at once — used to seed prefilled links. */
  reset: (next?: ValueBag) => void;

  stateOf: (element: NativeElement) => FieldState;

  page: NativePage;
  pageIndex: number;
  pageCount: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  goToPage: (index: number) => void;
  /** Validates the current page before advancing; returns whether it moved. */
  nextPage: () => boolean;
  prevPage: () => boolean;

  answered: number;
  required: number;
  /** 0–1, over required questions currently on screen. */
  progress: number;

  /** Validate everything visible. Populates `errors` and returns the first. */
  validateAll: () => { ok: boolean; firstErrorName: string };
  /** Visible answers only, shaped exactly as the SurveyJS renderer produced. */
  collect: () => ValueBag;
  clearError: (name: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** Seed defaults so a form opens showing what the author set, not blanks. */
function initialValues(form: NativeForm): ValueBag {
  const values: ValueBag = {};
  for (const q of form.questions) {
    // `today()` / `now()` come from the builder's dynamic-default markers,
    // which `buildSurveyJson` rewrites into `defaultValueExpression` on publish.
    const expr = q.defaultValueExpression.trim().toLowerCase();
    if (expr === "today()" || q.defaultValue === "__today__") {
      values[q.name] = new Date().toISOString().slice(0, 10);
      continue;
    }
    if (expr === "now()" || q.defaultValue === "__now__") {
      values[q.name] = new Date().toISOString().slice(0, 16);
      continue;
    }
    if (q.defaultValue !== undefined && q.defaultValue !== null && q.defaultValue !== "") {
      values[q.name] = q.defaultValue;
    }
  }
  return values;
}

/**
 * Answers to open the form with.
 *
 * A function is resolved at the moment it is needed rather than on the render
 * that supplied it, which is what lets a caller seed from a mutable store — the
 * builder's preview carries answers across a rebuilt form that way — without
 * reading that store during render, where a concurrent re-render could hand the
 * hook a value that is already stale.
 */
export type Seed = ValueBag | (() => ValueBag);

const resolveSeed = (seed?: Seed): ValueBag => (typeof seed === "function" ? seed() : (seed ?? {}));

export interface NativeFormOptions {
  /**
   * Show the answers without letting anyone change them.
   *
   * Applied where a question's `enabled` is decided, so it reaches every
   * control — including the ones inside tables and repeaters — rather than
   * each renderer having to remember to honour it.
   */
  readOnly?: boolean;
}

/**
 * How much of the rulebook a check applies.
 *
 * "full" is submission: everything runs. "live" runs on each keystroke and
 * reports only the rules a half-finished answer cannot legitimately fail — a
 * value over its maximum, or past its character or selection limit, is already
 * wrong and will still be wrong once the typing stops.
 *
 * Everything else waits. "Required", the minimums and the format rules share
 * one problem live: `4` on its way to `40` is under a minimum of 10, and `a@b`
 * on its way to an address is not yet an address. Reporting those per keystroke
 * means telling someone they are wrong for not having finished.
 */
export type CheckStage = "live" | "full";

/** One answer's error message, or "" when it passes. */
export function checkAnswer(q: NativeElement, value: unknown, stage: CheckStage = "full"): string {
  const full = stage === "full";

  if (q.required && isBlank(value)) {
    return full ? q.requiredMessage || "This field is required." : "";
  }
  if (isBlank(value)) return "";

  if (typeof value === "string") {
    if (q.maxLength > 0 && value.length > q.maxLength) {
      return `Use at most ${q.maxLength} characters.`;
    }
    if (full && q.inputType === "email" && !EMAIL_RE.test(value.trim())) {
      return "Enter a valid email address.";
    }
    if (full && q.inputType === "url" && !URL_RE.test(value.trim())) {
      return "Enter a valid link.";
    }
  }

  // Both date bounds report live. A date input hands over a whole date or
  // nothing at all — there is no half-typed date to be unfair to — so the
  // reason minimums wait elsewhere does not apply here.
  if ((q.minDate || q.maxDate) && (q.inputType === "date" || q.inputType === "datetime-local")) {
    // A `datetime-local` answer carries a time the bound does not, so the
    // comparison is on the date halves alone.
    const day = String(value).slice(0, 10);
    if (day.length === 10) {
      if (q.minDate && day < q.minDate) return `Choose ${q.minDate} or later.`;
      if (q.maxDate && day > q.maxDate) return `Choose ${q.maxDate} or earlier.`;
    }
  }

  if (q.inputType === "number" || q.kind === "slider") {
    const n = Number(value);
    if (!Number.isFinite(n)) return full ? "Enter a number." : "";
    if (full && q.min !== undefined && n < q.min) return `Enter ${q.min} or more.`;
    if (q.max !== undefined && n > q.max) return `Enter ${q.max} or less.`;
  }

  if (q.kind === "multi-choice" && Array.isArray(value)) {
    if (q.maxSelections > 0 && value.length > q.maxSelections) {
      return `Select at most ${q.maxSelections}.`;
    }
  }

  for (const v of q.validators) {
    const text = v.text || "";
    if (full && v.type === "regex" && v.regex) {
      try {
        if (!new RegExp(v.regex).test(String(value))) return text || "This entry is not in the expected format.";
      } catch {
        // An unparseable pattern is an authoring bug, not a respondent error —
        // never block a submission on it.
      }
    }
    if (full && v.type === "email" && !EMAIL_RE.test(String(value).trim())) {
      return text || "Enter a valid email address.";
    }
    if (v.type === "numeric") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        if (full) return text || "Enter a number.";
      } else {
        if (full && v.minValue !== undefined && n < v.minValue) return text || `Enter ${v.minValue} or more.`;
        if (v.maxValue !== undefined && n > v.maxValue) return text || `Enter ${v.maxValue} or less.`;
      }
    }
    if (v.type === "text") {
      const s = String(value);
      if (full && v.minLength !== undefined && s.length < v.minLength) {
        return text || `Enter at least ${v.minLength} characters.`;
      }
      if (v.maxLength !== undefined && s.length > v.maxLength) {
        return text || `Use at most ${v.maxLength} characters.`;
      }
    }
  }

  return "";
}

export function useNativeForm(form: NativeForm, seed?: Seed, options: NativeFormOptions = {}): NativeFormRuntime {
  const [values, setValues] = useState<ValueBag>(() => ({ ...initialValues(form), ...resolveSeed(seed) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pageIndex, setPageIndex] = useState(0);

  // Reseeding on identity rather than on the object lets a caller pass a fresh
  // `seed` literal every render without wiping what the respondent has typed.
  const formRef = useRef(form);
  useEffect(() => {
    if (formRef.current === form) return;
    formRef.current = form;
    setValues({ ...initialValues(form), ...resolveSeed(seed) });
    setErrors({});
    setPageIndex(0);
  }, [form, seed]);

  /**
   * Visibility for every element, resolved top-down so a hidden section takes
   * its children with it. Computed once per render rather than per element,
   * because a `visibleIf` referencing a field two sections away would otherwise
   * be evaluated once for each question that shares the condition.
   */
  const readOnlyForm = options.readOnly === true;
  const states = useMemo(() => {
    const map = new Map<string, FieldState>();

    const walk = (elements: NativeElement[], parentVisible: boolean, parentEnabled: boolean) => {
      for (const el of elements) {
        const ownVisible = el.visibleIf ? evaluateCondition(el.visibleIf, values) !== false : true;
        const ownEnabled = el.enableIf ? evaluateCondition(el.enableIf, values) !== false : true;
        const state: FieldState = {
          visible: parentVisible && ownVisible,
          enabled: parentEnabled && ownEnabled && !el.readOnly && !readOnlyForm,
        };
        map.set(el.id, state);
        if (el.elements.length > 0 && el.kind === "section") {
          walk(el.elements, state.visible, state.enabled);
        }
      }
    };

    for (const page of form.pages) walk(page.elements, true, true);
    return map;
  }, [form, values, readOnlyForm]);

  const stateOf = useCallback(
    (element: NativeElement): FieldState =>
      states.get(element.id) ?? { visible: true, enabled: !element.readOnly && !readOnlyForm },
    [states, readOnlyForm],
  );

  /**
   * Formula fields, recomputed from `values` on every render.
   *
   * They are derived rather than stored so a formula can never disagree with
   * its inputs — the SurveyJS path wrote results back into the survey on a
   * `setTimeout` after each change, which meant a submission fired in the same
   * tick could carry a stale total. `collect` folds these in at the end.
   */
  const computed = useMemo(() => {
    const out: Record<string, number> = {};
    // Two passes so a formula referring to another formula resolves, which is
    // how "subtotal → grand total" pairs are authored. Deeper chains than that
    // do not appear in any published form, and an unbounded fixpoint loop is
    // not worth the risk of a cycle.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const q of form.questions) {
        if (q.kind !== "readout" || !q.expression) continue;
        const result = evaluateFormula(q.expression, { ...values, ...out });
        if (result !== undefined) out[q.name] = result;
      }
    }
    return out;
  }, [form, values]);

  const merged = useMemo(() => ({ ...values, ...computed }), [values, computed]);

  const checkOne = useCallback(
    (q: NativeElement, bag: ValueBag, stage: CheckStage = "full"): string => checkAnswer(q, bag[q.name], stage),
    [],
  );

  const setValue = useCallback(
    (name: string, value: unknown) => {
      if (!name) return;
      setValues((prev) => (Object.is(prev[name], value) ? prev : { ...prev, [name]: value }));
      setErrors((prev) => {
        const question = form.byName.get(name);
        // A question already showing an error re-runs the whole rulebook on
        // every keystroke, so its message tracks what is in the box rather than
        // vanishing at the first character and returning at submit. A clean one
        // gets the live rules only.
        const stage = name in prev ? "full" : "live";
        const message = question ? checkOne(question, { [name]: value }, stage) : "";
        if (message === (prev[name] ?? "")) return prev;
        const next = { ...prev };
        if (message) next[name] = message;
        else delete next[name];
        return next;
      });
    },
    [form, checkOne],
  );

  const getValue = useCallback((name: string) => merged[name], [merged]);

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback((next?: ValueBag) => {
    setValues({ ...initialValues(formRef.current), ...next });
    setErrors({});
    setPageIndex(0);
  }, []);

  /** Questions the respondent can currently see and act on, in page order. */
  const liveQuestions = useMemo(() => {
    const out: { page: number; question: NativeElement }[] = [];
    const walk = (elements: NativeElement[], pageNo: number) => {
      for (const el of elements) {
        if (!stateOf(el).visible) continue;
        if (el.kind === "section") {
          walk(el.elements, pageNo);
          continue;
        }
        if (el.name && el.kind !== "static") out.push({ page: pageNo, question: el });
      }
    };
    form.pages.forEach((page, i) => walk(page.elements, i));
    return out;
  }, [form, stateOf]);

  const validate = useCallback(
    (onlyPage?: number): { ok: boolean; firstErrorName: string; found: Record<string, string> } => {
      const found: Record<string, string> = {};
      let firstErrorName = "";
      for (const { page, question } of liveQuestions) {
        if (onlyPage !== undefined && page !== onlyPage) continue;
        // A read-only readout has no input to correct, so an error on it would
        // be an accusation the respondent cannot answer.
        if (question.kind === "readout") continue;
        const message = checkOne(question, merged);
        if (!message) continue;
        found[question.name] = message;
        if (!firstErrorName) firstErrorName = question.name;
      }
      return { ok: firstErrorName === "", firstErrorName, found };
    },
    [liveQuestions, checkOne, merged],
  );

  const validateAll = useCallback(() => {
    const { ok, firstErrorName, found } = validate();
    setErrors(found);
    return { ok, firstErrorName };
  }, [validate]);

  const pageCount = form.pages.length;
  const safeIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const page = form.pages[safeIndex] ?? form.pages[0];

  const goToPage = useCallback(
    (index: number) => {
      setPageIndex(Math.max(0, Math.min(index, pageCount - 1)));
    },
    [pageCount],
  );

  const nextPage = useCallback(() => {
    const { ok, found } = validate(safeIndex);
    if (!ok) {
      setErrors((prev) => ({ ...prev, ...found }));
      return false;
    }
    if (safeIndex >= pageCount - 1) return false;
    setPageIndex(safeIndex + 1);
    return true;
  }, [validate, safeIndex, pageCount]);

  const prevPage = useCallback(() => {
    if (safeIndex === 0) return false;
    setPageIndex(safeIndex - 1);
    return true;
  }, [safeIndex]);

  const { answered, required } = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const { question } of liveQuestions) {
      if (!question.required) continue;
      total += 1;
      if (!isBlank(merged[question.name])) done += 1;
    }
    return { answered: done, required: total };
  }, [liveQuestions, merged]);

  const collect = useCallback((): ValueBag => {
    const visible = new Map(liveQuestions.map((entry) => [entry.question.name, entry.question]));
    const out: ValueBag = {};

    for (const [key, value] of Object.entries(merged)) {
      if (isBlank(value)) continue;
      // The `{name}-Comment` half of an "Other" answer has no question of its
      // own; it travels with the question it belongs to and is folded into it
      // downstream by `foldOtherAnswers`.
      const base = key.endsWith("-Comment") ? key.slice(0, -"-Comment".length) : key;
      const question = visible.get(base);
      if (!question) continue;

      // Numeric answers are held as strings while they are being typed — "12."
      // is a legal half-typed number and coercing on every keystroke would
      // delete the dot out from under the caret. They become numbers here, at
      // the edge, because the SharePoint column behind them is a Number field.
      if (key === base && (question.inputType === "number" || question.kind === "slider")) {
        const n = Number(value);
        out[key] = Number.isFinite(n) ? n : value;
        continue;
      }
      out[key] = value;
    }
    return out;
  }, [liveQuestions, merged]);

  return {
    form,
    values: merged,
    errors,
    setValue,
    getValue,
    reset,
    stateOf,
    page,
    pageIndex: safeIndex,
    pageCount,
    isFirstPage: safeIndex === 0,
    isLastPage: safeIndex === pageCount - 1,
    goToPage,
    nextPage,
    prevPage,
    answered,
    required,
    progress: required === 0 ? 1 : answered / required,
    validateAll,
    collect,
    clearError,
  };
}

/** Fields whose value changing should re-run a rule — used by tests and tools. */
export const conditionDependencies = referencedFields;
