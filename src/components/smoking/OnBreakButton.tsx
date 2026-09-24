import { useState } from "react";
import { Box, Popover, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { onBreakLabel } from "../../utils/smoking/adminData";
import { isoToMytInput } from "./BreakEditDialog";
import type { SmokingBreak } from "../../utils/smoking/schema";

/** "since 10:42" — the Malaysian wall-clock time a break started. */
function sinceLabel(timeIn: string): string {
  return `since ${isoToMytInput(timeIn).slice(11, 16)}`;
}

/**
 * The page header's live count of who is out right now.
 *
 * Zero renders as plain text — there is nothing to open a list onto. Any other
 * count is a real button, so the roster behind "3 people on a break now" is one
 * keyboard-operable press away rather than a number nobody can act on.
 */
export default function OnBreakButton({ outNow }: { outNow: SmokingBreak[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = onBreakLabel(outNow.length);

  if (outNow.length === 0) {
    return <Typography sx={{ fontSize: 12, color: editorial.muted, whiteSpace: "nowrap" }}>{label}</Typography>;
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="true"
        aria-label={`${label} — see who`}
        sx={{
          font: "inherit",
          fontSize: 12,
          fontWeight: 700,
          color: editorial.pmwBlueDark,
          background: "none",
          border: "none",
          p: 0,
          cursor: "pointer",
          whiteSpace: "nowrap",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
        }}
      >
        {label}
      </Box>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 320, borderRadius: radius.md } } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {outNow.map((b, index) => (
            <Box key={b.id} sx={{ pb: 1, borderBottom: index < outNow.length - 1 ? editorialHairline : "none" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: editorial.ink }}>
                {b.fullName || b.email}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted }}>
                {b.department || "—"} · {b.areaInName || "—"} · {sinceLabel(b.timeIn)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
