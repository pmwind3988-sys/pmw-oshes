import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { SUBMISSION_GRID_COLUMNS, SUBMISSION_GRID_GAP } from "./submissionGrid";

interface ListHeaderProps {
  isAdmin: boolean;
}

/** One column label. Written once, because it was written five times. */
function ColumnLabel({ children, align }: { children: ReactNode; align?: "right" }) {
  return (
    <Typography
      sx={{
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: editorial.muted,
        fontWeight: 800,
        fontSize: 11,
        textAlign: align,
      }}
    >
      {children}
    </Typography>
  );
}

export default function ListHeader({ isAdmin }: ListHeaderProps) {
  const theme = useTheme();
  // Rows fall back to the card layout below md, so the column header goes with them.
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));

  if (isCompact) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin ? SUBMISSION_GRID_COLUMNS.admin : SUBMISSION_GRID_COLUMNS.member,
        gap: SUBMISSION_GRID_GAP,
        px: 2.5,
        py: 1.5,
        // The panel colour, not a 90%-white wash: a translucent head let the
        // page background bleed through and read as a different white from the
        // rows immediately under it.
        backgroundColor: editorial.paper,
        borderRadius: `${radius.lg} ${radius.lg} 0 0`,
        border: `1px solid ${editorial.border}`,
        borderBottom: 0,
        alignItems: "center",
      }}
    >
      <ColumnLabel>Submission</ColumnLabel>
      {isAdmin && <ColumnLabel>Submitted by</ColumnLabel>}
      <ColumnLabel>List</ColumnLabel>
      <ColumnLabel>Submitted</ColumnLabel>
      <ColumnLabel>Status</ColumnLabel>
      {isAdmin ? <ColumnLabel align="right">Actions</ColumnLabel> : <Box />}
    </Box>
  );
}
