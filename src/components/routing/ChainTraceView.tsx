/**
 * ChainTraceView.tsx — renders "if this person submits, where does it go?"
 *
 * The single most useful thing on the routing page: it answers the question
 * before anybody submits, rather than after a submission has already gone to
 * the wrong person or parked with nowhere to go.
 */
import { Box, Chip, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { editorial } from "../../theme/editorial";
import type { ChainStopReason, ChainTrace } from "../../utils/approvalDirectoryHealth";

/**
 * How each stopping point should read. Only a loop or an over-long line is a
 * fault; the top of the reporting line is the correct place to stop, and a
 * missing person is a gap to fill rather than something broken.
 */
const STOP_TONE: Record<ChainStopReason, "ok" | "warn" | "bad"> = {
  "top-of-line": "ok",
  "not-listed": "warn",
  inactive: "warn",
  "no-approver": "warn",
  loop: "bad",
  "hop-limit": "bad",
};

const TONE_STYLE = {
  ok: { color: editorial.success, background: "#EAF6EA", icon: <CheckCircleIcon fontSize="small" /> },
  warn: { color: editorial.warning, background: editorial.yellowSoft, icon: <InfoOutlinedIcon fontSize="small" /> },
  bad: { color: editorial.error, background: "#FBE9E9", icon: <ErrorOutlinedIcon fontSize="small" /> },
} as const;

interface ChainTraceViewProps {
  trace: ChainTrace;
  /** Wording for the first chip, e.g. "Submits". */
  startLabel?: string;
}

export default function ChainTraceView({ trace, startLabel = "Submits" }: ChainTraceViewProps) {
  const tone = TONE_STYLE[STOP_TONE[trace.stoppedBecause]];

  return (
    <Box>
      <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 0.75, mb: 1.5 }}>
        {trace.steps.map((step, index) => (
          <Stack key={`${step.email}-${index}`} direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
            {index > 0 && <ArrowForwardIcon sx={{ fontSize: 16, color: editorial.softMuted }} />}
            <Chip
              size="small"
              label={(
                <Stack sx={{ py: 0.25 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: editorial.ink, lineHeight: 1.3 }}>
                    {step.name || step.email}
                  </Typography>
                  <Typography sx={{ fontSize: "0.65rem", color: editorial.softMuted, lineHeight: 1.3 }}>
                    {index === 0 ? startLabel : "Approves"}
                    {[step.position, step.department].filter(Boolean).length > 0
                      ? ` · ${[step.position, step.department].filter(Boolean).join(", ")}`
                      : ""}
                  </Typography>
                </Stack>
              )}
              sx={{
                height: "auto",
                borderRadius: "10px",
                px: 0.5,
                border: `1px solid ${index === 0 ? editorial.pmwBlueSoft : editorial.border}`,
                backgroundColor: index === 0 ? editorial.blueWash : editorial.white,
              }}
            />
          </Stack>
        ))}
      </Stack>

      <Stack
        direction="row"
        sx={{
          alignItems: "flex-start",
          gap: 1,
          p: 1.25,
          borderRadius: "10px",
          backgroundColor: tone.background,
          color: tone.color,
        }}
      >
        {tone.icon}
        <Typography sx={{ fontSize: "0.8rem", color: tone.color, fontWeight: 600 }}>
          {trace.summary}
        </Typography>
      </Stack>
    </Box>
  );
}
