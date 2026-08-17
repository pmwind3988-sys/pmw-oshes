import { useEffect, useMemo, useState } from "react";
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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Check, Close, Palette } from "@mui/icons-material";
import {
  COLOR_THEMES,
  CONTRAST_THEMES,
  FONT_THEMES,
  preloadFontThemes,
  resolveAppearance,
  type ResolvedAppearance,
} from "../../theme/appearance";
import { editorial, editorialHairline } from "../../theme/editorial";
import { useAppearance } from "../../contexts/AppearanceContext";
import {
  buildCustomBackgroundCss,
  buildDashboardBackgroundDefCss,
  DEFAULT_DASHBOARD_APPEARANCE,
  normalizeImageOpacity,
  normalizeImageUrl,
  type DashboardAppearanceSetting,
} from "../../utils/dashboardBackgrounds";

/* ---------------------------------------------------------------------------
   The Appearance dialog.

   Every change previews live against the whole app, not against a thumbnail.
   That is deliberate: a swatch cannot tell you whether "Midnight" makes your
   own overdue queue readable, and this is a decision one administrator makes
   on behalf of everybody. Cancel puts back what was there; only Save writes.

   The specimens are drawn from `resolveAppearance` rather than from hand-picked
   preview colours, so a card is showing the real derived palette — including
   the corrections the resolver makes for legibility on that ground.
--------------------------------------------------------------------------- */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Non-admins may open this and look; only admins may write. */
  isAdmin: boolean;
}

const CARD_SX = {
  appearance: "none",
  p: 0,
  overflow: "hidden",
  textAlign: "left",
  cursor: "pointer",
  borderRadius: "10px",
  background: editorial.panel,
  color: editorial.ink,
  font: "inherit",
  transition: "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  "&:hover": { transform: "translateY(-1px)" },
  "&:disabled": { cursor: "default", opacity: 0.55, transform: "none" },
} as const;

