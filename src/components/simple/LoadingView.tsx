import { Box, LinearProgress, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import Mascot from "./Mascot";
import { radius } from "../../theme/surfaces";

const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;

/**
 * The wait between asking for something and having it. The mascot bobs gently
 * unless the reader has asked for less motion.
 */
export function LoadingView({
  title = "Getting things ready",
  status,
}: {
  title?: string;
  status?: string;
}) {
  return (
    <Box
      sx={{
        minHeight: "50dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        px: 2,
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          animation: `${bob} 1.6s ease-in-out infinite`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Mascot mood="loading" size={120} />
      </Box>
      <Typography component="h1" sx={{ fontWeight: 700, fontSize: 22, color: "text.primary" }}>
        {title}
      </Typography>
      <Typography role="status" sx={{ color: "text.secondary", fontSize: 15 }}>
        {status ?? "Please wait a moment."}
      </Typography>
      <LinearProgress
        variant="indeterminate"
        sx={{ width: 220, height: 6, borderRadius: radius.full, bgcolor: "divider" }}
      />
    </Box>
  );
}
