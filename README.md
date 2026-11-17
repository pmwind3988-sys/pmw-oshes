# PMW OSHES Forms

React, TypeScript, and Vite application for OSHES operational forms, SharePoint-backed submissions, approval/evaluation workflows, and form administration.

The application is based on the proven `pmw-hrform` architecture. Career, recruitment, and HR-specific portal functionality has been removed, and so has the form builder: forms are authored **only** in `pmw-hrform`, which writes to whichever SharePoint site it is pointed at. This app reads that configuration and runs the forms.

## Included

- Microsoft 365 authentication with MSAL.
- Role-scoped portal: five derived role views (administrator, evaluator, approver, submitter, auditor), a gated submission drawer where signing advances the record to the next layer, a form catalogue with editable per-layer SLA and a read-only public/internal badge, People & roles, and an append-only audit trail.
- A strictly linear signed-out QR flow — poster → form → reference — with tracking reachable only by reference.
- SharePoint form discovery, submission dashboards, approvals, evaluations, attachments, signatures, and PDF generation.
- Workflow layers, conditional routing, SharePoint choice sources, and audit logging — all configured by the `pmw-hrform` builder and consumed here.
- OSHES-specific branding, access language, PDPA wording, environment variables, and groups.
- Vercel serverless APIs for public forms, submissions, evaluations, workflow email, and dashboard settings.

## Configure

See [SETUP.md](SETUP.md) for full deployment setup — SharePoint site, Entra app registration, every environment variable, and a first-run check that proves the wiring.

For local work: copy `.env.example` to `.env.local` and replace every placeholder with the OSHES tenant, Entra application, SharePoint site, group, email, and deployment values.

The primary SharePoint configuration variables are:

```text
VITE_SP_SITE_URL
VITE_OSHES_ADMIN_GROUP
VITE_OSHES_AUDITOR_GROUP
```

`VITE_OSHES_AUDITOR_GROUP` names a read-only Entra/SharePoint group; members see every record and the audit trail and can take no action.

SharePoint **list names are not configurable** and are identical to `pmw-hrform`'s — `Master Form`, `Approvers`, `Web Form Versions`, `Form Builder Log`, `AdminPanelSettings`, `Audit Trail`. OSHES lives on its own SharePoint site, so the site boundary is what separates it from HR; keeping the names identical means the shared builder writes the same schema to either site with no per-site mapping.

`Audit Trail` is an append-only list with `Title`, `EventAt`, `Reference`, `Actor` and `EventSummary` columns — if it does not exist, the trail falls back to what the records themselves prove (filings and signatures) and in-session actions still display.

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
- `/portal` — the portal, with three tabs: Your work (the landing page), Submissions (list or board view) and Manage (People, Audit and the smoking log, for accounts that reach them). A submission opens on its record page.
- `/portal?screen=subs&form=F&item=I` — deep link to one record (`scope=all|mine|needs` is also read)
- `/report` — signed-out QR poster flow (`?poster=JTY3-C&location=Jetty+3` prefills from the poster)
- `/track` — track a report by reference, no sign-in
- `/admin/routing` — approval routing (admin only)
- `/form/:formId` — published form
- `/eval/:token` — public evaluation/approval link
- `/privacy` — PDPA privacy notice

Legacy addresses redirect into the portal and are not admin-gated, because approvers receive the old email links (`src/utils/legacyRoutes.ts`):

- `/admin/submissions` and `/admin/approvals` — `/portal?screen=subs`, or that record when `form` and `item` are given
- `/admin/responses/:formTitle` — the Submissions tab filtered to that form
- `/admin/dashboard`, `/user/dashboard`, `/adminhomepage` — `/portal`
