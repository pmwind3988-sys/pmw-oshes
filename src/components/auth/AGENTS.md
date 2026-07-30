# AGENTS.md — src/components/auth/

**Scope:** Auth UI screens and route guards for the Azure AD / guest auth state machine.

## Auth State Machine Mapping

Each `PageState` maps to a screen component rendered by `App.tsx`:

| State | Component | Purpose |
|-------|-----------|---------|
| `choice` | `ChoiceScreen` | MSAL login vs guest decision (persisted to localStorage) |
| `guest` | `GuestLanding` | Guest mode entry point |
| `loading` | `LoadingScreen` | Animated progress bar while fetching data |
| `restricted` | `RestrictedAccessScreen` | Signed-in account lacks SharePoint site access |
| `wrong_tenant` | `WrongTenantScreen` | Tenant mismatch error with sign-out |
| `error` | `ErrorScreen` | Generic error fallback; auth timeout recovery uses "Re-login" with visual recovery steps |
| `ready` | `AdminGuard` | Route guard for admin pages (not an auth state screen) |

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Auth choice | `ChoiceScreen.tsx` | MSAL vs guest toggle — note: checkbox state is NOT wired (decision always persisted) |
| Guest landing | `GuestLanding.tsx` | Public user landing page |
| Loading indicator | `LoadingScreen.tsx` | `LinearProgress` with fade-in animation |
| SharePoint access restriction | `RestrictedAccessScreen.tsx` | Shows site membership guidance with retry/switch/sign-out |
| Wrong tenant | `WrongTenantScreen.tsx` | Identity mismatch — shows current vs expected tenant |
| Error fallback | `ErrorScreen.tsx` | Catch-all error with configurable retry/re-login callback and optional visual recovery steps |
| Admin guard | `AdminGuard.tsx` | Wraps protected admin-style routes; shows "Access Denied" + 4s redirect to `/user/dashboard`. Builder routes pass a superuser restriction label. |

## Conventions

- **Styling**: MUI components + `fadeInUp` animation imported from `../../theme`
- **fadeInUp**: Defined in `src/theme/index.ts` — keyframe animation used by ALL auth screens (slide up + fade in)
- **ThemeProvider**: Each auth screen wraps its own `<ThemeProvider theme={theme}>` — redundant with App.tsx's outer ThemeProvider but functional (MUI merges)
- **Props**: All screens receive simple props: `setPageState`, `onSignIn`, `onGuest`, `retry`, etc.
- **No ErrorBoundary**: Auth screens render OUTSIDE any ErrorBoundary — a crash here produces a white screen

## Anti-Patterns

- `ChoiceScreen.tsx` has `console.log("Choice clicked")` — remove
- `AdminGuard.tsx` receives the already-computed permission flag from `App.tsx` rather than checking group membership itself. Builder routes pass `canUseFormBuilder`; other admin routes pass `isAdmin`.
- `WrongTenantScreen.tsx` exposes `accounts[0]?.tenantId` (the current tenant) — this is visible to the user; acceptable for debugging
