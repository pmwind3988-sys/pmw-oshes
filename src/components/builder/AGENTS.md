# AGENTS.md — src/components/builder/

**Scope:** Runtime components that read and act on submissions.

> The folder name is historical. **There is no form builder in this app.** Forms are
> authored only in `pmw-hrform`, which writes `Master Form`, `Web Form Versions`,
> `Approvers` and `Form Builder Log` to whichever SharePoint site it is pointed at.
> Do not add authoring UI here — that reintroduces the duplicate this repo removed.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Approval workspace | `ApprovalDashboard.tsx` | Routes `/admin/submissions` and `/admin/approvals`. Admin-only. Per-item layer reassignment written to `WorkflowAssignmentData`; `L{n}_Email` remains authoritative |
| Per-item reassignment UI | `WorkflowAssignmentEditor.tsx` | Layer picker + reason, used by `ApprovalDashboard` |
| Response viewer | `ResponseViewer.tsx` | Route `/admin/responses/:formTitle`. Renders submissions with SurveyJS read-only, matrix data, PDF generation |
| Evaluation summary | `EvaluationSummary.tsx` | Read-only display of completed evaluation results. Used by `DetailModal` and `EvaluationPage` |
| Read-only submission preview | `ReadOnlySubmissionPreview.tsx` | Used by `EvaluationPage` so a reviewer sees what was submitted |
| Layer progress derivation | `approvalDashboardLayerProgress.ts` | Pure — has unit tests |
| Barrel exports | `index.ts` | Only barrel export in the entire app |
| Shared page chrome | `WorkspaceLayout.tsx` | `WorkspacePage`, `WorkspaceHeader`, `WorkspaceNotice`, `WorkspacePanelHeader`, `WorkspacePill`, `WorkspaceTag` |

## Conventions
- **State**: Local `useState` only — no context or external store
- **Styling**: MUI components plus `editorial` tokens from `src/theme/editorial.ts`, same as
  the portal screens and `AdminHomePage`. There is no private palette in this folder — the
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
