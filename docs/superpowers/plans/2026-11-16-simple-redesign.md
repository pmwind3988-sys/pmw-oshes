# Simple Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal's 11-item navigation, legacy dashboards and one-off screens with the three-tab, mascot-led design on the "OSHES Redesign" canvas.

**Architecture:** Keep the data layer (`PortalContainer`, `PortalContext`, `portalRecords`, `portalStats`, `sharepointClient`, the drawer's actions). Add a small shared kit (mascot, message card, loading view, pager), rewrite the shell as a top bar, merge screens, move admin tools into Manage, and redirect retired routes.

**Tech Stack:** React 19, MUI 9, react-router 7, Vitest + Testing Library, Vite.

**Amended 2026-11-17:** Tasks 6–10 now follow the Jira-style canvas artboards (Your work, Submissions list + board, record page with side panel, Manage sidebar); Task 14 swaps the mascot for Corporate Memphis art and runs before Task 6.

**Spec:** `docs/superpowers/specs/2026-11-16-simple-redesign-design.md`. Visual reference: https://claude.ai/artifact/RCLzzsg5SnArk5NcCphmbU (desktop artboards Main, Submissions, Record, Form, Done, Manage, Account, SignIn, Loading, Messages).

## Global Constraints

- The department is **OSHES**, never "OSHE".
- Colours come from the MUI theme built by `buildTheme()` (`palette.primary.main`, `background.default`, `background.paper`, `text.primary`, `text.secondary`, `divider`, `success.main`, `error.main`, `warning.main`) so all six contrast themes keep working. The canvas hexes are what the **default** appearance must produce: ink `#1B2540`, page `#F4F6FA`, card `#FFFFFF`, primary `#1F5FD0`, muted `#5B6577`, hairline `#E3E8F0`, success `#17794B`, danger `#C8372D`. Fixed accent constants (not theme): sun `#FFC83D`; tile tints `#FFF1CC`, `#FFE4E0`, `#ECE6FF`, `#DDF5E6`, `#E3EEFF`, `#EEF1F6`.
- Font: Plus Jakarta Sans 500/600/700/800 as the default font theme.
- Radii come from `radius` in `src/theme/surfaces.ts`; never type a pixel radius.
- Controls are at least 44px tall; buttons and pills fully rounded.
- Plain words in UI copy: "Needs me", "Sign", "Return", "Try again". No internal jargon ("layer", "SLA") in titles; keep it in secondary text only where it already exists.
- Who may see or do what is unchanged: every gate keeps reading `PortalAccess` and `canWithdrawRecord` / `canDeleteRecord`.
- Public URLs keep working: `/form/:formId`, `/eval/...`, `/report`, `/track`, `/smoke`, `/share-link`, `/privacy`, `/native/:formId`.
- No new runtime dependencies.

## Review Focus

1. A link from an old approval email (`/admin/submissions?form=Permit%20to%20Work&item=42`) must land on Submissions with that record open, for an approver who is not an admin.
2. A signed-out person opening a public form that is closed / expired / not found sees the message card, not a sign-in page.
3. An auditor (read-only) sees Manage's numbers and History but no action buttons anywhere, and "Needs me" is absent.
4. A list of 1,284 rows renders 25 rows and a working pager; changing All/Mine/Needs me or rows-per-page returns to page 1.
5. Midnight (dark) contrast theme: every new surface stays readable (no white cards on black).

---

### Task 1: Default look — font and theme values

**Files:**
- Modify: `src/theme/appearance.ts` (FONT_THEMES, DEFAULT_APPEARANCE, the default colour theme), `index.html` (Google Fonts link)
- Test: `src/theme/appearance.test.ts`

**Interfaces:**
- Produces: a font theme with id `"jakarta"` (body and heading `"'Plus Jakarta Sans', system-ui, sans-serif"`), made `DEFAULT_APPEARANCE.fontThemeId`; default appearance resolves to the canvas hexes above. Also `src/theme/simple.ts` exporting `SUN = "#FFC83D"` and `TINTS = { amber: "#FFF1CC", red: "#FFE4E0", violet: "#ECE6FF", green: "#DDF5E6", blue: "#E3EEFF", grey: "#EEF1F6" } as const`.

- [ ] **Step 1: Failing test** — in `appearance.test.ts`: `it("defaults to Plus Jakarta Sans and the canvas palette")` asserting `resolveAppearance(DEFAULT_APPEARANCE)` (use the file's existing resolver name) has `fontBody` containing `"Plus Jakarta Sans"`, `brand === "#1F5FD0"`, page background `"#F4F6FA"`, ink `"#1B2540"`.
- [ ] **Step 2:** `npx vitest run src/theme/appearance.test.ts` → FAIL.
- [ ] **Step 3:** Add the font theme and default values; add the font `<link>` (wght 500;600;700;800) to `index.html`; if `cspParity.test.ts` checks font hosts, keep it passing. Create `src/theme/simple.ts`.
- [ ] **Step 4:** `npx vitest run src/theme` → PASS (update any existing default-value assertions that the new default intentionally changes).
- [ ] **Step 5:** Commit `Make Plus Jakarta Sans and the canvas palette the default look`.

### Task 2: Mascot

**Files:**
- Create: `src/components/simple/Mascot.tsx`, `src/components/simple/Mascot.test.tsx`

**Interfaces:**
- Produces: `export type MascotMood = "hello" | "loading" | "success" | "error" | "expired" | "locked" | "switch" | "notfound" | "closed" | "empty" | "delete";` and `export default function Mascot({ mood, size = 120, className }: { mood: MascotMood; size?: number; className?: string })` rendering one inline `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">`.

- [ ] **Step 1: Failing test** — for every mood, render and assert one `svg` with `aria-hidden="true"` and `width`/`height` equal to `size`; `size={64}` renders `width="64"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Port the 11 drawings from the canvas (shared body: circle backdrop, clipboard with sun clip, blush cheeks; per mood: backdrop tint, face, badge). Source SVGs: `/_blob/` assets on the canvas, saved locally at `C:\Users\User\AppData\Local\Temp\claude\03d9edfca4c2d8f3\6e976842-1f2e-4379-bf3e-38967c242ed8\scratchpad\oshes\assets\m-<mood>.svg`. Shared parts are one component; moods are a lookup table, not 11 copies.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `Add the OSHES mascot in eleven moods`.

### Task 3: Message card, loading view, pager

**Files:**
- Create: `src/components/simple/MessageCard.tsx`, `src/components/simple/LoadingView.tsx`, `src/components/simple/Pager.tsx`, `src/utils/paginate.ts`
- Test: `src/utils/paginate.test.ts`, `src/components/simple/simpleKit.test.tsx`

**Interfaces:**
- Consumes: `Mascot`, `MascotMood` (Task 2).
- Produces:
  - `MessageCard({ mood, title, body, primary, secondary, details, fullPage = true }: { mood: MascotMood; title: string; body: React.ReactNode; primary?: { label: string; onClick?: () => void; href?: string; tone?: "primary" | "danger" }; secondary?: { label: string; onClick?: () => void; href?: string }; details?: string; fullPage?: boolean })`. `details` renders behind a "Show details" toggle. `fullPage` centres on the page background; `false` renders the bare card for use inside dialogs/lists.
  - `LoadingView({ title = "Getting things ready", status }: { title?: string; status?: string })` with the bobbing "loading" mascot (animation off under `prefers-reduced-motion`), a `role="status"` line and an indeterminate bar.
  - `pageWindow(page: number, last: number): (number | "gap")[]` and `paginate<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; last: number; from: number; to: number; total: number }` (page clamped into 1..last; empty input → `from 0, to 0, last 1`).
  - `Pager({ total, page, size, onPage, onSize, sizes = [25, 50, 100] }: { total: number; page: number; size: number; onPage: (p: number) => void; onSize: (s: number) => void; sizes?: number[] })` — "Showing {from}–{to} of {total}" (en-US thousands separators), rows-per-page select, prev/next with `aria-label`, page buttons with `aria-current="page"`.

- [ ] **Step 1: Failing tests** — `pageWindow(5, 52)` → `[1, "gap", 4, 5, 6, "gap", 52]`; `pageWindow(1, 3)` → `[1, 2, 3]`; `pageWindow(1, 1)` → `[1]`; `paginate(range(1284), 2, 25)` → `rows[0] === 25, from 26, to 50, last 52`; `paginate(range(30), 9, 25).page === 2`; `paginate([], 1, 25)` → `from 0, to 0, last 1`. Component tests: MessageCard renders title as `h1` when `fullPage`, calls `primary.onClick`, hides details until "Show details" is pressed; Pager shows "Showing 1,226–1,250 of 1,284" for page 50 size 25, and Next is disabled on the last page.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/utils/paginate.test.ts src/components/simple` → PASS.
- [ ] **Step 5:** Commit `Add the message card, loading view and table pager`.

### Task 4: Sign-in, loading and error screens

**Files:**
- Modify: `src/components/auth/SignInScreen.tsx`, `GuestLanding.tsx`, `LoadingScreen.tsx`, `ErrorScreen.tsx`, `RestrictedAccessScreen.tsx`, `WrongTenantScreen.tsx`, `AdminGuard.tsx`, `src/components/ErrorBoundary.tsx`
- Delete: `src/components/auth/ChoiceScreen.tsx`, `IdleAnimationPanel.tsx` if nothing else imports them
- Test: `src/components/auth/authScreens.test.tsx`

**Interfaces:**
- Consumes: `MessageCard`, `LoadingView`, `Mascot`.
- Produces: every component keeps its current props, so `App.tsx` compiles unchanged. `LoadingScreen` still accepts `userEmail`, `progress`, `status`, `steps` but shows only `LoadingView` with `status`. `ErrorScreen` maps `title`/`primaryActionLabel` through; reauth → mood `expired`, title "You have been away a while"; generic → mood `error`, title "Something went wrong", `errorMsg` in `details`.
- Copy (verbatim from the canvas): Restricted → mood `locked`, "No access yet", "This account is not set up for OSHES. Ask the OSHES team to add you, then try again.", buttons "Try again" / "Use another account". Wrong tenant → mood `switch`, "Wrong account", "You are signed in with an account from outside PMW. Switch to your work account.", "Switch account" / "Sign out". AdminGuard → mood `locked`, "This page is for OSHES admins", redirect target `/portal` (was `/user/dashboard`). ErrorBoundary → mood `error`, "Something went wrong", "Try again" reloads.
- Sign-in page: split layout (blue panel with `hello` mascot and "File a safety form in a minute. See where it is at any time."; right side "Welcome", "Sign in with Microsoft 365", "Continue without signing in" → `onForgetChoice`/guest path as today, small print and Privacy notice link). `GuestLanding` renders the same page with the guest note.

- [ ] **Step 1: Failing tests** — each screen renders its title text above; AdminGuard for a non-admin calls navigate with `"/portal"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/components/auth && npx tsc -b` → PASS.
- [ ] **Step 5:** Commit `Bring sign-in, loading and error screens into the simple design`.

### Task 5: Navigation model — three tabs

**Files:**
- Modify: `src/types/portal.ts`, `src/utils/portalRole.ts`, `src/contexts/PortalContext.tsx`, `src/components/portal/PortalContainer.tsx`
- Test: `src/utils/portalRole.test.ts`

**Interfaces:**
- Produces:
  - `PortalScreen = "home" | "subs" | "manage" | "people" | "audit" | "smoking" | "settings"` (removes `form`, `queue`, `mine`, `file`, `today`, `cat`).
  - `export type SubsScope = "all" | "mine" | "needs";`
  - `export interface PortalTab { screen: "home" | "subs" | "manage"; label: string; badge: number }` and `portalTabs(access: PortalAccess, needsCount: number): PortalTab[]` → Home, Submissions (badge = needsCount), and Manage only when `access.canSeeOperations || access.canSeePeople || access.canSeeAudit || access.isAdmin`.
  - `allowedScreens(access)`: home, subs, settings always; manage + its children (`people` if canSeePeople, `audit` if canSeeAudit, `smoking` if isAdmin || isAuditor) when Manage is shown.
  - `subsScopes(access): SubsScope[]` → `["all", "mine"]` plus `"needs"` when `!access.readOnly && access.isAssignee`.
  - Context: `setScreen(screen, formScope?, statusScope?, subsScope?: SubsScope | null)`; new `focusSubsScope: SubsScope | null`. Remove `portalSections` / `portalNav` and `PortalNavItem`/`PortalNavSection` once no caller remains (Task 6 removes the shell's use).
  - `PortalContainer` reads `?screen=&form=&item=&scope=` from `location.search` once after records load: sets the screen and, when `form` + `item` match a record (`listTitle`, `itemId`), calls `openDrawer(record.reference)`; then strips those params with `navigate({ search: "" }, { replace: true })`. Pure helper `readPortalDeepLink(search: string): { screen?: PortalScreen; form?: string; item?: string; scope?: SubsScope }` in `src/utils/portalDeepLink.ts` with its own test.
  - Saved `prefs.landing` values that are no longer screens fall back to `"home"`.

- [ ] **Step 1: Failing tests** — `portalTabs` for submitter → `["home","subs"]`; admin → `["home","subs","manage"]`; auditor `subsScopes` has no `"needs"`; `readPortalDeepLink("?screen=subs&form=Permit%20to%20Work&item=42")` → `{ screen: "subs", form: "Permit to Work", item: "42" }`; unknown screen → `{}`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; fix compile errors only in the files listed (screens are rewritten in Tasks 7–10; until then `PortalPage` may map removed cases to `HomeScreen`).
- [ ] **Step 4:** `npx vitest run src/utils/portalRole.test.ts src/utils/portalDeepLink.test.ts` → PASS.
- [ ] **Step 5:** Commit `Reduce the portal to Home, Submissions and Manage`.

### Task 6: Jira-style top bar and form picker (rework of commit a267ea4)

**Files:**
- Modify: `src/components/portal/PortalShell.tsx`, `src/styles/shell.css`, `src/components/portal/FormPickerDialog.tsx` (already exists from a267ea4), `src/pages/portal/portalScreens.test.tsx`

**Interfaces:**
- Consumes: `portalTabs`, `setScreen`, `submitSearch`, `FormPickerDialog`.
- Produces (canvas artboard `Main` header; HTML reference at `.superpowers/sdd/2026-11-16-simple-redesign/canvas/Main.dc.html`): white bar, bottom hairline, content max-width 1280px, min-height 60px. Left: logo chip (34px, SUN, 2px ink border) + "OSHES Forms". Tabs are text links 60px tall with a 3px bottom border — active: `primary.main` border and text, weight 800; inactive: transparent border, `text.primary`. Tab labels: **"Your work"** (screen home), "Submissions" (red count badge when `badge > 0`, with an `aria-label` like "2 need you"), "Manage". Right: global search (40px, light ground, 1.5px hairline border, radius `radius.md`-ish, placeholder "Search forms or PTW-0417", a `/` kbd hint) that submits to `submitSearch`; the **"/" shortcut is restored** (focus the box unless typing in a field); blue **"Create"** button (plus icon, only when `access.canFile`) opening `FormPickerDialog`; 36px avatar button (initials on SUN) opening a small menu with "Account" (→ settings) and "Sign out". Buttons here are 40px tall, radius ~10px (not pills) — the Jira look; keep 44px+ touch targets by padding the clickable area.
- Below 760px: tabs wrap to their own row, search takes full width on its own row.

- [ ] Step 1: failing tests — admin fixture shows tab "Your work", "Submissions", "Manage" and a "Create" button; submitter has no "Manage"; the search input has placeholder "Search forms or PTW-0417".
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: `npx vitest run src/pages/portal && npx tsc -b` → PASS. Step 5: commit `Give the top bar Jira-style tabs, search and Create`.

### Task 7: Your work (Home)

**Files:** Modify `src/pages/portal/HomeScreen.tsx`; test `src/pages/portal/portalScreens.test.tsx`.

**Interfaces:**
- Consumes: `FormPickerDialog`, `TINTS`, `setScreen`, `openDrawer`, `queue`, `myRecords`, `records`, `catalogue`.
- Produces (canvas `Main`): h1 "Your work" + one muted line ("Good morning, {first name}. {n} forms are waiting for your signature." — omit the second sentence when n = 0); a "View all submissions" outline button. "Start a form" section (only `access.canFile`): small uppercase label, grid of up to 4 catalogue cards (tinted 44px icon square, form name, "{n} sign-off(s)" from the chain length or "No sign-off"), and an "All forms" link opening the picker. A white card with tabs **Needs you** (count chip) / **Filed by you** / **Viewed recently**:
  - Needs you = `queue`; Filed by you = `myRecords`; Viewed recently = records whose drawer was opened this session (keep a small in-memory list in context: `recentRefs: string[]`, newest first, max 8, pushed by `openDrawer`).
  - Row: 32px tinted icon, subject (bold) over "{reference} · {form} · {submitter}", a status lozenge (uppercase 11px, tinted bg — waiting amber, in approval blue, approved green, returned red, recorded grey), date, and on Needs-you rows a blue "Review" button. Max 8 rows, then "See all" → Submissions with the matching scope.
  - Default tab: Needs you when it has items, else Filed by you. Hide Needs you for read-only accounts.
  - Empty tab → `MessageCard fullPage={false}` (Needs you: mood `success`, "You're all caught up", "Nothing is waiting for your signature."; Filed by you: mood `empty`, "Nothing here yet", "Forms you file will show up here.", primary "Create" → picker).

- [ ] Step 1: failing tests — default tab logic (pure helper `defaultWorkTab(queueLength, readOnly)`), lozenge tone mapping (pure `statusTone(status: PortalStatus): "waiting" | "progress" | "done" | "returned" | "neutral"`), empty-state titles. Step 2 FAIL → Step 3 implement → Step 4 PASS → Step 5 commit `Make Home a Your work page`.

### Task 8: Submissions — list and board

**Files:** Modify `src/pages/portal/RecordsScreen.tsx`, `src/pages/PortalPage.tsx`; create `src/pages/portal/SubmissionsBoard.tsx`, `src/utils/boardColumns.ts`; tests `src/utils/boardColumns.test.ts`, `src/pages/portal/portalScreens.test.tsx`.

**Interfaces:**
- Consumes: `subsScopes`, `focusSubsScope`, `Pager`, `paginate`, `statusTone` (Task 7), existing filters and `ExportCsvButton`.
- Produces (canvas `Submissions` and `Board`):
  - Header: h1 "Submissions", a List / Board segmented switch (remembered in `prefs.subsView: "list" | "board"`), Export.
  - Filter row: search box, chips All / Mine / Needs me (single-select; Needs me hidden when not in `subsScopes`; "Needs me" = `queue`), then dropdown buttons Form, Status, Filed (date range: Any time / Today / Last 7 days / Last 30 days).
  - List: a real `<table>` — columns: icon, Reference (blue bold link), Summary (subject, with form name under it), Filed by (avatar initials + name), With (current assignee avatar + name, "You" for this account, "—" when done), Status lozenge, Updated. Row click opens the record. `Pager` below (default 25; `prefs.pageSize`). Any filter/scope/size change → page 1.
  - Board: `boardColumns(records, userEmail): { id: "you" | "progress" | "returned" | "done"; title: string; items: PortalRecord[] }[]` — titles "Waiting for you", "In approval", "Returned", "Done"; Done holds only records settled in the last 14 days (a "Show N more in the list" link switches to List with status filter). Cards: subject, tinted form square, reference, age lozenge (or "x of y" step), assignee avatar; cards waiting for you get the ink 2px border. The board applies the same chips/filters but no paging; each column scrolls on its own. No drag-and-drop (statuses change only through signing).
  - Empty results → `MessageCard fullPage={false}` mood `notfound`, "Nothing matches", "Try a different search or filter."

- [ ] Step 1: failing tests — `boardColumns` puts a record on your layer in "you", a returned one in "returned", an approved one from 20 days ago nowhere and from 3 days ago in "done"; list of 60 shows "Showing 1–25 of 60"; auditor fixture has no "Needs me" chip. Step 2 FAIL → 3 → 4 PASS → Step 5 commit `Add list and board views to Submissions`.

### Task 9: Record page

**Files:** Modify `src/components/portal/SubmissionDrawer.tsx`, `src/components/portal/RecordDetail.tsx`, `src/pages/PortalPage.tsx`, `src/components/portal/PortalContainer.tsx`, `src/contexts/PortalContext.tsx`, `src/types/portal.ts`, `DeleteRecordDialog.tsx`, `WithdrawDialog.tsx`, `ReassignDialog.tsx`; tests `src/components/portal/recordDetailAnswers.test.tsx`, new `src/components/portal/recordPage.test.tsx`.

**Interfaces:**
- The record becomes a **page**, not a drawer: add `"record"` to `PortalScreen`. `openDrawer(ref)` keeps its name and now sets screen `"record"` (remembering the previous screen + scopes); `closeDrawer()` returns to it. The deep link from Task 5 therefore lands on the record page. `allowedScreens` includes `"record"` for everyone.
- Layout (canvas `Record`): breadcrumb "Submissions / {form} / {reference}" (Submissions and form go back to the list, form-scoped); h1 = subject; action row: Download PDF (existing split control), "Change who signs" (`ReassignDialog`, only `access.canChase && !record.done`), a ⋯ menu holding Withdraw/Cancel and Delete per `canWithdrawRecord` / `canDeleteRecord`. Left column: "What was filed" (first 6 answers in a 2-column definition grid, "Show all N answers" expands the existing Answers view), photos grid; **Activity** card with tabs All / Notes / History built from the record's existing timeline (notes = rejection/return reasons and evaluation notes; history = filed, each signature, returns, cancellations). No new write path for notes — the "Add a note" box from the canvas is **not** built (it has no backend); leave it out. Right side panel (300–420px, stacks under 900px): Approve and sign (green) + Return (outline) for the current assignee only; **Details** list (Status lozenge, With, Filed by, Form, Reference, Filed, and Due only when `hasSla`); **Sign-off steps** list (signed = green tick, current = sun circle with ink border, pending = grey ring) with "· {at+1} of {total}"; footer "Filed {date} · Updated {age}".
- Delete confirmation uses `MessageCard fullPage={false}` (mood `delete`, "Delete {reference}?", "This removes the form, its signatures and photos for everyone. It cannot be undone.", danger "Delete for everyone" / "Keep it") and keeps the type-the-reference guard.

- [ ] Step 1: failing tests — admin on in-flight record sees "Change who signs"; auditor sees no action buttons; breadcrumb text; Due row absent when `hasSla` is false; delete button disabled until the reference is typed (pure `canConfirmDelete(typed, reference)`). Step 2 FAIL → 3 → 4 PASS → Step 5 commit `Turn the record into a page with a details side panel`.

### Task 10: Manage with a sidebar, and Account

**Files:** Create `src/pages/portal/ManageScreen.tsx`, `src/components/portal/ManageLayout.tsx`; modify `PeopleScreen.tsx`, `AuditScreen.tsx`, `SmokingLogScreen.tsx`, `SettingsScreen.tsx`, `src/pages/PortalPage.tsx`, `src/components/smoking/SmokingLogTable.tsx` / `SmokingPaging.tsx`, `src/App.tsx` + `PortalContainer.tsx` (thread `formSlugs` and `canRunTestRuns`); tests `src/pages/portal/portalScreens.test.tsx`.

**Interfaces:**
- `ManageLayout({ active, children })`: left sidebar (canvas `Manage`) titled "MANAGE" with items Overview (`manage`), People and approvers (`people`, canSeePeople), Approval routing (link `/admin/routing`, builder superusers as today), Smoking log (`smoking`, isAdmin || isAuditor), History (`audit`, canSeeAudit), Test runs (`manage` sub-view, `canRunTestRuns`), divider, Form builder ↗ (`builderUrl()`, when set and `canManageCatalogue`). Active item: tinted `E3EEFF` background, `primary` text. Sidebar stacks above content under 900px.
- Overview: three count cards (each a button to Submissions): "Filed today" (status "all"), "Waiting for a signature" ("open"), "Waiting too long" ("Past SLA", only when `anySla(catalogue)`, red-tinted). A "Waiting the longest" table (top 5 open records by `hoursOnLayer`: reference + subject, With, Step "x of y", age lozenge) with "Open board" → Submissions board view.
- Test runs view: pick a form, then open `TestRunLauncher` or `TestRunPanel` (props `{ open, onClose, form: { Title, Slug } }`).
- People, History and Smoking log render inside `ManageLayout`; their tables use `Pager`.
- Account (canvas `Account`): identity card (avatar, name, email, role pill), Appearance (existing control), "Open the app on" (Your work / Submissions → `prefs.startScreen`), Privacy notice, Refresh my data, red-outlined Sign out.

- [ ] Step 1: failing tests — admin sidebar lists Overview, People and approvers, Smoking log, History; auditor sidebar has History and no Test runs; "Waiting for a signature" card calls `setScreen("subs", null, "open", "all")`; History with 80 entries shows a pager. Step 2 FAIL → 3 → 4 PASS → Step 5 commit `Gather admin tools under a Manage sidebar and simplify Account`.

### Task 11: Retire legacy routes

**Files:**
- Modify: `src/App.tsx`, `README.md`, `src/pages/AGENTS.md`, `src/components/portal/AGENTS.md`, `src/components/builder/AGENTS.md`, `src/components/auth/AGENTS.md`
- Create: `src/utils/legacyRoutes.ts`, `src/utils/legacyRoutes.test.ts`
- Delete: `src/pages/AdminHomePage.tsx`, `src/components/builder/ApprovalDashboard.tsx`, `src/components/builder/ResponseViewer.tsx`, `src/contexts/DashboardContext.tsx`, and `src/components/dashboard/*` files no longer imported (let `npx tsc -b` and a grep decide; keep anything `AdminRoutingPage` or the portal still imports)

**Interfaces:**
- Produces: `legacyRouteTarget(pathname: string, search: string): string | null` →
  - `/admin/submissions` or `/admin/approvals` + `?form=F&item=I` → `/portal?screen=subs&form=F&item=I`; without params → `/portal?screen=subs`
  - `/admin/responses/:formTitle` → `/portal?screen=subs&form=<formTitle>`
  - `/admin/dashboard`, `/user/dashboard`, `/adminhomepage` → `/portal`
  - anything else → `null`
  - These redirects are **not** admin-gated (approvers get those email links).
- `App.tsx`: one `<Route>` per legacy path rendering `<CatchAllRedirect to={legacyRouteTarget(...)} />`; remove the legacy dashboard element and its now-unused state (filters, sortBy, detailItem, hard-delete handler) and imports. `layerReviewLink.ts` / `formBuilderSP.ts` keep generating the old URL (emails in flight) — unchanged.

- [ ] **Step 1: Failing test** — the five mappings above with exact strings, including `encodeURIComponent` round-trip of "Permit to Work".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement, delete files, update docs (route list, the "One card shape" and screens tables).
- [ ] **Step 4:** `npm run build && npm run lint && npx vitest run` → all PASS.
- [ ] **Step 5:** Commit `Retire the legacy dashboards and redirect their links`.

### Task 12: Public form and approval pages

**Files:**
- Modify: `src/pages/DynamicFormPage.tsx` (state screens around lines 664 and 1891–1938, header/pills), `src/pages/EvaluationPage.tsx` (`StateScreen` uses), `src/pages/PublicReportPage.tsx`, `src/pages/SmokingScanPage.tsx`, `src/pages/ShareLinkPage.tsx`, `src/pages/PrivacyNoticePage.tsx`
- Test: `src/pages/formErrorKind.test.ts` (keep passing), new `src/pages/publicStates.test.tsx`

**Interfaces:**
- Consumes: `MessageCard`, `LoadingView`.
- Produces: form states → `MessageCard`: not ready / closed / expired → mood `closed` ("This form isn't ready yet" / "This form is closed" / "This form has expired"), not found → `notfound` ("We couldn't find this form"), load error → `error` ("We couldn't load this form", "Try again"), sign-in required → `locked` ("Sign in to open this form"). Evaluation: "This layer isn't yours" → mood `locked`, title "This one isn't for you". After submit → mood `success`, "All done!", reference block with Copy, "Track this form" / "Back to home" (canvas "Done"). Multi-page forms get the step rail on the left and the card on the right at ≥900px (canvas "Form"); fields keep their existing SurveyJS/native rendering — only the frame, header and buttons change. All other pages: swap to theme colours/font, wrap in the same page background and card.

- [ ] **Step 1: Failing test** — each error kind from `formErrorKind` renders its title above inside a `MessageCard`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run build && npx vitest run` → PASS.
- [ ] **Step 5:** Commit `Bring public forms and approval pages into the simple design`.

### Task 13: Verify in the browser

- [ ] `npm run dev`; open `/preview.html` for each screen (home, subs, manage, people, audit, smoking) in the default and `contrast=midnight` themes, at 1360px and 390px wide; open `/native/demo`. Fix anything unreadable or overflowing.
- [ ] `npm run build && npm run lint && npx vitest run` green.
- [ ] Commit fixes `Polish the redesign after a browser pass`.

### Task 14: Corporate Memphis art (replaces the clipboard mascot drawings; run before the Task 6 rework)

**Files:** Modify `src/components/simple/Mascot.tsx`, `src/components/simple/Mascot.test.tsx`.

**Interfaces:**
- Keeps the exact public API from Task 2: `type MascotMood` (same 11 moods) and `Mascot({ mood, size = 120, className })` rendering one `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">` with width/height = size. Every caller keeps working.
- Art: port the 11 Corporate Memphis scenes from `.superpowers/sdd/2026-11-16-simple-redesign/memphis/memphis-<mood>.svg` (flat, no outlines: a blob backdrop, confetti shapes, one long-limbed figure, one prop). Shared parts (blob, confetti, figure-by-pose, clipboard) are functions; moods are a table — not 11 pasted copies. Colours are the fixed illustration palette (allowed by the mascot exception in constraints.md).

- [ ] Step 1: update tests — viewBox is now "0 0 200 200"; every mood renders a backdrop path and at least one figure group; moods still render distinct markup.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: `npx vitest run src/components/simple && npx tsc -b` → PASS. Step 5: commit `Draw the message art in a Corporate Memphis style`.
