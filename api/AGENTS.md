# AGENTS.md — api/

**Scope:** Vercel serverless functions. Run locally via `npm run dev:api`. Deployed to Vercel alongside the SPA.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Public form config | `form-config.ts` | `GET /api/form-config?slug=X[&version=Y]`. Reads Master Form + Web Form Versions via Graph API. |
| Public form submit | `submit-form.ts` | `POST /api/submit-form`. Verifies form is public, creates list item via Graph API. Accepts optional `matrixData` param for dynamicmatrix child list items and resolves department approver layers from "Department Approver Directory". |
| Public evaluation | `evaluate.ts` | `GET /api/evaluate?token=X&responseItemId=Y` returns filtered layer-visible data; `POST /api/evaluate` submits approve/reject/confirm actions via system credential. |
| Dashboard background | `dashboard-background.ts` | `GET/POST /api/dashboard-background`. Fetches/saves dashboard background setting from SP list. |
| Send email | `send-email.ts` | `POST /api/send-email`. Sends HR form workflow mail via Graph API `sendMail` from `HR_FORM_EMAIL_FROM_ADDRESS` (fallback `EMAIL_FROM_ADDRESS`). Requires `Mail.Send` app permission. |
| Scheduled workflow email | `workflow-email-cron.ts` | Hourly Vercel Cron runner. Sends due per-item evaluator emails persisted in `WorkflowEmailSchedule`; authenticated with `CRON_SECRET` or `X-Api-Key`. |
| Job listings (public) | `jobs-list.ts` | `GET /api/jobs-list`. Lists active jobs from "Internal Job Listing" SP list with live applicant counts. |
| Job applications | `job-apply.ts` | `POST /api/job-apply`. Creates "Job Applications" item, uploads files, sends HR email. See gotchas in root AGENTS.md. |
| Job admin | `job-admin.ts` | `GET/PUT/DELETE /api/job-admin`. Admin CRUD for applications and job listings. All IDs validated as numeric before Graph `$filter`. |
| Graph client | `_utils/graphClient.ts` | Client-credentials token for `graph.microsoft.com/v1.0`. Exports: `queryListItems`, `createListItem`, `updateListItemFields`, `deleteListItem`, `queryListItemById`, `getListId`, etc. |
| API auth | `_utils/auth.ts` | Validates `X-Api-Key` header against `API_SECRET_KEY` env var. Used by all routes. |
| Career portal cards | `_utils/careerPortalCards.ts` | CRUD helpers for "Career Portal Cards" SP list. Used by jobs-list.ts and job-admin.ts. |
| List provisioning | `_utils/provisioning.ts` | Helpers for ensuring SP list schemas exist (used by submit-form, job-apply). |
| Logger | `_utils/logger.ts` | Sanitized logging helpers that avoid raw personal data in output. |

## Conventions
- **Import paths**: API routes import from `./_utils/...` (relative, `_` prefix convention).
- **OData**: Uses `odata=nometadata` — responses use `data.value` not `data.d.results`.
- **CORS**: `vercel.json` restricts `Access-Control-Allow-Origin` to `https://pmw-hrform.vercel.app` for `/api/*`.
- **Environment**: API routes run server-side in Vercel (Node.js runtime). Use `process.env` for secrets, NOT `import.meta.env.VITE_*`.
- **Graph API**: Raw `fetch` to `graph.microsoft.com/v1.0` with client credentials flow. No SP REST SDK.

## Anti-Patterns
- `console.error` in API routes — replace with proper logging.
