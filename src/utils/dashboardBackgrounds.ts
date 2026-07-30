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

export interface DashboardBackgroundSetting {
  backgroundId: string;
  customImageUrl: string;
  customImageSource: string;
  imageOpacity: number;
  updatedBy?: string;
  updatedAt?: string;
}

const CSS_VAR = "--app-bg";
const FALLBACK_CSS_VAR = "--app-bg-fallback";
const DEFAULT_FALLBACK = "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%)";
export const DEFAULT_IMAGE_OPACITY = 0.22;

function clampImageOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_OPACITY;
  return Math.min(1, Math.max(0, value));
}

export function normalizeImageOpacity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clampImageOpacity(parsed);
}

function overlayAlpha(imageOpacity: number, scale: number): string {
  return (1 - normalizeImageOpacity(imageOpacity) * scale).toFixed(3);
}

function photo(url: string, imageOpacity = DEFAULT_IMAGE_OPACITY): string {
  return `linear-gradient(180deg, rgba(220,236,248,${overlayAlpha(imageOpacity, 0.55)}) 0%, rgba(247,245,239,${overlayAlpha(imageOpacity, 1)}) 42%, rgba(220,236,248,${overlayAlpha(imageOpacity, 0.45)}) 100%), url("${url}") center/cover no-repeat`;
}

export const DASHBOARD_BACKGROUNDS: DashboardBackgroundDef[] = [
  {
    id: "clarity",
    label: "Editorial Sky",
    category: "Quiet",
    css: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%)",
    preview: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 45%, #F7F5EF 100%)",
  },
  {
    id: "paper-grid",
    label: "Paper Grid",
    category: "Quiet",
    css: "linear-gradient(180deg, rgba(251,250,245,0.96) 0%, rgba(234,245,252,0.96) 100%), repeating-linear-gradient(0deg, transparent 0, transparent 27px, rgba(16,16,16,0.04) 28px), repeating-linear-gradient(90deg, transparent 0, transparent 27px, rgba(16,16,16,0.035) 28px)",
    preview: "linear-gradient(135deg, #FBFAF5 0%, #EAF5FC 100%)",
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

export const DEFAULT_DASHBOARD_BACKGROUND_SETTING: DashboardBackgroundSetting = {
  backgroundId: "clarity",
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
  if (!normalized) return DEFAULT_FALLBACK;
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

export function buildDashboardBackgroundCss(setting: DashboardBackgroundSetting): string {
  const imageOpacity = normalizeImageOpacity(setting.imageOpacity);
  if (setting.backgroundId === "custom") {
    return buildCustomBackgroundCss(setting.customImageUrl, imageOpacity);
  }
  return buildDashboardBackgroundDefCss(findDashboardBackground(setting.backgroundId), imageOpacity);
}

export function applyDashboardBackground(setting: DashboardBackgroundSetting): void {
  document.documentElement.style.setProperty(CSS_VAR, buildDashboardBackgroundCss(setting));
  document.documentElement.style.setProperty(FALLBACK_CSS_VAR, DEFAULT_FALLBACK);
}
