import { Box } from "@mui/material";
import type { PortalStatus, SeverityTone } from "../../types";
import { editorial } from "../../theme/editorial";

/*
 * Pills are tonal fills, sentence case, and never outlined. The label is the
 * meaning; the fill only reinforces it, so each pill still reads in greyscale.
 */
const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 12.5,
  fontWeight: 700,
  lineHeight: 1.4,
  px: 1.25,
  py: 0.5,
  borderRadius: "999px",
  border: "none",
} as const;

/** A small coloured dot ahead of the label — the overdue marker. */
function dotSx(color: string) {
  return {
    "&::before": {
      content: '""',
      display: "inline-block",
      flex: "none",
      width: 7,
      height: 7,
      mr: 0.75,
      borderRadius: "999px",
      backgroundColor: color,
    },
  } as const;
}

/**
 * Severity keeps its weight difference in tone rather than solidity: the worst is
 * a red container, the next an amber one, and anything lower a blue tint. Always
 * carries text, so it is never colour-only.
 */
function severityColours(tone: SeverityTone) {
  if (tone === "high") {
    return { color: editorial.error, backgroundColor: editorial.errorWash };
  }
  if (tone === "mid") {
    return { color: editorial.warning, backgroundColor: editorial.warningWash };
  }
  return { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash };
}

export function SeverityPill({ label, tone }: { label: string; tone: SeverityTone }) {
  if (!label.trim()) return null;
  return <Box component="span" sx={{ ...PILL_BASE, ...severityColours(tone) }}>{label}</Box>;
}

function statusColours(status: PortalStatus) {
  switch (status) {
    // Red is spent on overdue only: a red container with a red dot ahead of it.
    case "Past SLA":
      return { color: editorial.error, backgroundColor: editorial.errorWash, dot: editorial.errorFill };
    case "In approval":
      return { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash };
    // Amber is "needs you": the record is back with the person who filed it.
    case "Returned":
      return { color: editorial.warning, backgroundColor: editorial.warningWash };
    case "Approved":
      return { color: editorial.success, backgroundColor: editorial.successWash };
    // Filed on a form with no approval step: complete, but never signed. Kept
    // quieter than Approved so the two are not read as the same event.
    case "Recorded":
      return { color: editorial.muted, backgroundColor: editorial.paper };
    case "Cancelled":
    case "Rejected":
      return { color: editorial.muted, backgroundColor: editorial.neutralWash };
  }
}

export function StatusPill({ status }: { status: PortalStatus }) {
  const { dot, ...colours } = statusColours(status);
  return (
    <Box component="span" sx={{ ...PILL_BASE, ...colours, ...(dot ? dotSx(dot) : null) }}>
      {status}
    </Box>
  );
}

/**
 * A proportional bar. Zero renders an empty track, never a sliver.
 *
 * Fully rounded at both ends, on a neutral track. It is one segment against the
 * track, so there is no gap to draw; the rounding is what keeps it a soft bar.
 */
export function ProportionBar({ percent, height = 6 }: { percent: number; height?: number }) {
  const width = percent > 0 ? `${Math.max(percent, 2)}%` : "0%";
  return (
    <Box sx={{ height, backgroundColor: editorial.neutralWash, borderRadius: 999, overflow: "hidden" }}>
      <Box
        sx={{
          height: "100%",
          width,
          borderRadius: 999,
          backgroundColor: editorial.pmwBlue,
          transition: "width 0.25s ease",
        }}
      />
    </Box>
  );
}
