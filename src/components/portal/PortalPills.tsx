import { Box } from "@mui/material";
import type { PortalStatus, SeverityTone } from "../../types";
import { editorial } from "../../theme/editorial";

const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  px: 0.9,
  py: 0.4,
  borderRadius: "999px",
  border: "1px solid transparent",
} as const;

/**
 * Severity keeps the prototype's weight difference — solid for the worst,
 * tint below it — so it survives greyscale printing, and always carries text
 * so it is never colour-only.
 */
function severityColours(tone: SeverityTone) {
  if (tone === "high") {
    return { color: editorial.onStatus, backgroundColor: editorial.errorFill, borderColor: editorial.errorFill };
  }
  if (tone === "mid") {
    return { color: editorial.onStatus, backgroundColor: editorial.warningFill, borderColor: editorial.warningFill };
  }
  return { color: editorial.ink, backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft };
}

export function SeverityPill({ label, tone }: { label: string; tone: SeverityTone }) {
  if (!label.trim()) return null;
  return <Box component="span" sx={{ ...PILL_BASE, ...severityColours(tone) }}>{label}</Box>;
}

function statusColours(status: PortalStatus) {
  switch (status) {
    case "Past SLA":
      return { color: editorial.onStatus, backgroundColor: editorial.errorFill, borderColor: editorial.errorFill };
    case "In approval":
      return { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft };
    case "Returned":
      return { color: editorial.warning, backgroundColor: editorial.warningWash, borderColor: editorial.warning };
    case "Approved":
      return { color: editorial.ink, backgroundColor: editorial.neutralWash, borderColor: editorial.border };
    // Filed on a form with no approval step: complete, but never signed. Kept
    // visually quieter than Approved so the two are not read as the same event.
    case "Recorded":
      return { color: editorial.muted, backgroundColor: editorial.paper, borderColor: editorial.border };
    case "Cancelled":
    case "Rejected":
      return { color: editorial.muted, backgroundColor: "transparent", borderColor: editorial.border };
  }
}

export function StatusPill({ status }: { status: PortalStatus }) {
  return <Box component="span" sx={{ ...PILL_BASE, ...statusColours(status) }}>{status}</Box>;
}

/** A proportional bar. Zero renders an empty track, never a sliver. */
export function ProportionBar({ percent, height = 6 }: { percent: number; height?: number }) {
  const width = percent > 0 ? `${Math.max(percent, 2)}%` : "0%";
  return (
    <Box sx={{ height, backgroundColor: editorial.neutralWash, borderRadius: 999, overflow: "hidden" }}>
      <Box sx={{ height: "100%", width, backgroundColor: editorial.pmwBlue, transition: "width 0.25s ease" }} />
    </Box>
  );
}
