import { Box, Stack, Typography } from "@mui/material";
import { Description as DescriptionIcon } from "@mui/icons-material";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";

interface EmptyStateProps {
  hasFilters: boolean;
}

/**
 * Nothing to show — and which kind of nothing.
 *
 * The two cases need different words because they need different next actions:
 * an empty filter is the reader's own doing and is undone by widening it, while
 * an empty list is the site's state and is undone by somebody filing a form.
 */
export default function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          maxWidth: 440,
          textAlign: "center",
          backgroundColor: editorial.panel,
          // Dashed rather than solid: the border says "this frame is a
          // placeholder", which a hairline card would not.
          border: `1px dashed ${editorial.pmwBlueSoft}`,
          borderRadius: radius.lg,
          px: { xs: 3, sm: 5 },
          py: 5,
        }}
      >
        <Box
          sx={{
            width: 60,
            height: 60,
            borderRadius: radius.lg,
            backgroundColor: editorial.blueWash,
            border: `1px solid ${editorial.pmwBlueSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DescriptionIcon sx={{ fontSize: 28, color: editorial.pmwBlueDark }} />
        </Box>

        <Typography sx={{ fontSize: 19, fontWeight: 800, color: editorial.ink, lineHeight: 1.3 }}>
          {hasFilters ? "No submissions match your filters" : "No submissions yet"}
        </Typography>

        <Typography sx={{ fontSize: 13.5, color: editorial.muted, lineHeight: 1.6 }}>
          {hasFilters
            ? "Try adjusting your search criteria or clearing some filters."
            : "Submissions will appear here once users start filling out OSHES forms."}
        </Typography>
      </Stack>
    </Box>
  );
}
