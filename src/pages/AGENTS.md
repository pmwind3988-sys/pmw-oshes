# AGENTS.md — src/pages/

**Scope:** Top-level route components. Each maps 1:1 to a route defined in `App.tsx`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Admin dashboard | `AdminHomePage.tsx` | Route `/adminhomepage` and catch-all. Props: ~25 from `App.tsx` (prop-drilling). |
| Role-scoped portal | `PortalPage.tsx` + `portal/` | Route `/portal`. Screens are selected by the derived `PortalRole`; see `src/utils/portalRole.ts`. |
| Public QR report flow | `PublicReportPage.tsx` | Routes `/report` and `/track`. Signed out, strictly linear: poster → form → reference. |
| Public form renderer | `DynamicFormPage.tsx` | Route `/form/:formId`. Auth gate bypassed for public forms. SurveyJS model + theme + submission handler with LayerConfig-based layer resolution. Uses `onCompleting` (prevents auto-complete) + `useEffect` on `submitStatus` to trigger `doSubmitForm()`. `onComplete` is intentionally NOT registered. |
| Evaluator interface | `EvaluationPage.tsx` | Routes `/eval/:token` (public) and `/eval/:formSlug/:responseId/:layerNumber` (365). Auth gate, layer action (approve/signature/checkbox/reject/confirm). |
| Approval workspace | `ApprovalDashboard.tsx` | Routes `/admin/submissions` and `/admin/approvals`. Both are admin-only; distinct from `/eval/...`, which is the assigned reviewer action page. |
| Privacy notice | `PrivacyNoticePage.tsx` | Route `/privacy`. Public page with PDPA privacy notice content. |

## Conventions
- **Prop-drilling**: `AdminHomePage` receives massive props from `App.tsx` — no context abstraction yet.
- **Route imports**: Pages are dynamically imported from `App.tsx` via `src/components/LazyRoute.tsx` — no `React.lazy()`.
- **No barrel export**: Import each page directly by path, e.g. `import AdminHomePage from "../pages/AdminHomePage"`.
- **Each page is self-contained**: Pages don't import from other pages.

## Anti-Patterns
- `DynamicFormPage.tsx` — has `console.error`/`console.warn` calls (remove or replace with proper logging).

## Not in this app
There is no form builder page. Forms are authored in `pmw-hrform`; adding authoring UI here reintroduces the duplicate this repo removed.
