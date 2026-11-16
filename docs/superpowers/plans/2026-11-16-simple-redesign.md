# Simple Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal's 11-item navigation, legacy dashboards and one-off screens with the three-tab, mascot-led design on the "OSHES Redesign" canvas.

**Architecture:** Keep the data layer (`PortalContainer`, `PortalContext`, `portalRecords`, `portalStats`, `sharepointClient`, the drawer's actions). Add a small shared kit (mascot, message card, loading view, pager), rewrite the shell as a top bar, merge screens, move admin tools into Manage, and redirect retired routes.

**Tech Stack:** React 19, MUI 9, react-router 7, Vitest + Testing Library, Vite.

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

### Task 6: Top bar shell and form picker

**Files:**
- Modify: `src/components/portal/PortalShell.tsx`, `src/styles/shell.css`, `src/pages/PortalPage.tsx`, `src/devPreview/main.tsx`
- Create: `src/components/portal/FormPickerDialog.tsx` (logic lifted from `src/pages/portal/FileFormScreen.tsx`, which is then deleted)
- Test: `src/pages/portal/portalScreens.test.tsx`

**Interfaces:**
- Consumes: `portalTabs`, `setScreen`, `submitSearch`.
- Produces: `FormPickerDialog({ open, onClose }: { open: boolean; onClose: () => void })` listing catalogue forms as tiles that open the published form exactly as `FileFormScreen` does today. Shell layout per canvas: logo + "OSHES Forms", tab pills (active = ink fill), red badge on Submissions, "File a form" button (when `access.canFile`) opening the picker, account pill (initials + name) → `setScreen("settings")`. Search moves into Home and Submissions (removes the bar's search and the "/" shortcut). Below 760px the tabs wrap under the logo; no hamburger. `PortalPage` routes: home, subs, manage, people, audit, smoking, settings.

- [ ] **Step 1: Failing test** — shell for an admin fixture shows tabs "Home", "Submissions", "Manage"; for a submitter fixture, no "Manage"; pressing "File a form" opens a dialog listing the fixture catalogue's form names.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; update `devPreview/main.tsx` screen chips to the new screens.
- [ ] **Step 4:** `npx vitest run src/pages/portal` → PASS.
- [ ] **Step 5:** Commit `Replace the side rail with a three-tab top bar`.

### Task 7: Home

**Files:**
- Modify: `src/pages/portal/HomeScreen.tsx`
- Delete: `src/pages/portal/FormHubScreen.tsx`, `TodayScreen.tsx`, `CatalogueScreen.tsx`
- Test: `src/pages/portal/portalScreens.test.tsx`

**Interfaces:**
- Consumes: `FormPickerDialog`, `Mascot`, `TINTS`, `setScreen`, `submitSearch`, `openDrawer`.
- Produces (canvas "Main"): blue greeting banner ("Good morning/afternoon/evening", "Hi, {first name}", search box submitting to `submitSearch`, `hello` mascot); "File a form" grid of up to 5 catalogue tiles (tint cycles through `TINTS`) plus "All forms" opening the picker — only when `access.canFile`; "Needs you" card listing the first 3 of `queue` with a "Sign" button opening the drawer, plus "See all" → `setScreen("subs", null, null, "needs")` — only when `queue.length > 0`; "Recent" card with the first 5 of `myRecords` and "See all" → `setScreen("subs", null, null, "mine")`. Empty recent → `MessageCard` (`fullPage={false}`, mood `empty`, "Nothing here yet", "Forms you file will show up here.", primary "File a form").

- [ ] **Step 1: Failing tests** — fixture with 2 queue items shows "Needs you" with two "Sign" buttons; empty-queue fixture has no "Needs you"; clicking "See all" under Recent calls `setScreen` with `("subs", null, null, "mine")`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement and delete the three screens (and any helper used only by them; `npx tsc -b` tells you).
- [ ] **Step 4:** `npx vitest run src/pages/portal && npx tsc -b` → PASS.
- [ ] **Step 5:** Commit `Simplify Home to forms, what needs you, and recent filings`.

### Task 8: Submissions — one list, three scopes, pages

**Files:**
- Modify: `src/pages/portal/RecordsScreen.tsx`, `src/pages/PortalPage.tsx`
- Delete: `src/pages/portal/QueueScreen.tsx`
- Test: `src/pages/portal/portalScreens.test.tsx`

**Interfaces:**
- Consumes: `subsScopes`, `focusSubsScope`, `Pager`, `paginate`, existing filters/`ExportCsvButton`.
- Produces (canvas "Submissions"): title, segmented All / Mine / Needs me (badge on Needs me), search, status filter, form filter, Export. Rows: tinted form icon, form name, reference, filed by, date, status pill, trailing "Sign" (Needs me rows, opens drawer) or "Open". Needs-me rows get the ink 2px border. Pager under the table (default 25; size remembered in `prefs` as `pageSize`). Scope, search, status, form or size change → page 1. Empty result → `MessageCard` `fullPage={false}`, mood `empty`, "Nothing matches", "Try a different search or filter." `RecordsScreen` takes no `scope` prop any more; `PortalPage` keys it on `${focusSubsScope}-${focusForm}-${focusStatus}-${searchSeedAt}`.

- [ ] **Step 1: Failing tests** — fixture of 60 records: 25 rows rendered, "Showing 1–25 of 60"; Next → "Showing 26–50 of 60"; switching to Mine returns to page 1; auditor fixture shows no "Needs me".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/pages/portal` → PASS.
- [ ] **Step 5:** Commit `Merge every submissions list into one paged list`.

### Task 9: Record panel

**Files:**
- Modify: `src/components/portal/SubmissionDrawer.tsx`, `src/components/portal/RecordDetail.tsx`, `DeleteRecordDialog.tsx`, `WithdrawDialog.tsx`, `ReassignDialog.tsx`
- Test: `src/components/portal/recordDetailAnswers.test.tsx`, new `src/components/portal/submissionDrawer.test.tsx`

**Interfaces:**
- Produces (canvas "Record"): the drawer opens wide (min(1040px, 100vw)); header with back/close, form name, "{reference} · filed by {submitter} on {date}", "Download PDF" (existing split control kept). Two columns that stack under 900px: left "What was filed" (first 6 answers + "See all N answers" expanding the existing Answers view) and Photos; right "Where it is" step list (signed = green tick, current = sun circle with ink border, pending = grey) and the action buttons ("Approve and sign" / "Return with a note" for the current assignee; Withdraw/Cancel/Delete per the existing rules). Timeline stays reachable as a "History" toggle under the steps. **Wire `ReassignDialog`** as a "Change who signs" action for `access.canChase && !record.done` (replaces the reassignment that lived on the retired `/admin/submissions` page). Delete confirmation uses `MessageCard` `fullPage={false}` (mood `delete`, "Delete {reference}?", "This removes the form, its signatures and photos for everyone. It cannot be undone.", "Delete for everyone" danger / "Keep it") while keeping the type-the-reference guard.

- [ ] **Step 1: Failing tests** — for an admin on an in-flight record, "Change who signs" is present; for an auditor no buttons render; delete dialog shows "Delete for everyone" disabled until the reference is typed.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; existing `recordDetailAnswers.test.tsx` must still pass.
- [ ] **Step 4:** `npx vitest run src/components/portal` → PASS.
- [ ] **Step 5:** Commit `Redesign the record panel and bring back reassignment`.

### Task 10: Manage, its tools, and Account

**Files:**
- Create: `src/pages/portal/ManageScreen.tsx`
- Modify: `src/pages/portal/PeopleScreen.tsx`, `AuditScreen.tsx`, `SmokingLogScreen.tsx`, `SettingsScreen.tsx`, `src/components/smoking/SmokingLogTable.tsx`, `src/components/smoking/SmokingPaging.tsx`
- Test: `src/pages/portal/portalScreens.test.tsx`

**Interfaces:**
- Consumes: `portalStats`, `TestRunLauncher` / `TestRunPanel` (props `{ open, onClose, form: { Title, Slug } }`), `loadedConfig.formSlugMap` (thread `formSlugs: Record<string,string>` and `canRunTestRuns: boolean` into the context from `App.tsx` → `PortalContainer`), `builderUrl()`.
- Produces (canvas "Manage"): three count tiles, each a button → Submissions: "forms filed today" (`statusScope` "all"), "waiting for a signature" ("open"), and "waiting too long" ("Past SLA") only when `anySla(catalogue)`. Tool cards (each only when allowed): People and approvers → `people`; Smoking log → `smoking`; History → `audit`; Approval routing → `/admin/routing` (builder superusers, as today); Test runs (when `canRunTestRuns`) → pick a form, then launcher or results; Form builder (external, `builderUrl()`). People/History/Smoking pages get a "Back to Manage" link and `Pager` on their tables (smoking keeps its own paging component restyled to match `Pager`, or switches to it). Account (canvas "Account"): identity card with role pill, Appearance (existing control), "Open the app on" (Home / Submissions), Privacy notice, Refresh my data, red-outlined "Sign out".

- [ ] **Step 1: Failing tests** — admin fixture: Manage shows "People and approvers", "History", "Smoking log"; auditor fixture: Manage shows "History" and no "Test runs"; clicking "waiting for a signature" calls `setScreen("subs", null, "open", "all")`; History with 80 entries shows a pager.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/pages/portal && npx tsc -b` → PASS.
- [ ] **Step 5:** Commit `Gather admin tools under Manage and simplify Account`.

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
