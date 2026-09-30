# AGENTS.md — api/

**Scope:** Vercel serverless functions. Run locally via `npm run dev:api`. Deployed to Vercel alongside the SPA.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Public form config | `form-config.ts` | `GET /api/form-config?slug=X[&version=Y]`. Reads Master Form + Web Form Versions via Graph API. |
| Public form submit | `submit-form.ts` | `POST /api/submit-form`. Verifies form is public, creates list item via Graph API. Accepts optional `matrixData` param for dynamicmatrix child list items and resolves department approver layers from "Department Approver Directory". |
| Public form attachments | `submit-form.ts` (`action: "upload-start"` / `"upload-chunk"`) | Files go up before the submission, in 2.5 MB pieces through a Graph upload session, because a serverless request is capped at ~4.5 MB. `upload-start` re-checks the form is public and the field is a file question; `upload-chunk` only PUTs to our own SharePoint host. The submission then carries only file addresses, and `fileAnswerUrls()` refuses any not on our site. Lives in `submit-form.ts` so the deployment does not gain a function. A file answer too long for a single-line column widens it to multi-line text first (`ensureFieldsHoldLongTextViaSPRest`). |
| Submission reference no. | `next-reference.ts` | `POST /api/next-reference` `{listTitle}`. Allocates the next `[PREFIX-]DDMMYY-NNNN` for a form. The **only** allocator — the signed-in browser and `submit-form.ts` both call through it, so concurrent submissions cannot claim the same number. Prefix/padding come from the form's `ReferenceConfig` on Master Form, never the request. |
| Reference counter | `_utils/referenceCounter.ts` | One permanent row per form in `Form Reference Counters`, holding `LastDateKey` + `LastNumber`. Increments via SP REST `IF-MATCH` with a 412-retry loop; the daily reset falls out of comparing the stored day to today (Malaysia, UTC+8). Keyed on the Master Form title, so `<form>` and `<form> Responses` lists share one counter. Numbers are claimed before the row is written, so failed submissions leave gaps by design. |
| Public evaluation | `evaluate.ts` | `GET /api/evaluate?token=X&responseItemId=Y` returns filtered layer-visible data; `POST /api/evaluate` submits approve/reject/confirm actions via system credential. After the decision it stamps `L{n}_ActedBy` and the signer's `Approval Directory` name/post (`L{n}_ActedByName` / `L{n}_ActedByPosition`) in separate, fail-soft patches — only when the layer had exactly one possible actor. See "Who signed a layer" in `src/utils/AGENTS.md`. |
| Dashboard background | `dashboard-background.ts` | `GET/POST /api/dashboard-background`. Fetches/saves dashboard background setting from SP list. |
| Send email | `send-email.ts` | `POST /api/send-email`. Sends HR form workflow mail via Graph API `sendMail` from `HR_FORM_EMAIL_FROM_ADDRESS` (fallback `EMAIL_FROM_ADDRESS`). Requires `Mail.Send` app permission. |
| Scheduled workflow email | `workflow-email-cron.ts` | Hourly Vercel Cron runner. Sends due per-item evaluator emails persisted in `WorkflowEmailSchedule`; authenticated with `CRON_SECRET` or `X-Api-Key`. |
| Job listings (public) | `jobs-list.ts` | `GET /api/jobs-list`. Lists active jobs from "Internal Job Listing" SP list with live applicant counts. |
| Job applications | `job-apply.ts` | `POST /api/job-apply`. Creates "Job Applications" item, uploads files, sends HR email. See gotchas in root AGENTS.md. |
| Job admin | `job-admin.ts` | `GET/PUT/DELETE /api/job-admin`. Admin CRUD for applications and job listings. All IDs validated as numeric before Graph `$filter`. |
| Test runs | `_utils/testRun.ts`, `_utils/testRunActions.ts`, `_utils/testRunTrail.ts`, `_utils/sendEmailTestRun.ts`, `_utils/formBuilderAccess.ts` | A rehearsal of a form's layer sequence (ported from pmw-hrform). Routing runs for real and the production addresses are written to `L{n}_Email` as usual; only the dispatch goes to the one address on a ticket signed with `API_SECRET_KEY` (4 h TTL). `IsTest`/`TestEmail` on the row carry the redirect past the ticket's expiry, so `evaluate.ts`, `linkReissue.ts`, `send-email.ts` and the cron keep honouring it. `TestRunLog` (multi-line) holds the pass/fail checklist. The actions `mint-test-ticket`, `stamp-test-run` (the signed-in path's post-hoc flag), `delete-test-runs` and `record-test-run-step` ride on `submit-form.ts` so the deployment gains no function. Only a **form builder** may mint, delete or record — `resolveFormBuilder` mirrors the browser's `resolveFormBuilderAccess`: membership of `VITE_OSHES_FORM_BUILDER_GROUP`, or of `VITE_OSHES_ADMIN_GROUP` when that is blank, checked with the caller's delegated SharePoint token. Test references come from a separate `TEST-` counter row (`next-reference.ts` takes the ticket for the signed-in path). |
| Graph client | `_utils/graphClient.ts` | Client-credentials token for `graph.microsoft.com/v1.0`. Exports: `queryListItems`, `createListItem`, `updateListItemFields`, `deleteListItem`, `queryListItemById`, `getListId`, etc. |
| API auth | `_utils/auth.ts` | Validates `X-Api-Key` header against `API_SECRET_KEY` env var. Used by all routes. |
| Career portal cards | `_utils/careerPortalCards.ts` | CRUD helpers for "Career Portal Cards" SP list. Used by jobs-list.ts and job-admin.ts. |
| List provisioning | `_utils/provisioning.ts` | Helpers for ensuring SP list schemas exist (used by submit-form, job-apply). |
| Logger | `_utils/logger.ts` | Sanitized logging helpers that avoid raw personal data in output. |

## Conventions
- **Import paths**: API routes import from `./_utils/...` (relative, `_` prefix convention).
- **OData**: Uses `odata=nometadata` — responses use `data.value` not `data.d.results`.
- **CORS**: `vercel.json` restricts `Access-Control-Allow-Origin` to `https://pmw-oshes.vercel.app` for `/api/*`. Vercel does not interpolate env vars into header values, so it is a literal — a custom domain means editing it.
- **Environment**: API routes run server-side in Vercel (Node.js runtime). Use `process.env` for secrets, NOT `import.meta.env.VITE_*`.
- **Graph API**: Raw `fetch` to `graph.microsoft.com/v1.0` with client credentials flow. No SP REST SDK.

## Gotchas
- **Every outbound mail path must honour a test run's redirect.** There are four: `deliverWorkflowEmail` (`_utils/workflowEmail.ts` — submit-form's first layer, evaluate's next layer, the cron, and `send-email`'s layer notices all pass through it via `WorkflowEmailContext.testRun`), `_utils/linkReissue.ts` (calls `sendGraphEmail` directly), `send-email.ts`'s non-workflow branch (calls `sendGraphEmail` directly), and nothing else. A search for `sendGraphEmail` alone finds only two of them. If you add a mail path, route it through `testRunDispatchFor` explicitly.
- **Fail closed.** `readTestRunRedirect` returning `undefined` means two things: not a test row, or a test row with an unusable `TestEmail`. Use `testRunDispatchFor`, whose `blocked` case sends nothing at all rather than falling back to the real assignee.
- **`WorkflowEmailContext.testRun` is server-only.** `send-email.ts` rebuilds the context field by field from the request; never cast a request body to it.
- **`IsTest` is provisioned lazily**, only when a form first mints a ticket, with the minting builder's delegated token (the app-only principal cannot create columns). Every browser query fetches it as an optional column, never inside a required `$select` — naming it there 400s the whole query on forms that never ran a test. The anonymous submit refuses a ticketed submission (409) if the columns have gone missing, rather than writing an unflagged row whose later layers would mail real approvers.
- **The signed-in path stamps after writing**: `DynamicFormPage` writes its own row, then calls `stamp-test-run`, which only flags a row submitted by the ticket's own `issuedBy` (the UPN from the SharePoint `LoginName`, i.e. MSAL's `username`). If the stamp fails the page deletes the row and stops before any notification is sent.

## Anti-Patterns
- `console.error` in API routes — replace with proper logging.
