# AGENTS.md — src/components/portal/

**Scope:** The portal's shell, its record detail, and the pieces its screens are drawn from. Screens themselves live in `src/pages/portal/`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Context assembly | `PortalContainer.tsx` | Builds catalogue → records → access, and owns `screen` / `focusForm` / `focusStatus`. The only place portal state is held. |
| Header, nav drawer, profile | `PortalShell.tsx` | Nav is a drawer at every width; the account lives top right. |
| Record detail — layout | `RecordDetail.tsx` | `OverviewTab`, `AnswersTab`, `ApprovalsTab`, `TimelineTab`, plus `DetailRow` / `SoftCard`. No actions here. |
| Record detail — actions | `SubmissionDrawer.tsx` | Tabbed drawer: gating, sign/return/nudge/reassign/cancel/PDF, and the pinned action bar. |
| Interactive statistics | `PortalStats.tsx` | `StatTile`, `StatTileRow`, `StatusMix`, `IntakeChart`. |
| "What happens after submit" | `FlowStrip.tsx` | `blueprintSteps(entry)` for a form type, `recordSteps(record)` for one record. |
| Status / severity pills | `PortalPills.tsx` | Also `ProportionBar`. |

## Conventions
- **A statistic is a button.** Every count rendered by `PortalStats.tsx` takes an `onClick` that opens the rows it counted, via `setScreen(screen, formScope, statusScope)`. A count with no list behind it is a dead end — don't add one.
- **Counts and filters share one vocabulary.** Both are `StatFilter` (`src/types/portal.ts`), so a tile cannot count one way and filter another. `portalStats()` in `src/utils/portalStats.ts` is the single pass that produces them.
- **Navigation states its own scope.** `setScreen` takes the form and status scope as arguments and clears them when they are not passed, so a nav click cannot inherit a form hub's filter. `PortalPage` keys `RecordsScreen` on that scope so it remounts with the filters seeded.
- **Layout and actions are separate files.** `RecordDetail.tsx` decides how a record *reads*; `SubmissionDrawer.tsx` decides what this account may *do* with it. That is what lets the same detail serve an approver with three buttons and an audit account with none.

## SLA is opt-in — do not reintroduce a default
A form has an SLA only where its layer or its `LayerConfig` sets `slaDays`. `layerSlaDays()` returns **0** otherwise, `hasSla` is false on both `CatalogueEntry` and `PortalRecord`, and every SLA affordance is then absent — not zero, not "none", absent:

- no SLA card in `OverviewTab`, no header stat in the drawer
- no "Past SLA" tile, status bucket, or filter option
- `slaNote` is empty; screens use `waitNote`, which falls back to the plain age on the layer
- `TodayScreen`'s stuck panel becomes "Longest waits"

There used to be a `VITE_OSHES_SLA_DEFAULT_DAYS` global fallback of three working days. It meant a form nobody had ever given a deadline turned red on day four and reported a breach against a number no one had chosen. It is gone; `anySla(catalogue)` is how a screen asks whether to render SLA vocabulary at all.

## Anti-Patterns
- Don't read SLA off `slaDays > 0` at a call site — use `hasSla`, so the rule lives in one place.
- Don't add a screen that reaches the form hub through the nav. It is scoped by `focusForm` and belongs behind a form card on Home; `allowedScreens()` permits `"form"` for everyone precisely because each of its doors is gated where it leads.
