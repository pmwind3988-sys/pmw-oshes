# PMW OSHES — deployment setup

Everything needed to take this app from a clean repo to a working deployment.

This app **does not author forms**. Forms are built in `pmw-hrform`, which writes
`Master Form`, `Approvers`, `Web Form Versions`, `Form Builder Log` and
`AdminPanelSettings` to whichever SharePoint site it is pointed at. This app reads
that configuration and runs the forms.

---

## The fact this guide is built on

**The OSHES SharePoint site is on the same host as the HR site**
(`https://tenant.sharepoint.com`). Confirmed 2026-08-01 against the
configured `VITE_SP_SITE_URL`.

That one fact removes most of the Azure work, because the delegated SharePoint
scope is granted per **origin**, not per site:

```
https://tenant.sharepoint.com/AllSites.Manage
```

A user who can already use the HR app holds a token that works on the OSHES site
the moment the site exists. No second app registration, no second consent prompt.

If OSHES ends up on a different tenant or host, stop — sections B and C change
substantially and the shared certificate no longer applies.

---

## A. Create the SharePoint site

1. Create the site: **SharePoint admin → Sites → Create**. Team or Communication
   site, both work. Note the resulting URL — it becomes `VITE_SP_SITE_URL`:

   ```
   https://<tenant>.sharepoint.com/sites/<your-oshes-site>
   ```

2. Decide which SharePoint groups map to which role.

   | Role | Purpose | Env var |
   |---|---|---|
   | Admin | Full admin: approvals, exports, hard delete | `VITE_OSHES_ADMIN_GROUP` |
   | Auditor | Read-only: sees every record and the audit trail, can take no action | `VITE_OSHES_AUDITOR_GROUP` |
   | (site members) | Submit forms, sign layers assigned to them | — |

   The auditor group is optional. Leave the var blank to disable the role.

   Either create a dedicated group, or point `VITE_OSHES_ADMIN_GROUP` at the
   site's built-in **Owners** group (`<Site Name> Owners`), which is what this
   deployment does. Reusing Owners is simpler, and it means anyone granted site
   ownership for any reason also gets form authoring and hard delete on OSHES
   submissions. Create a separate group if those two sets of people should differ.

   **Whatever you choose, take the name from SharePoint rather than typing it.**
   It is compared as a literal string against the group's `Title`, so a trailing
   space or a missing prefix reads as "not a member". List the real names:

   ```
   https://tenant.sharepoint.com/sites/YOUR-OSHES-SITE/_api/web/sitegroups?$select=Title
   ```

   A wrong name and a genuine membership failure look identical from the outside —
   both simply deny access. The form builder distinguishes them for you: when it
   denies access it logs which group it checked and, if that group does not exist,
   lists the ones that do.

3. **Do not create any lists by hand.** The builder provisions them, and a
   hand-made list with the right name but the wrong columns is harder to diagnose
   than a missing one.

---

## B. Entra app registration

Reuse the existing registration — do not create a second one.

4. **Add redirect URIs.** App registration → Authentication → **Single-page
   application**. MSAL refuses any origin not listed here, and the failure looks
   like a silent redirect loop rather than a clear error.

   ```
   https://<your-oshes-project>.vercel.app
   http://localhost:3000
   ```

   Add the production custom domain too, if there is one.

5. **Check the app-only Graph permission.** The serverless API authenticates as
   the application, not as a user, so origin-wide delegated consent does not
   cover it.

   - `Sites.ReadWrite.All` — works on the new site immediately, nothing to do.
   - `Sites.Selected` — **must be granted for this specific site**, or every API
     route returns 403 while the browser-side app appears to work fine.

   To grant under `Sites.Selected`:

   ```bash
   az rest --method POST \
     --url "https://graph.microsoft.com/v1.0/sites/{site-id}/permissions" \
     --body '{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<client-id>","displayName":"PMW Forms"}}]}'
   ```

   Get `{site-id}` with:

   ```bash
   az rest --method GET --url "https://graph.microsoft.com/v1.0/sites/tenant.sharepoint.com:/sites/YOUR-OSHES-SITE"
   ```

   Confirm the grant landed before moving on — this is the one step whose failure
   looks like a broken deployment rather than a missing permission:

   ```bash
   npm run check:site
   ```

6. **The certificate needs nothing new.** `getSharePointToken()` requests
   `${origin}/.default`, and the origin is unchanged, so the existing
   `SHAREPOINT_CERT_PFX_BASE64` works as-is.

