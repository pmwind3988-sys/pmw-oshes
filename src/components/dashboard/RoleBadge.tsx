import { Chip } from "@mui/material";
import { User as PersonIcon, ShieldCheck as ShieldIcon } from "../ui/Icons";
import { editorial } from "../../theme/editorial";

interface RoleBadgeProps {
  isAdmin: boolean;
}

export default function RoleBadge({ isAdmin }: RoleBadgeProps) {

  if (isAdmin) {
    return (
      <Chip
        icon={<ShieldIcon sx={{ color: `${editorial.pmwPurpleDark} !important` }} />}
        label="Admin"
        size="small"
        sx={{
          backgroundColor: editorial.purpleWash,
          color: editorial.pmwPurpleDark,
          border: "none",
          borderRadius: "999px",
          fontWeight: 700,
          letterSpacing: 0,
          fontSize: "0.8125rem",
        }}
      />
    );
  }

  return (
    <Chip
      icon={<PersonIcon sx={{ color: `${editorial.pmwBlueDark} !important` }} />}
      label="User"
      size="small"
      sx={{
        backgroundColor: editorial.blueWash,
        color: editorial.pmwBlueDark,
        border: "none",
        borderRadius: "999px",
        fontWeight: 700,
        letterSpacing: 0,
        fontSize: "0.8125rem",
      }}
    />
  );
}
