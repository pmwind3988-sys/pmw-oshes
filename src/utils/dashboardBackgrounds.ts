import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type AppearanceSetting,
} from "../theme/appearance";

/* ---------------------------------------------------------------------------
   The wallpaper behind the panels, and the record that carries it.

   Every preset here is written in terms of the appearance variables rather than
   in literal colour. That is what lets the wallpaper and the contrast theme be
   chosen independently: "Editorial Sky" is a brand-tinted wash of whatever the
   current ground is, so it is a pale blue on Ink on Paper and a deep slate on
   Midnight, instead of being a light gradient that a dark theme has to fight.

   The same goes for the photographic options — their scrim is mixed from the
   theme's own canvas, so a photograph sits *under* a dark theme rather than
   glowing through it.
--------------------------------------------------------------------------- */

export interface DashboardBackgroundDef {
  id: string;
  label: string;
  category: string;
  css: string;
  preview: string;
  imageUrl?: string;
  previewUrl?: string;
  source?: string;
  sourceUrl?: string;
}

/**
 * One settings record for the whole look: the three theme axes plus the
 * wallpaper. Deliberately one record and one round trip — an administrator
 * changing the look changes it in a single save, and the app polls one endpoint
 * rather than racing two.
 */
export interface DashboardAppearanceSetting extends AppearanceSetting {
  backgroundId: string;
  customImageUrl: string;
  customImageSource: string;
  imageOpacity: number;
  updatedBy?: string;
  updatedAt?: string;
}

const CSS_VAR = "--app-bg";
export const DEFAULT_IMAGE_OPACITY = 0.22;

/** The ground the contrast theme itself defines — see theme/appearance.ts. */
const THEME_GROUND = "var(--app-bg-fallback)";

function clampImageOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_OPACITY;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageOpacity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clampImageOpacity(parsed);
}

/** `var` mixed into transparency — the composable form of an alpha channel. */
function tint(variable: string, percent: number): string {
  return `color-mix(in srgb, var(${variable}) ${Math.round(percent)}%, transparent)`;
}

/**
 * A photograph under a scrim made of the theme's own canvas.
 *
 * `imageOpacity` runs 0 (scrim fully opaque, photo invisible) to 1 (no scrim).
 * The three stops are weighted differently so the top of the page — where the
 * header and the first row of statistics sit — stays the calmest part.
 */
function photo(url: string, imageOpacity = DEFAULT_IMAGE_OPACITY): string {
  const scrim = (scale: number) => {
    const opacity = 1 - normalizeImageOpacity(imageOpacity) * scale;
    return `color-mix(in srgb, var(--pmw-canvas) ${Math.round(opacity * 100)}%, transparent)`;
  };
  return `linear-gradient(180deg, ${scrim(0.55)} 0%, ${scrim(1)} 42%, ${scrim(0.45)} 100%), url("${url}") center/cover no-repeat`;
}

