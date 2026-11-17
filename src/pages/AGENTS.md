# AGENTS.md — src/pages/

**Scope:** Top-level route components. Each maps 1:1 to a route defined in `App.tsx`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Legacy addresses | `App.tsx` + `src/utils/legacyRoutes.ts` | `/admin/submissions`, `/admin/approvals`, `/admin/responses/:formTitle`, `/admin/dashboard`, `/user/dashboard` and `/adminhomepage` redirect into the portal. Not admin-gated: approvers receive those links. |
| Role-scoped portal | `PortalPage.tsx` + `portal/` | Route `/portal`. Three tabs: Your work, Submissions and Manage. Screens are selected by the derived `PortalRole`; see `src/utils/portalRole.ts`. |
| Your work (portal Home) | `portal/HomeScreen.tsx` | The landing tab. Interactive statistics + one card per form type. Every number is a button that opens the rows it counted. |
| Submissions and Manage | `portal/RecordsScreen.tsx`, `portal/SubmissionsBoard.tsx`, `portal/ManageScreen.tsx` | Submissions shows the list or the board view; Manage holds the People, Audit and smoking log pages. The record page is `components/portal/RecordPage.tsx`. |
| Approval routing | `AdminRoutingPage.tsx` | Route `/admin/routing`. Admin only. |
| Public QR report flow | `PublicReportPage.tsx` | Routes `/report` and `/track`. Signed out, strictly linear: poster → form → reference. |
| Public form renderer | `DynamicFormPage.tsx` | Route `/form/:formId`. Auth gate bypassed for public forms. SurveyJS model + theme + submission handler with LayerConfig-based layer resolution. Uses `onCompleting` (prevents auto-complete) + `useEffect` on `submitStatus` to trigger `doSubmitForm()`. `onComplete` is intentionally NOT registered. |
| Evaluator interface | `EvaluationPage.tsx` | Routes `/eval/:token` (public) and `/eval/:formSlug/:responseId/:layerNumber` (365). Auth gate, layer action (approve/signature/checkbox/reject/confirm). |
| Privacy notice | `PrivacyNoticePage.tsx` | Route `/privacy`. Public page with PDPA privacy notice content. |

## Conventions
- **Route imports**: Pages are dynamically imported from `App.tsx` via `src/components/LazyRoute.tsx` — no `React.lazy()`.
- **No barrel export**: Import each page directly by path, e.g. `import PortalPage from "../pages/PortalPage"`.
- **Legacy addresses are redirects, not pages**: a retired route gets a `LegacyRouteRedirect` in `App.tsx`, mapped by `legacyRouteTarget()`. Do not put a screen back behind an old address.
- **Each page is self-contained**: Pages don't import from other pages.

## Anti-Patterns
- `DynamicFormPage.tsx` — has `console.error`/`console.warn` calls (remove or replace with proper logging).

## Not in this app
There is no form builder page. Forms are authored in `pmw-hrform`; adding authoring UI here reintroduces the duplicate this repo removed.
