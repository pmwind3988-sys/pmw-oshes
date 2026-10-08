import { Box, type SxProps, type Theme } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { FileText as FileIcon, Pencil as SignIcon, Check as ClosedIcon } from "../ui/Icons";
import { authSoft, AUTH_FONT } from "./LoadingScreen";

/**
 * The sign-in screen's visual: three white pill "orbs" that show a record
 * moving from filed, to signed, to closed. They bob gently and never ask for
 * attention. Held still under `prefers-reduced-motion`.
 *
 * `sx` reaches the outer frame so the parent can adjust spacing.
 */

const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;

const reduceMotion = "@media (prefers-reduced-motion: reduce)";

const ORBS = [
  {
    key: "file",
    label: "File",
    detail: "Permit To Work",
    icon: FileIcon,
    tint: authSoft.primaryContainer,
    ink: authSoft.onPrimaryContainer,
    offset: 0,
    bob: "5s",
    delay: "0s",
  },
  {
    key: "sign",
    label: "Sign",
    detail: "Safety Officer",
    icon: SignIcon,
    tint: authSoft.amberContainer,
    ink: authSoft.onAmberContainer,
    offset: 40,
    bob: "6s",
    delay: "-2s",
  },
  {
    key: "closed",
    label: "Closed",
    detail: "PDF sent to you",
    icon: ClosedIcon,
    tint: authSoft.greenContainer,
    ink: authSoft.onGreenContainer,
    offset: 8,
    bob: "5.5s",
    delay: "-1s",
  },
] as const;

export default function IdleAnimationPanel({ sx }: { sx?: SxProps<Theme> }) {
  return (
    <Box
      aria-hidden
      sx={[
        {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: { xs: 1.5, md: 2.5 },
          fontFamily: AUTH_FONT,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {ORBS.map((orb) => {
        const Icon = orb.icon;
        return (
          <Box
            key={orb.key}
            sx={{
              mt: `${orb.offset}px`,
              animation: `${bob} ${orb.bob} ease-in-out ${orb.delay} infinite`,
              [reduceMotion]: { animation: "none" },
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1.25,
                pl: 1.25,
                pr: 2.5,
                borderRadius: 999,
                backgroundColor: authSoft.surface,
                boxShadow: "0 6px 20px rgba(22, 27, 36, 0.06)",
                transition: "transform 0.25s ease",
                "&:hover": { transform: "scale(1.06)" },
                [reduceMotion]: { transition: "none", "&:hover": { transform: "none" } },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: orb.tint,
                  color: orb.ink,
                  flexShrink: 0,
                }}
              >
                <Icon size={20} />
              </Box>
              <Box sx={{ lineHeight: 1.3 }}>
                <Box sx={{ fontWeight: 700, color: authSoft.ink, fontSize: 16 }}>{orb.label}</Box>
                <Box sx={{ fontSize: 13, color: authSoft.muted }}>{orb.detail}</Box>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
