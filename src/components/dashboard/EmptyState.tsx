import { Box, Stack, Typography } from "@mui/material";
import { FileText as DescriptionIcon } from "../ui/Icons";
import { editorial } from "../../theme/editorial";

interface EmptyStateProps {
  hasFilters: boolean;
}

/**
 * Nothing to show — and which kind of nothing.
 *
 * The two cases need different words because they need different next actions:
 * an empty filter is the reader's own doing and is undone by widening it, while
 * an empty list is the site's state and is undone by somebody filing a form.
 *
 * Drawn as a round tinted circle with an icon, a headline and one sentence. No
 * frame: an empty state is a place to read, not a card to look at.
 */
export default function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
      <Stack spacing={2} sx={{ alignItems: "center", maxWidth: 440, textAlign: "center", px: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            flex: "none",
            width: 112,
            height: 112,
            borderRadius: "50%",
            backgroundColor: editorial.blueWash,
            color: editorial.pmwBlueDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DescriptionIcon sx={{ fontSize: 44 }} />
        </Box>

        <Typography sx={{ fontSize: 19, fontWeight: 800, color: editorial.ink, lineHeight: 1.3 }}>
          {hasFilters ? "No submissions match your filters" : "No submissions yet"}
        </Typography>

        <Typography sx={{ fontSize: 14, color: editorial.muted, lineHeight: 1.6 }}>
          {hasFilters
            ? "Try adjusting your search criteria or clearing some filters."
            : "Submissions will appear here once users start filling out OSHES forms."}
        </Typography>
      </Stack>
    </Box>
  );
}
