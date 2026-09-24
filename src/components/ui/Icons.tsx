/* ---------------------------------------------------------------------------
   The icon set, inline.

   These screens used to draw from `@mui/icons-material` — Material's filled and
   "Outlined" glyphs, which sit on a different grid and at a different weight
   from the icons in the SI maintenance portal and in pmw-it. Put the four apps
   side by side and the icons were the loudest thing telling you they were not
   the same product: a 24px filled Material glyph beside a 2px-stroke lucide one
   reads as two design languages, not two screens.

   So this is lucide's set, at lucide's geometry: a 24px box, 2px stroke, round
   caps and joins, no fill. It is transcribed rather than installed, exactly as
   pmw-it does it — `lucide-react` for the fifty-odd glyphs used here would be a
   larger dependency than any other in the app, and `@mui/icons-material` is
   still installed for MUI's own internals, so installing lucide alongside it
   would ship two icon packages to draw one set of icons.

   ── The `fontSize` prop ─────────────────────────────────────────────────────

   Every call site here was written against MUI, which sizes an icon with
   `fontSize="small"` or `sx={{ fontSize: 18 }}` rather than with `size`. Those
   are accepted and translated, so the migration did not have to rewrite 180
   call sites by hand — which is 180 chances to change a size while meaning to
   change an import. `size` is the prop to use in new code; the other two are a
   compatibility layer and are documented as such.
--------------------------------------------------------------------------- */

import type { SVGProps } from "react";

/** MUI's named sizes, in the pixel values MUI resolves them to. */
const NAMED = { inherit: 16, small: 20, medium: 24, large: 35 } as const;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** The glyph's box, in px. The prop to use in new code. */
  size?: number;
  /** MUI compatibility — see the note at the top of this file. */
  fontSize?: keyof typeof NAMED | number;
  /**
   * MUI compatibility. `fontSize` is consumed as the size; every other scalar
   * key is passed through to `style`, which covers what these call sites
   * actually use — `color`, `display`, `flex`, margins.
   *
   * Responsive values (`{ xs: …, lg: … }`) are NOT supported and are dropped:
   * a plain `style` has no breakpoints, and quietly flattening one to its first
   * value would hide an element on the wrong screens. There was exactly one
   * such call site and it now wraps the icon in a `Box` instead.
   */
  sx?: Record<string, unknown>;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function resolveSize({ size, fontSize, sx }: IconProps): number {
  if (typeof size === "number") return size;
  if (typeof fontSize === "number") return fontSize;
  if (typeof fontSize === "string") return NAMED[fontSize];
  const fromSx = sx?.fontSize;
  if (typeof fromSx === "number") return fromSx;
  return 18;
}

/** The scalar half of an `sx`, as a plain style. See the note on `IconProps.sx`. */
function styleFromSx(sx: IconProps["sx"], own: React.CSSProperties | undefined): React.CSSProperties | undefined {
  if (!sx) return own;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sx)) {
    if (key === "fontSize") continue;
    if (value === null || typeof value === "object") continue;
    out[key] = value;
  }
  return { ...out, ...own } as React.CSSProperties;
}

function make(displayName: string, children: React.ReactNode): IconComponent {
  const Icon = ({ size, fontSize, sx, style, ...rest }: IconProps) => {
    const px = resolveSize({ size, fontSize, sx });
    return (
      <svg
        width={px}
        height={px}
        aria-hidden="true"
        focusable="false"
        {...BASE}
        style={styleFromSx(sx, style)}
        {...rest}
      >
        {children}
      </svg>
    );
  };
  Icon.displayName = displayName;
  return Icon;
}

// ── Navigation ──────────────────────────────────────────────────────────────

export const Home = make("Home", (
  <>
    <path d="M3 9.5 12 3l9 6.5" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </>
));

export const CalendarDays = make("CalendarDays", (
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </>
));

export const ClipboardClock = make("ClipboardClock", (
  <>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <circle cx="12" cy="14" r="3.5" />
    <path d="M12 12.5V14l1 1" />
  </>
));

