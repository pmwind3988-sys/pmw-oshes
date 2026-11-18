import { useEffect, useMemo } from "react";
import { Box, Button, Dialog, IconButton, Typography } from "@mui/material";
import { X as CloseIcon, ExternalLink as OpenInNewIcon } from "../ui/Icons";
import { radius } from "../../theme/surfaces";
import { savePdfBlob } from "../../utils/portalPdf";

export interface PdfPreview {
  blob: Blob;
  fileName: string;
}

/**
 * Shows a generated PDF before anything is saved.
 *
 * The record's PDF used to land straight in the downloads folder, so checking
 * it meant finding the file and opening it. The page now hands the finished
 * document here first: read it in place, then Download only if it is the one
 * wanted. "Open in a new tab" covers browsers that will not draw a PDF inside
 * the page (most phones).
 */
export default function PdfPreviewDialog({ preview, onClose }: { preview: PdfPreview | null; onClose: () => void }) {
  const url = useMemo(() => (preview ? URL.createObjectURL(preview.blob) : ""), [preview]);

  // The address points at a copy of the file held in memory; let it go once
  // the preview closes or shows another document.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const open = Boolean(preview);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="pdf-preview-title"
      slotProps={{ paper: { sx: { height: { xs: "100%", sm: "90vh" }, m: { xs: 0, sm: 4 }, maxHeight: { xs: "100%", sm: "90vh" }, borderRadius: { xs: 0, sm: radius.lg }, display: "flex", flexDirection: "column" } } }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography id="pdf-preview-title" sx={{ flex: "1 1 200px", minWidth: 0, fontSize: 15, fontWeight: 700 }} noWrap>
          {preview?.fileName ?? "PDF"}
        </Typography>
        <Button
          component="a"
          href={url || undefined}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          startIcon={<OpenInNewIcon size={16} />}
          sx={{ height: 40, borderRadius: radius.xs, textTransform: "none", fontWeight: 600 }}
        >
          Open in a new tab
        </Button>
        <Button
          variant="contained"
          onClick={() => preview && savePdfBlob(preview.blob, preview.fileName)}
          sx={{ height: 40, borderRadius: radius.xs, textTransform: "none", fontWeight: 700 }}
        >
          Download
        </Button>
        <IconButton aria-label="Close preview" onClick={onClose} sx={{ width: 40, height: 40, borderRadius: radius.xs }}>
          <CloseIcon size={18} />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, bgcolor: "background.default" }}>
        {url && (
          <Box
            component="iframe"
            title={preview ? `Preview of ${preview.fileName}` : "PDF preview"}
            src={url}
            sx={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        )}
      </Box>
    </Dialog>
  );
}