export const DASHBOARD_BACKGROUNDS: DashboardBackgroundDef[] = [
  {
    id: "theme",
    label: "Theme Ground",
    category: "Quiet",
    // No wallpaper at all — the contrast theme's own ground shows through. This
    // is the default because it is the only option guaranteed to suit every
    // theme, including ones added later.
    css: THEME_GROUND,
    preview: THEME_GROUND,
  },
  {
    id: "clarity",
    label: "Editorial Sky",
    category: "Quiet",
    css: `linear-gradient(180deg, var(--pmw-blue-wash) 0%, var(--pmw-canvas) 45%, var(--pmw-panel) 100%)`,
    preview: `linear-gradient(180deg, var(--pmw-blue-wash) 0%, var(--pmw-canvas) 45%, var(--pmw-panel) 100%)`,
  },
  {
    id: "paper-grid",
    label: "Paper Grid",
    category: "Quiet",
    css: `linear-gradient(180deg, ${tint("--pmw-paper", 96)} 0%, ${tint("--pmw-blue-wash", 96)} 100%), repeating-linear-gradient(0deg, transparent 0, transparent 27px, ${tint("--pmw-ink", 5)} 28px), repeating-linear-gradient(90deg, transparent 0, transparent 27px, ${tint("--pmw-ink", 4)} 28px)`,
    preview: `linear-gradient(135deg, var(--pmw-paper) 0%, var(--pmw-blue-wash) 100%), repeating-linear-gradient(90deg, transparent 0, transparent 11px, ${tint("--pmw-ink", 6)} 12px)`,
  },
  {
    id: "aurora",
    label: "Aurora",
    category: "Quiet",
    // Two off-centre radial pools of the brand and the accent. The only preset
    // that shows the colour theme at full strength, and the reason a magenta or
    // teal choice reads on the page rather than only on the buttons.
    css: `radial-gradient(120% 80% at 12% 0%, ${tint("--pmw-blue-wash", 92)} 0%, transparent 58%), radial-gradient(110% 70% at 95% 8%, ${tint("--pmw-purple-wash", 88)} 0%, transparent 55%), linear-gradient(180deg, var(--pmw-canvas) 0%, var(--pmw-panel) 100%)`,
    preview: `radial-gradient(120% 90% at 10% 0%, var(--pmw-blue-wash) 0%, transparent 60%), radial-gradient(110% 80% at 95% 10%, var(--pmw-purple-wash) 0%, transparent 58%), linear-gradient(180deg, var(--pmw-canvas) 0%, var(--pmw-panel) 100%)`,
  },
  {
    id: "workspace",
    label: "Workspace",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "studio",
    label: "Studio",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "city-glass",
    label: "City Glass",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "horizon",
    label: "Horizon",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "courtyard",
    label: "Courtyard",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
  {
    id: "prism",
    label: "Prism",
    category: "Online",
    imageUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=2400&q=80",
    previewUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=70",
    css: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=2400&q=80"),
    preview: photo("https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=70"),
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/license",
  },
];

export const DEFAULT_DASHBOARD_APPEARANCE: DashboardAppearanceSetting = {
  ...DEFAULT_APPEARANCE,
  backgroundId: "theme",
  customImageUrl: "",
  customImageSource: "",
  imageOpacity: DEFAULT_IMAGE_OPACITY,
};

function escapeCssUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function normalizeImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildCustomBackgroundCss(imageUrl: string, imageOpacity = DEFAULT_IMAGE_OPACITY): string {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) return THEME_GROUND;
  return photo(escapeCssUrl(normalized), imageOpacity);
}

export function findDashboardBackground(id: string): DashboardBackgroundDef {
  return DASHBOARD_BACKGROUNDS.find((background) => background.id === id) ?? DASHBOARD_BACKGROUNDS[0];
}

export function buildDashboardBackgroundDefCss(
  background: DashboardBackgroundDef,
  imageOpacity = DEFAULT_IMAGE_OPACITY,
  preview = false,
): string {
  const url = preview ? background.previewUrl || background.imageUrl : background.imageUrl;
  if (!url) return preview ? background.preview : background.css;
  return photo(escapeCssUrl(url), imageOpacity);
}

export function buildDashboardBackgroundCss(setting: DashboardAppearanceSetting): string {
  const imageOpacity = normalizeImageOpacity(setting.imageOpacity);
  if (setting.backgroundId === "custom") {
    return buildCustomBackgroundCss(setting.customImageUrl, imageOpacity);
  }
  return buildDashboardBackgroundDefCss(findDashboardBackground(setting.backgroundId), imageOpacity);
}

/** Coerce an API payload or a stale cache into a complete, valid record. */
export function normalizeDashboardAppearance(value: unknown): DashboardAppearanceSetting {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const backgroundId = typeof raw.backgroundId === "string" ? raw.backgroundId : "";
  const known = backgroundId === "custom" || DASHBOARD_BACKGROUNDS.some((b) => b.id === backgroundId);
  const customImageUrl = typeof raw.customImageUrl === "string" ? raw.customImageUrl : "";

  return {
    ...normalizeAppearance(raw),
    // A custom background with no usable URL falls back rather than rendering a
    // broken image request on every page.
    backgroundId: known && (backgroundId !== "custom" || normalizeImageUrl(customImageUrl))
      ? backgroundId
      : DEFAULT_DASHBOARD_APPEARANCE.backgroundId,
    customImageUrl,
    customImageSource: typeof raw.customImageSource === "string" ? raw.customImageSource : "",
    imageOpacity: normalizeImageOpacity(raw.imageOpacity ?? DEFAULT_IMAGE_OPACITY),
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

/**
 * Put the wallpaper on the page.
 *
 * "Theme Ground" *removes* the property rather than setting it to the ground,
 * so `body`'s own `var(--app-bg, var(--app-bg-fallback))` falls through to
 * whatever the contrast theme currently defines. Setting it would freeze the
 * ground at the value it had when the wallpaper was chosen.
 */
export function applyDashboardBackground(setting: DashboardAppearanceSetting): void {
  const root = document.documentElement;
  if (setting.backgroundId === "theme") {
    root.style.removeProperty(CSS_VAR);
    return;
  }
  root.style.setProperty(CSS_VAR, buildDashboardBackgroundCss(setting));
}