export const ListChecks = make("ListChecks", (
  <>
    <path d="m3 6 2 2 3-3M3 14l2 2 3-3" />
    <path d="M12 7h9M12 17h9" />
  </>
));

export const Folder = make("Folder", (
  <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" />
));

export const FilePlus = make("FilePlus", (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6M9 15h6" />
  </>
));

export const LayoutGrid = make("LayoutGrid", (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </>
));

export const Users = make("Users", (
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </>
));

export const History = make("History", (
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <polyline points="3 3 3 8 8 8" />
    <path d="M12 7v5l3 2" />
  </>
));

export const Settings = make("Settings", (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
));

export const Menu = make("Menu", <path d="M3 6h18M3 12h18M3 18h18" />);

export const X = make("X", <path d="M18 6 6 18M6 6l12 12" />);

export const Search = make("Search", (
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </>
));

export const LogOut = make("LogOut", (
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <path d="M21 12H9" />
  </>
));

// ── Movement ────────────────────────────────────────────────────────────────

export const ChevronDown = make("ChevronDown", <polyline points="6 9 12 15 18 9" />);
export const ChevronRight = make("ChevronRight", <polyline points="9 18 15 12 9 6" />);
export const ArrowLeft = make("ArrowLeft", (
  <>
    <path d="M19 12H5" />
    <polyline points="12 19 5 12 12 5" />
  </>
));
export const ArrowRight = make("ArrowRight", (
  <>
    <path d="M5 12h14" />
    <polyline points="12 5 19 12 12 19" />
  </>
));

export const RefreshCw = make("RefreshCw", (
  <>
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <polyline points="3 21 3 16 8 16" />
    <polyline points="21 3 21 8 16 8" />
  </>
));

export const Undo2 = make("Undo2", (
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </>
));

export const GitBranch = make("GitBranch", (
  <>
    <path d="M6 3v12" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </>
));

export const ExternalLink = make("ExternalLink", (
  <>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <path d="M10 14 21 3" />
  </>
));

export const Share = make("Share", (
  <>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <path d="M12 2v14" />
  </>
));

export const Link2 = make("Link2", (
  <>
    <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2" />
    <path d="M8 12h8" />
  </>
));

// ── Objects and actions ─────────────────────────────────────────────────────

export const Plus = make("Plus", <path d="M12 5v14M5 12h14" />);
export const Check = make("Check", <polyline points="20 6 9 17 4 12" />);
export const Copy = make("Copy", (
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
));

export const Pencil = make("Pencil", (
  <>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    <path d="m15 5 4 4" />
  </>
));

export const Trash2 = make("Trash2", (
  <>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </>
));

export const Download = make("Download", (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <path d="M12 15V3" />
  </>
));

export const Upload = make("Upload", (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <path d="M12 3v12" />
  </>
));

export const FileText = make("FileText", (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M8 13h8M8 17h5" />
  </>
));

export const Mail = make("Mail", (
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </>
));

export const UserCog = make("UserCog", (
  <>
    <path d="M12 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="7" cy="7" r="4" />
    <circle cx="18" cy="15" r="2.5" />
    <path d="M18 11.5V13M18 17v1.5M21 13.2l-1.3.8M16.3 16l-1.3.8M21 16.8l-1.3-.8M16.3 14l-1.3-.8" />
  </>
));

export const Lock = make("Lock", (
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </>
));

export const ShieldCheck = make("ShieldCheck", (
  <>
    <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
    <polyline points="9 12 11 14 15.5 9.5" />
  </>
));

// ── Status ──────────────────────────────────────────────────────────────────

export const CheckCircle = make("CheckCircle", (
  <>
    <circle cx="12" cy="12" r="9" />
    <polyline points="8.5 12.2 11 14.7 15.7 9.5" />
  </>
));

export const Circle = make("Circle", <circle cx="12" cy="12" r="9" />);

export const XCircle = make("XCircle", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </>
));

export const AlertTriangle = make("AlertTriangle", (
  <>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>
));

