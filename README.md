# PMW OSHES Forms

React, TypeScript, and Vite application for OSHES operational forms, SharePoint-backed submissions, approval/evaluation workflows, and form administration.

The application is based on the proven `pmw-hrform` architecture while keeping the reusable form builder intact. Career, recruitment, and HR-specific portal functionality has been removed.

## Included

- Microsoft 365 authentication with MSAL.
- Role-scoped portal: five derived role views (administrator, evaluator, approver, submitter, auditor), a gated submission drawer where signing advances the record to the next layer, an editable form catalogue with per-layer SLA and public flags, People & roles, and an append-only audit trail.
- A strictly linear signed-out QR flow — poster → form → reference — with tracking reachable only by reference.
- SharePoint form discovery, submission dashboards, approvals, evaluations, attachments, signatures, and PDF generation.
- Full drag-and-drop form builder, publishing, version history, workflow layers, conditional routing, SharePoint choice sources, and audit logging.
- OSHES-specific branding, access language, PDPA wording, environment variables, groups, and SharePoint system-list names.
- Vercel serverless APIs for public forms, submissions, evaluations, workflow email, and dashboard settings.

## Configure

Copy `.env.example` to `.env.local`, then replace every placeholder with the OSHES tenant, Entra application, SharePoint site, group, list, email, and deployment values.

The primary SharePoint configuration variables are:

```text
VITE_SP_SITE_URL
VITE_OSHES_ADMIN_GROUP
VITE_OSHES_FORM_BUILDER_GROUP
VITE_OSHES_AUDITOR_GROUP
VITE_OSHES_SLA_DEFAULT_DAYS
VITE_SP_MASTER_FORM_LIST
VITE_SP_APPROVERS_LIST
VITE_SP_FORM_VERSIONS_LIST
VITE_SP_FORM_BUILDER_LOG_LIST
VITE_SP_DASHBOARD_SETTINGS_LIST
VITE_SP_AUDIT_TRAIL_LIST
```

`VITE_OSHES_AUDITOR_GROUP` names a read-only Entra/SharePoint group; members see every record and the audit trail and can take no action. `VITE_SP_AUDIT_TRAIL_LIST` names an append-only list with `Title`, `EventAt`, `Reference`, `Actor` and `EventSummary` columns — if it does not exist, the trail falls back to what the records themselves prove (filings and signatures) and in-session actions still display.

No HR SharePoint site or list name is required by default.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify

```powershell
npm run build
node node_modules\vitest\vitest.mjs run
```

## Main routes

- `/` — Microsoft 365 sign-in
- `/portal` — role-scoped portal; the role resolves its own landing screen
- `/report` — signed-out QR poster flow (`?poster=JTY3-C&location=Jetty+3` prefills from the poster)
- `/track` — track a report by reference, no sign-in
- `/user/dashboard` — legacy full dashboard, user scope
- `/admin/dashboard` — legacy full dashboard, admin scope
- `/admin/builder` — form builder
- `/admin/submissions` — submission and workflow administration
- `/form/:formId` — published form
- `/eval/:token` — public evaluation/approval link
- `/privacy` — PDPA privacy notice

See `SHAREPOINT_IMPLEMENTATION_PLAN.md` for the proposed OSHES SharePoint topology and production checklist.
