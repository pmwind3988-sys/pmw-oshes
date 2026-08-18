# Handoff: OSHE role-scoped dashboards, approval flow & public QR entry

## Overview

A prototype of the OSHE portal reorganised around **who is looking at it**. It covers:

1. A working **sign-in** screen with a purely visual idle animation panel.
2. Five **role-scoped views** — Administrator, Evaluator (Safety Officer), Approver, Staff/submitter, Auditor (read-only).
3. A **submission detail drawer** where actions are gated by role and by whether the current approval layer belongs to you.
4. **Signing that actually advances state** — a signature moves the record to the next layer, out of your queue and into theirs.
5. A **linear public (signed-out) flow**: QR poster → form → reference number, with tracking reachable only by reference.
6. An **admin form catalogue** — the form set, its approval chain, per-layer SLA and public/internal flag are data, not code.
7. An **append-only audit trail** that records the actions you take in-session.

Target repo: `pmw-oshes` (this folder). The prototype is a design reference; the work is to recreate it in the existing React 19 + MUI + MSAL + SharePoint app.

## About the design files

`design/PMW OSHES.dc.html` is the current prototype and `design/PMW OSHES v1.dc.html` is the earlier single-role version, kept for reference. They are **design references written as self-contained HTML** — open them in a browser, click through every flow. They are *not* production code to copy: they hold their data in component state, fake the network, and are styled with a wireframe design system that is **not** the PMW palette.

**Recreate the screens inside `pmw-oshes` using its existing environment**: React 19, MUI v9 (`src/theme/index.ts` + `src/theme/editorial.ts`), `react-router-dom` v7 routes declared in `src/App.tsx`, MSAL/Entra auth (`src/auth/`), and SharePoint lists via `src/utils/sharepointClient.ts`. Do not introduce a second styling system.

## Fidelity

**Mid-to-high fidelity on layout, information architecture and behaviour; deliberately NOT final on colour and type.**

- **Take as given:** screen inventory, what each role sees and cannot see, panel order, table columns, the action set per role, empty states, validation rules, all copy.
- **Do not take as given:** the steel-blue wireframe palette, Barlow Condensed type, square corners and corner registration marks in the prototype. Those come from a generic design system used because the PMW tokens were not to hand at the time. **Re-skin everything with `editorial` + the MUI theme** (see Design tokens).

## Roles and what each one sees

The prototype uses five demo accounts. Map them to real authorisation as follows:

| Prototype role | Demo account | Real signal in this codebase |
|---|---|---|
| Administrator | aminah.yusof@pmw.gov.my | `isAdmin` — member of `SP_STATIC.adminGroup` (OSHE Forms Owner) |
| Evaluator (Safety Officer) | nurul.aziz@pmw.gov.my | Appears as a layer assignee of `type: "evaluation"`, and/or is layer 1 assignee on incident-class forms |
| Approver | faizal.mokhtar@pmw.gov.my | Is the assignee of an `approval` layer on at least one open submission |
| Staff / submitter | sazali.rahim@marinekita.com | Neither admin nor an assignee — sees only rows where `submittedByEmail`/`createdByEmail` matches, which `App.tsx` already filters for |
| Auditor (read-only) | tan.weiling@pmw.gov.my | **New**: a read-only group (e.g. `OSHE Auditors`) checked with the same `spClient.isGroupMember` pattern. No new write paths — the account simply never renders an action |

`src/App.tsx` already computes `isAdmin`, `canUseFormBuilder`, and an `assigneeVisibilityMap` per list. The role view should be **derived** from those plus the submission set, not stored on the user. Suggested derivation, placed next to `authDecision.ts`:

```ts
type PortalRole = "admin" | "evaluator" | "approver" | "submitter" | "auditor";
```

- `admin` if `isAdmin`
- else `auditor` if member of the auditor group
- else `evaluator` if the user is the assignee of any `evaluation` layer
- else `approver` if the user is the assignee of any `approval` layer
- else `submitter`

A user who is both an evaluator and an approver resolves to `evaluator` (the superset view); their approval items still appear in the same queue.

### Navigation per role (exact items and order)

