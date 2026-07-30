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
| Colors | `constants.ts` | `C` color object — inline styles, NOT MUI theme |

## Conventions
- **State**: Local `useState` only — no context or external store
- `ApprovalDashboard` and `WorkflowAssignmentEditor` style with the inline `C` object rather than the MUI theme; the portal screens use the theme. Match whichever file you are in.

## Where form configuration comes from
`LayerConfig` (layer sequence, assignees, and the OSHES additions `code` / `slaDays` /
`isPublic` / `severityCapture`) is JSON on the `Master Form` row, written by the
pmw-hrform builder. This app reads it via `spConfig.ts` and edits only the operational
subset — SLA and the public flag — through `portalCatalogueWrite.ts`.

## Anti-Patterns
- `useMemo`/`useCallback` used extensively — unnecessary in React 19; remove when refactoring
