import type { ReactNode } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { editorial, editorialHairline } from "../theme/editorial";
import { panelSx, radius } from "../theme/surfaces";

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
--------------------------------------------------------------------------- */

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
  /** Dropped below the body, above the card edge, behind a hairline. */
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
        display: "flex",
        flexDirection: "column",
        // Widgets sit in a grid and a row of cards that stop at their own
        // content length reads as a broken column rather than a set.
        height: "100%",
        minWidth: 0,
        p: { xs: 1.75, sm: 2 },
        ...sx,
      }}
    >
      {!bare && (
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1.5, minWidth: 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {caption && (
              <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.15, lineHeight: 1.4 }}>
                {caption}
              </Typography>
            )}
          </Box>

          {/* The reference's control cluster: the summarising number, then any
              quiet controls, then a hairline, then the way in. The rule is what
              separates "what this card says" from "what you can do with it". */}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flex: "none" }}>
            {meta}
            {actions}
            {onOpen && (
              <>
                {(meta || actions) && (
                  <Box
                    aria-hidden
                    sx={{ width: "1px", height: 18, mx: 0.5, backgroundColor: editorial.border, flex: "none" }}
                  />
                )}
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
                      width: 30,
                      height: 30,
                      p: 0,
                      flex: "none",
                      border: "none",
                      borderRadius: radius.sm,
                      backgroundColor: "transparent",
                      color: editorial.softMuted,
                      cursor: "pointer",
                      transition: "color 0.16s ease, background-color 0.16s ease, transform 0.16s ease",
                      "&:hover": {
                        color: editorial.pmwBlueDark,
                        backgroundColor: editorial.blueWash,
                        transform: "translateX(2px)",
                      },
                      "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } },
                    }}
                  >
                    <ArrowForwardIcon sx={{ fontSize: 17 }} />
                  </Box>
                </Tooltip>
              </>
            )}
          </Stack>
        </Stack>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>

      {footer && (
        <Box sx={{ mt: 1.5, pt: 1.25, borderTop: editorialHairline }}>{footer}</Box>
      )}
    </Box>
  );
}

/**
 * The count that sits at a widget's top right.
 *
 * One number, tabular so a card does not jog as it counts up, and tinted only
 * when it is a number someone has to do something about.
 */
export function WidgetCount({ value, tone = "ink" }: { value: number | string; tone?: "ink" | "alert" | "muted" }) {
  const zero = value === 0 || value === "0";
  return (
    <Typography
      sx={{
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        flex: "none",
        color: zero || tone === "muted" ? editorial.softMuted : tone === "alert" ? editorial.error : editorial.ink,
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
 * Every screen wrote this block by hand, which is why the title was 34px on
 * four of them and 26px on two, and why the export button sat above the title on
 * one and beside it on the rest.
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
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: editorial.softMuted,
                mb: 0.5,
              }}
            >
              {eyebrow}
            </Typography>
          )}
          <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 700, lineHeight: 1.12 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.6, lineHeight: 1.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {(meta || actions) && (
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ alignItems: "center", flex: "none", flexWrap: "wrap", rowGap: 1 }}
          >
            {meta && (
              <Typography sx={{ fontSize: 12, color: editorial.muted, whiteSpace: "nowrap" }}>{meta}</Typography>
            )}
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** The uppercase rule between groups of widgets. */
export function SectionLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      sx={{
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: editorial.softMuted,
        mb: 1.25,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

/** What a widget says when it has counted nothing. Never blank — "none" is an answer. */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1.25, lineHeight: 1.5 }}>{children}</Typography>
  );
}