---

## C. Environment variables

`.env.example` is the source of truth for the full list. Every key below must be
set in the Vercel project as well as locally.

### Identity and site

| Key | Notes |
|---|---|
| `VITE_AZURE_CLIENT_ID` | Same app registration as HR |
| `VITE_AZURE_TENANT_ID` | Same tenant |
| `VITE_SP_SITE_URL` | **The OSHES site.** No trailing slash |
| `VITE_OSHES_ADMIN_GROUP` | Exact group name from step A2 |
| `VITE_OSHES_AUDITOR_GROUP` | Exact group name, or blank |

> `VITE_SP_SITE_URL` is the single variable that decides which SharePoint site
> this deployment reads and writes. Check it twice.

### Secrets — server side only

| Key | Notes |
|---|---|
| `SYSTEM_CLIENT_ID` / `SYSTEM_CLIENT_SECRET` | App-only Graph credential |
| `SHAREPOINT_CERT_PFX_BASE64` / `SHAREPOINT_CERT_PASSWORD` | App-only SharePoint REST credential |
| `API_SECRET_KEY` | Must equal `VITE_API_SECRET_KEY` |
| `CRON_SECRET` | Guards the workflow email cron route |

`VITE_`-prefixed variables are **compiled into the browser bundle and are public**.
Never put a secret behind a `VITE_` prefix. `VITE_API_SECRET_KEY` is deliberately
public — it is a caller tag, not an authorisation boundary; `API_SECRET_KEY` is
the value the server actually trusts.

### Email

| Key | Notes |
|---|---|
| `OSHES_FORM_EMAIL_FROM_ADDRESS` | Mailbox workflow mail is sent from |
| `EMAIL_FROM_ADDRESS` | Shared fallback sender |
| `VITE_OSHES_FORM_EMAIL_FROM_ADDRESS` | Same mailbox, exposed to the browser for routing checks |
| `VITE_OSHES_MANUAL_PAPER_ADDRESS` | Sentinel mailbox meaning "handle on paper". **Blank disables the feature** |

Manual-paper routing marks a layer manual and emails it a generated PDF instead
of assigning an online reviewer. Blank disables it entirely.

> **This deployment points the sentinel at the same mailbox it sends from** —
> `VITE_OSHES_MANUAL_PAPER_ADDRESS` and `OSHES_FORM_EMAIL_FROM_ADDRESS` hold the
> same address. That is a deliberate choice, and it differs from pmw-hrform,
> where the two are separate mailboxes.
>
> The consequence, so it is never a surprise: the sentinel is compared against
> each **layer's assignee**, not against the sender. Any workflow layer assigned
> to that mailbox becomes `Manual Approval Required` — a PDF goes out and no
> approval link is generated. If a layer ever needs a genuine online approval
> routed to the OSHES inbox, give the sentinel its own address first.

### Misc

| Key | Notes |
|---|---|
| `VITE_APP_NAME` | Defaults to `PMW OSHES Forms` |
| `VITE_DEPARTMENT_NAME` | Defaults to `OSHES` |
| `VITE_PDPA_CONTACT_EMAIL` | Shown in the privacy notice |
| `VITE_APP_BASE_URL` | Production origin. Approval links in email are built from it — a wrong value 404s every emailed link |
| `VITE_BUILDER_URL` | Origin of the pmw-hrform deployment. **Origin only** — the app appends `/admin/builder?site=oshes`. Blank hides the link |

### Optional — defaults apply when unset

These are read by the code but are not required. The defaults are the values the
app uses today, so leaving them unset is a supported configuration.

| Key | Default | Set it when |
|---|---|---|
| `VITE_INTERNAL_EMAIL_DOMAINS` | `pmw-group.com` | Staff use another domain. Comma-separated; decides who counts as internal |
| `VITE_PDPA_NOTICE_VERSION` | `PDPA-MY-OSHES-2026-06-25` | The privacy notice changes and consent must be re-captured |
| `PDPA_RETENTION_YEARS` | `7` | See the warning below |
| `API_LOG_LEVEL` | `warn` in production | Debugging. Accepts `info`, `warn`, `error` |
| `APP_ORIGIN`, `APP_BASE_URL` | fall back to `VITE_APP_BASE_URL` | Never needed; the fallback is correct |

