import { Box, type SxProps, type Theme } from "@mui/material";
import type { Breakpoint } from "@mui/material/styles";
import logo32 from "../assets/logo-32.png";
import logo48 from "../assets/logo-48.png";
import logo64 from "../assets/logo-64.png";
import logo88 from "../assets/logo-88.png";
import logo128 from "../assets/logo-128.png";

type ResponsiveLogoSize = number | Partial<Record<Breakpoint, number>>;

interface LogoProps {
  size?: ResponsiveLogoSize;
  alt?: string;
  sx?: SxProps<Theme>;
}

const SIZE_MAP = [
  { src: logo32, width: 32 },
  { src: logo48, width: 48 },
  { src: logo64, width: 64 },
  { src: logo88, width: 88 },
  { src: logo128, width: 128 },
];

function pickSrc(size: number): string {
  for (const entry of SIZE_MAP) {
    if (entry.width >= size) return entry.src;
  }
  return SIZE_MAP[SIZE_MAP.length - 1].src;
}

function getLargestRequestedSize(size: ResponsiveLogoSize): number {
  if (typeof size === "number") return size;
  const sizes = Object.values(size).filter((value): value is number => typeof value === "number");
  return sizes.length > 0 ? Math.max(...sizes) : 64;
}

export default function Logo({ size = 64, alt = "PMW Logo", sx }: LogoProps) {
  const src = pickSrc(getLargestRequestedSize(size));
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
        display: "block",
        imageRendering: "-webkit-optimize-contrast",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        outline: "none",
        ...((sx as Record<string, unknown>) || {}),
      }}
    />
  );
}
