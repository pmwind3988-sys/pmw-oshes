import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { editorial } from "../../theme/editorial";
import { Callout } from "../Widget";
import { Download as DownloadIcon, Printer as PrinterIcon } from "../ui/Icons";
import { appBaseUrl } from "../../config/appBaseUrl";
import { generateQrWithLogo } from "../../utils/qrWithLogo";
import { printSmokingPoster, qrFileName, smokingScanUrl } from "./printSmokingPoster";
import type { SmokingArea } from "../../utils/smoking/schema";

export default function AreaQrDialog({
  open,
  area,
  onClose,
}: {
  open: boolean;
  area: SmokingArea | null;
  onClose: () => void;
}) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [preparedFor, setPreparedFor] = useState<string | null>(null);

  const scanUrl = area ? smokingScanUrl(appBaseUrl(), area.code) : "";

  // Clear the previous area's QR the moment a different area opens, without a
  // render-cascading effect — same pattern as AreaDialog / ResolveFlagDialog.
  const key = open ? (area?.id ?? null) : null;
  if (preparedFor !== key) {
    setPreparedFor(key);
    setQr("");
    setError("");
  }

  useEffect(() => {
    if (!open || !area) return;
    let cancelled = false;
    generateQrWithLogo(smokingScanUrl(appBaseUrl(), area.code), { width: 1200, logoUrl: "/logo-128.png" })
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not prepare the QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, area]);

  const handleDownload = () => {
    if (!area || !qr) return;
    const link = document.createElement("a");
    link.href = qr;
    link.download = qrFileName(area);
    link.click();
  };

  const handlePrint = () => {
    if (!area) return;
    setPrinting(true);
    printSmokingPoster(area)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not open the poster to print."))
      .finally(() => setPrinting(false));
  };

  return (
    <Dialog open={open && !!area} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{area?.name} — QR code</DialogTitle>
      <DialogContent>
        {area && !area.active && (
          <Callout tone="warning" sx={{ mb: 2 }}>
            This area is retired — its poster no longer records scans.
          </Callout>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
          {error ? (
            <Typography sx={{ fontSize: 13, color: editorial.error }}>{error}</Typography>
          ) : qr ? (
            <Box component="img" src={qr} alt={`QR code for ${area?.name}`} sx={{ width: 280, height: 280 }} />
          ) : (
            <Typography sx={{ fontSize: 13, color: editorial.muted }}>Preparing QR…</Typography>
          )}
          <Typography sx={{ fontSize: 11, color: editorial.muted, wordBreak: "break-all", textAlign: "center" }}>{scanUrl}</Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", px: 3, pb: 2, gap: 0.5 }}>
        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
          <Button fullWidth variant="outlined" startIcon={<DownloadIcon fontSize="small" />} disabled={!qr} onClick={handleDownload}>
            Download QR image (PNG)
          </Button>
          <Button fullWidth variant="outlined" startIcon={<PrinterIcon fontSize="small" />} disabled={printing} onClick={handlePrint}>
            Print poster
          </Button>
        </Box>
        <Typography sx={{ fontSize: 11, color: editorial.muted, textAlign: "center", mt: 0.5 }}>
          The print window also offers Save as PDF.
        </Typography>
        <Button onClick={onClose} sx={{ alignSelf: "center", mt: 0.5 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
