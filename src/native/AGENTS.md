# AGENTS.md — src/native/

**Scope:** A form renderer that reads published SurveyJSON and draws it without SurveyJS.

**Status: this is the renderer.** Every surface that draws a form draws it with this
engine — SurveyJS no longer renders anything in the app.

- `/form/:formId` (`DynamicFormPage`) — the live form, including the submit path.
- `/eval/...` (`EvaluationPage`) and the approval dashboard — evaluation entry.
- `ResponseViewer` — a submitted response, read-only (`useNativeForm(..., { readOnly: true })`).
- **The builder's live preview** — `LivePreviewModal` in `components/builder/FormBuilder.tsx`.
  Its banner carries the logo beside the form's title and description; the managed Company
  question is published `visible: false` and this engine draws it inside the form, so a
  chooser in the banner as well would ask the same question twice.
- `/native/:formId` (`NativeFormPreviewPage`) — a read-only preview route that predates the
  migration. It now renders the same thing `/form/:formId` does without submitting, and is
  chiefly useful for `/native/demo`, which needs no tenant.

`survey-core` and `survey-react-ui` are **uninstalled**, and the two files that registered
SurveyJS question types are gone. What the approval pages actually used from them lives on
as `utils/signatureCapture.tsx` (the signing control) and `utils/matrixData.ts` (reading a
submitted matrix), neither of which has a SurveyJS dependency. Published forms are still
SurveyJSON — that is the storage format, and `parseForm()` reads it — but no SurveyJS code
runs anywhere in the app.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Published JSON → element model | `schema.ts` | `parseForm()`. 39 builder types → 16 SurveyJS types → 14 `NativeKind`s. Pure. |
| `visibleIf` / `enableIf` / formulas | `expression.ts` | `evaluateCondition()`, `evaluateFormula()`. Pure. Reuses `safeEvalArithmetic` from `FormBuilderEngine`. |
| Answers, visibility, validation, pages | `useNativeForm.ts` | One hook, one `values` object. Returns `NativeFormRuntime`. |
| The controls | `fields.tsx` | One component per kind. Classes only — no inline styles. |
| Layout, sections, rail, page nav | `NativeForm.tsx` | Default export `NativeFormView`. |
| The entire visual system | `native-form.css` | Tokens under `.nf`, dark under `.nf[data-theme="dark"]`. |
| Sample form for `/native/demo` | `demoForm.ts` | Not a fixture; no test asserts against it. |
| The live form and its submit path | `../pages/DynamicFormPage.tsx` | `handleSubmit` validates, then fills `lastDataRef` from `collect()`. |
| Preview route | `../pages/NativeFormPreviewPage.tsx` | Route `/native/:formId`, public. Read-only. |
| Builder preview | `../components/builder/FormBuilder.tsx` | `NativePreviewBody`, used by `LivePreviewModal`. |

## Commands
```bash
npx vitest run src/native      # 50 tests across schema.test.ts + expression.test.ts
```
Visual check without a backend or a tenant:
```bash
npm run dev
```
then `/native/demo`, optionally with `?theme=dark`. A real form needs a tenant, and the
builder's preview needs a signed-in session, so `/native/demo` is the quicker way to look
at the engine itself.

## Design rules the CSS enforces
Breaking one of these is what makes a form look untidy, so they are worth restating:
- **One type scale.** Labels 12.5px/600, controls 13.5px, help 11.5px. Nothing else.
- **One radius, one hairline, one shadow.** Depth carries no meaning here.
- **Rhythm belongs to the field block, not the control.** Every field occupies the same
  vertical slot whether it holds an input, a chip row or a table.
- **No component styles itself.** If a control needs a new value, it becomes a token.

## Gotchas

### The engine is a *renderer*, not a form system
It has no opinion about SharePoint, approval layers, PDFs or notifications. `collect()`
returns a value bag; what happens next is the host page's problem. Keep it that way — the
moment it knows about `L{n}_Email` it stops being swappable.

### `collect()` must keep matching SurveyJS's output shape
The SharePoint column mapping rejects a payload carrying a key it has no column for, so:
- **Hidden answers are dropped on collect, not on hide.** Same as SurveyJS's default
  `clearInvisibleValues: "onComplete"`. Switching away from a branch and back must not
  lose what was typed, but a branch hidden at submit time contributes nothing.
- **"Other" answers stay split.** The question holds the literal `"other"` and
  `{name}-Comment` holds the typed text, so `foldOtherAnswers()` works unchanged.
