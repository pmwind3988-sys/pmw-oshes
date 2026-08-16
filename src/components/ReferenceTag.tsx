import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { editorial } from "../theme/editorial";

/**
 * The reference number, rendered as a record's primary ID.
 *
 * Every surface that names a record — queue rows, the records table, the drawer,
 * the audit trail, the dashboard, the evaluation page — renders it through this,
 * so the ID looks the same wherever someone meets it and stays findable at a
 * glance in a column of otherwise similar grey metadata.
 *
 * Blue rather than a neutral because DESIGN.md reserves blue for action and
 * identity, and this is the identity. The palette and 8px radius are lifted from
 * the dashboard's existing `identityChipSx` rather than invented, so the two
 * halves of the product show an ID the same way. It stays deliberately quieter
 * than StatusPill and the severity pills: a reference is never *urgent*, and a
 * screen where everything competes signals nothing.
 *
 * `userSelect: all` makes a single click select the whole ID. These get read
 * down the phone and pasted into mail all day, and part of one is worse than
 * none.
 */

export type ReferenceTagSize = "sm" | "md" | "lg";

const SIZES: Record<ReferenceTagSize, { fontSize: number; px: number; py: number }> = {
  sm: { fontSize: 11.5, px: 0.7, py: 0.1 },
  md: { fontSize: 13, px: 0.9, py: 0.25 },
  lg: { fontSize: 16, px: 1.2, py: 0.4 },
};

interface ReferenceTagProps {
  value: string;
  size?: ReferenceTagSize;
  sx?: SxProps<Theme>;
}

export default function ReferenceTag({ value, size = "sm", sx }: ReferenceTagProps) {
  if (!value) return null;
  const scale = SIZES[size];
  return (
    <Box
      component="span"
      title={`Reference ${value}`}
      sx={{
        display: "inline-block",
        px: scale.px,
        py: scale.py,
        borderRadius: "8px",
        backgroundColor: editorial.blueWash,
        border: `1px solid ${editorial.pmwBlueSoft}`,
        color: editorial.pmwBlueDark,
        fontSize: scale.fontSize,
        fontWeight: 800,
        letterSpacing: "0.02em",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        userSelect: "all",
        ...sx,
      }}
    >
      {value}
    </Box>
  );
}
