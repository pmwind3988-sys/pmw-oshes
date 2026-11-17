# AGENTS.md — src/components/dashboard/

**Scope:** Now holds a single component. The legacy full dashboard (its header, stats, filter toolbar, submission table and detail modal) was retired with the `/admin/dashboard` and `/user/dashboard` routes. Those addresses redirect to the portal (`src/utils/legacyRoutes.ts`). Browsing, filtering and record detail now live in the portal (`src/components/portal/`, `src/pages/portal/`).

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Appearance picker | `AppearancePicker.tsx` | Used by the portal's Settings screen (`src/pages/portal/SettingsScreen.tsx`) |

## Shared card language
The portal screens draw from `src/components/Widget.tsx` and `src/theme/surfaces.ts`. See `src/components/portal/AGENTS.md` for the full list.

**No literal colours.** Earlier versions of this folder carried `rgba(255,255,255,0.94)` panels, `#FFF3E0` banners and `` `${stat.accent}26` `` — the last of which silently produced `var(--pmw-success)26` and rendered as nothing once the tokens became CSS variables. Compose transparency with `color-mix(in srgb, <token> N%, transparent)`, and take radii from `radius`, or the admin half of the app breaks the moment somebody picks Midnight.
