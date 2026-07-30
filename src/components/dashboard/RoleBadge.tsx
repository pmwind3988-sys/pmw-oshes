import { Chip } from "@mui/material";
import { Shield as ShieldIcon, Person as PersonIcon } from "@mui/icons-material";
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
          border: `1px solid ${editorial.pmwPurpleSoft}`,
          fontWeight: 800,
          letterSpacing: 0,
          fontSize: "0.7rem",
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
        border: `1px solid ${editorial.pmwBlueSoft}`,
        fontWeight: 800,
        letterSpacing: 0,
        fontSize: "0.7rem",
      }}
    />
  );
}
