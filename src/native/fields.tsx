/**
 * The controls.
 *
 * Every one takes the same three props — the element, its value, and a setter —
 * and returns markup carrying only classes from `native-form.css`. No control
 * styles itself inline, which is the constraint that keeps a form looking like
 * one thing: a padding value cannot drift between two fields if neither field
 * is allowed to name one.
 *
 * The choices that shape how it reads:
 *
 * - **Small choice sets are chips, large ones are lists.** Four short options
 *   in a row is faster to scan and to tap than four stacked radio dots, and it
 *   costs a third of the vertical space. Past that threshold the row wraps
 *   badly and a list is better, so the switch is automatic rather than an
 *   authoring decision — published forms carry no property for it.
 * - **The whole option row is the hit target**, not the 15px dot inside it.
 * - **Ranking reorders with buttons, not drag.** Dragging is unusable on a
 *   phone and unreachable from a keyboard; the project has `react-dnd` for the
 *   builder canvas, but an answer control is not the place for it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import type { NativeChoice, NativeElement, NativeRateStep } from "./schema";
import { formatNumber } from "./expression";

export interface ControlProps {
  element: NativeElement;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  invalid: boolean;
  /** DOM id of the control, so the field's `<label>` can point at it. */
  controlId: string;
  /** Companion `{name}-Comment` value, for "Other" free text. */
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}

const OTHER = "other";
const NONE = "none";

interface Option extends NativeChoice {
  /** Distinguishes the two synthesised rows from the author's own choices. */
  role: "choice" | "other" | "none";
  /** React key. Not the value — see `buildOptions`. */
  key: string;
}

/**
 * The author's choices plus the synthesised "None" and "Other" rows.
 *
 * The de-duplication is load-bearing, not defensive. SurveyJS's `showOtherItem`
 * appends an item whose value is the literal string `"other"`, and a form whose
 * own choice list already contains `other` — a dropdown of providers with an
 * "Other provider" entry, say — ends up with two options sharing a value. React
 * warns about the duplicate key, and worse, the two rows become indistinguishable
 * once selected. The author's choice wins, since it is the one with a label they
 * wrote and a SharePoint value behind it.
 */
function buildOptions(element: {
  choices: NativeChoice[];
  hasNone: boolean;
  noneText: string;
  hasOther: boolean;
  otherText: string;
}): Option[] {
  const options: Option[] = element.choices.map((c) => ({ ...c, role: "choice", key: `choice:${c.value}` }));
  const taken = new Set(options.map((o) => o.value));

  if (element.hasNone && !taken.has(NONE)) {
    options.push({ value: NONE, text: element.noneText, role: "none", key: "none" });
  }
  if (element.hasOther && !taken.has(OTHER)) {
    options.push({ value: OTHER, text: element.otherText, role: "other", key: "other" });
  }
  return options;
}

/** True once the "Other" row exists and is the current selection. */
function otherIsChosen(options: Option[], selected: string[]): boolean {
  return options.some((o) => o.role === "other" && selected.includes(o.value));
}

