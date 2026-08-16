/**
 * The renderer.
 *
 * Layout is decided in exactly two places, which is the point:
 *
 * - `toRows` turns a flat element list into rows, honouring the
 *   `startWithNewLine: false` flag published forms already carry. Fields in a
 *   row split it evenly and drop to full width under 220px, so a two-up pair
 *   authored on a desktop stacks on a phone without the author doing anything.
 * - `FieldBlock` owns the label / hint / control / error stack. Every question
 *   goes through it, so nothing can grow its own label style, and a control
 *   never has to know whether it is required or in an error state beyond the
 *   one `invalid` flag it is handed.
 *
 * Sections are the visible unit. A form with no panels still gets one, because
 * a bare list of forty fields on a white page is the thing that reads as
 * unfinished — the card, its number and its title are what turn it into a
 * document.
 */

import { useEffect, useId, useMemo, useState } from "react";
import type { NativeElement } from "./schema";
import type { NativeFormRuntime } from "./useNativeForm";
import {
  BooleanControl,
  FileControl,
  MultiChoiceControl,
  RankingControl,
  RatingControl,
  ReadoutControl,
  SelectControl,
  SignatureControl,
  SingleChoiceControl,
  SliderControl,
  StaticBlock,
  TableControl,
  TextAreaControl,
  TextControl,
  type ControlProps,
} from "./fields";
import "./native-form.css";

const COMMENT_SUFFIX = "-Comment";

/** Group consecutive elements that opted out of starting a new line. */
function toRows(elements: NativeElement[]): NativeElement[][] {
  const rows: NativeElement[][] = [];
  for (const el of elements) {
    // Anything that needs the full width is a row of its own regardless of the
    // flag: a table or a repeater squeezed into half a row is unreadable, and
    // authors set the flag on the field before it, not knowing what follows.
    const wide = el.kind === "table" || el.kind === "repeater" || el.kind === "section";
    if (!el.inline || wide || rows.length === 0) {
      rows.push([el]);
      continue;
    }
    const last = rows[rows.length - 1];
    if (last.some((e) => e.kind === "table" || e.kind === "repeater" || e.kind === "section")) {
      rows.push([el]);
      continue;
    }
    last.push(el);
  }
  return rows;
}

const CONTROLS: Record<string, (props: ControlProps) => React.ReactElement | null> = {
  text: TextControl,
  textarea: TextAreaControl,
  select: SelectControl,
  "single-choice": SingleChoiceControl,
  "multi-choice": MultiChoiceControl,
  boolean: BooleanControl,
  rating: RatingControl,
  slider: SliderControl,
  file: FileControl,
  signature: SignatureControl,
  table: TableControl,
  ranking: RankingControl,
  readout: ReadoutControl,
};

/** Sized to sit on the cap height of 11.5px text, not on its line box. */
function ErrorGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.4v3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="8.6" r="0.75" fill="currentColor" />
    </svg>
  );
}

interface BlockProps {
  element: NativeElement;
  runtime: NativeFormRuntime;
  depth: number;
  /** Values live under a prefix inside a repeater row. */
  scope?: RepeaterScope;
}

/**
 * Inside a repeater, a template field's answers belong to one row of an array
 * rather than to the form. The scope swaps the value source without any control
 * needing to know it is nested.
 */
interface RepeaterScope {
  read: (name: string) => unknown;
  write: (name: string, value: unknown) => void;
}

