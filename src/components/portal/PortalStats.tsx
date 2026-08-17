import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { editorial, editorialHairline, seriesColour } from "../../theme/editorial";
import { gridline, liftSx, radius } from "../../theme/surfaces";
import type { DayPoint, StatBucket } from "../../utils/portalStats";

/**
 * The dashboard's statistics, as things you can press.
 *
 * A number on a dashboard is a question ("how many are waiting on me?"), and a
 * question the reader cannot follow is decoration. So every tile, bar and
 * segment here is a real button that opens the list it counts — nothing
 * renders a count it cannot hand off. Tiles that would read zero still render,
 * because "none" is an answer; they just render quietly and stay pressable so
 * the layout does not reflow as work arrives.
 *
 * Every chart is ruled the same way: a dashed gridline behind the marks and a
 * labelled scale on the axis the marks are measured along. Bars used to be drawn
 * against nothing, which meant a reader could see that Tuesday was taller than
 * Monday but not that it was eleven — the shape was legible and the quantity was
 * not. Colour is carried by the brand for volume and by the status tokens for
 * anything that means overdue, returned or approved; it is never picked to make
 * a chart look varied.
 */

const TONE_COLOUR: Record<StatBucket["tone"], string> = {
  ink: editorial.pmwBlue,
  alert: editorial.error,
  positive: editorial.success,
  muted: editorial.softMuted,
};

export function toneColour(tone: StatBucket["tone"]): string {
  return TONE_COLOUR[tone];
}

/**
 * The colour a mark should take: its status hue where it *has* one, and a
 * categorical hue from the series ramp where it does not.
 *
 * This is the whole colour policy of the charts in one function. A form type, an
 * approver, a length-of-service band means nothing in particular — it just needs
 * to be told apart from its neighbour, so it draws from the series ramp. A
 * bucket that really is overdue or approved keeps red or green, because there
 * those hues are the information rather than decoration.
 */
export function markColour(tone: StatBucket["tone"] | undefined, index: number): string {
  return tone ? TONE_COLOUR[tone] : seriesColour(index);
}

/**
 * A rounded scale for an axis: 4-ish ticks landing on 1, 2 or 5 × a power of ten.
 *
 * The top of a chart has to be a number a reader can hold — 15, not 13 — or the
 * gridlines stop being a ruler and become decoration that happens to be evenly
 * spaced.
 */
export function axisTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised > 5 ? 10 : normalised > 2 ? 5 : normalised > 1 ? 2 : 1) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

export interface StatTileProps {
  value: number | string;
  label: string;
  /** Second line — what the number means, or what pressing it does. */
  hint?: string;
  tone?: StatBucket["tone"];
  /** Drawn as an accent rail down the left edge when the count is non-zero. */
  onClick?: () => void;
  /** Marks the tile as the filter currently applied. */
  active?: boolean;
}

/**
 * One number, its name, and the list behind it. Renders as a button when it has
 * somewhere to go and as a plain box when it does not, so nothing invites a
 * press that does nothing.
 */
