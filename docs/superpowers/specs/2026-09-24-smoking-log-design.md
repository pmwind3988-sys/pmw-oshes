# Smoking log — design

Date: 2026-09-24
Status: approved in chat, awaiting spec review

## Purpose

Anyone who smokes on site (staff or contractor) scans the QR poster at a
smoking area when they arrive and scans the same poster again when they
leave. OSHES admins see each break — who, where, in, out, how long — and can
filter, correct, delete and export the records.

## Who uses it

| Person | Can do |
|---|---|
| Smoker (any Google account, or a PMW Microsoft account) | Sign in once, fill in a profile, scan in, scan out, edit own profile |
| OSHES admin | Everything below, plus edit and permanently delete break rows, manage areas, print posters, resolve flags |
| OSHES auditor | View the log, totals, people and edit history; export. No edits, no deletes |

Admin and auditor come from the portal's existing role groups
(`VITE_OSHES_ADMIN_GROUP`, `VITE_OSHES_AUDITOR_GROUP`). Smokers get no access
to any other part of the portal.

## Smoker flow

1. Scan an area poster → opens `/smoke?area=<code>` on the phone.
2. Not signed in → **Continue with Google** (primary, large) or
   **Sign in with Microsoft** (secondary link, PMW tenant only).
3. No profile yet → profile form:
   - Full name — text, required, pre-filled from the account
   - Department — dropdown from HR's Departments list, required
   - Position — text, required
   - Staff ID — text, optional
   - Company — text, required, defaults to "PMW"
   - PDPA notice (reuse the portal's existing wording) shown on this step
4. The server issues a 90-day smoking pass; later scans skip sign-in.
5. The scan is recorded and a large full-screen result shows:
   - No open break → **IN · 10:42 · Block A smoking area**
   - Open break → **OUT · 10:49 · 7 min**
6. The result screen links to **Edit my profile**.

### Scan rules (decided on the server, with the server's clock)

| Situation | Result |
|---|---|
| No open break | Open a break: time in = now, area in = this area |
| Open break, opened **less than 1 minute** ago | No change; show "You're already in since 10:42" |
| Open break, opened 1 minute or more ago | Close it: time out = now, area out = this area (may differ from area in) |
| Open break older than 12 hours | Still closed by this scan, as above; the row is flagged "Lasted over 12 hours" |
| Area code unknown or retired | Nothing recorded; show "This poster is no longer in use" |

At most one open break per email. Concurrent scans must not create two open
breaks (check-then-write guarded by an ETag/`If-Match` merge, as elsewhere in
`api/_utils/sharepointRest.ts`).

### Flags

- **Open over 12 hours** — computed when the log is read (open and time in
  older than 12 h). No cron job.
- **Lasted over 12 hours** — set when a break closes with duration > 12 h.
- An admin resolves a flag by adding a note, or by editing the times (an edit
  that brings the duration to 12 h or less clears it).
- Flagged breaks are left out of totals and counted separately.

## Admin: Smoking log page

A new **Smoking log** item in the portal navigation, visible to admins and
auditors only. Four tabs:

1. **Log** — one row per break: name, email, department, position, company,
   area in, area out, time in, time out, duration, flag.
   - Filters: date range (default: this week), department, area, person
     search, "Flagged only".
   - Header count: "N people on a break now" (tap for names).
   - Row actions (admin only):
     - **Edit** — time in, time out, area in/out, name, department,
       position, company. Duration recalculates; the flag re-evaluates.
     - **Resolve flag** — add a note; records who resolved it.
     - **Delete** — yes/no confirmation dialog: "Delete this break record for
       <name>, <date time in>? This cannot be undone." with **No** as the
       default focus. Permanently removes the SharePoint row.
   - **History** per row — the Audit Trail entries for that row.
2. **Totals** — per person over the chosen dates: number of breaks, total
   time, average length, flagged count; optionally grouped by department.
3. **Areas** (admin only) — add, rename, retire an area; **Print poster**
   (A4: area name, QR with PMW logo, "Scan when you arrive, scan again when
   you leave"), reusing `src/utils/qrWithLogo.ts` and the existing poster
   layout from `/report`.
4. **People** — registered smoker profiles. Email is read-only (comes from
   the sign-in account).

**Export to Excel** on Log and Totals exports exactly what the current
filters show, as a CSV that opens directly in Excel, reusing
`src/utils/csv.ts` (no new spreadsheet library).

### Audit

Every admin edit, delete, flag resolution and area change writes an entry to
the existing **Audit Trail** list via `writeAuditEntry`
(`src/utils/portalAudit.ts`), with the actor, time, and the row's values
before and after. A deleted row survives only as its Audit Trail entry.

## Data (SharePoint, OSHES site)

The portal provisions these lists on first admin visit, like its other lists.

**Smoking Profiles** — one row per person
Email (unique, lower-case), FullName, Department, Position, StaffId, Company,
SignInMethod (`google` | `microsoft`), FirstSeen, LastSeen.

**Smoking Log** — one row per break
Email, FullName, Department, Position, Company (copied from the profile at
time in, so later profile changes don't rewrite history), AreaInCode,
AreaInName, AreaOutCode, AreaOutName, TimeIn, TimeOut, DurationMinutes,
FlagReason, ResolutionNote, ResolvedBy, ResolvedAt.

**Smoking Areas** — one row per area
Title (area name), Code (short random code printed in the QR), Active.

**Departments** — read-only, from HR:
`https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Lists/Departments`,
department name from `Title` (verify during build). Cached on the server for
24 h; on failure the last good copy is served.

## Sign-in and the smoking pass

- **Google:** Google Identity Services button in the browser; the server
  verifies the ID token against Google's public keys (audience = our client
  ID, `email_verified` true) before trusting the email.
- **Microsoft:** the existing MSAL setup (`src/auth/msalConfig.ts`, PMW
  tenant). The server verifies the Microsoft ID token (issuer = PMW tenant,
  audience = our client ID).
- After verification the server issues a signed **smoking pass** (email +
  expiry, 90 days), signed with the same mechanism as
  `api/_utils/linkToken.ts` but a distinct purpose so it can't be reused as
  an evaluation link. Stored in the browser; sent with each scan.
- An expired or invalid pass sends the smoker back to sign-in.
- Admin actions use the portal's normal signed-in admin session, never the
  smoking pass.

## Server

One Vercel function, `api/smoking.ts`, routed by an `action` parameter, to
stay within the deployment's function count (10 today):

| Action | Caller | Does |
|---|---|---|
| `signin` | smoker | Verify Google/Microsoft ID token → pass + whether a profile exists |
| `profile-get` / `profile-save` | smoker (pass) | Read/write own profile |
| `departments` | smoker (pass) | Cached HR department names |
| `area` | anyone | Resolve area code → name, active |
| `scan` | smoker (pass) | Apply the scan rules; return IN / OUT / already-in / retired |

Admin reads and writes (log, totals, edit, delete, areas, people) go from the
browser with the admin's own SharePoint token, like the rest of the portal.

## Setup (to document in SETUP.md)

1. Google Cloud Console: create an OAuth 2.0 Web client, authorised origin =
   the portal's production origin (plus preview origins if needed). Put the
   client ID in `VITE_GOOGLE_CLIENT_ID` (browser) and `GOOGLE_CLIENT_ID`
   (server). No client secret.
2. Grant the OSHES app-only identity **read** on the HR Docs site if it uses
   `Sites.Selected`. Nothing to do under `Sites.Read(Write).All`.
3. Add `https://accounts.google.com` to the CSP `script-src`, `frame-src` and
   `connect-src` in `vercel.json`.
4. New secret for signing passes, or reuse the existing link-token secret
   with a distinct purpose string (decide during planning).

## Error handling

- No signal / request fails → the result screen says "Not recorded — tap to
  try again"; never shows IN/OUT unless the server confirmed it.
- HR departments unreachable and no cached copy → the department field falls
  back to free text, marked so admins can see it wasn't from the list.
- Google/Microsoft sign-in cancelled or blocked → stay on the sign-in step
  with a plain message.

## Testing

- Unit tests for the scan rules: first scan, second scan, re-scan within
  1 minute, different area out, over-12-hour close, retired/unknown area,
  concurrent scans.
- Unit tests for token verification (Google and Microsoft: good, wrong
  audience, expired, unverified email) and pass issue/expiry/wrong purpose.
- Unit tests for totals (flagged excluded) and flag evaluation after edit.
- Browser preview run: sign in → profile → IN → OUT → admin log → edit →
  delete with confirm → export.

## Out of scope

Scan-out reminders, smokers' own history, department-head views, scheduled
jobs.