function selectionSx(selected: boolean) {
  return {
    border: selected ? `2px solid ${editorial.pmwBlue}` : editorialHairline,
    boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${editorial.pmwBlue} 18%, transparent)` : "none",
  };
}

function SectionHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>{title}</Typography>
      <Typography sx={{ fontSize: 12, color: editorial.muted }}>{caption}</Typography>
    </Box>
  );
}

function Grid({ min, children }: { min: number; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 1.25 }}>
      {children}
    </Box>
  );
}

function Tick() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: "50%",
        backgroundColor: editorial.pmwBlue,
        color: editorial.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Check sx={{ fontSize: 13 }} />
    </Box>
  );
}

/**
 * A miniature of the app in a candidate palette: ground, panel, a heading rule,
 * two text lines, a brand pill and the three status dots. Small enough to scan
 * a row of six, complete enough to show whether the status colours survive the
 * ground — which is the failure mode a colour picker normally hides.
 */
function Specimen({ p, label }: { p: ResolvedAppearance; label: string }) {
  return (
    <Box sx={{ position: "relative", height: 84, background: p.ground, p: 1 }}>
      <Box
        sx={{
          height: "100%",
          borderRadius: "6px",
          backgroundColor: p.panel,
          border: `1px solid ${p.border}`,
          p: 0.9,
          display: "flex",
          flexDirection: "column",
          gap: 0.6,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
          <Box sx={{ width: 26, height: 7, borderRadius: 1, backgroundColor: p.ink }} />
          <Box
            sx={{
              px: 0.5,
              py: 0.1,
              borderRadius: "999px",
              backgroundColor: p.brandWash,
              color: p.brandInk,
              fontSize: 6.5,
              fontWeight: 800,
              lineHeight: 1.5,
            }}
          >
            {label}
          </Box>
        </Box>
        <Box sx={{ width: "82%", height: 4, borderRadius: 1, backgroundColor: p.muted }} />
        <Box sx={{ width: "58%", height: 4, borderRadius: 1, backgroundColor: p.softMuted }} />
        <Box sx={{ mt: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 22, height: 9, borderRadius: "2px", backgroundColor: p.brand }} />
          {[p.success, p.warning, p.error].map((tone) => (
            <Box key={tone} sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: tone }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default function AppearancePicker({ open, onClose, isAdmin }: Props) {
  const { setting, backgrounds, loading, saving, error, preview, save } = useAppearance();
  const [draft, setDraft] = useState<DashboardAppearanceSetting>(setting);
  const [validationError, setValidationError] = useState("");

  // Seeding the draft on open is a state adjustment, not a synchronisation with
  // anything outside React, so it belongs in render rather than in an effect —
  // this way the first paint of the dialog already has the right draft instead
  // of rendering once with the old one and correcting itself.
  //
  // Keyed on the open/closed transition rather than on `setting`: reopening
  // seeds from whatever is live, but the 60s poll landing mid-decision must not
  // reset a half-made choice.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(setting);
      setValidationError("");
    }
  }

  useEffect(() => {
    // A genuine external effect: fetch the specimen faces so the typeface cards
    // are drawn in the faces they name.
    if (open) preloadFontThemes();
  }, [open]);

  /** Change one field, and paint the result on the app behind the dialog. */
  function edit(changes: Partial<DashboardAppearanceSetting>): void {
    const next = { ...draft, ...changes };
    setDraft(next);
    setValidationError("");
    preview(next);
  }

  function dismiss(): void {
    preview(null);
    onClose();
  }

  const customPreviewUrl = normalizeImageUrl(draft.customImageUrl);
  const dirty = JSON.stringify({ ...draft, updatedAt: 0, updatedBy: 0 }) !== JSON.stringify({ ...setting, updatedAt: 0, updatedBy: 0 });

  // Each axis is previewed against the other two as they currently stand, so a
  // contrast card shows what it would look like with *your* colour theme.
  const contrastSpecimens = useMemo(
    () => CONTRAST_THEMES.map((t) => resolveAppearance({ ...draft, contrastThemeId: t.id })),
    [draft],
  );
  const colorSpecimens = useMemo(
    () => COLOR_THEMES.map((t) => resolveAppearance({ ...draft, colorThemeId: t.id })),
    [draft],
  );

  async function handleSave(): Promise<void> {
    if (draft.backgroundId === "custom") {
      if (!normalizeImageUrl(draft.customImageUrl)) {
        setValidationError("Enter a valid http or https image URL.");
        return;
      }
      if (!draft.customImageSource.trim()) {
        setValidationError("Enter the image source, owner, or license note.");
        return;
      }
    }

    try {
      await save({
        ...draft,
        customImageUrl: draft.backgroundId === "custom" ? normalizeImageUrl(draft.customImageUrl) || "" : "",
        customImageSource: draft.backgroundId === "custom" ? draft.customImageSource.trim() : "",
      });
      onClose();
    } catch {
      /* surfaced by the provider's error state */
    }
  }

  return (
    <Dialog open={open} onClose={dismiss} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Palette sx={{ color: editorial.pmwBlue }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>Appearance</Typography>
            <Typography sx={{ fontSize: 11.5, color: editorial.muted }}>
              {isAdmin
                ? "Previews as you choose. Nothing is saved until you press Save, and saving applies to everyone."
                : "Set by an administrator for the whole workspace."}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={dismiss} size="small" aria-label="Close appearance settings">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {(error || validationError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {validationError || error}
          </Alert>
        )}
        {!isAdmin && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You can look through the themes here, but only an OSHES administrator can change what everyone sees.
          </Alert>
        )}

        <Stack spacing={3}>
          <Box>
            <SectionHeading
              title="Contrast"
              caption="The ink and ground pairing — this is what decides legibility, so it is the first choice."
            />
            <Grid min={158}>
              {CONTRAST_THEMES.map((theme, index) => {
                const selected = draft.contrastThemeId === theme.id;
                return (
                  <Box
                    key={theme.id}
                    component="button"
                    type="button"
                    disabled={!isAdmin}
                    aria-pressed={selected}
                    onClick={() => edit({ contrastThemeId: theme.id })}
                    sx={{ ...CARD_SX, ...selectionSx(selected) }}
                  >
                    <Box sx={{ position: "relative" }}>
                      <Specimen p={contrastSpecimens[index]} label="OSHES" />
                      {selected && <Tick />}
                    </Box>
                    <Box sx={{ px: 1.1, py: 0.9 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }}>{theme.label}</Typography>
                      <Typography sx={{ fontSize: 10.5, color: editorial.muted, lineHeight: 1.35 }}>
                        {theme.note}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Grid>
          </Box>

          <Box>
            <SectionHeading
              title="Colour"
              caption="Identity and action only. Green, amber and red keep their meanings in every theme, so no accent is offered in those families."
            />
            <Grid min={158}>
              {COLOR_THEMES.map((theme, index) => {
                const selected = draft.colorThemeId === theme.id;
                const p = colorSpecimens[index];
                return (
                  <Box
                    key={theme.id}
                    component="button"
                    type="button"
                    disabled={!isAdmin}
                    aria-pressed={selected}
                    onClick={() => edit({ colorThemeId: theme.id })}
                    sx={{ ...CARD_SX, ...selectionSx(selected) }}
                  >
                    <Box sx={{ position: "relative", display: "flex", height: 46 }}>
                      {[p.brand, p.brandWash, p.accent, p.accentWash].map((tone, i) => (
                        <Box key={i} sx={{ flex: 1, backgroundColor: tone }} />
                      ))}
                      {selected && <Tick />}
                    </Box>
                    <Box sx={{ px: 1.1, py: 0.9 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }}>{theme.label}</Typography>
                      <Typography sx={{ fontSize: 10.5, color: editorial.muted, lineHeight: 1.35 }}>
                        {theme.note}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Grid>
          </Box>

          <Box>
            <SectionHeading
              title="Typeface"
              caption="Headings and body. Microsoft 365 uses the faces already on the machine and downloads nothing."
            />
            <Grid min={158}>
              {FONT_THEMES.map((theme) => {
                const selected = draft.fontThemeId === theme.id;
                return (
                  <Box
                    key={theme.id}
                    component="button"
                    type="button"
                    disabled={!isAdmin}
                    aria-pressed={selected}
                    onClick={() => edit({ fontThemeId: theme.id })}
                    sx={{ ...CARD_SX, ...selectionSx(selected) }}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        height: 46,
                        px: 1.2,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 0.75,
                        backgroundColor: editorial.paperSoft,
                      }}
                    >
                      {/* The specimen has to be drawn in the face it names, so
                          these override the global font rule rather than
                          inherit it. */}
                      <Box component="span" sx={{ fontFamily: `${theme.heading} !important`, fontSize: 25, fontWeight: 700, lineHeight: 1.1 }}>
                        Aa
                      </Box>
                      <Box component="span" sx={{ fontFamily: `${theme.body} !important`, fontSize: 12, color: editorial.muted }}>
                        0123
                      </Box>
                      {selected && <Tick />}
                    </Box>
                    <Box sx={{ px: 1.1, py: 0.9 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }}>{theme.label}</Typography>
                      <Typography sx={{ fontSize: 10.5, color: editorial.muted, lineHeight: 1.35 }}>
                        {theme.note}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Grid>
          </Box>

          <Box>
            <SectionHeading
              title="Background"
              caption="What sits behind the panels. Theme Ground follows the contrast theme, so it suits every one of them."
            />
            <Grid min={148}>
              {backgrounds.map((background) => {
                const selected = draft.backgroundId === background.id;
                return (
                  <Box
                    key={background.id}
                    component="button"
                    type="button"
                    disabled={!isAdmin}
                    aria-pressed={selected}
                    onClick={() => edit({ backgroundId: background.id })}
                    sx={{ ...CARD_SX, ...selectionSx(selected) }}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        height: 72,
                        background: buildDashboardBackgroundDefCss(background, draft.imageOpacity, true),
                      }}
                    >
                      {selected && <Tick />}
                    </Box>
                    <Box sx={{ px: 1.1, py: 0.9 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }}>
                        {background.label}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, color: editorial.muted, lineHeight: 1.35 }}>
                        {background.source || background.category}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Grid>

            <Box
              sx={{
                mt: 1.5,
                p: 1.75,
                borderRadius: "10px",
                backgroundColor: editorial.panel,
                ...selectionSx(draft.backgroundId === "custom"),
              }}
            >
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, mb: 1 }}>Custom image</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr auto" }, gap: 1 }}>
                <TextField
                  size="small"
                  disabled={!isAdmin}
                  value={draft.customImageUrl}
                  onChange={(event) => edit({ backgroundId: "custom", customImageUrl: event.target.value })}
                  placeholder="https://example.com/background.jpg"
                  slotProps={{ htmlInput: { sx: { fontSize: "0.875rem" }, "aria-label": "Custom background image URL" } }}
                />
                <Button
                  variant={draft.backgroundId === "custom" ? "contained" : "outlined"}
                  disabled={!isAdmin}
                  onClick={() => edit({ backgroundId: "custom" })}
                  sx={{ minWidth: 92 }}
                >
                  Select
                </Button>
              </Box>
              {draft.backgroundId === "custom" && (
                <>
                  <TextField
                    label="Image source / credit"
                    size="small"
                    fullWidth
                    disabled={!isAdmin}
                    value={draft.customImageSource}
                    onChange={(event) => edit({ customImageSource: event.target.value })}
                    placeholder="PMW owned asset, photographer, license, or source URL"
                    sx={{ mt: 1.25 }}
                  />
                  {customPreviewUrl && (
                    <Box
                      sx={{
                        mt: 1.25,
                        height: 96,
                        borderRadius: "8px",
                        border: editorialHairline,
                        background: buildCustomBackgroundCss(draft.customImageUrl, draft.imageOpacity),
                      }}
                    />
                  )}
                </>
              )}
            </Box>

            <Box sx={{ mt: 1.5, p: 1.75, borderRadius: "10px", border: editorialHairline, backgroundColor: editorial.panel }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>Image strength</Typography>
                  <Typography sx={{ fontSize: 11, color: editorial.muted }}>
                    How far the photograph comes through the theme's own scrim.
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 11.5, color: editorial.muted, fontWeight: 800 }}>
                  {Math.round(draft.imageOpacity * 100)}%
                </Typography>
              </Box>
              <Slider
                value={Math.round(draft.imageOpacity * 100)}
                min={0}
                max={100}
                step={1}
                disabled={!isAdmin}
                onChange={(_, value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  edit({ imageOpacity: normalizeImageOpacity(next / 100) });
                }}
                aria-label="Image strength"
              />
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
        <Button
          disabled={!isAdmin}
          onClick={() => edit({ ...DEFAULT_DASHBOARD_APPEARANCE })}
          sx={{ color: editorial.muted, mr: "auto" }}
        >
          Reset to default
        </Button>
        <Button onClick={dismiss}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!isAdmin || saving || loading || !dirty}
          onClick={() => { void handleSave(); }}
          sx={{ minWidth: 150 }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save for everyone"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