export const AlertCircle = make("AlertCircle", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.5h.01" />
  </>
));

export const Info = make("Info", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4.5M12 7.75h.01" />
  </>
));

export const Ban = make("Ban", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>
));

export const HelpCircle = make("HelpCircle", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.5a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.6-2.6 2.6" />
    <path d="M12 17h.01" />
  </>
));

export const Wrench = make("Wrench", (
  <path d="M14.5 5.5a4.5 4.5 0 0 0 5.9 5.9l-8.5 8.5a2.6 2.6 0 0 1-3.7-3.7z" />
));

export const Loader2 = make("Loader2", <path d="M21 12a9 9 0 1 1-6.2-8.6" />);

export const WifiOff = make("WifiOff", (
  <>
    <path d="M2 2l20 20" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0" />
    <path d="M5 12.9a10 10 0 0 1 3.1-2.1M19 12.9a10 10 0 0 0-4.6-2.6" />
    <path d="M2 8.8a15 15 0 0 1 4.6-2.9M21.9 8.8a15 15 0 0 0-10-3.7" />
    <path d="M12 20h.01" />
  </>
));

// ── People and identity ─────────────────────────────────────────────────────

export const User = make("User", (
  <>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>
));

export const LogIn = make("LogIn", (
  <>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <path d="M15 12H3" />
  </>
));

export const ShieldUser = make("ShieldUser", (
  <>
    <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
    <circle cx="12" cy="10" r="2.4" />
    <path d="M8.5 16.3a4 4 0 0 1 7 0" />
  </>
));

export const ShieldAlert = make("ShieldAlert", (
  <>
    <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
    <path d="M12 7.5v5M12 16h.01" />
  </>
));

// ── Structure and data ──────────────────────────────────────────────────────

export const LayoutDashboard = make("LayoutDashboard", (
  <>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </>
));

export const Table = make("Table", (
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </>
));

export const Layers = make("Layers", (
  <>
    <path d="m12 2 9 5-9 5-9-5z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </>
));

export const Network = make("Network", (
  <>
    <rect x="9" y="2" width="6" height="5" rx="1" />
    <rect x="2" y="17" width="6" height="5" rx="1" />
    <rect x="16" y="17" width="6" height="5" rx="1" />
    <path d="M12 7v4M5 17v-2h14v2" />
  </>
));

export const Hash = make("Hash", <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />);

export const Filter = make("Filter", <path d="M3 4h18l-7 8.5V20l-4-2v-5.5z" />);

export const FileType = make("FileType", (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M9 13h6M12 13v5" />
  </>
));

// ── Time and state ──────────────────────────────────────────────────────────

export const Clock = make("Clock", (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.9" />
  </>
));

export const Hourglass = make("Hourglass", (
  <>
    <path d="M6 2h12M6 22h12" />
    <path d="M7 2v3.5c0 2 5 4.2 5 6.5s-5 4.5-5 6.5V22" />
    <path d="M17 2v3.5c0 2-5 4.2-5 6.5s5 4.5 5 6.5V22" />
  </>
));

export const RotateCcw = make("RotateCcw", (
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <polyline points="3 3 3 8 8 8" />
  </>
));

export const ChevronUp = make("ChevronUp", <polyline points="18 15 12 9 6 15" />);

export const Eye = make("Eye", (
  <>
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>
));

export const Palette = make("Palette", (
  <>
    <path d="M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.2 3H16a2 2 0 0 0-1.5 3.3A1.8 1.8 0 0 1 13 21z" />
    <circle cx="7.5" cy="11.5" r="1.1" />
    <circle cx="10.5" cy="7.5" r="1.1" />
    <circle cx="15.5" cy="8.5" r="1.1" />
  </>
));

export const SmokingRoomsOutlined = make("SmokingRoomsOutlined", (
  <>
    <path d="M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14" />
    <path d="M18 8c0-2.5-2-2.5-2-5" />
    <path d="M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M22 8c0-2.5-2-2.5-2-5" />
    <path d="M7 12v4" />
  </>
));