export function StatTile({ value, label, hint, tone = "ink", onClick, active = false }: StatTileProps) {
  const zero = value === 0 || value === "0";
  const accent = toneColour(tone);
  const interactive = Boolean(onClick);

  return (
    <Box
      component={interactive ? "button" : "div"}
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-pressed={interactive ? active : undefined}
      sx={{
        position: "relative",
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        p: { xs: 1.5, sm: 1.75 },
        pl: { xs: 1.75, sm: 2 },
        borderRadius: radius.lg,
        border: editorialHairline,
        borderColor: active ? accent : editorial.border,
        backgroundColor: active ? editorial.blueWash : editorial.panel,
        cursor: interactive ? "pointer" : "default",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 3,
          backgroundColor: zero ? editorial.border : accent,
        },
        ...(interactive && { ...liftSx, "&:hover": { ...liftSx["&:hover"], borderColor: accent } }),
      }}
    >
      <Typography
        sx={{
          fontSize: { xs: 26, sm: 30 },
          fontWeight: 700,
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
          color: zero ? editorial.softMuted : tone === "alert" ? editorial.error : editorial.ink,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 0.4 }} noWrap>
        {label}
      </Typography>
      {hint && (
        <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 0.15 }} noWrap>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/** A responsive row of tiles. Two up on a phone, then as many as fit. */
export function StatTileRow({ children, min = 148 }: { children: React.ReactNode; min?: number }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        },
        gap: { xs: 1.25, sm: 1.75 },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Status mix: the counts as a row of figures, over one proportional bar.
 *
 * The bar alone answered "how much of this is stuck" but never "how many", so
 * the exact figure lived in a tooltip nobody opens on a phone. Reading the
 * numbers first and the proportion underneath gives both at once, and it is the
 * order people say them in — "eighteen in approval, three of them late".
 *
 * A stacked bar rather than a pie: the comparison is a length, and lengths are
 * read far more accurately than angles. It also degrades to a legible strip on a
 * phone, which a pie with seven labels does not.
 */
export function StatusMix({
  buckets,
  active,
  onPick,
}: {
  buckets: StatBucket[];
  active?: string;
  onPick?: (bucket: StatBucket) => void;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return (
      <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>
        Nothing has been filed here yet.
      </Typography>
    );
  }

  return (
    <Box>
      <Stack
        direction="row"
        sx={{
          flexWrap: "wrap",
          alignItems: "flex-start",
          mb: 1.75,
          // The dashed rule between figures is the reference's separator and
          // does the same job as a table's column line: it keeps "18" and "Jr"
          // reading as one unit when four of them sit in a row.
          "& > *:not(:last-of-type)": { borderRight: gridline },
        }}
      >
        {buckets.map((bucket) => {
          const on = active === bucket.id;
          return (
            <Box
              key={bucket.id}
              component={onPick ? "button" : "div"}
              type={onPick ? "button" : undefined}
              onClick={onPick ? () => onPick(bucket) : undefined}
              aria-pressed={onPick ? on : undefined}
              aria-label={onPick ? `Show ${bucket.count} ${bucket.label}` : undefined}
              sx={{
                flex: "1 1 auto",
                minWidth: 68,
                textAlign: "left",
                border: "none",
                background: "none",
                font: "inherit",
                color: "inherit",
                pr: 1.5,
                pl: 0,
                py: 0.25,
                cursor: onPick ? "pointer" : "default",
                opacity: !active || on ? 1 : 0.45,
                transition: "opacity 0.16s ease",
                "&:not(:first-of-type)": { pl: 1.5 },
                "&:hover .status-mix-count": onPick ? { color: toneColour(bucket.tone) } : undefined,
              }}
            >
              <Typography
                className="status-mix-count"
                sx={{
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  fontVariantNumeric: "tabular-nums",
                  color: on ? toneColour(bucket.tone) : editorial.ink,
                  transition: "color 0.16s ease",
                }}
              >
                {bucket.count}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.2 }} noWrap title={bucket.label}>
                {bucket.label}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <Stack
        direction="row"
        spacing={0.4}
        sx={{ height: 12, borderRadius: radius.full, overflow: "hidden" }}
      >
        {buckets.map((bucket) => (
          <Tooltip key={bucket.id} title={`${bucket.label}: ${bucket.count} (${bucket.percent}%)`} enterDelay={200}>
            <Box
              component={onPick ? "button" : "div"}
              type={onPick ? "button" : undefined}
              aria-label={onPick ? `Show ${bucket.count} ${bucket.label}` : undefined}
              onClick={onPick ? () => onPick(bucket) : undefined}
              sx={{
                width: `${(bucket.count / total) * 100}%`,
                minWidth: 6,
                border: "none",
                p: 0,
                borderRadius: radius.full,
                backgroundColor: toneColour(bucket.tone),
                opacity: !active || active === bucket.id ? 1 : 0.3,
                cursor: onPick ? "pointer" : "default",
                transition: "opacity 0.16s ease",
                "&:hover": onPick ? { opacity: 1 } : undefined,
              }}
            />
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Fourteen days of intake, measured against a labelled scale.
 *
 * Bars are buttons only where the day has something in it — an empty day has no
 * list to open, and a pressable empty bar is a lie.
 */
export function IntakeChart({
  days,
  onPickDay,
  height = 108,
}: {
  days: DayPoint[];
  onPickDay?: (day: DayPoint) => void;
  height?: number;
}) {
  const busiest = Math.max(...days.map((day) => day.count), 0);
  const ticks = axisTicks(busiest);
  const top = ticks[ticks.length - 1] || 1;

  return (
    <Box>
      <Stack direction="row" spacing={1}>
        <Stack
          sx={{
            flex: "none",
            height,
            justifyContent: "space-between",
            alignItems: "flex-end",
            minWidth: 18,
          }}
        >
          {[...ticks].reverse().map((tick) => (
            <Typography
              key={tick}
              sx={{
                fontSize: 10,
                lineHeight: 1,
                color: editorial.softMuted,
                fontVariantNumeric: "tabular-nums",
                // Each label names the line it sits on, so it is nudged up by
                // half its own height to centre on that line rather than hang
                // below it.
                transform: "translateY(-50%)",
                "&:first-of-type": { transform: "none" },
                "&:last-of-type": { transform: "translateY(-100%)" },
              }}
            >
              {tick}
            </Typography>
          ))}
        </Stack>

        <Box sx={{ position: "relative", flex: 1, minWidth: 0, height }}>
          {ticks.map((tick) => (
            <Box
              key={tick}
              aria-hidden
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(tick / top) * 100}%`,
                borderTop: tick === 0 ? editorialHairline : gridline,
              }}
            />
          ))}

          <Stack direction="row" spacing={0.5} sx={{ position: "relative", alignItems: "flex-end", height: "100%" }}>
            {days.map((day) => {
              const pressable = Boolean(onPickDay) && day.count > 0;
              return (
                <Tooltip key={day.key} title={`${day.label}: ${day.count} filed`} enterDelay={150}>
                  <Box
                    component={pressable ? "button" : "div"}
                    type={pressable ? "button" : undefined}
                    onClick={pressable ? () => onPickDay?.(day) : undefined}
                    aria-label={pressable ? `${day.count} filed on ${day.label}` : undefined}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      height: "100%",
                      display: "flex",
                      alignItems: "flex-end",
                      border: "none",
                      background: "none",
                      p: 0,
                      cursor: pressable ? "pointer" : "default",
                      "&:hover .intake-bar": pressable ? { filter: "brightness(0.88)" } : undefined,
                    }}
                  >
                    <Box
                      className="intake-bar"
                      sx={{
                        width: "100%",
                        // A zero day keeps a visible 2px floor so the axis reads
                        // as a continuous fortnight rather than a gap in the data.
                        height: day.count === 0 ? 2 : `${Math.max((day.count / top) * 100, 3)}%`,
                        borderRadius: `${radius.sm} ${radius.sm} 0 0`,
                        // One hue for the fortnight, with today picked out in the
                        // second series colour rather than by opacity: a bar that
                        // is merely darker reads as "more", which today is not.
                        backgroundColor:
                          day.count === 0
                            ? editorial.border
                            : day.isToday
                              ? seriesColour(1)
                              : seriesColour(0),
                        transition: "height 0.2s ease, filter 0.16s ease",
                      }}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </Stack>
        </Box>
      </Stack>

      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, pl: "26px" }}>
        {days.map((day) => (
          <Typography
            key={day.key}
            sx={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 9.5,
              color: day.isToday ? editorial.pmwBlueDark : editorial.softMuted,
              fontWeight: day.isToday ? 800 : 600,
            }}
          >
            {day.short}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export interface BarRow {
  id: string;
  label: string;
  value: number;
  /** Right of the label — an age, a share, whatever the value does not say. */
  hint?: string;
  /**
   * Set only where the row *means* something — overdue, approved. Left unset,
   * the row takes a categorical hue from the series ramp by its position.
   */
  tone?: StatBucket["tone"];
}

/**
 * Ranked horizontal bars against a labelled scale.
 *
 * Horizontal rather than vertical because the categories here are names — form
 * titles, approvers — and a name reads along a row without being rotated,
 * truncated to four characters, or stacked into a staircase of angled labels.
 */
export function BarRows({
  rows,
  onPick,
  emptyNote = "Nothing to show yet.",
  valueSuffix,
}: {
  rows: BarRow[];
  onPick?: (row: BarRow) => void;
  emptyNote?: string;
  /** Appended to the axis top for units the numbers alone do not carry. */
  valueSuffix?: string;
}) {
  if (rows.length === 0) {
    return <Typography sx={{ fontSize: 13, color: editorial.muted, py: 1 }}>{emptyNote}</Typography>;
  }

  const busiest = Math.max(...rows.map((row) => row.value), 0);
  const ticks = axisTicks(busiest);
  const top = ticks[ticks.length - 1] || 1;

  return (
    <Box>
      <Box sx={{ position: "relative" }}>
        {ticks.map((tick) => (
          <Box
            key={tick}
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(tick / top) * 100}%`,
              borderLeft: tick === 0 ? editorialHairline : gridline,
            }}
          />
        ))}

        <Stack spacing={1.5} sx={{ position: "relative" }}>
          {rows.map((row, index) => {
            const accent = markColour(row.tone, index);
            const pressable = Boolean(onPick);
            return (
              <Box
                key={row.id}
                component={pressable ? "button" : "div"}
                type={pressable ? "button" : undefined}
                onClick={pressable ? () => onPick?.(row) : undefined}
                aria-label={pressable ? `${row.label}: ${row.value}` : undefined}
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  p: 0,
                  font: "inherit",
                  color: "inherit",
                  cursor: pressable ? "pointer" : "default",
                  "&:hover .bar-row-fill": pressable ? { filter: "brightness(0.9)" } : undefined,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 0.5, minWidth: 0 }}
                >
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0 }} noWrap title={row.label}>
                    {row.label}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline", flex: "none" }}>
                    {row.hint && (
                      <Typography sx={{ fontSize: 11, color: editorial.muted, whiteSpace: "nowrap" }}>
                        {row.hint}
                      </Typography>
                    )}
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}
                    >
                      {row.value}
                    </Typography>
                  </Stack>
                </Stack>
                <Box sx={{ height: 10, borderRadius: radius.full, overflow: "hidden" }}>
                  <Box
                    className="bar-row-fill"
                    sx={{
                      height: "100%",
                      // Zero draws nothing rather than a sliver — a bar that is
                      // visible at all reads as "some", and this means none.
                      width: row.value > 0 ? `${Math.max((row.value / top) * 100, 1.5)}%` : "0%",
                      borderRadius: radius.full,
                      backgroundColor: accent,
                      transition: "width 0.25s ease, filter 0.16s ease",
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      <Box sx={{ position: "relative", height: 16, mt: 0.75 }}>
        {ticks.map((tick, index) => (
          <Typography
            key={tick}
            sx={{
              position: "absolute",
              left: `${(tick / top) * 100}%`,
              transform: index === 0 ? "none" : index === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 10,
              color: editorial.softMuted,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tick}
            {valueSuffix && index === ticks.length - 1 ? ` ${valueSuffix}` : ""}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Generic in its `id` so a caller whose slices *are* filters — the dashboard's
 * are — keeps that type all the way to `onPick`, rather than casting a bare
 * string back into a `StatFilter` at the call site and losing the guarantee that
 * a slice can actually be opened.
 */
export interface GaugeSegment<Id extends string = string> {
  id: Id;
  label: string;
  count: number;
  /** Unset takes a categorical hue from the series ramp by position. */
  tone?: StatBucket["tone"];
  /** A quieter second line under the legend entry — "+2 arriving today". */
  hint?: string;
}

const GAUGE_SIZE = 168;
const GAUGE_STROKE = 17;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
/** 270° of ring, leaving the bottom quarter open for the total to sit in. */
const GAUGE_SWEEP = GAUGE_CIRCUMFERENCE * 0.75;

/**
 * The whole set as one ring, with the total in the middle.
 *
 * This is the only chart here that is a circle, and it earns it by answering a
 * different question from the bars: not "how does this week compare with last"
 * but "what is the shape of the pile right now". Two or three segments is its
 * limit — beyond that the arcs stop being comparable and `StatusMix` is the
 * honest drawing.
 *
 * The gap at the bottom is not decoration: it is what makes the number in the
 * middle read as the total of the ring rather than as one more label floating
 * inside a closed circle.
 */
export function DonutGauge<Id extends string = string>({
  segments,
  total,
  centreLabel,
  onPick,
}: {
  segments: GaugeSegment<Id>[];
  total: number;
  centreLabel: string;
  onPick?: (segment: GaugeSegment<Id>) => void;
}) {
  const counted = segments.reduce((sum, segment) => sum + segment.count, 0);
  const drawable = segments.filter((segment) => segment.count > 0);

  // Each arc's start is the sum of the counts before it, derived rather than
  // accumulated in a mutable running total — with at most four segments the
  // repeated scan costs nothing, and the map stays a pure function of the input.
  const arcs = drawable.map((segment, index) => {
    const before = drawable.slice(0, index).reduce((sum, prior) => sum + prior.count, 0);
    const length = counted === 0 ? 0 : (segment.count / counted) * GAUGE_SWEEP;
    // A hairline of ground between arcs, so two adjacent segments read as two
    // quantities rather than one long one that changes colour.
    const gap = drawable.length > 1 ? 3 : 0;
    return {
      segment,
      length: Math.max(length - gap, 0.5),
      offset: counted === 0 ? 0 : (before / counted) * GAUGE_SWEEP,
    };
  });

  return (
    <Stack spacing={1.5} sx={{ alignItems: "center" }}>
      <Box sx={{ position: "relative", width: GAUGE_SIZE, maxWidth: "100%", flex: "none" }}>
        <Box
          component="svg"
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
          role="img"
          aria-label={`${centreLabel}: ${total}`}
          sx={{ width: "100%", height: "auto", display: "block" }}
        >
          <g transform={`rotate(135 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}>
            <circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              fill="none"
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${GAUGE_SWEEP} ${GAUGE_CIRCUMFERENCE}`}
              style={{ stroke: editorial.neutralWash }}
            />
            {arcs.map(({ segment, length, offset: start }, index) => (
              <circle
                key={segment.id}
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth={GAUGE_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${length} ${GAUGE_CIRCUMFERENCE}`}
                strokeDashoffset={-start}
                style={{ stroke: markColour(segment.tone, index), transition: "stroke-dasharray 0.3s ease" }}
              />
            ))}
          </g>
        </Box>

        <Stack
          sx={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Typography sx={{ fontSize: 11.5, color: editorial.muted, fontWeight: 700 }}>{centreLabel}</Typography>
          <Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {total}
          </Typography>
        </Stack>
      </Box>

      <Stack
        direction="row"
        sx={{ flexWrap: "wrap", justifyContent: "center", gap: 1.5, width: "100%" }}
      >
        {segments.map((segment, index) => {
          const pressable = Boolean(onPick) && segment.count > 0;
          return (
            <Box
              key={segment.id}
              component={pressable ? "button" : "div"}
              type={pressable ? "button" : undefined}
              onClick={pressable ? () => onPick?.(segment) : undefined}
              aria-label={pressable ? `Show ${segment.count} ${segment.label}` : undefined}
              sx={{
                border: "none",
                background: "none",
                p: 0,
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                cursor: pressable ? "pointer" : "default",
                "&:hover .gauge-legend-label": pressable ? { color: editorial.pmwBlueDark } : undefined,
              }}
            >
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    flex: "none",
                    borderRadius: "2px",
                    backgroundColor: markColour(segment.tone, index),
                  }}
                />
                <Typography sx={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {segment.count}
                </Typography>
                <Typography className="gauge-legend-label" sx={{ fontSize: 12.5, fontWeight: 600 }}>
                  {segment.label}
                </Typography>
              </Stack>
              {segment.hint && (
                <Typography sx={{ fontSize: 10.5, color: editorial.softMuted, ml: "17px" }}>
                  {segment.hint}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
