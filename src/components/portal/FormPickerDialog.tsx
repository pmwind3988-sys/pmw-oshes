import { useNavigate } from "react-router-dom";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { FileText as DescriptionOutlinedIcon } from "../ui/Icons";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import { MessageCard } from "../simple/MessageCard";
import type { CatalogueEntry } from "../../types";

const TINT_CYCLE = Object.values(TINTS);

/** The one line under a form's name: what happens after it is filed. */
function captionFor(entry: CatalogueEntry): string {
  if (!entry.slug) return "No published link yet. Republish it in the form builder to open it here.";
  if (entry.hasWorkflow) return `${entry.workflow.label} · first to ${entry.firstApprover}`;
  return entry.workflow.label;
}

/**
 * The tiles themselves, without the dialog around them. Picking one hands the
 * entry back; the dialog decides where that leads.
 */
export function FormPickerList({
  catalogue,
  onPick,
}: {
  catalogue: CatalogueEntry[];
  onPick: (entry: CatalogueEntry) => void;
}) {
  if (catalogue.length === 0) {
    return (
      <MessageCard
        mood="empty"
        title="No forms yet"
        body="Forms appear here once they are published."
        fullPage={false}
      />
    );
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
      {catalogue.map((entry, index) => {
        const openable = Boolean(entry.slug);
        return (
          <Box
            key={entry.listTitle}
            component={openable ? "button" : "div"}
            type={openable ? "button" : undefined}
            onClick={openable ? () => onPick(entry) : undefined}
            aria-disabled={openable ? undefined : true}
            sx={{
              width: "100%",
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 2,
              textAlign: "left",
              border: 0,
              borderRadius: radius.lg,
              bgcolor: "background.default",
              color: "text.primary",
              font: "inherit",
              cursor: openable ? "pointer" : "default",
              opacity: openable ? 1 : 0.6,
              transition: "background-color 0.16s ease",
              "&:hover": openable ? { bgcolor: "action.hover" } : undefined,
              "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Box
              sx={{
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: radius.md,
                bgcolor: TINT_CYCLE[index % TINT_CYCLE.length],
                color: "text.primary",
              }}
            >
              <DescriptionOutlinedIcon />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{entry.name}</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{captionFor(entry)}</Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * File a form: a picker over the published catalogue. Each tile opens the
 * published form itself at /form/{slug}, with its own schema, validation and
 * consent. Nothing here defines a form of its own.
 */
export default function FormPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { catalogue } = usePortal();
  const navigate = useNavigate();

  const pick = (entry: CatalogueEntry) => {
    onClose();
    navigate(`/form/${encodeURIComponent(entry.slug)}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="form-picker-title"
      slotProps={{ paper: { sx: { borderRadius: radius.xl } } }}
    >
      <DialogTitle id="form-picker-title" sx={{ fontWeight: 800, pb: 0.5 }}>
        File a form
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>
          Pick a form to open it. Your name and email come from your account.
        </Typography>
        <FormPickerList catalogue={catalogue} onPick={pick} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onClose}
          sx={{ minHeight: 44, px: 2, borderRadius: radius.full, textTransform: "none", fontWeight: 600 }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
