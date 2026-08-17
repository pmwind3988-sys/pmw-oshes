import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
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
        borderRadius: "14px",
        border: editorialHairline,
        borderColor: active ? accent : editorial.border,
        backgroundColor: active ? editorial.blueWash : editorial.panel,
        cursor: interactive ? "pointer" : "default",
        overflow: "hidden",
        transition: "border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease",
        "&::before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 3,
          backgroundColor: zero ? editorial.border : accent,
        },
        ...(interactive && {
          "&:hover": {
            borderColor: accent,
            transform: "translateY(-1px)",
            boxShadow: "0 6px 18px rgba(0, 90, 158, 0.10)",
          },
          "&:active": { transform: "translateY(0)" },
          "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
        }),
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
 * Status mix as one horizontal bar, each segment a filter.
 *
 * A stacked bar rather than a pie: the comparison people actually make here is
 * "how much of this is stuck", which is a length, and lengths are read far more
 * accurately than angles. It also degrades to a legible strip on a phone, which
 * a pie with seven labels does not.
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
          height: 14,
          borderRadius: "999px",
          overflow: "hidden",
          border: editorialHairline,
          backgroundColor: editorial.paper,
        }}
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
                border: "none",
                p: 0,
                backgroundColor: toneColour(bucket.tone),
                opacity: !active || active === bucket.id ? 1 : 0.35,
                cursor: onPick ? "pointer" : "default",
                transition: "opacity 0.16s ease",
                "&:hover": onPick ? { opacity: 1 } : undefined,
              }}
            />
          </Tooltip>
        ))}
      </Stack>

      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
        {buckets.map((bucket) => {
          const on = active === bucket.id;
          return (
            <Box
              key={bucket.id}
              component={onPick ? "button" : "div"}
              type={onPick ? "button" : undefined}
              onClick={onPick ? () => onPick(bucket) : undefined}
              aria-pressed={onPick ? on : undefined}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.6,
                px: 0.9,
                py: 0.4,
                borderRadius: "999px",
                border: editorialHairline,
                borderColor: on ? toneColour(bucket.tone) : editorial.border,
                backgroundColor: on ? editorial.blueWash : "transparent",
                font: "inherit",
                color: "inherit",
                cursor: onPick ? "pointer" : "default",
                "&:hover": onPick ? { borderColor: toneColour(bucket.tone) } : undefined,
              }}
            >
              <Box
                sx={{ width: 8, height: 8, borderRadius: "50%", flex: "none", backgroundColor: toneColour(bucket.tone) }}
              />
              <Typography sx={{ fontSize: 11.5, fontWeight: 700 }}>{bucket.label}</Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted, fontVariantNumeric: "tabular-nums" }}>
                {bucket.count}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Fourteen days of intake. Bars are buttons only where the day has something in
 * it — an empty day has no list to open, and a pressable empty bar is a lie.
 */
export function IntakeChart({ days, onPickDay }: { days: DayPoint[]; onPickDay?: (day: DayPoint) => void }) {
  const busiest = Math.max(...days.map((day) => day.count), 0);

  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-end", height: 84 }}>
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
                  "&:hover .intake-bar": pressable ? { backgroundColor: editorial.pmwBlueDark } : undefined,
                }}
              >
                <Box
                  className="intake-bar"
                  sx={{
                    width: "100%",
                    // A zero day keeps a visible 2px floor so the axis reads as
                    // a continuous fortnight rather than a gap in the data.
                    height: day.count === 0 ? 2 : `${Math.max(day.percent, 6)}%`,
                    borderRadius: "3px 3px 0 0",
                    backgroundColor:
                      day.count === 0
                        ? editorial.border
                        : day.isToday
                          ? editorial.pmwBlueDark
                          : editorial.pmwBlue,
                    opacity: day.count === 0 ? 1 : day.isToday ? 1 : 0.75,
                    transition: "height 0.2s ease, background-color 0.16s ease",
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }}>
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

      <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 1 }}>
        {busiest === 0 ? "Nothing filed in the last 14 days." : `Busiest day: ${busiest} filed`}
      </Typography>
    </Box>
  );
}
