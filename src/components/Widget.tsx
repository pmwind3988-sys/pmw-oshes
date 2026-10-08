import type { ReactNode } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { ArrowRight as ArrowForwardIcon, CheckCircle as CheckCircleIcon } from "./ui/Icons";
import { editorial } from "../theme/editorial";
import { panelSx } from "../theme/surfaces";

/* ---------------------------------------------------------------------------
   The widget — one card shape, used by every panel in the portal and the admin
   dashboard.

   Both halves of the app had grown their own `PANEL_SX` constant and their own
   `PanelHead` / `PanelHeading` / `SectionCard` function, four near-copies that
   had already drifted on padding, title size and where the count sits. They are
   all this now, which is what lets a screen be rearranged without deciding how a
   card looks first.

   The header is deliberately three slots, in reading order: what this is
   (`title` + `caption`), the one number that summarises it (`meta`), and the way
   in (`onOpen`). The arrow renders only where there is somewhere to go — a
   decorative chevron on a card that does not open is the same lie as an
   unpressable statistic.

   Surfaces are fills, not outlines: a white card with no border and no shadow on
   the tinted page ground. The soft-UI card is 24px; `surfaces.radius.lg` is the
   shared 12px structural radius used by every other panel, so the 24px is written
   here rather than changing that scale under the rest of the app.
--------------------------------------------------------------------------- */

const CARD_RADIUS = "24px";
const FOCUS_RING = "3px solid #9DBDF5";

export interface WidgetProps {
  /** Required in practice — omitted only alongside `bare`, where nothing draws it. */
  title?: ReactNode;
  /** The second line — what the card is counting, or what pressing it does. */
  caption?: ReactNode;
  /** Right of the title: a count, a pill, a small toggle. */
  meta?: ReactNode;
  /** Opens the full list this card summarises. Renders the trailing arrow. */
  onOpen?: () => void;
  /** Names the destination for screen readers: "Open your queue". */
  openLabel?: string;
  /** Quiet controls sitting before the arrow — a filter, a range switch. */
  actions?: ReactNode;
  /** Dropped below the body, separated by space rather than a rule. */
  footer?: ReactNode;
  /** Skips the header entirely — for a card that is all body. */
  bare?: boolean;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

export function Widget({
  title,
  caption,
  meta,
  onOpen,
  openLabel,
  actions,
  footer,
  bare = false,
  children,
  sx,
}: WidgetProps) {
  return (
    <Box
      sx={{
        ...panelSx,
        border: "none",
        borderRadius: CARD_RADIUS,
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
        // Widgets sit in a grid and a row of cards that stop at their own
        // content length reads as a broken column rather than a set.
        height: "100%",
        minWidth: 0,
        p: { xs: 2, sm: 2.5 },
        ...sx,
      }}
    >
      {!bare && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1.75, minWidth: 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h2"
              sx={{ fontSize: 17.5, fontWeight: 800, lineHeight: 1.3, color: editorial.ink }}
            >
              {title}
            </Typography>
            {caption && (
              <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.25, lineHeight: 1.4 }}>
                {caption}
              </Typography>
            )}
          </Box>

          {/* The control cluster: the summarising number, then any quiet
              controls, then the way in. Spacing separates them; there is no rule. */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: "none" }}>
            {meta}
            {actions}
            {onOpen && (
              <Tooltip title={openLabel ?? "Open"} enterDelay={300}>
                <Box
                  component="button"
                  type="button"
                  onClick={onOpen}
                  aria-label={openLabel ?? "Open"}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    p: 0,
                    flex: "none",
                    border: "none",
                    borderRadius: "999px",
                    backgroundColor: editorial.neutralWash,
                    color: editorial.ink,
                    cursor: "pointer",
                    transition: "color 0.16s ease, background-color 0.16s ease, transform 0.12s ease",
                    "&:hover": {
                      color: editorial.pmwBlueDark,
                      backgroundColor: editorial.blueWash,
                      transform: "translateX(2px)",
                    },
                    "&:active": { transform: "scale(0.97)" },
                    "&:focus-visible": { outline: FOCUS_RING, outlineOffset: 2 },
                    "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } },
                  }}
                >
                  <ArrowForwardIcon sx={{ fontSize: 18 }} />
                </Box>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>