| Role | Sidebar items |
|---|---|
| admin | Today · Submissions · Form catalogue · People & roles · Audit trail |
| evaluator | Today · To evaluate *(count)* · Submissions |
| approver | My approvals *(count)* · All records |
| submitter | My submissions *(count)* · File a form |
| auditor | Records · Audit trail *(count)* |

Landing screen after sign-in: `today` for admin and evaluator, `queue` for approver, `subs` for submitter and auditor.

## Screens

### 1. Sign in

Two equal columns, full viewport height, divided by a 1px hairline.

- **Left column** — brand lockup top-left (`PMW OSHE`, 22px heading weight; a 10px uppercase 0.14em-tracked subtitle `SAFETY · HEALTH · ENVIRONMENT · SECURITY`); a footer line at 11px muted: "Prototype · demo accounts below, any password of four characters or more". Between them, a **purely visual idle animation**, no words:
  - a 40×40px grid of hairlines at 7% ink, inset `-40px 0`, translating `0 → -40px` over 14s linear infinite (seamless drift);
  - a 1px accent horizontal scan line sweeping `top: 4% → 96%` over 9s ease-in-out infinite, fading in at 12% and out after 88%;
  - a square stack centred in the column, `min(340px, 100%)` wide, `aspect-ratio: 1`: four nested square frames at insets 0 / 14% / 30% / 44%, rotating 34s, 22s (reverse), 15s, 9s (reverse) linear infinite;
  - a filled core at inset 44% (accent at 22% alpha) breathing `scale(0.82) opacity 0.55 → scale(1.06) opacity 1` over 6.4s ease-in-out;
  - centre crosshair: 1px vertical and horizontal lines at 14% ink;
  - two orbiting marks — an 8px filled square and an 8px outlined square on the outer ring (18s), a 6px filled square on the 14% ring (11s reverse).
  - Recreate with MUI `keyframes` from `@mui/material/styles` (the theme already imports `keyframes` for `fadeInUp`). Respect `prefers-reduced-motion` — hold the composition static.
- **Right column** — centred 420px stack, 13.6px gaps: `Sign in` (28px heading) · Work email field · Password field (`type="password"`) · error banner when present · full-width primary `Sign in` (44px min height) · a hairline-separated **Demo accounts** block (11px uppercase label, five click-to-fill rows, 44px min height each, role label + email left, person name right) · a hairline-separated **No account** block with `Report something — scanned a poster` (secondary) and `Track a report I already filed` (ghost).

**Validation** (exactly as prototyped): unknown email → "No account with that email. Pick one of the demo accounts below."; password shorter than 4 characters → "Password must be at least four characters." Errors clear on the next keystroke in either field.

**In production this screen is not a password form.** Keep the layout, the animated panel and the two no-account routes, but drive sign-in through the existing `ChoiceScreen` / MSAL redirect (`loginRequest`) — the email/password pair exists only so the prototype can switch roles. The demo-account list becomes either nothing (production) or a dev-only role switcher behind `import.meta.env.DEV`.

### 2. Today (admin, evaluator)

Header: `Today` (34px) with a sub-line "Thursday 30 July · N filed in the last 24 h · N approvals past SLA" (both counts computed, not written), and an `Export view to CSV` button pushed right (admin/evaluator/auditor only).

A single flex column, 27.2px gaps, with four panels whose visual order is prop-controlled (`severityFirst` swaps panels 1 and 2):

1. **High severity · last 24 hours** — sub-caption "paged to the duty officer on receipt". A 3-column grid of clickable cards. Each: a severity pill (10px, uppercase, 0.1em tracking, `inline-flex` + `white-space: nowrap` — it must never wrap), the age right-aligned at 11px muted, the subject at 17px heading weight, the location at 12px, then a hairline-topped 11px footer `REF · Layer n of m`. Filter: `tone` is high or mid, filed within 24h, not closed. Empty state: "Nothing high-severity in the last 24 hours."
2. **Stuck approvals** — sub-caption "oldest first · age measured on the current layer only", count right-aligned. Table columns: Reference (118px, ghost-button link) · Form + subject (two lines) · Waiting on + role (170px) · Layer (86px) · Age on layer + SLA note (130px) · actions (170px, right-aligned: `Nudge` / `Nudged` and `Reassign`, admin+evaluator only). Sorted by age descending. Empty state: "Nothing is past its SLA right now."
3. **Two half-width panels side by side (27.2px gap):**
   - **Awaiting your signature** — count at 22px in the heading row; rows of subject (14px) over `REF · Form · Layer n of m · waiting Xd Yh` (11px), each with a primary `Review`. Empty: "Your queue is clear."
   - **Where work is sitting** — "approvers ranked by longest wait on their current layer". Per person: name + role + longest wait, a 6px bar (width proportional to the worst wait in the set), then "N open · N past SLA". Top 4. Toggleable via prop.
