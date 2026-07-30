import { Chip } from "@mui/material";
import { DescriptionOutlined as DescriptionIcon } from "@mui/icons-material";

interface ListBadgeProps {
  title: string;
  color: string;
  pale: string;
}

export default function ListBadge({ title, color, pale }: ListBadgeProps) {
  return (
    <Chip
      icon={<DescriptionIcon sx={{ color: `${color} !important`, fontSize: "1rem" }} />}
      label={title}
      size="small"
      sx={{
        backgroundColor: pale,
        color,
        boxShadow: `inset 0 0 0 1px ${color}33`,
        fontWeight: 800,
        fontSize: "0.75rem",
        textTransform: "none",
        maxWidth: "100%",
        "& .MuiChip-label": {
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
      }}
    />
  );
}
