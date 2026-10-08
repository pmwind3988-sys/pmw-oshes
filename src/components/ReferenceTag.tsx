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
 * A neutral monospace pill: the reference is an identifier to read and copy, not
 * an action or a status, so it takes the quiet chip fill and no colour. It stays
 * deliberately quieter than StatusPill and the severity pills: a reference is
 * never *urgent*, and a screen where everything competes signals nothing.
 *
 * `userSelect: all` makes a single click select the whole ID. These get read
 * down the phone and pasted into mail all day, and part of one is worse than
 * none.
 */

export type ReferenceTagSize = "sm" | "md" | "lg";

/** Monospace, so a reference reads as an identifier, and set as a pill like every other tag. */
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const SIZES: Record<ReferenceTagSize, { fontSize: number; px: number; py: number }> = {
  sm: { fontSize: 12, px: 1, py: 0.2 },
  md: { fontSize: 13, px: 1.25, py: 0.3 },
  lg: { fontSize: 16, px: 1.5, py: 0.45 },
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
        borderRadius: "999px",
        backgroundColor: editorial.neutralWash,
        border: "none",
        color: editorial.ink,
        fontFamily: MONO_STACK,
        fontSize: scale.fontSize,
        fontWeight: 600,
        letterSpacing: "0.01em",
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