- **Numbers are coerced at the edge**, in `collect()`, not on each keystroke — `"12."` is a
  legal half-typed number and coercing early eats the decimal point.

### `"other"` can collide with a real choice
`showOtherItem` appends an item whose value is the string `"other"`, and published forms
exist whose own choice list already contains `other` (an "Other provider" entry, say).
`buildOptions()` in `fields.tsx` de-duplicates, and the author's choice wins. Do not go
back to pushing the pseudo-option unconditionally — it produced duplicate React keys and
two rows that were indistinguishable once selected.

### Unparsed conditions show the field
`evaluateCondition()` returns `undefined` — not `false` — for anything outside the
supported subset, and every caller treats that as "no rule". A rule nobody can parse must
never hide a question the respondent was meant to answer.

### Formulas are derived, never stored
They are recomputed from `values` on every render and folded in by `collect()`. The
SurveyJS path wrote results back on a `setTimeout`, which meant a submission in the same
tick could carry a stale total. Two evaluation passes, so "subtotal → grand total" chains
resolve; deeper chains do not appear in any published form and an unbounded fixpoint loop
would risk a cycle.

### `startWithNewLine` is the layout model
Published forms carry no column count. `toRows()` in `NativeForm.tsx` groups consecutive
elements with `startWithNewLine: false` into one row; tables, repeaters and nested panels
always take a row alone regardless, because an author sets the flag on the field *before*
the one it affects and cannot see what follows.

### Cards follow document order, panels and loose fields alike
`NativeFormView` walks `page.elements` once and cuts it into cards: a top-level panel is a
numbered section, and each *run* of elements between panels becomes one untitled card drawn
where that run sits. It used to sort instead — every non-panel element hoisted into a single
leading card — which reordered any form whose author put a question between two sections,
so the rendered form disagreed with the builder. Do not group by kind here; group by
position. Section numbers count only the sections actually on screen, so a panel hidden by
`visibleIf` closes the gap rather than leaving one.

### Layout is `@container`, not `@media`
`.nf` declares `container-type: inline-size`, and every layout breakpoint queries that box
rather than the viewport. This is what makes the builder's device preview honest: a 340px
"mobile" preview lays out as mobile even on a 1440px monitor, which viewport queries could
never do. **Do not add a `@media` layout rule here.** The two that remain are genuinely
about the device, not the layout — the 16px control-font bump that stops mobile browsers
zooming in, and `prefers-reduced-motion`. Keying the font bump to the container would
inflate type inside a narrow preview, which is the one place an author is judging it.

The builder's desktop preview is 1180px wide for the same reason: at the old 760px it
rendered the stacked layout and labelled it "desktop".

### `rateValues` beats `rateMin`/`rateMax`
A rating whose author wrote per-step labels is drawn from that list outright, and its
`minRateDescription` / `maxRateDescription` are suppressed — they would repeat the first
and last button word for word. The step's *value* stays a number when the published one
is, because the SharePoint column behind a rating is a Number field; `NativeChoice` would
have stringified it, which is why `NativeRateStep` exists as a separate shape. The
builder's editor derives its rows from the range, so the two can never disagree.

### The signing window is portalled, and carries `.nf` itself
`SignatureControl` no longer draws on the form: a signature made inline is committed by
the act of drawing it, and a stray touch while scrolling is the common case on a phone,
not the unlucky one. Tapping opens a dialog whose stroke is provisional until confirmed.

That dialog is portalled to `document.body` **with `className="nf"` on the fixed element
itself**. Both halves matter: `.nf` declares `container-type: inline-size`, which makes it
a containment root and therefore the containing block for any fixed-position descendant —
a dialog rendered inside the form would be pinned to the form's box and land off-screen on
a scrolled page — and portalling out of `.nf` would otherwise leave it with no tokens. The
theme is read off the nearest `.nf` ancestor when the dialog opens, since it cannot inherit
`data-theme` across the portal.

### CSP blocks `new Function()`
Same constraint as the rest of the app. `expression.ts` reuses `safeEvalArithmetic` rather
than growing a second evaluator — do not reach for `eval` or `Function` here.

## What is not implemented
- **Cross-field validations and `logicRules`** — `validators` and `visibleIf`/`enableIf`
  are read; the builder's richer rule objects are not.
- On `/native/:formId` only: prefilled QR links, and version pinning beyond `?v=`. Both
  work on `/form/:formId`, which owns them rather than the engine.

Submission is not this directory's job and should stay that way. `DynamicFormPage` owns
uploads, column mapping and workflow; the engine hands it a value bag from `collect()`.
