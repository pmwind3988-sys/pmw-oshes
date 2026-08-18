# AGENTS.md — src/utils/

**Scope:** SharePoint REST clients, form runtime logic, portal derivation, config loading, auth persistence.

> `formBuilderSP.ts` keeps its historical name but holds only the **runtime** half:
> reads, submission writes, workflow status, provisioning helpers for matrix child
> lists and document libraries. Form authoring lives in `pmw-hrform`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| SP REST client (dashboard) | `sharepointClient.ts` | Factory `createSpClient(instance, accounts)` — CRUD, digest cache, `isGroupMember`, list discovery, `resolveUserEmails` |
| SP REST client (builder) | `formBuilderSP.ts` | **Standalone** — raw `token: string` param, NOT `createSpClient`; ~1470 lines, 43 exports |
| Config loader | `spConfig.ts` | `SP_STATIC` group names, `loadConfig` from Master Form, `filterVisibleLists`, `generateMeta`, `getMissingConfigs`, `legacyToLayerConfig()` migration helper |
| Form logic | `FormBuilderEngine.ts` | Pure functions: 57 question types, validation, survey JSON builder, versioning |
| Status constants | `statusConstants.ts` | `SP_LAYER_STATUS`, `SP_FORM_STATUS`, `normalizeLayerStatus()`, `deriveFormStatus()`, `layerColumn()` helper |
| Custom widget | `DynamicMatrix.tsx` | Custom SurveyJS widget for matrix questions + `rowsToHtml()` matrix↔HTML conversion |
| "Other" answers | `surveyOtherAnswers.ts` | `foldOtherAnswers()` — collapses SurveyJS's `"other"` + `{name}-Comment` pair into the typed answer. Must run on every submit path (form + evaluation): `-Comment` has no SP column, so `mapBodyToSharePointColumnKeys` would reject the submission |
| Auth persistence | `authDecision.ts` | `localStorage` helpers for `pmw_hr_auth_decision` |
| PDPA compliance | `pdpa.ts` | Constants + helper for PDPA retention date, consent label, privacy notice sections |
| Career API client | `careersService.ts` | Frontend fetch wrapper for `/api/jobs-list`, `/api/job-apply`, `/api/job-admin`. ~470 lines. |
| Dashboard backgrounds | `dashboardBackgrounds.ts` | Predefined background gradient/image definitions + CSS variable binding |
| Dashboard background API | `dashboardBackgroundService.ts` | Frontend fetch wrapper for `/api/dashboard-background` |
| PDF generation | `generateFormPdf.ts` | Client-side PDF creation via `@react-pdf/renderer`, uploads to SharePoint, opens in new tab |
| PDF document template | `FormPdfDocument.tsx` | React-PDF document component for form response PDF. Letterhead + numbered data table + per-layer signature cards |
| PDF chain progress | `pdfLayerProgress.ts` | `isAwaitingLayer()`, `chainProgress()` — which layers have been decided, and what an unfinished document says about itself |
| Portal PDF (drawer) | `portalPdf.ts` | `recordLayerResults()` / `downloadRecordPdf()` / `regenerateRecordPdf()` — the copy rendered from a `PortalRecord`, and the rebuild that replaces the stored one |
| PDF letterhead identity | `../config/company.ts` | `COMPANY` — name/address/contact/logo from `VITE_COMPANY_*`. Blank fields are omitted from the page, never guessed |
| CSV response export | `formResponseCsv.ts` | `buildFormResponseCsv()` — pure. Every answer in form order, per-layer approval columns, Malaysian times, numbers bare, pictures as link-or-base64. **The one place a cell's shape is decided** — do not format for CSV anywhere else |
| CSV export (per form) | `formResponseExport.ts` | `buildFormResponseExport()` — re-reads the response list in full (no `$select`), the schema per version, and matrix child rows grouped by parent. Used by `ResponseViewer` |
| CSV export (dashboard) | `dashboardResponseCsv.ts` | `buildDashboardSubmissionCsv()` — translates `Submission[]` into the shared export shape. Used by `AdminHomePage` |
| Export clock | `malaysiaTime.ts` | `formatMalaysiaDateTime()`, `malaysiaDateStamp()` — fixed UTC+8, same reasoning as `referenceNumber.ts`. Wall-clock text is never shifted; only stored instants convert |
| Layer sequence | `layerSequence.ts` | `layerSequenceFromConfig()` — which layers a submission went through, manual branches resolved. Shared by the PDF and the CSV so they cannot disagree |
| Answer vs. plumbing | `responseSystemFields.ts` | `responseAnswerFields()`, `isResponseSystemField()` — the one list of workflow/SharePoint columns. Layer columns match by pattern, so a fourth layer is not mistaken for a question |
| Job apply PDF | `JobApplyPdfDocument.tsx` | React-PDF document for job application PDF |