/**
 * The yellow call-to-action.
 *
 * One per surface, at most. Yellow is the loudest thing on the page and it is
 * spent on the single action the card exists to make possible — signing the item
 * in front of you, filing the form. A second yellow button on the same screen
 * halves the value of the first, which is the whole reason it is a separate
 * component rather than a colour prop anyone can reach for.
 *
 * Square-cornered like every other MUI button here (DESIGN.md), and its ink is
 * near-black in every theme because the fill never changes.
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
        minHeight: size === "small" ? 32 : 40,
        px: size === "small" ? 1.5 : 2.25,
        border: "none",
        borderRadius: radius.sm,
        backgroundColor: editorial.cta,
        color: editorial.onCta,
        font: "inherit",
        fontSize: size === "small" ? 12.5 : 13.5,
        fontWeight: 800,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background-color 0.16s ease",
        "&:hover": { backgroundColor: editorial.ctaHover },
        "& .MuiSvgIcon-root": { fontSize: size === "small" ? 16 : 18 },
      }}
    >
      {startIcon}
      {children}
    </Box>
  );
}

const CALLOUT_TONE = {
  info: { border: editorial.pmwBlueSoft, background: editorial.blueWash, ink: editorial.pmwBlueDark },
  warning: { border: editorial.warning, background: editorial.warningWash, ink: editorial.warning },
  error: { border: editorial.error, background: editorial.errorWash, ink: editorial.error },
} as const;

/**
 * A banner about the screen it sits above — a misconfiguration, a caveat, a
 * consequence worth reading before acting.
 *
 * Tone is the whole contract: `warning` and `error` keep the meanings DESIGN.md
 * gives them, so a callout is amber only when something is actually wrong. A
 * screen where every notice is amber has no way left to say "this one matters".
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
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.background,
        borderRadius: radius.lg,
        p: 2,
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
        ...(framed ? panelSx : null),
        overflowX: "auto",
      }}
    >
      <Box component="table" sx={{ width: "100%", minWidth, borderCollapse: "collapse", fontSize: 13 }}>
        <Box component="thead">
          <Box
            component="tr"
            sx={{
              // Alignment is set per cell rather than here: a `& th` rule from
              // the row outranks the individual cell's own class, so a default
              // here could only be beaten with `!important`.
              "& th": {
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: editorial.muted,
                px: framed ? 2 : 0,
                pr: framed ? 2 : 1.5,
                py: 1.25,
                borderBottom: editorialHairline,
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
          px: framed ? 2 : 0,
          pr: framed ? 2 : 1.5,
          py: compact ? 0.85 : 1.25,
          borderBottom: editorialHairline,
          verticalAlign: "top",
        },
        ...(onOpen ? { "&:hover": { backgroundColor: editorial.blueWash } } : null),
        "&:last-of-type td": { borderBottom: "none" },
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
  ink: { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft },
  alert: { color: editorial.error, backgroundColor: editorial.errorWash, borderColor: editorial.error },
  positive: { color: editorial.success, backgroundColor: editorial.successWash, borderColor: editorial.success },
  muted: { color: editorial.muted, backgroundColor: editorial.neutralWash, borderColor: editorial.border },
} as const;

export type TileTone = keyof typeof TILE_TONE;

/** The rounded glyph that opens a task row. Tinted by what the row is about. */
export function IconTile({ children, tone = "ink" }: { children: ReactNode; tone?: TileTone }) {
  const palette = TILE_TONE[tone];
  return (
    <Box
      sx={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: radius.md,
        border: `1px solid ${palette.borderColor}`,
        backgroundColor: palette.backgroundColor,
        color: palette.color,
        "& .MuiSvgIcon-root": { fontSize: 18 },
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
  divider = true,
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
      spacing={1.25}
      sx={{
        alignItems: "center",
        py: 1.25,
        minWidth: 0,
        borderBottom: divider ? editorialHairline : "none",
        "&:last-of-type": { borderBottom: "none", pb: 0 },
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
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <Typography className="task-row-title" sx={{ fontSize: 13.5, fontWeight: 700, minWidth: 0 }} noWrap>
            {title}
          </Typography>
          {badge}
        </Stack>
        {description && (
          <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.2, lineHeight: 1.4 }} noWrap>
            {description}
          </Typography>
        )}
        {timestamp && (
          <Typography sx={{ fontSize: 11, color: editorial.softMuted, mt: 0.3 }} noWrap>
            {timestamp}
          </Typography>
        )}
      </Box>

      {action && <Box sx={{ flex: "none" }}>{action}</Box>}
    </Stack>
  );
}
