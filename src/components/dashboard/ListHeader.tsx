import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { SUBMISSION_GRID_COLUMNS, SUBMISSION_GRID_GAP } from "./submissionGrid";

interface ListHeaderProps {
  isAdmin: boolean;
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
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        borderRadius: "8px 8px 0 0",
        border: `1px solid ${editorial.border}`,
        borderBottom: 0,
        alignItems: "center",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Submission
      </Typography>
      {isAdmin && (
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 0,
            color: editorial.muted,
            fontWeight: 600,
            fontSize: "0.7rem",
          }}
        >
          Submitted By
        </Typography>
      )}
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        List
      </Typography>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Submitted
      </Typography>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0,
          color: editorial.muted,
          fontWeight: 600,
          fontSize: "0.7rem",
        }}
      >
        Status
      </Typography>
      {isAdmin ? (
        <Typography
          variant="caption"
          sx={{
            textTransform: "uppercase",
            letterSpacing: 0,
            color: editorial.muted,
            fontWeight: 600,
            fontSize: "0.7rem",
            textAlign: "right",
          }}
        >
          Actions
        </Typography>
      ) : (
        <Box />
      )}
    </Box>
  );
}
