# Simple redesign: build the canvas into the app

Source of truth for the look: the "OSHES Redesign" canvas
(https://claude.ai/artifact/RCLzzsg5SnArk5NcCphmbU), desktop-first, ten screens.

## Why
The app grew 11 menu items, two legacy dashboards and many one-off screens. People
can't tell "My submissions" from "All submissions" from "Waiting on you". The goal is
fewer places, one look, and friendly, consistent messages.

## Goals
- Three tabs: **Home**, **Submissions**, **Manage** (admins only). Account sits behind
  the name in the top bar.
- One **Submissions** list with an All / Mine / Needs me switch, replacing My
  submissions, All submissions, the approval queue and Today.
- One **message card** (mascot, title, one sentence, one or two buttons) for sign-in
  errors, no access, wrong account, session expired, closed/expired/not-found forms,
  empty lists and destructive confirmations.
- One **loading** screen: bobbing mascot plus a bar, no seven-step checklist.
- Every long table pages: 25 / 50 / 100 rows, "Showing 1–25 of N", prev/next and
  collapsed page numbers.
- Desktop-first; still usable on a phone (layouts wrap, tables scroll sideways).

## Non-goals
- No change to what the data is, who can see or sign what, or how emails and the
  workflow behave.
- No change to the PDF documents.
- The form builder stays in pmw-hrform.

## Anti-goals (a failure even if it looks right)
- A link someone already received by email stops working.
- An admin loses a power tool that only lived on a removed page (hard delete, test runs,
  approval routing, CSV export).

## What goes, and where it goes
| Today | After |
|---|---|
| Home, File a form, form hub | Home (form tiles + Needs you + Recent) |
| My submissions, All submissions, Waiting on you, Today | Submissions, with All / Mine / Needs me |
| Form catalogue | Removed (visibility is set in the builder anyway) |
| People & roles, Audit trail, Smoking log, approval routing, test runs, builder link | Manage tools |
| Today's numbers | Three count tiles at the top of Manage, each opening Submissions filtered |
| Settings | Account |
| `/admin/dashboard`, `/user/dashboard` | Redirect to `/portal` |
| `/admin/submissions`, `/admin/approvals` (linked from sent emails) | Redirect to Submissions, opening `item` when given |
| `/admin/responses/:formTitle` | Redirect to Submissions filtered to that form |
| Sign-in choice screen + guest landing | One split sign-in page |

Public pages (`/form`, `/eval`, `/report`, `/track`, `/smoke`, `/share-link`,
`/privacy`, `/native`) keep their URLs and get the new look.

## Approaches considered
1. **Restyle in place, keep all screens**: least risk, but keeps the clutter the redesign
   is meant to remove. Rejected.
2. **New shell and screens over the existing data layer** (chosen): keep
   `PortalContainer` / `PortalContext`, the role and stats utilities, SharePoint client
   and the record drawer's actions; replace the shell, merge screens, retire the legacy
   dashboard after moving its tools.
3. **Full rewrite including data loading with server-side paging**: right long-term
   for very large lists, but it changes how sign-in loads data and every count on the
   page. Deferred.

**My call on paging:** this pass pages the list that is already loaded (only 25–100
rows are drawn at once, so long lists stay fast). Fetching one page at a time from
SharePoint is a separate follow-up, because the counts and filters currently rely on
having every row.

## Visual system (from the canvas)
- Font: Plus Jakarta Sans 500–800.
- Ink `#1B2540`, page `#F4F6FA`, card `#FFFFFF`, primary blue `#1F5FD0` (hover
  `#174AA6`), sun `#FFC83D`, success `#17794B`, danger `#C8372D`, muted text `#5B6577`,
  hairline `#E3E8F0`. Tinted tiles: `#FFF1CC`, `#FFE4E0`, `#ECE6FF`, `#DDF5E6`,
  `#E3EEFF`, `#EEF1F6`.
- Pills and buttons fully rounded, 44px+ tall; cards 20–28px radius; an ink 2px border
  marks "needs you".
- Mascot: the clipboard character in 11 moods (hello, loading, success, error, expired,
  locked, switch, not found, closed, empty, delete) as inline React SVG components.
- Dark mode keeps working through the existing appearance setting (tokens get dark
  values).

## Left to the builder
- Exact component boundaries, as long as `Widget`'s "one card shape" rule in
  `src/components/portal/AGENTS.md` is honoured or explicitly replaced.
- Updating the AGENTS.md files and README route list to match.