## Dual SharePoint Client Pattern
```
Dashboard path:
  App.tsx → createSpClient(msalInstance, accounts) → sharepointClient.ts

Builder path:
  DynamicFormPage.tsx / EvaluationPage.tsx → raw token (via msalInstance.acquireTokenSilent)
    → formBuilderSP.ts (independent digest cache)
```
- **Intentional separation**: builder uses raw token, dashboard uses MSAL instance
- **Risk**: two digest caches, two SP_SITE_URL reads, inconsistent error handling

## Conventions
- `sharepointClient.ts`: returns `SharePointClient` interface; MSAL-aware
- `spConfig.ts`: `SP_STATIC.adminGroup` is broad HR owner access; `SP_STATIC.formBuilderSuperuserGroup` is the narrower builder-access group.
- `formBuilderSP.ts`: standalone functions; no MSAL dependency
- `FormBuilderEngine.ts`: pure logic, no side effects, no React imports
- **OData**: `odata=nometadata` — responses use `data.value` not `data.d.results`

## What the printed page may claim
`FormPdfDocument.tsx` is a record that gets filed and shown to auditors, so every mark on it
has to be something the data supports:

- **A "(TICK)" question prints as its boxes, not as a sentence.** `shouldListChoices()` sends
  multi-answer and multi-select fields to `renderChoiceList()`, which draws every option with a
  bordered box and an `X` — the controls that were *not* taken matter as much as the ones that
  were. A tick is matched on the option's value **or** its label, through `selectedAnswer()`,
  because a form submits values and a SharePoint multi-value column hands back `;#`-joined
  labels. Single-answer questions stay sentences, and lists past 24 options do too.
- **Punctuation is never an answer.** Empty entries are dropped before joining, so a three-tick
  answer whose labels did not survive submission can no longer print as `, ,`. When every entry
  is blank the page says so in as many words — that state means the labels were lost upstream
  (choices authored with empty values), and the fix is in the form, not here.
- **One signature well per signature.** A layer whose evaluation answers already carry ink does
  not also get the layer's own empty rule: an unfilled well is indistinguishable from ink that
  failed to load. The rule is still drawn for a layer that signs on the layer itself, including
  one signed on paper.
- **Composition:** mark top left, address ranged right beside it, then the document band — what
  the document *is* (title, reference, date, form, version) on the left, who filed it and its
  status on the right. A filed permit is looked up by its number, not by whose name is on it.
  Positions are asserted in `FormPdfDocument.test.tsx` via `placedText()`, which runs the PDF's
  own transform stack, because "on the left" is a claim about the page and not about the JSX.

## SP Column Type Mapping
`FormBuilderEngine.ts` `getSpColumnKind()` and `formBuilderSP.ts` `ensureColumns()` map SurveyJS types to SharePoint `FieldTypeKind`:
- 2 = Text, 3 = Note, 4 = DateTime, 6 = Choice, 8 = Boolean, 9 = Number, 15 = MultiChoice, 11 = Image
- `dynamicmatrix`/`tableinput` create `_Html` (richText) + `_Json` columns AND a child list `{FormTitle} Matrix {FieldName}` (primary storage). See `ensureMatrixChildList()`.
- `spChoicesSource` fields fetch live choices from SP at publish time and pass them to `addColumn()`
- Formula fields use `_expression` custom property on `type: "text", readOnly: true` — NOT SurveyJS native `expression`
- `ranking` type stores ordered array as JSON string in Note column (kind=3)

## Anti-Patterns
- `formBuilderSP.ts` has `catch (e: any)` and `eslint-disable` — fix types when touching
- `formBuilderSP.ts` has `data.d.results` fallback — legacy format, should be removed
- `console.warn` in `formBuilderSP.ts` — remove or replace with proper logging