      {footer && <Box sx={{ mt: 1.75 }}>{footer}</Box>}
    </Box>
  );
}

/**
 * The count that sits at a widget's top right.
 *
 * A neutral pill, tabular so a card does not jog as it counts up, and tinted red
 * only when it is a number someone has to do something about.
 */
export function WidgetCount({ value, tone = "ink" }: { value: number | string; tone?: "ink" | "alert" | "muted" }) {
  const zero = value === 0 || value === "0";
  const alert = !zero && tone === "alert";
  return (
    <Typography
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 32,
        px: 1.25,
        py: 0.4,
        borderRadius: "999px",
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1.4,
        fontVariantNumeric: "tabular-nums",
        flex: "none",
        backgroundColor: alert ? editorial.errorWash : editorial.neutralWash,
        color: zero || tone === "muted" ? editorial.softMuted : alert ? editorial.error : editorial.ink,
      }}
    >
      {value}
    </Typography>
  );
}

/**
 * The dashboard grid.
 *
 * `auto-fit` with a floor rather than a fixed column count, so the same grid
 * gives three widgets on a desktop, two on a tablet and one on a phone without
 * a breakpoint list per screen. `minmax(0, 1fr)` is what stops one long
 * unbroken reference from widening every track past the viewport.
 */
export function WidgetGrid({
  children,
  min = 300,
  columns,
  sx,
}: {
  children: ReactNode;
  /** Narrowest a widget may get before the grid drops a column. */
  min?: number;
  /** Pins the desktop column count where the content demands a fixed rhythm. */
  columns?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: columns
          ? { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: `repeat(${columns}, minmax(0, 1fr))` }
          : { xs: "1fr", sm: `repeat(auto-fit, minmax(${min}px, 1fr))` },
        gap: { xs: 1.5, sm: 2 },
        alignItems: "stretch",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The page's own header: what this screen is, then what you can do to it.
 *
 * Every screen wrote this block by hand, which is why the title drifted between
 * sizes and why the export button sat above the title on one screen and beside
 * it on the rest. The title is 30px from the small breakpoint up and steps to
 * 26px on a phone, so the first table row still clears the fold.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  meta,
  actions,
  back,
  sx,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A small line above the title — the scope this screen was opened from. */
  eyebrow?: ReactNode;
  /** Quiet right-hand text: a timestamp, a row count. Sits before `actions`. */
  meta?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box sx={{ mb: { xs: 2.5, sm: 3 }, ...sx }}>
      {back}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1.5, sm: 2 }}
        sx={{ alignItems: { sm: "flex-end" }, justifyContent: "space-between", minWidth: 0 }}
      >
        {/* Keeps a readable width when the actions are wide: they wrap before
            the title breaks mid-word. */}
        <Box sx={{ minWidth: { xs: 0, sm: 200 }, flex: { sm: "1 1 200px" } }}>
          {eyebrow && (
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.muted, mb: 0.5 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 26, sm: 30 },
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: editorial.ink,
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 15, color: editorial.muted, mt: 0.75, lineHeight: 1.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {(meta || actions) && (
          <Stack
            direction="row"
            sx={{ alignItems: "center", flex: "0 1 auto", flexWrap: "wrap", gap: 1.25, justifyContent: { sm: "flex-end" } }}
          >
            {meta && (
              <Typography sx={{ fontSize: 13, color: editorial.muted, whiteSpace: "nowrap" }}>{meta}</Typography>
            )}
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** A quiet heading between groups of widgets. Sentence case, no shouting. */
export function SectionLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      sx={{
        fontSize: 14,
        fontWeight: 800,
        color: editorial.muted,
        mb: 1.25,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * What a widget says when it has counted nothing. Never blank — "none" is an
 * answer. A round tinted circle with a check, and one sentence beneath it.
 */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center", py: 2 }}>
      <Box
        sx={{
          flex: "none",
          width: 112,
          height: 112,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: editorial.blueWash,
          color: editorial.pmwBlueDark,
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 44 }} />
      </Box>
      <Typography sx={{ fontSize: 14, color: editorial.muted, lineHeight: 1.5, maxWidth: 280 }}>{children}</Typography>
    </Stack>
  );
}

/**
 * The primary action: one filled blue pill per surface, at most.
 *
 * The one thing on a screen that asks to be pressed. A second filled button on the
 * same screen halves the value of the first, which is why it is a separate
 * component rather than a colour prop anyone can reach for. Text on it is white
 * in every theme, because the brand fill does not change between themes.
 */
export function CtaButton({
  children,
  onClick,
  startIcon,
  fullWidth = false,
  size = "medium",
}: {
  children: ReactNode;
  onClick?: () => void;
  startIcon?: ReactNode;
  fullWidth?: boolean;
  size?: "small" | "medium";
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        width: fullWidth ? "100%" : "auto",
        minHeight: size === "small" ? 36 : 44,
        px: size === "small" ? 1.75 : 2.5,
        border: "none",
        borderRadius: "999px",
        backgroundColor: editorial.pmwBlue,
        color: editorial.white,
        font: "inherit",
        fontSize: size === "small" ? 13 : 14,
        fontWeight: 800,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background-color 0.16s ease, transform 0.12s ease",
        "&:hover": { backgroundColor: editorial.pmwBlueDark },
        "&:active": { transform: "scale(0.97)" },
        "&:focus-visible": { outline: FOCUS_RING, outlineOffset: 2 },
        "& .MuiSvgIcon-root": { fontSize: size === "small" ? 16 : 18 },
      }}
    >
      {startIcon}
      {children}
    </Box>
  );
}

const CALLOUT_TONE = {
  info: { background: editorial.blueWash, ink: editorial.pmwBlueDark },
  warning: { background: editorial.warningWash, ink: editorial.warning },
  error: { background: editorial.errorWash, ink: editorial.error },
} as const;

/**
 * A banner about the screen it sits above — a misconfiguration, a caveat, a
 * consequence worth reading before acting.
 *
 * A tinted fill on a 24px radius, with no outline. Tone is the whole contract:
 * `warning` and `error` keep the meanings DESIGN.md gives them, so a callout is
 * amber only when something is actually wrong. A screen where every notice is
 * amber has no way left to say "this one matters".
 */
export function Callout({
  tone = "info",
  title,
  children,
  sx,
}: {
  tone?: keyof typeof CALLOUT_TONE;
  title?: ReactNode;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const palette = CALLOUT_TONE[tone];
  return (
    <Box
      sx={{
        border: "none",
        backgroundColor: palette.background,
        borderRadius: CARD_RADIUS,
        p: 2.25,
        ...sx,
      }}
    >
      {title && (
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: palette.ink, mb: children ? 0.75 : 0 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export interface DataColumn {
  key: string;
  label: ReactNode;
  /** Fixed track width in px. Omit for the column that should absorb the slack. */
  width?: number;
  align?: "left" | "right";
}

/**
 * The table, on the widget's terms.
 *
 * Six screens drew one by hand — the records list, the audit trail, the stuck
 * approvals panel, the catalogue, the people table and the admin submissions
 * grid — and each had its own head padding, its own hover tint and its own
 * decision about whether the head was uppercase. The differences were never
 * meant; they are what happens when a `<thead>` is retyped six times.
 *
 * Borderless: rows are separated by space and by their tinted hover, not rules.
 * It scrolls inside its own box rather than widening the page: a table is the
 * one thing on these screens that legitimately needs more width than a phone
 * has, and the fix for that is a scrollbar on the table, never on the document.
 */
export function DataTable({
  columns,
  minWidth = 820,
  children,
  framed = true,
}: {
  columns: DataColumn[];
  /** Below this the table scrolls sideways instead of crushing its columns. */
  minWidth?: number;
  children: ReactNode;
  /** Off when the table is already inside a `Widget` and should not double-frame. */
  framed?: boolean;
}) {
  return (
    <Box
      sx={{
        ...(framed ? { ...panelSx, border: "none", borderRadius: CARD_RADIUS, boxShadow: "none", p: 1 } : null),
        overflowX: "auto",
      }}
    >
      <Box
        component="table"
        sx={{ width: "100%", minWidth, borderCollapse: "separate", borderSpacing: "0 2px", fontSize: 13 }}
      >
        <Box component="thead">
          <Box
            component="tr"
            sx={{
              // Alignment is set per cell rather than here: a `& th` rule from
              // the row outranks the individual cell's own class, so a default
              // here could only be beaten with `!important`.
              "& th": {
                fontSize: 13,
                fontWeight: 700,
                textTransform: "none",
                letterSpacing: 0,
                color: editorial.muted,
                px: framed ? 2 : 1.5,
                py: 1.25,
                border: "none",
                whiteSpace: "nowrap",
              },
            }}
          >
            {columns.map((column) => (
              <Box
                component="th"
                key={column.key}
                scope="col"
                sx={{ width: column.width, textAlign: column.align ?? "left" }}
              >
                {column.label}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">{children}</Box>
      </Box>
    </Box>
  );
}

/**
 * One row. Pressable rows are keyboard-operable by construction — a `<tr>` with
 * an `onClick` and no key handler is a control half the office cannot use.
 *
 * A row has no rules. Hover lifts it into a 16px tinted tile; the tint sits on
 * the cells, because a radius on a `<tr>` does not round its background.
 */
export function DataRow({
  onOpen,
  compact = false,
  framed = true,
  children,
}: {
  onOpen?: () => void;
  compact?: boolean;
  framed?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      component="tr"
      onClick={onOpen}
      tabIndex={onOpen ? 0 : undefined}
      role={onOpen ? "button" : undefined}
      onKeyDown={
        onOpen
          ? (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      sx={{
        cursor: onOpen ? "pointer" : "default",
        "& td": {
          px: framed ? 2 : 1.5,
          pr: framed ? 2 : 1.5,
          py: compact ? 1 : 1.5,
          border: "none",
          verticalAlign: "top",
          transition: "background-color 0.16s ease",
        },
        "& td:first-of-type": { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
        "& td:last-of-type": { borderTopRightRadius: 16, borderBottomRightRadius: 16 },
        ...(onOpen ? { "&:hover td": { backgroundColor: editorial.blueSoft } } : null),
      }}
    >
      {children}
    </Box>
  );
}

/** A cell. `align="right"` for the actions column; `muted` for secondary text. */
export function DataCell({
  children,
  align,
  muted = false,
  nowrap = false,
  sx,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  nowrap?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="td"
      sx={{
        ...(align === "right" ? { textAlign: "right" } : null),
        ...(muted ? { color: editorial.muted } : null),
        ...(nowrap ? { whiteSpace: "nowrap" } : null),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

const TILE_TONE = {
  ink: { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash },
  alert: { color: editorial.error, backgroundColor: editorial.errorWash },
  positive: { color: editorial.success, backgroundColor: editorial.successWash },
  muted: { color: editorial.muted, backgroundColor: editorial.neutralWash },
} as const;

export type TileTone = keyof typeof TILE_TONE;

/** The round glyph that opens a task row. Tinted by what the row is about. */
export function IconTile({ children, tone = "ink" }: { children: ReactNode; tone?: TileTone }) {
  const palette = TILE_TONE[tone];
  return (
    <Box
      sx={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "50%",
        backgroundColor: palette.backgroundColor,
        color: palette.color,
        "& .MuiSvgIcon-root": { fontSize: 19 },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * One line of work: what it is, what it needs, and the button that does it.
 *
 * The pattern is the point — a row that names an item but makes you open it to
 * act is two clicks where the list already knew there was one thing to do. So
 * the primary action rides on the row, and the row itself opens the detail for
 * everything the button does not cover.
 *
 * The trailing action is drawn as a tonal pill whatever button the caller passes:
 * a list full of solid buttons reads as a set of alarms. `divider` is still
 * accepted for existing callers, but rows are borderless and it draws no rule.
 */
export function TaskRow({
  icon,
  tone = "ink",
  title,
  description,
  timestamp,
  badge,
  action,
  onOpen,
}: {
  icon?: ReactNode;
  tone?: TileTone;
  title: ReactNode;
  description?: ReactNode;
  /** When it landed, or how long it has waited. Right-aligned on wide rows. */
  timestamp?: ReactNode;
  /** A pill beside the title — severity, "Urgent", a reference. */
  badge?: ReactNode;
  action?: ReactNode;
  onOpen?: () => void;
  divider?: boolean;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "center",
        py: 1.25,
        minWidth: 0,
      }}
    >
      {icon && <IconTile tone={tone}>{icon}</IconTile>}

      <Box
        component={onOpen ? "button" : "div"}
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        sx={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: "none",
          background: "none",
          p: 0,
          font: "inherit",
          color: "inherit",
          cursor: onOpen ? "pointer" : "default",
          "&:hover .task-row-title": onOpen ? { color: editorial.pmwBlueDark } : undefined,
        }}
      >
        {/* The title may wrap onto a second line; the badge drops beneath it
            rather than squeezing the words into a truncated fragment. */}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, minWidth: 0 }}>
          <Typography
            className="task-row-title"
            sx={{
              fontSize: 14.5,
              fontWeight: 700,
              lineHeight: 1.35,
              minWidth: 0,
              overflowWrap: "break-word",
              color: editorial.ink,
            }}
          >
            {title}
          </Typography>
          {badge && <Box sx={{ flex: "none" }}>{badge}</Box>}
        </Stack>
        {description && (
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.25, lineHeight: 1.4 }} noWrap>
            {description}
          </Typography>
        )}
        {timestamp && (
          <Typography sx={{ fontSize: 12, color: editorial.softMuted, mt: 0.3 }} noWrap>
            {timestamp}
          </Typography>
        )}
      </Box>

      {action && (
        <Box
          sx={{
            flex: "none",
            // Whatever button the caller passed, the trailing action is a tonal
            // pill. These descendant rules outrank the button's own styling.
            "& button, & a": {
              minHeight: 36,
              px: 1.75,
              border: "none",
              borderRadius: "999px",
              boxShadow: "none",
              backgroundColor: editorial.blueWash,
              color: editorial.pmwBlueDark,
              fontSize: 13,
              fontWeight: 800,
              textTransform: "none",
              whiteSpace: "nowrap",
              transition: "background-color 0.16s ease, transform 0.12s ease",
            },
            "& button:hover, & a:hover": { backgroundColor: editorial.pmwBlueSoft, boxShadow: "none" },
            "& button:active, & a:active": { transform: "scale(0.97)" },
          }}
        >
          {action}
        </Box>
      )}
    </Stack>
  );
}

/**
 * The secondary action on a widget — "Open your queue", "See everything you filed".
 *
 * A tonal pill with no outline, so it reads as a control at a glance without
 * going to the filled primary: there are several of these on the dashboard at
 * once and a screen of solid CTAs signals nothing.
 */
export function QuietButton({
  children,
  onClick,
  fullWidth = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        width: fullWidth ? "100%" : "auto",
        minHeight: 36,
        px: 1.75,
        border: "none",
        borderRadius: "999px",
        backgroundColor: editorial.neutralWash,
        color: editorial.ink,
        font: "inherit",
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background-color 0.16s ease, color 0.16s ease, transform 0.12s ease",
        "&:hover": { backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark },
        "&:active": { transform: "scale(0.97)" },
        "&:focus-visible": { outline: FOCUS_RING, outlineOffset: 2 },
      }}
    >
      {children}
    </Box>
  );
}
