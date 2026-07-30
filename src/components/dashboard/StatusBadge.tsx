import { Chip } from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as WaitingIcon,
  TaskAlt as ConfirmedIcon,
} from "@mui/icons-material";
import { editorial } from "../../theme/editorial";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  fullyapproved: { label: "Fully Approved", color: editorial.success, bg: "rgba(16, 124, 16, 0.08)", dot: editorial.success },
  approved: { label: "Approved", color: editorial.success, bg: "rgba(16, 124, 16, 0.08)", dot: editorial.success },
  confirmed: { label: "Confirmed", color: editorial.success, bg: "rgba(16, 124, 16, 0.08)", dot: editorial.success },
  rejected: { label: "Rejected", color: editorial.error, bg: "rgba(198, 40, 40, 0.08)", dot: editorial.error },
  inprogress: { label: "In Review", color: editorial.pmwBlueDark, bg: editorial.blueWash, dot: editorial.pmwBlue },
  pending: { label: "Pending", color: editorial.warning, bg: editorial.yellowSoft, dot: editorial.warning },
  cancelled: { label: "Cancelled", color: editorial.muted, bg: editorial.paperSoft, dot: editorial.muted },
} as const;

function normalizeStatus(status: string | null): string {
  if (!status) return "pending";
  const normalized = status.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "fullyapproved" || normalized === "completed") return "fullyapproved";
  if (normalized === "approved") return "approved";
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "cancelled") return "cancelled";
  if (normalized.includes("reject")) return "rejected";
  if (normalized.includes("progress") || normalized.includes("review") || normalized === "inreview") return "inprogress";
  return "pending";
}

interface StatusBadgeProps {
  status: string | null;
}

function getStatusIcon(key: string, color: string) {
  const iconSx = { color: `${color} !important`, fontSize: "1rem" };
  if (key === "fullyapproved" || key === "approved") return <CheckCircleIcon sx={iconSx} />;
  if (key === "confirmed") return <ConfirmedIcon sx={iconSx} />;
  if (key === "rejected" || key === "cancelled") return <CancelIcon sx={iconSx} />;
  if (key === "inprogress") return <AccessTimeIcon sx={iconSx} />;
  return <WaitingIcon sx={iconSx} />;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = normalizeStatus(status);
  const cfg = STATUS_CFG[key] ?? STATUS_CFG.pending;

  return (
    <Chip
      icon={getStatusIcon(key, cfg.color)}
      label={cfg.label}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        boxShadow: `inset 0 0 0 1px ${cfg.dot}33`,
        fontWeight: 800,
        fontSize: "0.75rem",
      }}
    />
  );
}
