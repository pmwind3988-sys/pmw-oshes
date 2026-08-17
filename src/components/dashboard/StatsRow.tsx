import { Box, Stack, Typography } from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
} from "@mui/icons-material";
import type { ReactNode } from "react";
import type { Submission } from "../../types";
import { editorial } from "../../theme/editorial";
import { panelSx, radius } from "../../theme/surfaces";
import { IconTile, type TileTone } from "../Widget";

interface StatsRowProps {
  submissions: Submission[];
}

/**
 * The four headline counts over the submissions table.
 *
 * These used to be drawn with literal `rgba()` washes and a `${token}26` hex
 * suffix appended to a colour that had become a `var()` — which silently
 * produced `var(--pmw-success)26` and rendered as nothing. Both are gone: the
 * washes are the status tokens' own, and transparency is composed with
 * `color-mix`, so the row survives all six contrast themes.
 *
 * The progress bar under each number is the share of the visible set, which is
 * the question the four cards are really being asked together — "how much of
 * this pile is approved" — and a length answers it without the reader dividing
 * two figures in their head.
 */
export default function StatsRow({ submissions }: StatsRowProps) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;

  for (const s of submissions) {
    const status = (s.formStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
    if (status === "fullyapproved" || status === "approved" || status === "completed") {
      approved++;
    } else if (status.includes("reject")) {
      rejected++;
    } else {
      pending++;
    }
  }

  const total = submissions.length;
  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const submissionLabel = (value: number, label: string) =>
    `${value} ${label} submission${value === 1 ? "" : "s"}`;

  const stats: {
    label: string;
    value: number;
    helper: string;
    progress: number;
    icon: ReactNode;
    tone: TileTone;
    accent: string;
  }[] = [
    {
      label: "Total",
      value: total,
      helper: total === 1 ? "1 visible submission" : `${total} visible submissions`,
      progress: total > 0 ? 100 : 0,
      icon: <DescriptionIcon />,
      tone: "ink",
      accent: editorial.pmwBlue,
    },
    {
      label: "Approved",
      value: approved,
      helper: submissionLabel(approved, "approved"),
      progress: percent(approved),
      icon: <CheckCircleIcon />,
      tone: "positive",
      accent: editorial.successFill,
    },
    {
      label: "Pending",
      value: pending,
      helper: submissionLabel(pending, "pending"),
      progress: percent(pending),
      icon: <AccessTimeIcon />,
      tone: "muted",
      accent: editorial.warningFill,
    },
    {
      label: "Rejected",
      value: rejected,
      helper: submissionLabel(rejected, "rejected"),
      progress: percent(rejected),
      icon: <CancelIcon />,
      tone: "alert",
      accent: editorial.errorFill,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
        gap: { xs: 1.5, sm: 2 },
      }}
    >
      {stats.map((stat) => (
        <Box
          key={stat.label}
          sx={{
            ...panelSx,
            position: "relative",
            overflow: "hidden",
            p: { xs: 1.5, sm: 1.75 },
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            // The accent rail names the card's meaning before the number is
            // read, and greys out at zero so an empty count is not an alarm.
            "&::before": {
              content: '""',
              position: "absolute",
              inset: "0 0 auto 0",
              height: 3,
              backgroundColor: stat.value === 0 ? editorial.border : stat.accent,
            },
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography
              sx={{
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: editorial.muted,
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              {stat.label}
            </Typography>
            <IconTile tone={stat.tone}>{stat.icon}</IconTile>
          </Stack>

          <Box sx={{ mt: "auto" }}>
            <Typography
              sx={{
                fontWeight: 800,
                color: stat.value === 0 ? editorial.softMuted : editorial.ink,
                lineHeight: 1,
                fontSize: { xs: 30, sm: 34 },
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {stat.value}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: editorial.softMuted, fontWeight: 700, mt: 0.4 }}>
              {stat.helper}
            </Typography>
          </Box>

          <Box sx={{ height: 6, borderRadius: radius.full, backgroundColor: editorial.neutralWash, overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                width: `${stat.progress}%`,
                borderRadius: radius.full,
                backgroundColor: stat.accent,
                transition: "width 0.28s ease",
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