> **`PDPA_RETENTION_YEARS` and `VITE_PDPA_RETENTION_YEARS` are two different
> variables.** The browser reads the `VITE_` one to display the retention period;
> `api/submit-form.ts` reads the un-prefixed one to compute the `RetentionUntil`
> date actually written to SharePoint. Change one without the other and the
> notice shown to the user stops matching the stored data. Set both, or neither.

---

## D. Vercel project

7. Import the repo as a new Vercel project. Framework preset **Vite**.
8. Add every variable from section C to Production, Preview and Development.
9. Confirm the production branch matches the repo's default branch.
10. `vercel.json` already carries the CSP, CORS and cron definitions — do not
    duplicate them in the dashboard. Vercel does **not** interpolate env vars into
    `vercel.json` header values, so anything environment-specific there must be
    literal.

    Because of that, `Access-Control-Allow-Origin` in `vercel.json` is the hard-coded
    string `https://pmw-oshes.vercel.app`. **Attaching a custom domain means editing
    that literal** — no env var will do it for you.

### The cron schedule

`workflow-email-cron` runs **once a day at 00:00 UTC** (08:00 Malaysia), which is
what the Hobby plan allows — it permits a daily cadence only, and rejects a
deploy carrying anything more frequent.

Running daily costs almost nothing here, for two reasons worth knowing before
anyone is tempted to "fix" it:

- **Immediate workflow email never touches the cron.** `deliverWorkflowEmail` is
  called inline during submission, so an approval request goes out at submit
  time regardless of the schedule.
- **The cron is a catch-up sweep, not a timer.** It collects every entry whose
  `dueAt` has passed, so a longer interval delays delivery but never drops it.
  The soonest anything can become due is one day out — `customDays` has a floor
  of 1 — so a daily sweep is matched to the queue it drains.

00:00 UTC is chosen so reminders land at the start of the Malaysian working day
rather than overnight.

To run it on demand without waiting:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/workflow-email-cron
```

It is idempotent — an entry moves to `sending` before delivery, so a second run
will not re-send. The response reports `{ examined, sent, failed }`.

11. Check the variables landed correctly:

    ```bash
    npm run check:env
    ```

    Run it locally against `.env.local`, and again after a deploy by pulling the
    deployed values first:

    ```bash
    npx vercel env pull .env.production.local --environment=production
    ```

    It never prints a secret — only whether each is present and whether the pairs
    that must match actually match.

---

## E. First run — proving it works

12. **Teach the form builder about this site.** The builder is a separate
    deployment (`pmw-hrform`) and has no way to discover the OSHES site — it
    reads a static registry. Set both in that project's environment:

    | Key | Value |
    |---|---|
    | `VITE_SP_SITE_URL_OSHES` | the same URL as `VITE_SP_SITE_URL` here |
    | `VITE_OSHES_ADMIN_GROUP` | the same group name as here |

    Only a URL and a group name cross over — no OSHES secret belongs in the
    builder's environment. Both are `VITE_`-prefixed, so they are compiled in at
    build time: **the builder must be rebuilt after setting them**, not merely
    restarted.

13. Open the builder at `/admin/builder?site=oshes`, signed in as a member of
    the admin group from step A2. An orange banner naming the OSHES site
    confirms it is pointed at the right place.

    Opening it provisions the five system lists automatically — the call is
    best-effort and silent, so an empty form library is the symptom of it having
    failed.

14. Build and publish one throwaway form.
15. Open this app. The form should appear in the catalogue.

    That round trip proves the site URL, the group names, and the delegated
    token are all correct. If the catalogue is empty but no error appears, the
    likely cause is a group name mismatch, not a permissions failure.

16. Submit the test form as an ordinary member and confirm it reaches the
    dashboard.
17. Delete the test form.

---

## F. Expected gaps on a fresh site

These are unfinished builder features, not setup mistakes. The app degrades
rather than failing:

| Missing | Effect |
|---|---|
| `Audit Trail` list | Trail is inferred from filings and signatures; in-session actions still display |
| `Master Form.IsPublic` column | Catalogue cannot persist the public flag |
| `LayerConfig.slaDays` | That form has no SLA: never overdue, and no SLA UI is rendered for it |
| `Returned` on `FormStatus` | Return-to-submitter falls back to another status |

---

## G. Verify a change before deploying

```bash
npx tsc -b
node node_modules\vitest\vitest.mjs run
npm run build
npx eslint .
```

`npx tsc -b` must be clean — it is the same check the Vercel build runs, so a
local pass is what predicts a successful deploy.
