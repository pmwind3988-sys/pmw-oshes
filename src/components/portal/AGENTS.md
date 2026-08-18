# AGENTS.md — src/components/portal/

**Scope:** The portal's shell, its record detail, and the pieces its screens are drawn from. Screens themselves live in `src/pages/portal/`.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Context assembly | `PortalContainer.tsx` | Builds catalogue → records → access, and owns `screen` / `focusForm` / `focusStatus`. The only place portal state is held. |
| Header, nav drawer, profile | `PortalShell.tsx` | Nav is a drawer at every width; the account lives top right. |
| Record detail — layout | `RecordDetail.tsx` | `OverviewTab`, `AnswersTab`, `ApprovalsTab`, `TimelineTab`, plus `DetailRow` / `SoftCard`. No actions here. |
| Record detail — actions | `SubmissionDrawer.tsx` | Tabbed drawer: gating, sign/return/nudge/reassign/cancel/delete/PDF, and the pinned action bar. |
| Interactive statistics | `PortalStats.tsx` | `StatTile`, `StatTileRow`, `StatusMix`, `IntakeChart`, `BarRows`, `DonutGauge`, `axisTicks`. |
| Card, page header, table, task row | `../Widget.tsx` | Shared with `src/components/dashboard/`. See "One card shape" below. |
| Radii and card recipes | `../../theme/surfaces.ts` | `radius`, `panelSx`, `sunkenSx`, `liftSx`, `gridline`. |
| "What happens after submit" | `FlowStrip.tsx` | `blueprintSteps(entry)` for a form type, `recordSteps(record)` for one record. |
| Status / severity pills | `PortalPills.tsx` | Also `ProportionBar`. |

## One card shape
Every panel in the portal *and* in `src/components/dashboard/` is `Widget` from
`src/components/Widget.tsx`. There used to be four near-copies of the same card — a
`PANEL_SX` constant plus a `PanelHead` / `PanelHeading` / `SectionCard` function in
`HomeScreen`, `TodayScreen`, `FormHubScreen` and `SettingsScreen` — which had already drifted
on padding, title size and where the count sat. Do not add a fifth.

- `Widget` — title, caption, `meta` (the one summarising count, via `WidgetCount`), `actions`,
  `onOpen` (renders the trailing arrow) and `footer`. `bare` drops the header for a card that
  is all body. The arrow renders **only** where `onOpen` is passed: a chevron on a card that
  does not open is the same lie as an unpressable statistic.
- `WidgetGrid` — `auto-fit` with a `min` floor, so one grid gives three columns on a desktop
  and one on a phone without a breakpoint list per screen.
- `PageHeader` — `title` / `subtitle` / `eyebrow` / `meta` / `actions` / `back`. Every screen
  used to write this by hand, which is why the title was 34px on four of them and 26px on two.
- `DataTable` + `DataRow` + `DataCell` — the six hand-rolled `<table>`s. `DataRow` is
  keyboard-operable whenever it takes `onOpen`.
- `TaskRow` — icon tile, title, description, timestamp, trailing action. The primary action
  rides on the row, so a queue never costs two clicks to do one thing.
- `Callout`, `SectionLabel`, `WidgetEmpty`, `IconTile`.

**Never type a pixel radius.** Import `radius` from `src/theme/surfaces.ts`. `editorial.ts` is
copied byte-for-byte into pmw-hrform and holds colour only, which is why the geometry lives in
`surfaces.ts` beside the other app-specific glue.

## Charts are ruled, not floated
Every chart draws its marks against a labelled scale: `axisTicks()` rounds the top to a number
a reader can hold (15, not 13), and `gridline` is the one dashed rule they all share. A bar
drawn against nothing shows that Tuesday beat Monday but not that it was eleven.

Colour follows meaning, never variety: the brand carries volume, and `success` / `warning` /
`error` are used **only** where the series really is approved / late / rejected. `DonutGauge`
tops out at three or four segments — beyond that the arcs stop being comparable and `StatusMix`
is the honest drawing.

## Conventions
- **A statistic is a button.** Every count rendered by `PortalStats.tsx` takes an `onClick` that opens the rows it counted, via `setScreen(screen, formScope, statusScope)`. A count with no list behind it is a dead end — don't add one.
- **Counts and filters share one vocabulary.** Both are `StatFilter` (`src/types/portal.ts`), so a tile cannot count one way and filter another. `portalStats()` in `src/utils/portalStats.ts` is the single pass that produces them.
- **Navigation states its own scope.** `setScreen` takes the form and status scope as arguments and clears them when they are not passed, so a nav click cannot inherit a form hub's filter. `PortalPage` keys `RecordsScreen` on that scope so it remounts with the filters seeded.
- **Layout and actions are separate files.** `RecordDetail.tsx` decides how a record *reads*; `SubmissionDrawer.tsx` decides what this account may *do* with it. That is what lets the same detail serve an approver with three buttons and an audit account with none.
- **Cancel keeps the record; delete ends it.** `cancelSubmission()` marks the record void and leaves it readable — that is the answer for a duplicate or a withdrawn filing. `deleteSubmission()` is administrators only and removes the item with every signature, photo, attachment, PDF and matrix row belonging to it (`hardDeleteSubmission` in `sharepointClient.ts` does the sweep). It is gated behind typing the reference, and its audit row is the only thing left afterwards — so it always writes one.

## SLA is opt-in — do not reintroduce a default
A form has an SLA only where its layer or its `LayerConfig` sets `slaDays`. `layerSlaDays()` returns **0** otherwise, `hasSla` is false on both `CatalogueEntry` and `PortalRecord`, and every SLA affordance is then absent — not zero, not "none", absent:

- no SLA card in `OverviewTab`, no header stat in the drawer
- no "Past SLA" tile, status bucket, or filter option
- `slaNote` is empty; screens use `waitNote`, which falls back to the plain age on the layer
- `TodayScreen`'s stuck panel becomes "Longest waits"

There used to be a `VITE_OSHES_SLA_DEFAULT_DAYS` global fallback of three working days. It meant a form nobody had ever given a deadline turned red on day four and reported a breach against a number no one had chosen. It is gone; `anySla(catalogue)` is how a screen asks whether to render SLA vocabulary at all.

## The catalogue reports visibility, it does not set it
`IsPublic` is authored in the pmw-hrform builder, which is the only writer of it. `CatalogueScreen`'s "Who can reach it" column is a read-only badge over `entry.visibility`, and `saveCatalogueSettings()` writes **SLA only**. The screen used to carry a Public/Internal toggle that wrote the flag from outside the builder — a second writer for a value stored in two places (`LayerConfig.isPublic` and the `IsPublic` column), which is what the "mismatch" state exists to report. Do not add it back; `resolveFormVisibility()` still surfaces unset and mismatched forms so they can be fixed at the source.

## Anti-Patterns
- Don't read SLA off `slaDays > 0` at a call site — use `hasSla`, so the rule lives in one place.
- Don't write `isPublic` from this app — the builder owns it, and the catalogue reports what the form link actually does.
- Don't add a screen that reaches the form hub through the nav. It is scoped by `focusForm` and belongs behind a form card on Home; `allowedScreens()` permits `"form"` for everyone precisely because each of its doors is gated where it leads.
