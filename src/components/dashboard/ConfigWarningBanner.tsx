import {
  Alert,
  Box,
  Collapse,
  IconButton,
  Typography,
} from "@mui/material";
import { Warning as WarningIcon, Close as CloseIcon } from "@mui/icons-material";
import { useState } from "react";
import { editorial, editorialShadow } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";

interface ConfigWarningBannerProps {
  missingLists: string[];
}

export default function ConfigWarningBanner({ missingLists }: ConfigWarningBannerProps) {
  const [open, setOpen] = useState(true);

  if (missingLists.length === 0 || !open) return null;

  return (
    <Collapse in={open}>
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{
          borderRadius: radius.lg,
          border: `1px solid color-mix(in srgb, ${editorial.warning} 42%, transparent)`,
          backgroundColor: editorial.warningWash,
          boxShadow: editorialShadow,
          color: editorial.ink,
          "& .MuiAlert-message": {
            width: "100%",
          },
          "& .MuiAlert-icon": {
            color: editorial.warning,
            opacity: 1,
          },
        }}
        action={
          <IconButton
            aria-label="dismiss"
            color="inherit"
            size="small"
            onClick={() => setOpen(false)}
            sx={{
              borderRadius: radius.md,
              "&:focus-visible": {
                outline: `3px solid ${editorial.yellowSoft}`,
                outlineOffset: 2,
              },
            }}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 900, color: editorial.ink, mb: 0.5 }}>
          Lists missing configuration
        </Typography>
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, mb: 1 }}>
          The following lists are not yet configured in the Documents config library:
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {missingLists.map((list) => (
            <Box
              key={list}
              sx={{
                backgroundColor: editorial.panel,
                border: `1px solid color-mix(in srgb, ${editorial.warning} 30%, transparent)`,
                color: editorial.warning,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                px: 1.5,
                py: 0.5,
                borderRadius: radius.sm,
              }}
            >
              {list}
            </Box>
          ))}
        </Box>
      </Alert>
    </Collapse>
  );
}
