# AGENTS.md — src/components/dashboard/

**Scope:** Dashboard UI — submission browsing, filtering, status displays, and detail views.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Top bar / navigation | `Header.tsx` | Sticky, role badge, admin tools, Form Builder button (`canUseFormBuilder` only) |
| Stats summary | `StatsRow.tsx` | 4-column layout: Total / Approved / Pending / Rejected |
| Form list cards | `ListSummaryCards.tsx` | Grid of cards with counts; edit button shown only with `canUseFormBuilder`, then `onEditForm` navigates to `/admin/builder/:listTitle` |
| Search / filters | `Toolbar.tsx` | List, status, sort, submitter dropdowns |
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

## Conventions
- **Responsive**: desktop table (`ListHeader` + `SubmissionRow` grid) vs mobile stacked cards
- **Modal pattern**: `DetailModal` receives `submissionData` object; formats dates, users, lookups via `formatFieldValue()`
- **Internal field filtering**: `mapSubmission()` in `App.tsx` uses `/^L[1-9]_/` regex (extended from old L[1-3] to support dynamic layers)
- **Layer Progression**: `DetailModal` shows a timeline/stepper of all layers with status badges. Evaluation layers render via `EvaluationSummary`, approval layers via legacy `ApprovalCard`.
- **StatusBadge**: Handles `fullyapproved`, `approved`, `confirmed`, `rejected`, `inprogress`, `pending`, `cancelled`

## Anti-Patterns
- `DetailModal.tsx` uses `dangerouslySetInnerHTML` — audit XSS if user input reaches `value`