/** Chips stay readable up to four short options; past that, use a list. */
function prefersChips(choices: { text: string }[]): boolean {
  return choices.length > 0 && choices.length <= 4 && choices.every((c) => c.text.length <= 18);
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Text ───────────────────────────────────────────────────────────────── */

/**
 * Applies a question's `autocapitalize` rule to what was just typed.
 *
 * Runs per keystroke, which is what makes it feel like the field is helping
 * rather than correcting you afterwards — and matches how the SurveyJS build
 * did it, so a form published years ago capitalises exactly as it used to.
 */
export function applyAutocapitalize(mode: string, text: string): string {
  switch (mode) {
    case "words":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    case "sentences":
      return text.replace(/(^\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    case "characters":
      return text.toUpperCase();
    default:
      return text;
  }
}

export function TextControl({ element, value, onChange, disabled, invalid, controlId }: ControlProps) {
  // A date input takes its bounds as date strings; every other input takes the
  // numeric pair. Handing a number to the first, or a date to the second, is
  // silently ignored by the browser, so they cannot share one attribute.
  const dated = element.inputType === "date" || element.inputType === "datetime-local";
  const input = (
    <input
      id={controlId}
      className="nf-input"
      type={element.inputType}
      value={value === null || value === undefined ? "" : String(value)}
      placeholder={element.placeholder}
      disabled={disabled}
      data-invalid={invalid}
      maxLength={element.maxLength > 0 ? element.maxLength : undefined}
      min={dated ? element.minDate || undefined : element.min}
      max={dated ? element.maxDate || undefined : element.max}
      step={element.step}
      onChange={(e) => onChange(applyAutocapitalize(element.autocapitalize, e.target.value))}
    />
  );

  if (!element.prefix && !element.suffix) return input;

  return (
    <div className="nf-affix" data-invalid={invalid}>
      {element.prefix && (
        <span className="nf-affix-tag" data-side="start">
          {element.prefix}
        </span>
      )}
      {input}
      {element.suffix && (
        <span className="nf-affix-tag" data-side="end">
          {element.suffix}
        </span>
      )}
    </div>
  );
}

export function TextAreaControl({ element, value, onChange, disabled, invalid, controlId }: ControlProps) {
  const text = value === null || value === undefined ? "" : String(value);
  return (
    <>
      <textarea
        id={controlId}
        className="nf-textarea"
        rows={element.rows}
        value={text}
        placeholder={element.placeholder}
        disabled={disabled}
        data-invalid={invalid}
        maxLength={element.maxLength > 0 ? element.maxLength : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {element.maxLength > 0 && (
        <div className="nf-scale-ends">
          <span />
          <span>
            {text.length} / {element.maxLength}
          </span>
        </div>
      )}
    </>
  );
}

/* ── Choice ─────────────────────────────────────────────────────────────── */

/** The free-text box shown once "Other" is picked. */
function OtherBox({
  element,
  otherValue,
  onOtherChange,
  disabled,
}: Pick<ControlProps, "element" | "otherValue" | "onOtherChange" | "disabled">) {
  return (
    <div className="nf-other">
      <input
        className="nf-input"
        type="text"
        value={otherValue ?? ""}
        placeholder={`Please specify ${element.title.toLowerCase()}`}
        aria-label={`${element.title} — other`}
        disabled={disabled}
        onChange={(e) => onOtherChange?.(e.target.value)}
      />
    </div>
  );
}

export function SelectControl(props: ControlProps) {
  const { element, value, onChange, disabled, invalid, controlId } = props;
  const current = value === null || value === undefined ? "" : String(value);
  const options = buildOptions(element);

  // A value that matches no option is an "Other" answer read back from a saved
  // response, where the free text has already replaced the literal "other".
  const isUnlisted = current !== "" && !options.some((o) => o.value === current);
  const showOther = element.hasOther && (isUnlisted || otherIsChosen(options, [current]));

  return (
    <>
      <select
        id={controlId}
        className="nf-select"
        value={isUnlisted ? OTHER : current}
        disabled={disabled}
        data-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{element.placeholder || "Select…"}</option>
        {options.map((choice) => (
          <option key={choice.key} value={choice.value}>
            {choice.text}
          </option>
        ))}
      </select>
      {showOther && (
        <OtherBox
          element={element}
          otherValue={props.otherValue ?? (isUnlisted ? current : "")}
          onOtherChange={props.onOtherChange}
          disabled={disabled}
        />
      )}
    </>
  );
}

export function SingleChoiceControl(props: ControlProps) {
  const { element, value, onChange, disabled, controlId } = props;
  const current = value === null || value === undefined ? "" : String(value);
  const options = buildOptions(element);
  const showOther = otherIsChosen(options, [current]);

  if (prefersChips(options)) {
    return (
      <>
        <div className="nf-chips" role="radiogroup" aria-labelledby={`${controlId}-label`}>
          {options.map((choice) => (
            <button
              key={choice.key}
              type="button"
              className="nf-chip"
              aria-pressed={current === choice.value}
              disabled={disabled}
              onClick={() => onChange(current === choice.value ? "" : choice.value)}
            >
              {choice.text}
            </button>
          ))}
        </div>
        {showOther && <OtherBox {...props} />}
      </>
    );
  }

  return (
    <>
      <div
        className="nf-options"
        data-cols={element.colCount > 1 ? Math.min(element.colCount, 4) : undefined}
        role="radiogroup"
        aria-labelledby={`${controlId}-label`}
      >
        {options.map((choice) => (
          <label
            key={choice.key}
            className="nf-option"
            data-selected={current === choice.value}
            data-disabled={disabled}
          >
            <input
              type="radio"
              name={controlId}
              checked={current === choice.value}
              disabled={disabled}
              onChange={() => onChange(choice.value)}
            />
            <span className="nf-option-text">{choice.text}</span>
          </label>
        ))}
      </div>
      {showOther && <OtherBox {...props} />}
    </>
  );
}

export function MultiChoiceControl(props: ControlProps) {
  const { element, value, onChange, disabled, controlId } = props;
  const selected = toArray(value);
  const options = buildOptions(element);
  const noneValue = options.find((o) => o.role === "none")?.value;
  const atLimit = element.maxSelections > 0 && selected.length >= element.maxSelections;

  const toggle = (choiceValue: string) => {
    // "None" is exclusive by definition — holding it alongside real answers
    // would submit a contradiction.
    if (noneValue !== undefined && choiceValue === noneValue) {
      onChange(selected.includes(noneValue) ? [] : [noneValue]);
      return;
    }
    const withoutNone = selected.filter((v) => v !== noneValue);
    const next = withoutNone.includes(choiceValue)
      ? withoutNone.filter((v) => v !== choiceValue)
      : [...withoutNone, choiceValue];
    onChange(next);
  };

  return (
    <>
      <div
        className="nf-options"
        data-cols={element.colCount > 1 ? Math.min(element.colCount, 4) : undefined}
        role="group"
        aria-labelledby={`${controlId}-label`}
      >
        {options.map((choice) => {
          const isOn = selected.includes(choice.value);
          const blocked = disabled || (atLimit && !isOn && choice.role !== "none");
          return (
            <label key={choice.key} className="nf-option" data-selected={isOn} data-disabled={blocked}>
              <input type="checkbox" checked={isOn} disabled={blocked} onChange={() => toggle(choice.value)} />
              <span className="nf-option-text">{choice.text}</span>
            </label>
          );
        })}
      </div>
      {element.maxSelections > 0 && (
        <div className="nf-scale-ends">
          <span>
            {selected.length} of {element.maxSelections} selected
          </span>
        </div>
      )}
      {otherIsChosen(options, selected) && <OtherBox {...props} />}
    </>
  );
}

export function BooleanControl({ element, value, onChange, disabled, controlId }: ControlProps) {
  const state = value === true || value === "true" ? true : value === false || value === "false" ? false : null;
  return (
    <div className="nf-bool" role="group" aria-labelledby={`${controlId}-label`}>
      <button
        type="button"
        aria-pressed={state === true}
        disabled={disabled}
        onClick={() => onChange(state === true ? null : true)}
      >
        {element.labelTrue}
      </button>
      <button
        type="button"
        aria-pressed={state === false}
        disabled={disabled}
        onClick={() => onChange(state === false ? null : false)}
      >
        {element.labelFalse}
      </button>
    </div>
  );
}

/**
 * The steps on a rating scale.
 *
 * An author who wrote `rateValues` has said what each point means, and those
 * labels replace the derived range outright — the two can disagree, and the one
 * with words on it is the one the respondent was meant to read.
 */
function ratingSteps(element: NativeElement): NativeRateStep[] {
  if (element.rateValues.length > 0) return element.rateValues;
  const from = Math.min(element.rateMin, element.rateMax);
  const to = Math.max(element.rateMin, element.rateMax);
  // A runaway range would emit hundreds of buttons; no published form has a
  // scale wider than 10, so anything past that is a data error, not a design.
  const count = Math.min(to - from + 1, 21);
  return Array.from({ length: count }, (_, i) => ({ value: from + i, text: "" }));
}

export function RatingControl({ element, value, onChange, disabled, controlId }: ControlProps) {
  // Compared as text, not as numbers: a step's value may be a word, and a saved
  // answer read back from SharePoint can arrive as `"4"` for a numeric scale.
  const current = value === null || value === undefined || value === "" ? "" : String(value);
  const steps = ratingSteps(element);
  // A scale is "labelled" once any step says something its own value does not.
  // Then every button carries a caption, and a step the author left blank shows
  // its number alone rather than dropping out of the row.
  const labelled = steps.some((step) => step.text !== "" && step.text !== String(step.value));

  return (
    <>
      <div
        className="nf-rating"
        data-labelled={labelled || undefined}
        role="radiogroup"
        aria-labelledby={`${controlId}-label`}
      >
        {steps.map((step) => {
          const selected = current === String(step.value);
          const caption = step.text && step.text !== String(step.value) ? step.text : "";
          return (
            <button
              key={String(step.value)}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? null : step.value)}
            >
              {/* A word-valued step has no number to show, so the label is the
                  whole button rather than a caption under a repeat of itself. */}
              {typeof step.value === "number" && <span className="nf-rating-value">{step.value}</span>}
              {(caption || typeof step.value !== "number") && (
                <span className="nf-rating-text">{caption || String(step.value)}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* The end captions describe a bare numeric scale. Once every step is
          labelled they repeat the first and last button word for word, so they
          step aside rather than saying "Disagree" twice on the same row. */}
      {!labelled && (element.minRateDescription || element.maxRateDescription) && (
        <div className="nf-scale-ends">
          <span>{element.minRateDescription}</span>
          <span>{element.maxRateDescription}</span>
        </div>
      )}
    </>
  );
}

export function SliderControl({ element, value, onChange, disabled, controlId }: ControlProps) {
  const min = element.min ?? 0;
  const max = element.max ?? 100;
  const current = value === null || value === undefined || value === "" ? min : Number(value);
  return (
    <div className="nf-slider-row">
      <input
        id={controlId}
        className="nf-slider"
        type="range"
        min={min}
        max={max}
        step={element.step ?? 1}
        value={Number.isFinite(current) ? current : min}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="nf-slider-value" htmlFor={controlId}>
        {element.prefix}
        {Number.isFinite(current) ? current : min}
        {element.suffix}
      </output>
    </div>
  );
}

export function ReadoutControl({ element, value }: ControlProps) {
  const numeric = Number(value);
  const shown = Number.isFinite(numeric)
    ? formatNumber(numeric, element.displayStyle, element.decimals, element.currency)
    : "—";
  return (
    <div className="nf-readout">
      <span>{shown}</span>
      <span className="nf-readout-tag">Calculated</span>
    </div>
  );
}

/* ── Files and signature ────────────────────────────────────────────────── */

interface StoredFile {
  name: string;
  size: number;
  type: string;
  /** Data URL — the same shape the SurveyJS file question produced. */
  content: string;
}

export function FileControl({ element, value, onChange, disabled, invalid, controlId }: ControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [tooLarge, setTooLarge] = useState("");

  const files: StoredFile[] = Array.isArray(value)
    ? (value as StoredFile[])
    : value && typeof value === "object"
      ? [value as StoredFile]
      : [];

  const accept = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setTooLarge("");
    const limit = element.maxSizeMb > 0 ? element.maxSizeMb * 1024 * 1024 : 0;
    const kept: StoredFile[] = [];

    for (const file of Array.from(picked)) {
      if (limit > 0 && file.size > limit) {
        setTooLarge(`"${file.name}" is over the ${element.maxSizeMb} MB limit and was not attached.`);
        continue;
      }
      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      if (content) kept.push({ name: file.name, size: file.size, type: file.type, content });
    }

    if (kept.length === 0) return;
    onChange(element.allowMultiple ? [...files, ...kept] : [kept[0]]);
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : null);
  };

  return (
    <>
      <button
        type="button"
        id={controlId}
        className="nf-drop"
        data-over={over}
        data-invalid={invalid}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) void accept(e.dataTransfer.files);
        }}
      >
        <span>{element.allowMultiple ? "Choose files or drop them here" : "Choose a file or drop it here"}</span>
        <span className="nf-drop-note">
          {element.acceptedTypes || "Any file type"}
          {element.maxSizeMb > 0 ? ` · up to ${element.maxSizeMb} MB each` : ""}
        </span>
      </button>
      <input
        ref={inputRef}
        className="nf-sr"
        type="file"
        accept={element.acceptedTypes || undefined}
        multiple={element.allowMultiple}
        disabled={disabled}
        onChange={(e) => {
          void accept(e.target.files);
          // Cleared so re-picking the same file fires `change` again.
          e.target.value = "";
        }}
      />
      {tooLarge && <p className="nf-error">{tooLarge}</p>}
      {files.length > 0 && (
        <div className="nf-files">
          {files.map((file, i) => (
            <div className="nf-file" key={`${file.name}-${i}`}>
              {file.type.startsWith("image/") && <img className="nf-file-thumb" src={file.content} alt="" />}
              <span className="nf-file-name">{file.name}</span>
              <span className="nf-file-size">{formatBytes(file.size)}</span>
              <button type="button" className="nf-rowbtn" data-tone="danger" disabled={disabled} onClick={() => remove(i)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Ink is always dark, because the paper it is drawn on is always white. */
const SIGNATURE_INK = "#101828";

function PenGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M2.5 15.5h3l8-8a2.12 2.12 0 0 0-3-3l-8 8v3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 5.5l2 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The signing window.
 *
 * Signing happens here rather than on the form because a signature drawn inline
 * is committed by the act of drawing it: a stray touch while scrolling past the
 * field is already a signature, and on a phone that is the common case, not the
 * unlucky one. A window makes the stroke provisional until it is confirmed, and
 * gives the drawing surface room it cannot have between two other questions.
 *
 * It is portalled to `document.body` and carries the `nf` class itself. `.nf`
 * declares `container-type: inline-size`, which makes it the containing block
 * for fixed-position descendants — a dialog rendered inside the form would be
 * pinned to the form's box and could sit off-screen once the page had scrolled.
 * Being the fixed element *and* the token scope is what keeps both true at once.
 */
function SignatureDialog({
  title,
  initial,
  theme,
  onCancel,
  onConfirm,
}: {
  title: string;
  initial: string;
  theme: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(initial !== "");

  /** Size the backing store to the CSS box, so strokes are not blurry. */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const backingWidth = Math.round(width * ratio);
    const backingHeight = Math.round(height * ratio);
    // Assigning either dimension clears the canvas, so a no-op resize — which
    // every unrelated window event produces — must not touch them.
    if (canvas.width === backingWidth && canvas.height === backingHeight) return;
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = SIGNATURE_INK;
    // Editing starts from what is already signed, so a correction is a
    // correction rather than a redraw from nothing.
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = initial;
    }
  }, [initial]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  return createPortal(
    <div
      className="nf nf-sign-modal"
      data-theme={theme}
      role="dialog"
      aria-modal="true"
      aria-label={`Sign — ${title}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="nf-sign-dialog">
        <div className="nf-sign-dialog-head">
          <span className="nf-sign-dialog-eyebrow">Signature</span>
          <h2 className="nf-sign-dialog-title">{title}</h2>
        </div>
        <div className="nf-sign-paper">
          <canvas
            ref={canvasRef}
            className="nf-sign-canvas"
            aria-label={`Signing area for ${title}`}
            onPointerDown={(e) => {
              const ctx = e.currentTarget.getContext("2d");
              if (!ctx) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const { x, y } = pointAt(e);
              ctx.beginPath();
              ctx.moveTo(x, y);
              // A tap with no drag is still a mark, so the dot it leaves counts
              // as ink and Confirm is reachable from it.
              ctx.lineTo(x, y);
              ctx.stroke();
              setHasInk(true);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext("2d");
              if (!ctx) return;
              const { x, y } = pointAt(e);
              ctx.lineTo(x, y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          />
          <span className="nf-sign-rule" aria-hidden="true" />
        </div>
        <p className="nf-sign-note">Sign with a mouse, pen or finger, then confirm.</p>
        <div className="nf-sign-dialog-foot">
          <button type="button" className="nf-btn" data-variant="ghost" disabled={!hasInk} onClick={clear}>
            Clear
          </button>
          <span className="nf-sign-dialog-gap" />
          <button type="button" className="nf-btn" data-variant="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="nf-btn"
            data-variant="primary"
            disabled={!hasInk}
            onClick={() => {
              const canvas = canvasRef.current;
              if (canvas) onConfirm(canvas.toDataURL("image/png"));
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SignatureControl({ element, value, onChange, disabled, invalid, controlId }: ControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Non-null while the window is open, and carrying the theme the form was
  // rendered in — the dialog leaves the form's subtree, so it cannot inherit it.
  const [signing, setSigning] = useState<{ theme: string } | null>(null);

  const stroke = value ? String(value) : "";
  const title = element.title || "Signature";

  const openDialog = () =>
    setSigning({ theme: rootRef.current?.closest(".nf")?.getAttribute("data-theme") || "light" });

  return (
    <div className="nf-sign" ref={rootRef} data-signed={stroke !== ""} data-invalid={invalid}>
      <button
        type="button"
        id={controlId}
        className="nf-sign-plate"
        disabled={disabled}
        aria-label={stroke ? `${title} — signed. Open the signing window to change it.` : `${title} — tap to sign`}
        onClick={openDialog}
      >
        {stroke ? (
          <img className="nf-sign-ink" src={stroke} alt="" />
        ) : (
          <span className="nf-sign-cue">
            <PenGlyph />
            Tap to sign
          </span>
        )}
      </button>
      <div className="nf-sign-bar">
        <span>{stroke ? "Signed — locked until you change it" : "Opens a signing window; nothing is kept until you confirm"}</span>
        <span className="nf-sign-actions">
          <button type="button" className="nf-rowbtn" disabled={disabled} onClick={openDialog}>
            {stroke ? "Edit" : "Sign"}
          </button>
          <button
            type="button"
            className="nf-rowbtn"
            data-tone="danger"
            disabled={disabled || !stroke}
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        </span>
      </div>
      {signing && (
        <SignatureDialog
          title={title}
          initial={stroke}
          theme={signing.theme}
          onCancel={() => setSigning(null)}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setSigning(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Table ──────────────────────────────────────────────────────────────── */

type TableRow = Record<string, unknown>;

export function TableControl({ element, value, onChange, disabled }: ControlProps) {
  const columns = element.columns;
  const minRows = Math.max(0, element.minRows);
  const maxRows = element.maxRows > 0 ? element.maxRows : Infinity;

  const rows: TableRow[] = Array.isArray(value) ? (value as TableRow[]) : [];
  // A matrix opens showing the rows the author asked for, so the respondent
  // sees a table to fill rather than an empty box with an "Add" button.
  const shown: TableRow[] =
    rows.length >= minRows
      ? rows
      : [...rows, ...Array.from({ length: minRows - rows.length }, (): TableRow => ({}))];

  const write = (rowIndex: number, columnName: string, cell: unknown) => {
    const next = shown.map((row, i) => (i === rowIndex ? { ...row, [columnName]: cell } : { ...row }));
    onChange(next);
  };

  if (columns.length === 0) return <p className="nf-hint">This table has no columns configured.</p>;

  return (
    <div className="nf-table-wrap">
      <div className="nf-table-scroll">
        <table className="nf-table">
          <thead>
            <tr>
              <th className="nf-table-index" scope="col">
                #
              </th>
              {columns.map((column) => (
                <th key={column.name} scope="col">
                  {column.title}
                </th>
              ))}
              {!disabled && <th scope="col" aria-label="Row actions" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="nf-table-index">{rowIndex + 1}</td>
                {columns.map((column) => (
                  <td key={column.name}>
                    {column.cellType === "select" ? (
                      <select
                        className="nf-select"
                        value={row[column.name] === undefined ? "" : String(row[column.name])}
                        disabled={disabled}
                        aria-label={`${column.title}, row ${rowIndex + 1}`}
                        onChange={(e) => write(rowIndex, column.name, e.target.value)}
                      >
                        <option value="">—</option>
                        {column.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.text}
                          </option>
                        ))}
                      </select>
                    ) : column.cellType === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={row[column.name] === true}
                        disabled={disabled}
                        aria-label={`${column.title}, row ${rowIndex + 1}`}
                        onChange={(e) => write(rowIndex, column.name, e.target.checked)}
                      />
                    ) : (
                      <input
                        className="nf-input"
                        type={column.cellType === "number" ? "number" : column.cellType === "date" ? "date" : "text"}
                        value={row[column.name] === undefined ? "" : String(row[column.name])}
                        disabled={disabled}
                        aria-label={`${column.title}, row ${rowIndex + 1}`}
                        onChange={(e) => write(rowIndex, column.name, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                {!disabled && (
                  <td>
                    <button
                      type="button"
                      className="nf-rowbtn"
                      data-tone="danger"
                      disabled={shown.length <= minRows}
                      onClick={() => onChange(shown.filter((_, i) => i !== rowIndex))}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="nf-table-foot">
          <button
            type="button"
            className="nf-rowbtn"
            disabled={shown.length >= maxRows}
            onClick={() => onChange([...shown, {}])}
          >
            + {element.addRowText}
          </button>
          <span className="nf-drop-note">
            {shown.length} {shown.length === 1 ? "row" : "rows"}
            {Number.isFinite(maxRows) ? ` · max ${maxRows}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Ranking ────────────────────────────────────────────────────────────── */

export function RankingControl({ element, value, onChange, disabled }: ControlProps) {
  const items = element.rankItems;
  const ordered = toArray(value).filter((v) => items.some((i) => i.value === v));
  // Anything the stored order does not mention keeps its authored position, so
  // a form that gained an option since a draft was saved still shows it.
  const full = [...ordered, ...items.map((i) => i.value).filter((v) => !ordered.includes(v))];

  const move = (from: number, to: number) => {
    if (to < 0 || to >= full.length) return;
    const next = [...full];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="nf-rank">
      {full.map((itemValue, index) => {
        const item = items.find((i) => i.value === itemValue);
        return (
          <div className="nf-rank-item" key={itemValue}>
            <span className="nf-rank-pos">{index + 1}</span>
            <span className="nf-rank-label">{item?.text ?? itemValue}</span>
            <span className="nf-rank-moves">
              <button
                type="button"
                className="nf-rowbtn"
                disabled={disabled || index === 0}
                aria-label={`Move ${item?.text ?? itemValue} up`}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="nf-rowbtn"
                disabled={disabled || index === full.length - 1}
                aria-label={`Move ${item?.text ?? itemValue} down`}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Static content ─────────────────────────────────────────────────────── */

export function StaticBlock({ element }: { element: NativeElement }) {
  if (element.tone) {
    return (
      <div className="nf-note" data-tone={element.tone}>
        <div>
          {element.title && <div className="nf-note-title">{element.title}</div>}
          <div
            className="nf-html"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element.html || element.description) }}
          />
        </div>
      </div>
    );
  }

  if (element.imageUrl) {
    return (
      <figure>
        <img src={element.imageUrl} alt={element.title || ""} style={{ maxWidth: "100%", borderRadius: 8 }} />
        {element.title && <figcaption className="nf-hint">{element.title}</figcaption>}
      </figure>
    );
  }

  if (!element.html.trim()) return <hr className="nf-divider" />;

  return <div className="nf-html" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(element.html) }} />;
}
