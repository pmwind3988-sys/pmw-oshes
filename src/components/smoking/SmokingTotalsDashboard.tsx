import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { SectionLabel, Widget, WidgetGrid } from "../Widget";
import { BarRows, IntakeChart, StatTile, StatTileRow, type BarRow } from "../portal/PortalStats";
import SmokingHeatmap, { type HeatMetric } from "./SmokingHeatmap";
import SmokingTotalsTable from "./SmokingTotalsTable";
import { useIsPhone } from "./SmokingPaging";
import { computeTotals } from "../../utils/smoking/adminData";
import { breakHeatmap, breakSummary, breakdownRows, breaksPerDay, type BreakdownBy } from "../../utils/smoking/analytics";
import type { SmokingBreak } from "../../utils/smoking/schema";

/**
 * "42 min", "11.1 h" — one short token, because a tile's big figure wraps into
 * two lines at five-across; the exact minutes go in the tile's hint.
 */
const tileTime = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`);

/** A row of mutually exclusive choices — which measure, which grouping. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <Stack role="group" aria-label={label} direction="row" sx={{ display: "inline-flex", gap: 0.5, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            sx={{
              minHeight: 32,
              px: 1.5,
              border: "none",
              borderRadius: radius.full,
              backgroundColor: on ? editorial.pmwBlueSoft : editorial.neutralWash,
              color: on ? editorial.pmwBlueDark : editorial.muted,
              font: "inherit",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
              transition: "background-color 0.16s ease, color 0.16s ease",
              "&:hover": { color: editorial.pmwBlueDark },
              "&:focus-visible": { outline: "3px solid #9DBDF5", outlineOffset: 2 },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Stack>
  );
}

/** The five figures as one short strip, for a phone, where five tiles fill the screen. */
function SummaryStrip({ items }: { items: Array<{ value: string | number; label: string; alert?: boolean }> }) {
  return (
    <Box sx={{ backgroundColor: editorial.paper, borderRadius: "24px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", rowGap: 1.25, columnGap: 1, p: 2 }}>
      {items.map((item) => (
        <Box key={item.label} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: item.alert ? editorial.error : editorial.ink, fontVariantNumeric: "tabular-nums" }}>
            {item.value}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: editorial.muted, mt: 0.25 }}>{item.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

type PhoneSection = "table" | "when" | "days" | "where";

const PHONE_SECTIONS: Array<{ value: PhoneSection; label: string }> = [
  { value: "table", label: "Totals" },
  { value: "when", label: "By hour" },
  { value: "days", label: "By day" },
  { value: "where", label: "Breakdown" },
];

const BREAKDOWN_OPTIONS: Array<{ value: BreakdownBy; label: string }> = [
  { value: "department", label: "Department" },
  { value: "company", label: "Company" },
  { value: "area", label: "Area" },
  { value: "person", label: "Person" },
];

/**
 * The Totals tab: what the filtered breaks add up to, when they happen, how
 * they trend across the dates, and who or where they come from — then the
 * per-person table the numbers are built from. Everything follows the filter
 * bar above it; nothing here filters on its own.
 */
export default function SmokingTotalsDashboard({
  breaks,
  from,
  to,
  now,
  groupByDepartment,
  resetKey = "",
}: {
  breaks: SmokingBreak[];
  from: string;
  to: string;
  now: Date;
  groupByDepartment: boolean;
  resetKey?: string;
}) {
  const [metric, setMetric] = useState<HeatMetric>("breaks");
  const [by, setBy] = useState<BreakdownBy>("department");
  // A phone shows one section at a time under the tiles, not four cards to scroll past.
  const phone = useIsPhone();
  const [section, setSection] = useState<PhoneSection>("table");
  const show = (s: PhoneSection) => !phone || section === s;

  const summary = breakSummary(breaks, now);
  const breakdown: BarRow[] = breakdownRows(breaks, by, now).map((r) => ({
    id: r.id,
    label: r.label,
    value: r.minutes,
    hint: `${r.breaks} ${r.breaks === 1 ? "break" : "breaks"}`,
    // One measure, one hue: a department is not a category that needs telling
    // apart from its neighbour, it is a longer or shorter bar of the same thing.
    tone: "ink",
  }));

  return (
    <Stack spacing={2}>
      {phone ? (
        <SummaryStrip
          items={[
            { value: summary.breaks, label: summary.open ? `Breaks (+${summary.open} out)` : "Breaks" },
            { value: tileTime(summary.totalMinutes), label: "Total time" },
            { value: `${summary.averageMinutes} min`, label: "Average" },
            { value: summary.people, label: "People" },
            { value: summary.flagged, label: "Flagged", alert: summary.flagged > 0 },
          ]}
        />
      ) : (
      <StatTileRow min={128}>
        <StatTile value={summary.breaks} label="Breaks" hint={summary.open ? `+${summary.open} still out` : "closed and counted"} />
        <StatTile value={tileTime(summary.totalMinutes)} label="Total time" hint={`${summary.totalMinutes} min, flagged left out`} />
        <StatTile value={`${summary.averageMinutes} min`} label="Average break" hint="per counted break" />
        <StatTile value={summary.people} label="People" hint="took at least one break" />
        <StatTile value={summary.flagged} label="Flagged" hint="counted separately" tone={summary.flagged ? "alert" : "muted"} />
      </StatTileRow>
      )}

      {phone && <Segmented label="Show" value={section} onChange={setSection} options={PHONE_SECTIONS} />}

      {show("when") && (
      <Widget
        title="When people take breaks"
        caption="each break by the hour it started, Malaysian time"
        actions={
          <Segmented
            label="Shade by"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "breaks", label: "Breaks" },
              { value: "minutes", label: "Minutes" },
            ]}
          />
        }
      >
        <SmokingHeatmap heatmap={breakHeatmap(breaks, now)} metric={metric} />
      </Widget>
      )}

      {(show("days") || show("where")) && (
      <WidgetGrid min={340}>
        {show("days") && (
        <Widget title="Breaks per day" caption="every break by the day it started">
          <IntakeChart days={breaksPerDay(breaks, from, to, now)} unit="breaks" height={132} />
        </Widget>
        )}
        {show("where") && (
        <Widget title="Where the time goes" caption="counted minutes, top 10">
          {/* In the body, not the header: four choices beside the title would
              push it into a one-word column on a phone. */}
          <Box sx={{ mb: 1.75 }}>
            <Segmented label="Break down by" value={by} onChange={setBy} options={BREAKDOWN_OPTIONS} />
          </Box>
          <BarRows rows={breakdown} emptyNote="No counted breaks in these filters." valueSuffix="min" />
        </Widget>
        )}
      </WidgetGrid>
      )}

      {show("table") && (
      <Box>
        <SectionLabel sx={{ mb: 1 }}>{groupByDepartment ? "By department" : "By person"}</SectionLabel>
        <SmokingTotalsTable totals={computeTotals(breaks, now)} groupByDepartment={groupByDepartment} resetKey={resetKey} />
      </Box>
      )}
    </Stack>
  );
}
