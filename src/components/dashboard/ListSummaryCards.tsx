import { Box, Grid, Typography, IconButton, Tooltip } from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  ArrowForward as ArrowForwardIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import type { Submission, DiscoveredList, ListMetaEntry } from "../../types";
import { editorial, editorialShadow, editorialShadowHover } from "../../theme/editorial";

interface ListSummaryCardsProps {
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  listMetaMap: Record<string, ListMetaEntry>;
  isAdmin: boolean;
  canUseFormBuilder: boolean;
  onEditForm: (listTitle: string) => void;
}

export default function ListSummaryCards({
  submissions,
  visibleLists,
  listMetaMap,
  isAdmin,
  canUseFormBuilder,
  onEditForm,
}: ListSummaryCardsProps) {
  return (
    <Grid container spacing={2}>
      {visibleLists.map((list) => {
        const meta = listMetaMap[list.title] ?? {
          icon: "📋",
          color: editorial.ink,
          pale: editorial.blueWash,
          category: "General",
        };
        const listSubmissions = submissions.filter((s) => s.listTitle === list.title);
        const count = listSubmissions.length;
        let listApproved = 0;
        let listPending = 0;
        let listRejected = 0;

        for (const submission of listSubmissions) {
          const status = (submission.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
          if (["fullyapproved", "approved", "completed"].includes(status)) {
            listApproved++;
          } else if (status.includes("reject")) {
            listRejected++;
          } else {
            listPending++;
          }
        }

        const approvedWidth = count > 0 ? `${(listApproved / count) * 100}%` : "0%";
        const pendingWidth = count > 0 ? `${(listPending / count) * 100}%` : "0%";
        const rejectedWidth = count > 0 ? `${(listRejected / count) * 100}%` : "0%";
        const cardCaption = isAdmin ? "All visible submissions" : "Visible to you";

        return (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={list.id}>
            <Box
              sx={{
                minHeight: 224,
                backgroundColor: "rgba(255, 255, 255, 0.94)",
                borderRadius: "8px",
                boxShadow: editorialShadow,
                p: { xs: 1.75, sm: 2 },
                pt: canUseFormBuilder ? { xs: 2.25, sm: 2.5 } : { xs: 1.75, sm: 2 },
                position: "relative",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: "0 0 auto 0",
                  height: 3,
                  backgroundColor: meta.color,
                },
                "&:hover": {
                  boxShadow: editorialShadowHover,
                  transform: "translateY(-2px)",
                },
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "box-shadow 0.2s ease",
                  "&:hover": {
                    transform: "none",
                  },
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "8px",
                    backgroundColor: meta.pale,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.06)",
                  }}
                >
                  <DescriptionIcon sx={{ fontSize: 22, color: meta.color }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                      color: editorial.ink,
                      lineHeight: 1.2,
                      mb: 0.25,
                      textWrap: "balance",
                    }}
                  >
                    {list.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: editorial.muted, fontWeight: 700, display: "block" }}>
                    {meta.category} · {cardCaption}
                  </Typography>
                </Box>
                {canUseFormBuilder && (
                  <Tooltip title={`Edit ${list.title}`}>
                    <IconButton
                      aria-label={`Edit ${list.title}`}
                      onClick={() => onEditForm(list.title)}
                      size="small"
                      sx={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        width: 40,
                        height: 40,
                        borderRadius: "8px",
                        backgroundColor: editorial.purpleWash,
                        color: editorial.pmwPurpleDark,
                        boxShadow: `inset 0 0 0 1px ${editorial.pmwPurpleSoft}`,
                        transition: "background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
                        "&:hover": {
                          backgroundColor: editorial.pmwPurpleSoft,
                          boxShadow: `inset 0 0 0 1px ${editorial.pmwPurple}`,
                        },
                        "&:active": {
                          transform: "scale(0.96)",
                        },
                        "&:focus-visible": {
                          outline: `3px solid ${editorial.pmwPurpleSoft}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <EditIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              <Box sx={{ mt: "auto" }}>
                <Typography
                  variant="h2"
                  sx={{
                    fontWeight: 800,
                    color: editorial.ink,
                    letterSpacing: 0,
                    fontSize: "2.4rem",
                    mb: 0.5,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </Typography>
                <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 800 }}>
                  {count === 1 ? "submission" : "submissions"}
                </Typography>
              </Box>

              {count > 0 ? (
                <Box sx={{ mt: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      height: 7,
                      overflow: "hidden",
                      borderRadius: 999,
                      backgroundColor: "rgba(16, 16, 16, 0.08)",
                      mb: 1.5,
                    }}
                  >
                    <Box sx={{ width: approvedWidth, backgroundColor: editorial.success }} />
                    <Box sx={{ width: pendingWidth, backgroundColor: editorial.warning }} />
                    <Box sx={{ width: rejectedWidth, backgroundColor: editorial.error }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.success,
                      fontWeight: 700,
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                    {listApproved} approved
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.warning,
                      fontWeight: 700,
                    }}
                  >
                    <AccessTimeIcon sx={{ fontSize: 14 }} />
                    {listPending} pending
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      fontSize: "0.75rem",
                      color: editorial.error,
                      fontWeight: 700,
                    }}
                  >
                    <CancelIcon sx={{ fontSize: 14 }} />
                    {listRejected} rejected
                  </Box>
                  </Box>
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{ color: editorial.muted, fontStyle: "italic", mt: 2 }}
                >
                  No submissions
                </Typography>
              )}

              {!isAdmin && !canUseFormBuilder && count > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 0.5,
                    color: editorial.pmwBlueDark,
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    mt: 2,
                    transition: "transform 0.2s ease",
                    ".MuiBox-root:hover &": {
                      transform: "translateX(2px)",
                    },
                  }}
                >
                  Listed below
                  <ArrowForwardIcon sx={{ fontSize: 14 }} />
                </Box>
              )}
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}