function FieldBlock({ element, runtime, depth, scope }: BlockProps) {
  const reactId = useId();
  const controlId = `nf-${reactId}`;
  const state = runtime.stateOf(element);

  if (!state.visible) return null;

  if (element.kind === "static") return <StaticBlock element={element} />;
  if (element.kind === "section") return <Section element={element} runtime={runtime} depth={depth + 1} scope={scope} />;
  if (element.kind === "repeater") return <Repeater element={element} runtime={runtime} depth={depth} />;

  const Control = CONTROLS[element.kind] ?? TextControl;
  const error = scope ? "" : (runtime.errors[element.name] ?? "");
  const value = scope ? scope.read(element.name) : runtime.getValue(element.name);
  const otherKey = `${element.name}${COMMENT_SUFFIX}`;

  const setValue = (next: unknown) => {
    if (scope) scope.write(element.name, next);
    else runtime.setValue(element.name, next);
  };

  return (
    <div className="nf-field" data-name={element.name} id={`field-${element.name}`}>
      <label className="nf-label" id={`${controlId}-label`} htmlFor={controlId}>
        {element.title}
        {element.required && (
          <span className="nf-req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {element.description && <p className="nf-hint">{element.description}</p>}
      <Control
        element={element}
        value={value}
        onChange={setValue}
        disabled={!state.enabled}
        invalid={!!error}
        controlId={controlId}
        otherValue={
          scope ? (scope.read(otherKey) as string | undefined) : (runtime.getValue(otherKey) as string | undefined)
        }
        onOtherChange={(text) => {
          if (scope) scope.write(otherKey, text);
          else runtime.setValue(otherKey, text);
        }}
      />
      {error && (
        <p className="nf-error" role="alert">
          <ErrorGlyph />
          {error}
        </p>
      )}
    </div>
  );
}

function Rows({
  elements,
  runtime,
  depth,
  scope,
}: {
  elements: NativeElement[];
  runtime: NativeFormRuntime;
  depth: number;
  scope?: RepeaterScope;
}) {
  const rows = useMemo(() => toRows(elements), [elements]);
  return (
    <>
      {rows.map((row, i) => (
        <div className="nf-row" key={row[0]?.id ?? i}>
          {row.map((element) => (
            <FieldBlock key={element.id} element={element} runtime={runtime} depth={depth} scope={scope} />
          ))}
        </div>
      ))}
    </>
  );
}

type RepeaterRow = Record<string, unknown>;

function Repeater({ element, runtime, depth }: BlockProps) {
  const stored = runtime.getValue(element.name);
  const rows: RepeaterRow[] = Array.isArray(stored) ? (stored as RepeaterRow[]) : [];
  const minRows = Math.max(1, element.minRows);
  const shown: RepeaterRow[] =
    rows.length >= minRows
      ? rows
      : [...rows, ...Array.from({ length: minRows - rows.length }, (): RepeaterRow => ({}))];
  const maxRows = element.maxRows > 0 ? element.maxRows : Infinity;

  const writeRow = (index: number, name: string, value: unknown) => {
    runtime.setValue(
      element.name,
      shown.map((row, i) => (i === index ? { ...row, [name]: value } : { ...row })),
    );
  };

  return (
    <div className="nf-field" data-full="true" id={`field-${element.name}`}>
      <label className="nf-label">
        {element.title}
        {element.required && <span className="nf-req">*</span>}
      </label>
      {element.description && <p className="nf-hint">{element.description}</p>}
      <div className="nf-repeat">
        {shown.map((row, index) => (
          <div className="nf-repeat-item" key={index}>
            <div className="nf-repeat-head">
              <span>
                {element.title || "Entry"} {index + 1}
              </span>
              <button
                type="button"
                className="nf-rowbtn"
                data-tone="danger"
                disabled={shown.length <= minRows}
                onClick={() =>
                  runtime.setValue(
                    element.name,
                    shown.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </button>
            </div>
            <div className="nf-repeat-body">
              <Rows
                elements={element.elements}
                runtime={runtime}
                depth={depth + 1}
                scope={{
                  read: (name) => row[name],
                  write: (name, value) => writeRow(index, name, value),
                }}
              />
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="nf-rowbtn"
            disabled={shown.length >= maxRows}
            onClick={() => runtime.setValue(element.name, [...shown, {}])}
          >
            + {element.addRowText === "Add row" ? `Add ${element.title.toLowerCase() || "entry"}` : element.addRowText}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  element,
  runtime,
  depth,
  index,
  scope,
}: BlockProps & { index?: number }) {
  const [open, setOpen] = useState(!element.startCollapsed);

  const heading = (
    <>
      {index !== undefined && <span className="nf-section-index">{String(index + 1).padStart(2, "0")}</span>}
      <div className="nf-section-heading">
        <h2 className="nf-section-title">{element.title || "Details"}</h2>
        {element.description && <p className="nf-section-desc">{element.description}</p>}
      </div>
    </>
  );

  return (
    <section className="nf-section" data-tone={depth > 0 ? "nested" : undefined}>
      {(element.title || element.description) &&
        (element.collapsible ? (
          <button
            type="button"
            className="nf-section-head"
            data-clickable="true"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {heading}
            <svg className="nf-section-chev" data-open={open} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 5.5 7 9l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <div className="nf-section-head">{heading}</div>
        ))}
      {open && (
        <div className="nf-section-body">
          <Rows elements={element.elements} runtime={runtime} depth={depth} scope={scope} />
        </div>
      )}
    </section>
  );
}

/**
 * One card on the page: a panel the author drew, or a run of elements that sit
 * between panels and share the untitled card they land in.
 */
type PageBlock =
  | { kind: "loose"; id: string; elements: NativeElement[] }
  | { kind: "section"; id: string; element: NativeElement };

export interface NativeFormProps {
  runtime: NativeFormRuntime;
  /**
   * Rendered at the end of the main column, above the page navigation and the
   * mobile action bar — consent blocks, submission errors, anything the
   * respondent has to read at full width before they commit.
   */
  footer?: React.ReactNode;
  /** Submit label, shown on the rail button and the mobile action bar. */
  submitLabel?: string;
  submitting?: boolean;
  onSubmit?: () => void;
  dark?: boolean;
}

export default function NativeFormView({
  runtime,
  footer,
  submitLabel = "Submit",
  submitting = false,
  onSubmit,
  dark = false,
}: NativeFormProps) {
  const { form, page, pageIndex, pageCount, isLastPage, isFirstPage } = runtime;

  /**
   * The page cut into cards, **in the order it was authored**.
   *
   * Each top-level panel is a numbered section; each run of elements between
   * two panels becomes one untitled card of its own, so a flat form still reads
   * as a document rather than as loose fields on a page.
   *
   * A run is drawn where it sits. Gathering every run into one leading card —
   * what this did before — silently reordered the form: a question the author
   * placed between two sections jumped above both of them, and the order on
   * screen stopped matching the order in the builder.
   */
  const blocks = useMemo(() => {
    const out: PageBlock[] = [];
    for (const el of page.elements) {
      if (el.kind === "section") {
        out.push({ kind: "section", id: el.id, element: el });
        continue;
      }
      const last = out[out.length - 1];
      if (last?.kind === "loose") last.elements.push(el);
      else out.push({ kind: "loose", id: `loose-${el.id}`, elements: [el] });
    }
    return out;
  }, [page]);

  const sections = useMemo(
    () => blocks.flatMap((block) => (block.kind === "section" ? [block.element] : [])),
    [blocks],
  );

  /**
   * The blocks that have something to show, numbered as they will be seen: a
   * section hidden by a rule takes its number with it rather than leaving a gap
   * in the sequence, and a run whose every field is hidden draws no empty card.
   */
  const drawn = useMemo(() => {
    const out: { block: PageBlock; number?: number }[] = [];
    let numbered = 0;
    for (const block of blocks) {
      if (block.kind === "section") {
        if (!runtime.stateOf(block.element).visible) continue;
        out.push({ block, number: numbered });
        numbered += 1;
        continue;
      }
      if (block.elements.some((el) => runtime.stateOf(el).visible)) out.push({ block });
    }
    return out;
  }, [blocks, runtime]);

  /**
   * The rail's dots. A dot is only worth drawing if it says something, so each
   * section reports one of three states — untouched, every required answer in,
   * or something in it currently failing validation.
   */
  const railSections = useMemo(() => {
    const describe = (section: NativeElement) => {
      const required: NativeElement[] = [];
      let failing = false;
      const walk = (elements: NativeElement[]) => {
        for (const el of elements) {
          if (!runtime.stateOf(el).visible) continue;
          if (el.kind === "section") {
            walk(el.elements);
            continue;
          }
          if (el.name && runtime.errors[el.name]) failing = true;
          if (el.required && el.name) required.push(el);
        }
      };
      walk(section.elements);
      const answered = required.filter((el) => {
        const v = runtime.getValue(el.name);
        return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
      }).length;
      const state = failing ? "error" : required.length > 0 && answered === required.length ? "done" : "todo";
      return { section, state };
    };

    return sections.filter((s) => runtime.stateOf(s).visible).map(describe);
  }, [sections, runtime]);

  // Move focus to the first thing that failed, rather than leaving the person
  // to hunt for a red border somewhere below the fold. Keyed on the error set,
  // not on every keystroke that clears one.
  const errorKey = Object.keys(runtime.errors).join("|");
  useEffect(() => {
    const first = errorKey.split("|")[0];
    if (!first) return;
    const node = document.getElementById(`field-${first}`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  }, [errorKey]);

  const complete = runtime.required > 0 && runtime.answered >= runtime.required;

  const rail = (
    <aside className="nf-rail">
      <div className="nf-rail-card">
        <div className="nf-rail-head">
          <div className="nf-rail-eyebrow">Required answered</div>
          <div className="nf-rail-count">
            {runtime.answered}
            <span> / {runtime.required}</span>
          </div>
          <div
            className="nf-meter"
            role="progressbar"
            aria-valuenow={runtime.answered}
            aria-valuemin={0}
            aria-valuemax={runtime.required}
            aria-label="Required questions answered"
          >
            <div
              className="nf-meter-fill"
              data-complete={complete}
              style={{ transform: `scaleX(${runtime.progress})` }}
            />
          </div>
        </div>
        {railSections.length > 1 && (
          <nav className="nf-rail-list" aria-label="Form sections">
            {railSections.map(({ section, state }, i) => (
              <button
                key={section.id}
                type="button"
                className="nf-rail-item"
                data-state={state}
                onClick={() =>
                  document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="nf-rail-dot" data-state={state} />
                <span className="nf-rail-label">{section.title || `Section ${i + 1}`}</span>
              </button>
            ))}
          </nav>
        )}
        {isLastPage && onSubmit && (
          <div className="nf-rail-foot">
            <button
              type="button"
              className="nf-btn"
              data-variant="primary"
              data-block="true"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? "Submitting…" : submitLabel}
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="nf" data-theme={dark ? "dark" : "light"}>
      <div className="nf-shell" data-rail="on">
        <main className="nf-main">
          {pageCount > 1 && (
            <div className="nf-steps" role="tablist" aria-label="Form pages">
              {form.pages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="nf-step"
                  role="tab"
                  aria-selected={i === pageIndex}
                  data-state={i === pageIndex ? "current" : i < pageIndex ? "done" : "todo"}
                  onClick={() => runtime.goToPage(i)}
                >
                  <span className="nf-step-num">{i + 1}</span>
                  {p.title || `Page ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {(page.title || page.description) && (
            <div className="nf-section">
              <div className="nf-section-head">
                <div className="nf-section-heading">
                  <h2 className="nf-section-title">{page.title}</h2>
                  {page.description && <p className="nf-section-desc">{page.description}</p>}
                </div>
              </div>
            </div>
          )}

          {drawn.map(({ block, number }) =>
            block.kind === "section" ? (
              <div key={block.id} id={block.element.id}>
                <Section element={block.element} runtime={runtime} depth={0} index={number} />
              </div>
            ) : (
              <section className="nf-section" key={block.id}>
                <div className="nf-section-body">
                  <Rows elements={block.elements} runtime={runtime} depth={0} />
                </div>
              </section>
            ),
          )}

          {footer}

          {pageCount > 1 && (
            <div className="nf-pagenav">
              <button
                type="button"
                className="nf-btn"
                data-variant="ghost"
                disabled={isFirstPage}
                onClick={() => runtime.prevPage()}
              >
                ← Back
              </button>
              <span className="nf-pagenav-status">
                Page {pageIndex + 1} of {pageCount}
              </span>
              {!isLastPage && (
                <button type="button" className="nf-btn" data-variant="primary" onClick={() => runtime.nextPage()}>
                  Continue →
                </button>
              )}
            </div>
          )}

          {isLastPage && onSubmit && (
            <div className="nf-actionbar">
              <button
                type="button"
                className="nf-btn"
                data-variant="primary"
                data-block="true"
                disabled={submitting}
                onClick={onSubmit}
              >
                {submitting ? "Submitting…" : submitLabel}
              </button>
            </div>
          )}
        </main>
        {rail}
      </div>
    </div>
  );
}
