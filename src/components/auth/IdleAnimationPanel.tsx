import { Box } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { editorial } from "../../theme/editorial";

/**
 * The sign-in screen's left column: a purely visual idle animation, no words.
 * Everything is CSS on plain boxes — nothing here needs exporting as an asset.
 *
 * Held static under `prefers-reduced-motion`; the composition still reads.
 */

const gridDrift = keyframes`
  from { transform: translateY(0); }
  to { transform: translateY(-40px); }
`;

const scanLine = keyframes`
  0% { top: 4%; opacity: 0; }
  12% { opacity: 0.9; }
  88% { opacity: 0.9; }
  100% { top: 96%; opacity: 0; }
`;

const spinSlow = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(0.82); opacity: 0.55; }
  50% { transform: scale(1.06); opacity: 1; }
`;

const ink = (alpha: number) => `rgba(16, 16, 16, ${alpha})`;
const accent = (alpha: number) => `rgba(0, 120, 212, ${alpha})`;

/** Four nested frames, each turning at its own rate and direction. */
const FRAMES = [
  { inset: "0%", duration: "34s", direction: "normal", alpha: 0.2 },
  { inset: "14%", duration: "22s", direction: "reverse", alpha: 0.16 },
  { inset: "30%", duration: "15s", direction: "normal", alpha: 0.13 },
  { inset: "44%", duration: "9s", direction: "reverse", alpha: 0.1 },
] as const;

const reduceMotion = "@media (prefers-reduced-motion: reduce)";

export default function IdleAnimationPanel() {
  return (
    <Box sx={{ position: "relative", flex: 1, my: 5, overflow: "hidden" }} aria-hidden>
      {/* Hairline grid, drifting one cell so the loop is seamless. */}
      <Box
        sx={{
          position: "absolute",
          inset: "-40px 0",
          backgroundImage: `linear-gradient(to right, ${ink(0.07)} 1px, transparent 1px), linear-gradient(to bottom, ${ink(0.07)} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          animation: `${gridDrift} 14s linear infinite`,
          [reduceMotion]: { animation: "none" },
        }}
      />

      {/* A single accent scan sweeping the column. */}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          height: "1px",
          top: "50%",
          background: accent(0.45),
          animation: `${scanLine} 9s ease-in-out infinite`,
          [reduceMotion]: { animation: "none", opacity: 0.5 },
        }}
      />

      <Box sx={{ position: "relative", height: "100%", display: "grid", placeItems: "center" }}>
        <Box
          sx={{
            position: "relative",
            width: "min(340px, 100%)",
            aspectRatio: "1",
            display: "grid",
            placeItems: "center",
          }}
        >
          {FRAMES.map((frame) => (
            <Box
              key={frame.inset}
              sx={{
                position: "absolute",
                inset: frame.inset,
                border: `1px solid ${ink(frame.alpha)}`,
                animation: `${spinSlow} ${frame.duration} linear infinite`,
                animationDirection: frame.direction,
                [reduceMotion]: { animation: "none" },
              }}
            />
          ))}

          {/* Filled core, breathing. */}
          <Box
            sx={{
              position: "absolute",
              inset: "44%",
              background: accent(0.22),
              animation: `${breathe} 6.4s ease-in-out infinite`,
              [reduceMotion]: { animation: "none", opacity: 0.8 },
            }}
          />

          {/* Centre crosshair. */}
          <Box sx={{ position: "absolute", top: 0, bottom: 0, width: "1px", background: ink(0.14) }} />
          <Box sx={{ position: "absolute", left: 0, right: 0, height: "1px", background: ink(0.14) }} />

          {/* Two marks orbiting the outer ring, one the inner. */}
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              animation: `${spinSlow} 18s linear infinite`,
              [reduceMotion]: { animation: "none" },
            }}
          >
            <Box sx={{ position: "absolute", top: -4, left: "50%", width: 8, height: 8, background: editorial.pmwBlue }} />
            <Box
              sx={{
                position: "absolute",
                bottom: -4,
                left: "50%",
                width: 8,
                height: 8,
                border: `1px solid ${editorial.pmwBlue}`,
              }}
            />
          </Box>
          <Box
            sx={{
              position: "absolute",
              inset: "14%",
              animation: `${spinSlow} 11s linear infinite`,
              animationDirection: "reverse",
              [reduceMotion]: { animation: "none" },
            }}
          >
            <Box sx={{ position: "absolute", top: -3, left: "50%", width: 6, height: 6, background: editorial.pmwBlue }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