4. **Inbound today, by form** — "form types come from the catalogue — this list follows it". Two-column grid of rows: form name (200px) · 10px proportional bar · today's count (26px, right-aligned, heading font). Zero-count rows render an empty track, not a sliver.

### 3. Queue — "To evaluate" / "My approvals"

Max width 840px, a card per item (13.6px padding, 13.6px gaps): top line `REF · Form` plus an optional severity pill; subject at 19px heading; `location · filed X ago` at 12px; then `Layer n of m · within/past a N-day SLA` at 11px (accent when breached). A primary `Open and sign` on the right, `flex: none`.

Sub-copy differs by role — evaluator: "you are layer 1 on incident, near-miss and hazard forms — evaluate, then it routes onward"; approver: "only what is on your layer · signing releases it to the next approver immediately".

Empty state is a full card: "Nothing is waiting on you." over "Signed items move on to the next layer immediately."

### 4. Submissions / My submissions / Records

Title and sub-copy vary by role (`Submissions` / `My submissions` / `Records` — the auditor's reads "read only · no action can be taken from this account").

Filter row (flex, wrapping, 13.6px gaps, aligned to the bottom): Form type select (220px, options from the catalogue) · Status select (190px: All / In approval / Past SLA / Approved / Returned / Cancelled) · free-text search over reference **and** subject (flex, min 200px) · `Export N rows to CSV` (admin/evaluator/auditor).

Table columns: Reference (120px) · Form + subject · Source (150px) · Stage (170px) · Status pill (130px) · Filed (105px). Whole row is clickable and opens the drawer. Empty: "Nothing matches that filter."

Status pill treatments: **Past SLA** solid dark accent with reversed text; **In approval** light accent tint; **Approved** neutral tint; **Cancelled / Rejected** transparent with a neutral border.

### 5. File a form (submitter)

Two steps in one screen. First a picker — every catalogue form as a 54px row: name (16px heading) over "N approval layers · first to «person»". Then the form itself in a card: Where (42px input) · outcome picker (only when the form captures severity) · What happened (90px textarea) · Photos (dashed 64px drop target) · a "Still needed: …" hint whenever incomplete · submit labelled `Submit — routes to «first approver»`. A `← Change form` link and the draft indicator sit in the card header. Name and email are **not** asked — the session supplies them.

### 6. Form catalogue (admin)

Header with `Add form type` (primary). Table: Code (64px, heading font) · Form type + "N in the last 30 days" (230px) · Approval chain as wrapping nowrap chips · SLA per layer as a 52px numeric input + "days" · Public link as a toggle button (`Public` accent tint / `Internal` plain) · Severity field (Required / Optional / —).

Footnote, verbatim: "SLA per layer is new data — it does not exist in the current catalogue schema. It is what makes 'overdue' computable per form type instead of one global constant; unset types fall back to N working days."

`Add form type` dialog: Name · Code (auto-uppercased, ≤4 chars) · Layers (numeric, clamped 1–6) · SLA days. On confirm the type appears in the catalogue, in "Inbound today" at zero, in the QR picker if public, and writes an audit entry. Empty name → toast "Give the form type a name first."

This screen is the answer to "the form set must be configurable later" — nothing downstream hard-codes a form list. In this repo it belongs with the existing form-builder plumbing: `src/utils/formBuilderSP.ts`, `src/config/oshe.ts`, `api/form-config.ts`, and the Layers tab of `AdminFormBuilder.tsx`. **Do not build a parallel catalogue** — extend `LayerConfig` with the SLA and public flags.

### 7. People & roles (admin)

Table (max 960px): Name · Approval role · System role pill · Open items · "Sees" — a plain-language sentence per row. The point of the screen: **an approval layer points at a role, not a person**, which is what makes reassignment safe.

### 8. Audit trail (admin, auditor)

"append-only · every signature, nudge, reassignment and cancellation, including the ones made in this session". Table (max 1060px): When (130px, nowrap) · Reference (120px) · Who (170px) · Event. Newest first. Every mutation in the prototype prepends a row — preserve that: the trail is written from the same code path as the action, never separately.

### 9. Submission detail drawer

Right-hand drawer, `min(580px, 94vw)`, over a 42% neutral-900 scrim; the scrim's left region is a click-to-close target. Slides in from `translateX(24px)` + opacity 0 over 180ms ease-out; scrim fades over 140ms.

- Header: `REF · Form` (11px uppercase) · subject (26px) · a status line — `Layer n of m · within/past a N-day SLA`, accent when breached · close icon button.
- A hairline-bounded two-column field grid: Filed · Source · Location · Reported by · Severity ("Not captured on this form" when absent) · Photos ("None" or "N attached").
- **Approval chain** as a vertical timeline. Filled square = signed, outlined = current, muted outline = not started. Status text per step: `Signed` / `Awaiting you` / `Awaiting «first name»` / `Not started`; sub-line is the signature timestamp, `on this layer Xd Yh`, or "opens when the layer before is signed". Signed steps show their note in a left-bordered block.
- A note textarea appears **only when you can sign**, labelled "Evaluation note" for an evaluator, "Note for the record" otherwise; placeholder "Optional for approval, required if you return it".
- Action row, gated:
  - `Sign this layer` / `Evaluate and release` + `Return for more information` — only when the current layer's assignee is you.
  - `Nudge approver` + `Reassign layer` — admin and evaluator, only while open, and only when it is *not* your own layer (you cannot chase yourself).
  - `Download PDF` — everyone.
  - `Withdraw` (submitter, own item, still on layer 1) / `Cancel submission` (admin), pushed right.
  - Auditor sees only `Download PDF`, plus the note "Audit accounts cannot sign, chase or cancel. Everything above is a record of what others did."

### 10. Public flow (signed out) — strictly linear

Centred 430px column, a small chrome bar above it: `PMW OSHE` · a stage label · `Exit`. Stage labels: "Step 1 of 3 · choose a form", "Step 2 of 3 · no sign-in needed", "Step 3 of 3 · keep the reference", "Tracking". Each stage animates in with a 6px rise over 160ms.

1. **Poster scanned** — "Poster scanned · code JTY3-C" (10px uppercase accent), `Jetty 3 · Berth C` (26px), "PMW Port Klang · location filled in for you". Then "What are you reporting?" and a 56px row per **public** catalogue form: name + "Severity is asked · N approval layers". Footnote: "A poster can encode one specific form and skip this step. Anything urgent — call 999 first, then file."
2. **Form** — `← Change form` and the draft indicator; the form name as heading; Where (prefilled from the poster) · outcome (4 options, 48px targets, only when the form captures severity) · a warning block when the outcome is Serious or worse ("This pages the duty safety officer the moment you submit, and starts a 24-hour investigation clock. Keep the area as it is if it is safe to do so.") · What happened · Photos · Your name ("Optional — you can report anonymously") · Email ("Optional") · a "Still needed: …" line · a 48px submit, **disabled until location, outcome and description are present** · "Saved on this device as you type, so a dropped signal at the jetty does not lose the entry."
3. **Received** — "Received HH:MM", "Your report is with the safety team.", the reference in a framed block at 34px with the label "Reference — photograph this", then `Download a PDF of what you sent` and `Track this report`. Closing line: if an email was given, "A copy is on its way to «email»."; otherwise "You did not leave an email, so the reference above is the only way back in — photograph it."
4. **Tracking** — reachable two ways only: the button on the confirmation, or the login screen's "Track a report I already filed", which asks for a reference and rejects unknown ones ("No report with that reference. Check the letters and dashes."). Shows a stage timeline built from that record's own chain — `Received` → one step per layer → `Closed out` — and states plainly: "Only the stage is public — approver names are not shown here."

**There is no stage picker.** The earlier prototype let anyone jump to the confirmation or the PDF without filing anything; that was the defect this version fixes. Stage transitions happen only through: pick a form → submit a valid form → optionally open tracking. Deep-link `/form/:formId` and `/eval/:token` continue to be the real entry points (`isPublicRoutePath` in `App.tsx` already exempts them from the auth gate).

## Interactions & behaviour

- **Sign** (`advance`): marks the current layer signed with the actor, note and timestamp; if it was the last layer the record becomes `Approved`/`Completed`, otherwise `CurrentLayer` increments and the age-on-layer resets to zero. Toast: "REF moves to layer N, «person» («role»)." or "REF approved and closed — the submitter is told." Then it leaves your queue — verify by watching the sidebar count drop.
- **Return for more information**: refuses to proceed with an empty note ("Say what is missing before returning it — the submitter only gets your note."), sets status `Returned`, leaves the approver's queue, and surfaces in the submitter's list.
- **Nudge**: idempotent per session — the button becomes `Nudged`. Toast names the person and says "Next automatic reminder in 24 h." Wire to the existing `api/workflow-email-cron.ts` / `workflowEmailSchedule.ts` machinery rather than a new mailer.
- **Reassign**: a dialog listing candidate approvers with their current load, radio-selected, confirmed with `Reassign`. The layer's assignee changes, the age keeps running (state, not the clock), and the trail records it.
- **Cancel / Withdraw**: a dialog stating the record keeps its reference and is marked cancelled with your name; a reason field; confirm sets status `Cancelled`.
- **Export CSV**: toast only in the prototype — "Exporting N rows with the columns you can see, plus approval history. Emailed to you when ready." Note the contract: **the export matches the current filter and visible columns**.
- **Draft autosave**: the public/staff form persists to `localStorage` on every keystroke and restores on load; the indicator reads "Saves as you type" → "Draft saved Ns ago" → "Draft saved N min ago" (a 5s tick refreshes it). Cleared on successful submit. Prototype key `pmw-oshes-draft-v2` — namespace it per form id in production.
- **Toasts**: single slot, bottom-centre, 3.4s, max 560px. Use MUI `Snackbar` per the theme's existing overrides.
- **Animations**: scrim fade 140ms; drawer slide 180ms ease-out; stage rise 160ms; dialog fade 120ms. The login panel animation runs continuously.

## State

Prototype state, and where each piece really belongs:

| Prototype state | Production home |
|---|---|
| `session` (account + role) | MSAL `activeAccount` + derived `PortalRole` |
| `records[]` with `at` (0-based current layer), `status`, `ageH`, `signedBy[]` | SharePoint response lists — `CurrentLayer`, `FormStatus`, `L{n}_Status`, `L{n}_Email`, `L{n}_SignedAt`, `L{n}_Rejection`, `L{n}_Signature`, `EvaluationData`; already mapped by `mapSubmission` in `App.tsx` |
| `catalogue[]` (code, name, chain, sla, public, severity) | `LayerConfig` / list meta via `spConfig.ts` + `api/form-config.ts`, extended with `slaDays` and `isPublic` |
| `audit[]` | Existing workflow email/action logs (`workflowEmailLog.ts`) plus a new append-only trail list |
| `nudged{}` | `WorkflowEmailSchedule` on the item |
| `form` draft + `savedAt` | `localStorage`, per form id |
| `drawer`, `reassign`, `addOpen`, `confirmCancel`, `toast` | Local component state — fine as-is |

Age-on-layer is prototyped as `ageH` hours. Derive it in production from `L{n}_SignedAt` of the previous layer (or `SubmittedAt` for layer 1) to now. **Overdue** = age on layer > that form type's `slaDays × 24`; the prototype exposes a `slaDefaultDays` fallback of 3 for types with no SLA set. Whether the SLA counts working days or calendar days is an open product question — the copy says "working days".

## Design tokens

The prototype ships a wireframe system; **do not carry it over**. Re-skin with `src/theme/editorial.ts`:

| Prototype role | Prototype value | Use instead |
|---|---|---|
| Accent / primary | `#5980a6` | `editorial.pmwBlue` `#0078D4`, hover/pressed `editorial.pmwBlueDark` `#005A9E` |
| Accent tint (pill fills) | `#eef6ff` / `#d6ebff` | `editorial.blueWash` `#EDF7FE`, `editorial.pmwBlueSoft` `#D7ECFA` |
| Deep accent (breach pill, toast) | `#1d2d3d` | `editorial.ink` `#101010` for the toast; `editorial.error` `#C62828` for genuine SLA breach |
| Ground | `#f2f2f3` | theme `background.default` `editorial.skySoft`, panels `editorial.panel` `#FFFFFF` |
| Text / muted | `#1d1f20` / 55% ink | `editorial.ink` / `editorial.muted` `#5F646D` |
| Divider | 16% ink | `editorialHairline` (`1px solid #DDE4EC`) |
| Heading font | Barlow Condensed 600 | `editorialFonts.sans` at the theme's `h3`–`h6` weights (700) |
| Body font | Barlow 400 | `editorialFonts.sans`, `body1` 0.96rem / `body2` 0.875rem |
| Radius | 0 (square) | theme `shape.borderRadius` 12 · cards/dialogs 14 · MUI buttons are square (`borderRadius: 0`) already |
| Elevation | flat + hairline | `editorialShadow` / `editorialShadowHover` |
| Spacing | 3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2 px | MUI `spacing()` — read the prototype's gaps as ≈0.5/1/1.5/2/2.5/3.5 units |

Severity in the prototype is encoded by **weight, not hue** (solid dark for Major, tint for Serious) because its palette is mono. With the PMW palette available, use `editorial.error` for Major/LTI, `editorial.warning` `#B15C00` for Serious, and a neutral tint below that — but keep the weight difference so severity survives greyscale printing.

Also drop, when re-skinning: the `.blueprint` corner registration marks (`<i class="corner …">`), square-cornered cards, and the transparent card fills. They belong to the wireframe system, not to PMW.

## Assets

None new. Logos already exist at `src/assets/logo*.png` and `public/logo*.png`; icons at `public/icons.svg`. The prototype used no imagery — the login animation is pure CSS on `<div>`s, so nothing needs exporting. Use `@mui/icons-material` for any icon the recreation needs.

## Accessibility notes

- Every tap target in the public flow is ≥44px; keep that on mobile — this is filled in one-handed, on a jetty, in sunlight.
- The prototype relies on the design system's `:focus-visible` ring; MUI's focus styles cover this, but check the custom picker rows (they are `<button>`s, not inputs — keep them so).
- Severity and status must not be colour-only; each pill carries text.
- Honour `prefers-reduced-motion` for the login animation and the drawer slide.

## Files in this bundle

- `design/PMW OSHES.dc.html` — the current prototype: login, five roles, drawer, dialogs, linear public flow, catalogue, people, audit trail.
- `design/PMW OSHES v1.dc.html` — earlier version, single safety-officer view with a stage-picker public flow. Kept only to show what changed and why.
- `design/styles.css` — the wireframe design system the prototypes link. **Reference only; do not port.**
- `design/support.js` — prototype runtime. Not part of the design.

To drive the prototype: open `PMW OSHES.dc.html`, click a demo account row, then `Sign in`. Sign in as the approver, sign an item, then sign in as the submitter and watch the same record move.

## Open questions for the team

1. **Auditor group** — does a read-only OSHE group exist in Entra, or does one need creating?
2. **SLA semantics** — working days or calendar days, and per layer or per whole form?
3. **Return for more information** — is there an existing SharePoint status for it, or does `Rejected` + a note carry it today?
4. **Reassignment** — permanent change to the `LayerConfig` assignee, or per-submission override? The prototype assumes per-submission.
5. **Anonymous reports** — confirm PDPA treatment for a report with no name and no email (`PDPA_COMPLIANCE.md` covers consent, not anonymity).
