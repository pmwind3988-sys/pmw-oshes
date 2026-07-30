import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  TextField,
  Typography,
} from "@mui/material";
import {
  Check,
  Close,
  ImageSearch,
} from "@mui/icons-material";
import {
  buildCustomBackgroundCss,
  buildDashboardBackgroundDefCss,
  DASHBOARD_BACKGROUNDS,
  DEFAULT_DASHBOARD_BACKGROUND_SETTING,
  DEFAULT_IMAGE_OPACITY,
  findDashboardBackground,
  normalizeImageUrl,
  normalizeImageOpacity,
  type DashboardBackgroundSetting,
} from "../../utils/dashboardBackgrounds";

interface Props {
  open: boolean;
  onClose: () => void;
  setting: DashboardBackgroundSetting;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (setting: DashboardBackgroundSetting) => Promise<DashboardBackgroundSetting>;
}

function resolveInitialId(setting: DashboardBackgroundSetting): string {
  if (setting.backgroundId === "custom") return "custom";
  return DASHBOARD_BACKGROUNDS.some((background) => background.id === setting.backgroundId)
    ? setting.backgroundId
    : DEFAULT_DASHBOARD_BACKGROUND_SETTING.backgroundId;
}

export default function BackgroundPicker({
  open,
  onClose,
  setting,
  loading,
  saving,
  error,
  onSave,
}: Props) {
  const [selectedId, setSelectedId] = useState(resolveInitialId(setting));
  const [customUrl, setCustomUrl] = useState(setting.customImageUrl);
  const [customSource, setCustomSource] = useState(setting.customImageSource || "");
  const [imageOpacity, setImageOpacity] = useState(normalizeImageOpacity(setting.imageOpacity ?? DEFAULT_IMAGE_OPACITY));
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedId(resolveInitialId(setting));
    setCustomUrl(setting.customImageUrl);
    setCustomSource(setting.customImageSource || "");
    setImageOpacity(normalizeImageOpacity(setting.imageOpacity ?? DEFAULT_IMAGE_OPACITY));
    setValidationError("");
  }, [open, setting.backgroundId, setting.customImageSource, setting.customImageUrl, setting.imageOpacity]);

  const customPreviewUrl = normalizeImageUrl(customUrl);
  const selectedBackground = findDashboardBackground(selectedId);
  const previewCss = selectedId === "custom"
    ? buildCustomBackgroundCss(customUrl, imageOpacity)
    : buildDashboardBackgroundDefCss(selectedBackground, imageOpacity);

  async function handleSave(): Promise<void> {
    const nextCustomUrl = selectedId === "custom" ? normalizeImageUrl(customUrl) : "";
    const nextCustomSource = selectedId === "custom" ? customSource.trim() : "";
    if (selectedId === "custom" && !nextCustomUrl) {
      setValidationError("Enter a valid http or https image URL.");
      return;
    }
    if (selectedId === "custom" && !nextCustomSource) {
      setValidationError("Enter the image source, owner, or license note.");
      return;
    }

    try {
      await onSave({
        backgroundId: selectedId,
        customImageUrl: nextCustomUrl || "",
        customImageSource: nextCustomSource,
        imageOpacity,
      });
      onClose();
    } catch {
      /* Save errors are surfaced by the shared background hook. */
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: "8px" } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <ImageSearch sx={{ color: "#0078D4" }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827" }}>
            Dashboard Background
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close background picker">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {(error || validationError) && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: "8px" }}>
            {validationError || error}
          </Alert>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 260px" }, gap: 2.5 }}>
          <Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 1.5 }}>
              {DASHBOARD_BACKGROUNDS.map((background) => {
                const selected = selectedId === background.id;
                return (
                  <Box
                    key={background.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      setSelectedId(background.id);
                      setValidationError("");
                    }}
                    sx={{
                      appearance: "none",
                      border: selected ? "2px solid #0078D4" : "1px solid rgba(17,24,39,0.12)",
                      borderRadius: "8px",
                      background: "#fff",
                      cursor: "pointer",
                      p: 0,
                      overflow: "hidden",
                      textAlign: "left",
                      transition: "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
                      boxShadow: selected ? "0 0 0 3px rgba(0,120,212,0.14)" : "0 1px 3px rgba(17,24,39,0.08)",
                      "&:hover": {
                        borderColor: "#0078D4",
                        transform: "translateY(-1px)",
                      },
                    }}
                  >
                    <Box sx={{ position: "relative", height: 90, background: buildDashboardBackgroundDefCss(background, imageOpacity, true) }}>
                      {selected && (
                        <Box sx={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", backgroundColor: "#0078D4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check sx={{ fontSize: 15, color: "#fff" }} />
                        </Box>
                      )}
                    </Box>
                    <Box sx={{ px: 1.25, py: 1 }}>
                      <Typography variant="body2" sx={{ color: "#111827", fontWeight: 700, lineHeight: 1.2 }}>
                        {background.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#6B7280", display: "block", mt: 0.25 }}>
                        {background.source || background.category}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ mt: 2.5, p: 2, border: selectedId === "custom" ? "2px solid #0078D4" : "1px solid rgba(17,24,39,0.12)", borderRadius: "8px", backgroundColor: "#fff" }}>
              <Typography variant="subtitle2" sx={{ color: "#111827", fontWeight: 700, mb: 1 }}>
                Custom Image
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr auto" }, gap: 1 }}>
                <TextField
                  size="small"
                  value={customUrl}
                  onFocus={() => setSelectedId("custom")}
                  onChange={(event) => {
                    setSelectedId("custom");
                    setCustomUrl(event.target.value);
                    setValidationError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSave();
                  }}
                  placeholder="https://example.com/background.jpg"
                  slotProps={{ htmlInput: { sx: { fontSize: "0.875rem" } } }}
                />
                <Button
                  variant={selectedId === "custom" ? "contained" : "outlined"}
                  onClick={() => setSelectedId("custom")}
                  sx={{ textTransform: "none", borderRadius: "8px", minWidth: 92 }}
                >
                  Select
                </Button>
              </Box>
              {selectedId === "custom" && (
                <TextField
                  label="Image source / credit"
                  size="small"
                  value={customSource}
                  onChange={(event) => {
                    setCustomSource(event.target.value);
                    setValidationError("");
                  }}
                  placeholder="PMW owned asset, photographer, license, or source URL"
                  fullWidth
                  sx={{ mt: 1.25 }}
                  slotProps={{ input: { sx: { borderRadius: "8px" } } }}
                />
              )}
            </Box>

            <Box sx={{ mt: 2, p: 2, border: "1px solid rgba(17,24,39,0.12)", borderRadius: "8px", backgroundColor: "#fff" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, mb: 0.75 }}>
                <Typography variant="subtitle2" sx={{ color: "#111827", fontWeight: 700 }}>
                  Image Opacity
                </Typography>
                <Typography variant="caption" sx={{ color: "#6B7280", fontWeight: 700 }}>
                  {Math.round(imageOpacity * 100)}%
                </Typography>
              </Box>
              <Slider
                value={Math.round(imageOpacity * 100)}
                min={0}
                max={100}
                step={1}
                onChange={(_, value) => {
                  const nextValue = Array.isArray(value) ? value[0] : value;
                  setImageOpacity(normalizeImageOpacity(nextValue / 100));
                }}
                aria-label="Image opacity"
                sx={{ color: "#0078D4" }}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ color: "#111827", fontWeight: 700, mb: 1 }}>
              Preview
            </Typography>
            <Box
              sx={{
                height: { xs: 180, md: 300 },
                borderRadius: "8px",
                border: "1px solid rgba(17,24,39,0.12)",
                background: previewCss,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 18, height: 38, borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.92)", border: "1px solid rgba(17,24,39,0.08)" }} />
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 72, height: 74, borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.9)", border: "1px solid rgba(17,24,39,0.08)" }} />
              <Box sx={{ position: "absolute", left: 16, right: 16, top: 162, bottom: 18, borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.88)", border: "1px solid rgba(17,24,39,0.08)" }} />
              {loading && (
                <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.52)" }}>
                  <CircularProgress size={28} />
                </Box>
              )}
            </Box>
            {selectedId === "custom" && customPreviewUrl && (
              <Typography variant="caption" sx={{ color: "#6B7280", display: "block", mt: 1, wordBreak: "break-all", lineHeight: 1.35 }}>
                {customPreviewUrl}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: "#6B7280", display: "block", mt: 0.75, wordBreak: "break-word", lineHeight: 1.35 }}>
              {selectedId === "custom" ? customSource.trim() : selectedBackground.source || selectedBackground.category}
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", borderRadius: "8px" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => { void handleSave(); }}
          disabled={saving}
          sx={{ textTransform: "none", borderRadius: "8px", minWidth: 150 }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save Background"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
