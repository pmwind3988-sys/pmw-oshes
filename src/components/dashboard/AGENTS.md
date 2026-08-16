# AGENTS.md — src/components/dashboard/

**Scope:** Dashboard UI — submission browsing, filtering, status displays, and detail views.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Top bar / navigation | `Header.tsx` | Sticky, role badge, admin tools, Form Builder button (`canUseFormBuilder` only) |
| Stats summary | `StatsRow.tsx` | 4-column layout: Total / Approved / Pending / Rejected |
| Form list cards | `ListSummaryCards.tsx` | Grid of cards with counts; edit button shown only with `canUseFormBuilder`, then `onEditForm` navigates to `/admin/builder/:listTitle` |
| Search / filters | `Toolbar.tsx` | Form type, status, sort, submitter, submitted-on, profile, plus stacked field conditions |
| Field condition editor | `FieldConditions.tsx` | One row per condition; the operator and value editor come from the field's `kind` |
| Submission rows | `SubmissionRow.tsx` | Responsive: desktop grid / mobile stacked; clickable |
| Detail view | `DetailModal.tsx` | Full dialog with fields, signatures, approval chain |
| Status pills | `StatusBadge.tsx` | Auto-normalizes status strings to colored chips |
| List pills | `ListBadge.tsx` | Colored list identifier pills |
| Empty state | `EmptyState.tsx` | Placeholder when no submissions match filters |
| Config warning | `ConfigWarningBanner.tsx` | Amber banner for unconfigured SharePoint lists |

## Component Data Flow
```
App.tsx → DashboardProvider (context: submissions, filters, listMetaMap)
  ├── Header (isAdmin, canUseFormBuilder, onOpenBuilder → navigate to /admin/builder)
  ├── StatsRow (submissions)
  ├── ListSummaryCards (visibleLists, canUseFormBuilder, onEditForm → navigate to /admin/builder/:listTitle)
  ├── Toolbar (filters, onChange)
  └── SubmissionRow[] (submission, onClick)
        └── DetailModal (open, onClose, submissionData)
```
- State managed via `DashboardContext` (`src/contexts/DashboardContext.tsx`) — the ONLY context store in the app.

## Filtering — scope, then refine
- **One model, one engine, three screens.** `SubmissionFilterState` (`src/utils/submissionFilters.ts`) and `recordMatchesFilters` are shared by the dashboard `Toolbar`, `ApprovalDashboard`, and `ResponseViewer`. Only the skin differs: MUI here, the builder's inline `C` palette in `src/components/builder/SubmissionFilterPanel.tsx`. Change semantics in the engine, never in a screen.
- **Each screen adapts its own row type** to `FilterableRecord` (`Submission`, `PendingItem`, `SubmissionItem`). Adapters may pass null text — the engine coerces.
- **`formType` scopes everything below it.** The publish profile and every field condition are interpreted against the selected form, so `applyFormTypeChange` clears both when it changes. Never set `formType` directly.
- **Field conditions replaced the hardcoded `trainingTitle` filter**, which had promoted one form's question into the global model and left every other form's questions unfilterable.
- **The field catalogue comes from published SurveyJSON** (`src/utils/formFieldCatalog.ts`), keyed by question name, and is widened by `mergeObservedValues` — a SharePoint-backed dropdown carries no `choices` in the published JSON, so its options are recovered from the answers on record.
- **Answers must actually be loaded to filter on them.** The dashboard has them in `submissionData`; `ResponseViewer` reads `RawJSON`; `ApprovalDashboard`'s list queries select workflow columns only, so it fetches answers lazily (no `$select`, per form) the first time a form type is picked, and holds field conditions back until they land.

## Conventions
- **Responsive**: desktop table (`ListHeader` + `SubmissionRow` grid) vs mobile stacked cards
- **Modal pattern**: `DetailModal` receives `submissionData` object; formats dates, users, lookups via `formatFieldValue()`
- **Internal field filtering**: `mapSubmission()` in `App.tsx` uses `/^L[1-9]_/` regex (extended from old L[1-3] to support dynamic layers)
- **Layer Progression**: `DetailModal` shows a timeline/stepper of all layers with status badges. Evaluation layers render via `EvaluationSummary`, approval layers via legacy `ApprovalCard`.
- **StatusBadge**: Handles `fullyapproved`, `approved`, `confirmed`, `rejected`, `inprogress`, `pending`, `cancelled`

## Anti-Patterns
- `DetailModal.tsx` uses `dangerouslySetInnerHTML` — audit XSS if user input reaches `value`
