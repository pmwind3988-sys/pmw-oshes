# AGENTS.md — src/components/builder/

**Scope:** Runtime components that read and act on submissions.

> The folder name is historical. **There is no form builder in this app.** Forms are
> authored only in `pmw-hrform`, which writes `Master Form`, `Web Form Versions`,
> `Approvers` and `Form Builder Log` to whichever SharePoint site it is pointed at.
> Do not add authoring UI here — that reintroduces the duplicate this repo removed.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Evaluation summary | `EvaluationSummary.tsx` | Read-only display of completed evaluation results. Used by `EvaluationPage` |
| Read-only submission preview | `ReadOnlySubmissionPreview.tsx` | Used by `EvaluationPage` so a reviewer sees what was submitted |
| Test run launcher | `TestRunLauncher.tsx` | "Test workflow" on each form card in Manage, for form builders (`canRunTestRuns`, i.e. `resolveFormBuilderAccess`). Mints a signed ticket (`mint-test-ticket` on `/api/submit-form`) and opens `/form/{slug}?testTicket=…` ("Fill in myself") or `…&simulate=1` ("Simulate submission"): the form fills itself with `sampleAnswersFor` (signature pads signed with `SAMPLE_SIGNATURE`, file uploads never invented), ticks consent, submits once and then offers a link to step 1. A form needing a real file stops with the gaps highlighted instead of retrying. `simulate` is ignored without a ticket, so a real link cannot submit itself. Not an authoring tool: it only rehearses an already-published form. |
| Test run panel | `TestRunPanel.tsx` | "Test runs" on the same card. Lists `IsTest` rows with each run's checklist (`TestRunLog` merged with the row via `testRunProgress.ts`), renders the PDF in the browser (`record-test-run-step`), deletes through `delete-test-runs`, which re-checks `IsTest` server-side. |
| Barrel exports | `index.ts` | Only barrel export in the entire app |
| Shared page chrome | `WorkspaceLayout.tsx` | `WorkspacePage`, `WorkspaceHeader`, `WorkspaceNotice`, `WorkspacePanelHeader`, `WorkspacePill`, `WorkspaceTag` |

## Test runs in the listings
- A test run is kept out of the portal entirely: `App.tsx` filters `IsTest` rows out before the portal sees them, and the only list that shows them is Manage's test-run panel. `IsTest` is read in its own optional query (`readTestRowIds` in `src/utils/testColumnProbeCache.ts`) on every tier — never inside a required `$select`, which would 400 every form that was never rehearsed.

## Conventions
- **State**: Local `useState` only — no context or external store
- **Styling**: MUI components plus `editorial` tokens from `src/theme/editorial.ts`, same as
  the portal screens. There is no private palette in this folder — the
  grey/emerald `C` object these files arrived with (and `constants.ts`) has been removed.
  Panels 14px, inputs 12px, small surfaces 8–10px, pills 999px, MUI buttons square. See
  `DESIGN.md`.
- **Whole-page states** (loading, signed out, access denied) go through `WorkspaceNotice`
  so the three routes cannot each invent their own version.

## Relationship to pmw-hrform
The approval, evaluation and response flows are the pmw-hrform workflow with no behavioural
changes — same layers, statuses, actions, emails and PDF handling. Keep the logic in step
with hrform. The presentation is deliberately **not** shared: hrform renders these screens
in standalone grey chrome, this app renders them in PMW Editorial. Do not re-import
hrform's inline styles when porting a fix across.

## Where form configuration comes from
`LayerConfig` (layer sequence, assignees, and the OSHES additions `code` / `slaDays` /
`isPublic`) is JSON on the `Master Form` row, written by the pmw-hrform builder. This
app reads it via `spConfig.ts` and edits only the SLA through `portalCatalogueWrite.ts`
— `isPublic` is read-only here, because the builder owns it.

## Anti-Patterns
- `useMemo`/`useCallback` used extensively — unnecessary in React 19; remove when refactoring
