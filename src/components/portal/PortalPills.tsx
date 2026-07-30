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
    return { color: editorial.white, backgroundColor: editorial.error, borderColor: editorial.error };
  }
  if (tone === "mid") {
    return { color: editorial.white, backgroundColor: editorial.warning, borderColor: editorial.warning };
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
      return { color: editorial.white, backgroundColor: editorial.error, borderColor: editorial.error };
    case "In approval":
      return { color: editorial.pmwBlueDark, backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlueSoft };
    case "Returned":
      return { color: editorial.warning, backgroundColor: editorial.yellowSoft, borderColor: "rgba(177, 92, 0, 0.32)" };
    case "Approved":
      return { color: editorial.ink, backgroundColor: "#F1F3F6", borderColor: editorial.border };
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
    <Box sx={{ height, backgroundColor: "rgba(16, 16, 16, 0.06)", borderRadius: 999, overflow: "hidden" }}>
      <Box sx={{ height: "100%", width, backgroundColor: editorial.pmwBlue, transition: "width 0.25s ease" }} />
    </Box>
  );
}
