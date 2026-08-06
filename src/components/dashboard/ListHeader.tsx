import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { editorial } from "../../theme/editorial";

interface ListHeaderProps {
  isAdmin: boolean;
}

export default function ListHeader({ isAdmin }: ListHeaderProps) {
  const theme = useTheme();
  // Column titles only make sense over the column grid. SubmissionRow stacks
  // into cards under lg because the grid's fixed minimums do not fit — the two
  // breakpoints must stay identical.
  const isStacked = useMediaQuery(theme.breakpoints.down("lg"));

  if (isStacked) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isAdmin
          ? "minmax(240px, 2fr) minmax(180px, 1.35fr) minmax(170px, 1.15fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 88px"
          : "minmax(260px, 2.2fr) minmax(180px, 1.25fr) minmax(132px, 0.85fr) minmax(150px, 1fr) 40px",
        gap: 2,
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
