import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  ArrowForward as ArrowForwardIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import type { Submission, DiscoveredList, ListMetaEntry } from "../../types";
import { editorial } from "../../theme/editorial";
import { panelSx, radius } from "../../theme/surfaces";
import { WidgetGrid } from "../Widget";

interface ListSummaryCardsProps {
  submissions: Submission[];
  visibleLists: DiscoveredList[];
  listMetaMap: Record<string, ListMetaEntry>;
  isAdmin: boolean;
  canUseFormBuilder: boolean;
  onEditForm: (listTitle: string) => void;
}

/**
 * One card per SharePoint list, carrying its volume and its approval mix.
 *
 * Rebuilt on the shared card geometry — a hairline and a 14px radius rather
 * than a shadowed 8px tile on a 94%-white wash — so the admin dashboard and the
 * portal read as one product rather than two eras of one. The stacked bar and
 * its legend are the only colour here, and they are the status tokens, because
 * approved / pending / rejected is exactly what those tokens mean.
 */
export default function ListSummaryCards({
  submissions,
  visibleLists,
  listMetaMap,
  isAdmin,
  canUseFormBuilder,
  onEditForm,
}: ListSummaryCardsProps) {
  return (
    <WidgetGrid min={260}>
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

        const share = (value: number) => (count > 0 ? `${(value / count) * 100}%` : "0%");
        const cardCaption = isAdmin ? "All visible submissions" : "Visible to you";

        const legend = [
          { key: "approved", icon: <CheckCircleIcon sx={{ fontSize: 14 }} />, colour: editorial.success, text: `${listApproved} approved` },
          { key: "pending", icon: <AccessTimeIcon sx={{ fontSize: 14 }} />, colour: editorial.warning, text: `${listPending} pending` },
          { key: "rejected", icon: <CancelIcon sx={{ fontSize: 14 }} />, colour: editorial.error, text: `${listRejected} rejected` },
        ];

        return (
          <Box
            key={list.id}
            sx={{
              ...panelSx,
              position: "relative",
              overflow: "hidden",
              minHeight: 224,
              height: "100%",
              p: { xs: 1.75, sm: 2 },
              pt: canUseFormBuilder ? { xs: 2.25, sm: 2.5 } : { xs: 1.75, sm: 2 },
              display: "flex",
              flexDirection: "column",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: "0 0 auto 0",
                height: 3,
                backgroundColor: meta.color,
              },
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", mb: 2 }}>
              <Box
                sx={{
                  flex: "none",
                  width: 42,
                  height: 42,
                  borderRadius: radius.md,
                  backgroundColor: meta.pale,
                  border: `1px solid ${editorial.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DescriptionIcon sx={{ fontSize: 20, color: meta.color }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 15.5, fontWeight: 800, color: editorial.ink, lineHeight: 1.25, textWrap: "balance" }}>
                  {list.title}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: editorial.muted, fontWeight: 700, mt: 0.2 }}>
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
                      top: 10,
                      right: 10,
                      width: 34,
                      height: 34,
                      minWidth: 34,
                      minHeight: 34,
                      borderRadius: radius.sm,
                      backgroundColor: editorial.purpleWash,
                      color: editorial.pmwPurpleDark,
                      border: `1px solid ${editorial.pmwPurpleSoft}`,
                      "&:hover": { backgroundColor: editorial.pmwPurpleSoft, borderColor: editorial.pmwPurple },
                      "&:focus-visible": { outline: `3px solid ${editorial.pmwPurpleSoft}`, outlineOffset: 2 },
                    }}
                  >
                    <EditIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>

            <Box sx={{ mt: "auto" }}>
              <Typography
                sx={{
                  fontWeight: 800,
                  color: count === 0 ? editorial.softMuted : editorial.ink,
                  fontSize: 36,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.softMuted, fontWeight: 800, mt: 0.4 }}>
                {count === 1 ? "submission" : "submissions"}
              </Typography>
            </Box>

            {count > 0 ? (
              <Box sx={{ mt: 2 }}>
                <Stack
                  direction="row"
                  spacing={0.4}
                  sx={{ height: 8, overflow: "hidden", borderRadius: radius.full, mb: 1.25 }}
                >
                  <Box sx={{ width: share(listApproved), borderRadius: radius.full, backgroundColor: editorial.successFill }} />
                  <Box sx={{ width: share(listPending), borderRadius: radius.full, backgroundColor: editorial.warningFill }} />
                  <Box sx={{ width: share(listRejected), borderRadius: radius.full, backgroundColor: editorial.errorFill }} />
                </Stack>
                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {legend.map((item) => (
                    <Stack
                      key={item.key}
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center", fontSize: 11.5, color: item.colour, fontWeight: 700 }}
                    >
                      {item.icon}
                      {item.text}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 2 }}>No submissions</Typography>
            )}

            {!isAdmin && !canUseFormBuilder && count > 0 && (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: "center",
                  color: editorial.pmwBlueDark,
                  fontSize: 11.5,
                  fontWeight: 800,
                  mt: 2,
                }}
              >
                Listed below
                <ArrowForwardIcon sx={{ fontSize: 14 }} />
              </Stack>
            )}
          </Box>
        );
      })}
    </WidgetGrid>
  );
}
