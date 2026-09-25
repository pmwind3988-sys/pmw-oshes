import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import type { HeatCell, Heatmap } from "../../utils/smoking/analytics";

export type HeatMetric = "breaks" | "minutes";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * One hue, light to dark: the brand blue mixed into the panel. Mixing into the
 * panel token rather than white keeps the ramp reading "more is stronger" on a
 * dark theme too, where the panel is the dark end.
 */
const STEPS = [18, 38, 60, 80, 100];
const stepColour = (step: number) =>
  step === 0 ? editorial.neutralWash : `color-mix(in srgb, ${editorial.pmwBlue} ${STEPS[step - 1]}%, ${editorial.panel})`;

/** 0 for an empty slot, otherwise 1–5 by share of the busiest slot. */
function stepFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * STEPS.length));
}

const hh = (hour: number) => String(hour).padStart(2, "0");
const slotLabel = (c: HeatCell) => `${DAYS[c.day]} ${hh(c.hour)}:00–${hh((c.hour + 1) % 24)}:00`;
const cellSummary = (c: HeatCell) =>
  `${slotLabel(c)} · ${c.breaks} ${c.breaks === 1 ? "break" : "breaks"} · ${c.minutes} min`;

/**
 * When people step out: weekdays down the side, Malaysian hours across the top,
 * darker where more breaks started (or more minutes were spent). The exact
 * figures for a slot are on hover and in each cell's accessible name.
 */
export default function SmokingHeatmap({ heatmap, metric }: { heatmap: Heatmap; metric: HeatMetric }) {
  const hours = Array.from({ length: heatmap.lastHour - heatmap.firstHour + 1 }, (_, i) => heatmap.firstHour + i);
  const max = Math.max(...heatmap.cells.flat().map((c) => c[metric]), 0);
  const columns = `36px repeat(${hours.length}, minmax(22px, 1fr))`;

  return (
    <Box>
      {/* The grid scrolls inside its card on a phone rather than squeezing
          twenty-odd hour columns into slivers too thin to hover. */}
      <Box sx={{ overflowX: "auto", pb: 0.5 }}>
        <Box
          role="group"
          aria-label={`Breaks by weekday and hour, shaded by ${metric === "breaks" ? "number of breaks" : "minutes spent"}`}
          sx={{ display: "grid", gridTemplateColumns: columns, gap: "2px", minWidth: 36 + hours.length * 24 }}
        >
          <Box />
          {hours.map((hour) => (
            <Typography
              key={hour}
              aria-hidden
              sx={{ fontSize: 10, color: editorial.softMuted, textAlign: "center", fontVariantNumeric: "tabular-nums", pb: 0.25 }}
            >
              {hh(hour)}
            </Typography>
          ))}

          {heatmap.cells.map((row, day) => (
            <Box key={DAYS[day]} sx={{ display: "contents" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: editorial.muted, alignSelf: "center" }}>
                {DAYS[day]}
              </Typography>
              {hours.map((hour) => {
                const cell = row[hour];
                const step = stepFor(cell[metric], max);
                return (
                  <Tooltip key={hour} title={cellSummary(cell)} enterDelay={80} disableInteractive>
                    <Box
                      tabIndex={0}
                      aria-label={cellSummary(cell)}
                      sx={{
                        height: 26,
                        borderRadius: radius.sm,
                        backgroundColor: stepColour(step),
                        outlineOffset: 1,
                        "&:hover, &:focus-visible": { outline: `2px solid ${editorial.ink}` },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ mt: 1.25, alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
        <Typography sx={{ fontSize: 12, color: editorial.muted, flex: 1, minWidth: 200 }}>
          {heatmap.peak ? (
            <>
              Busiest: <Box component="strong" sx={{ color: editorial.ink }}>{slotLabel(heatmap.peak)}</Box> ·{" "}
              {heatmap.peak.breaks} {heatmap.peak.breaks === 1 ? "break" : "breaks"}
            </>
          ) : (
            "No breaks in these filters."
          )}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }} aria-hidden>
          <Typography sx={{ fontSize: 10.5, color: editorial.softMuted, mr: 0.25 }}>Fewer</Typography>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <Box key={step} sx={{ width: 14, height: 14, borderRadius: radius.sm, backgroundColor: stepColour(step) }} />
          ))}
          <Typography sx={{ fontSize: 10.5, color: editorial.softMuted, ml: 0.25 }}>More</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
