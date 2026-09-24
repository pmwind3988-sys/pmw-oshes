import { useEffect, useState } from "react";
import { Avatar, Box, Divider, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import { Wrench as BuildOutlinedIcon, LayoutGrid as CategoryOutlinedIcon, X as CloseIcon, ChevronDown as ExpandMoreIcon, Folder as FolderOutlinedIcon, Users as GroupOutlinedIcon, HelpCircle as HelpOutlineIcon, History as HistoryOutlinedIcon, Home as HomeOutlinedIcon, ListChecks as ListAltOutlinedIcon, LogOut as LogoutIcon, Menu as MenuIcon, FilePlus as NoteAddOutlinedIcon, ExternalLink as OpenInNewIcon, ClipboardClock as PendingActionsOutlinedIcon, Search as SearchIcon, Settings as SettingsOutlinedIcon, SmokingRoomsOutlined as SmokingRoomsOutlinedIcon, CalendarDays as TodayOutlinedIcon } from "../ui/Icons";
import type { IconComponent } from "../ui/Icons";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import { portalSections, roleLabel } from "../../utils/portalRole";
import { builderUrl, OSHES_APP } from "../../config/oshes";
import Logo from "../Logo";
import type { PortalScreen } from "../../types";
import "../../styles/shell.css";

/**
 * The shell: a branded column of labelled destinations, a sticky bar over the
 * content, and the canvas the screens sit on.
 *
 * The layout is pmw-it's, so the two internal portals read as one product. It
 * replaced an icon-only rail plus a drawer, which had the labels and the
 * destinations in two different places — you clicked a glyph you had to
 * remember, or opened a drawer to read the word and then clicked again. One
 * column carrying both costs 236px on a desktop and nothing on a phone, where
 * it is the same element as an off-canvas drawer.
 *
 * Below 1024px the column IS that drawer, switched by CSS in shell.css rather
 * than by a width check here, so first paint is never the wrong layout.
 */

/** One glyph per screen. The column carries the word too — this is not a memory test. */
const SCREEN_ICON: Partial<Record<PortalScreen, IconComponent>> = {
  home: HomeOutlinedIcon,
  today: TodayOutlinedIcon,
  queue: PendingActionsOutlinedIcon,
  subs: ListAltOutlinedIcon,
  mine: FolderOutlinedIcon,
  file: NoteAddOutlinedIcon,
  cat: CategoryOutlinedIcon,
  people: GroupOutlinedIcon,
  audit: HistoryOutlinedIcon,
  smoking: SmokingRoomsOutlinedIcon,
  settings: SettingsOutlinedIcon,
};

/** Two letters from the display name, or one from the email when there is no name yet. */
function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const {
    access,
    role,
    userName,
    userEmail,
    screen,
    setScreen,
    records,
    myRecords,
    queue,
    catalogue,
    audit,
    submitSearch,
    onSignOut,
  } = usePortal();
  const [navOpen, setNavOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [draftQuery, setDraftQuery] = useState("");

  const builder = builderUrl();
  const profileOpen = Boolean(profileAnchor);
  const displayed = userName || userEmail;
  const initials = initialsOf(userName, userEmail);

  const sections = portalSections(access, {
    queue: queue.length,
    allRecords: records.length,
    myRecords: myRecords.length,
    catalogue: catalogue.length,
    audit: audit.length,
  });

  // While the drawer is over the page the page behind it must not scroll — on a
  // phone a scrolling backdrop reads as the drawer itself failing to scroll.
  // Escape closes it for anyone on a keyboard.
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  const pick = (next: PortalScreen) => {
    setScreen(next);
    setNavOpen(false);
    setProfileAnchor(null);
  };

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = draftQuery.trim();
    if (!query) return;
    submitSearch(query);
    setNavOpen(false);
  };

  const avatarSx = {
    bgcolor: editorial.pmwBlueSoft,
    color: editorial.pmwBlueDark,
    fontWeight: 800,
  } as const;

  return (
    <div className="shell">
      {navOpen && (
        <button
          type="button"
          className="shell-backdrop"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        id="portal-nav"
        aria-label="Portal sections"
        className={`shell-nav oshes-brand-surface${navOpen ? " open" : ""}`}
      >
        <div className="shell-brand">
          {/* The wordmark is the way back Home, which is the screen that shows
              every other one — so the shortest route out of anywhere is a click
              on the name of the app. */}
          <button type="button" className="shell-brand-link" onClick={() => pick("home")}>
            <span className="shell-logo-chip">
              <Logo size={24} />
            </span>
            <span>
              <span className="shell-brand-name">{OSHES_APP.department}</span>
              <span className="shell-brand-sub">Forms Portal</span>
            </span>
          </button>
          <button
            type="button"
            className="shell-navclose"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <nav className="shell-navlist">
          {sections.map((section) => (
            <div key={section.id}>
              {section.label && <div className="shell-navsection">{section.label}</div>}
              {section.items.map((item) => {
                const Icon = SCREEN_ICON[item.screen];
                const active = screen === item.screen;
                return (
                  <button
                    key={item.screen}
                    type="button"
                    className={`shell-navitem${active ? " active" : ""}`}
                    onClick={() => pick(item.screen)}
                    aria-current={active ? "page" : undefined}
                    title={item.hint}
                  >
                    {Icon && <Icon fontSize="small" />}
                    <span>{item.label}</span>
                    {item.count !== null && item.count > 0 && item.screen === "queue" && (
                      <span className="shell-navcount">{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shell-navfoot">
          <div className="shell-navuser">
            <div className="shell-avatar">{initials}</div>
            <div className="shell-navuser-text">
              <div className="shell-navuser-name">{displayed}</div>
              <div className="shell-navuser-role">{access.readOnly ? "Read only" : roleLabel(role)}</div>
            </div>
          </div>

          {/* Authoring lives in pmw-hrform. The link is only rendered when
              VITE_BUILDER_URL is set, and it carries ?site=oshes so the operator
              lands on THIS site's forms rather than HR's. */}
          {builder && access.canManageCatalogue && (
            <a className="shell-navlink" href={builder} target="_blank" rel="noopener noreferrer">
              <BuildOutlinedIcon fontSize="small" /> Form builder
              <OpenInNewIcon sx={{ fontSize: 12 }} />
            </a>
          )}
          <a className="shell-navlink" href="/privacy" target="_blank" rel="noopener noreferrer">
            <HelpOutlineIcon fontSize="small" /> Privacy notice
          </a>
          <button type="button" className="shell-signout" onClick={onSignOut}>
            <LogoutIcon fontSize="small" /> Sign out
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div className="shell-headerrow">
            <button
              type="button"
              className="shell-hamburger"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              aria-controls="portal-nav"
              aria-expanded={navOpen}
            >
              <MenuIcon />
            </button>

            {/* The column's brand mark is behind the drawer on a phone, so the
                bar carries one of its own. */}
            <button type="button" className="shell-headerbrand" onClick={() => pick("home")}>
              <Logo size={22} />
              <span>{OSHES_APP.department}</span>
            </button>

            <form className="shell-search" onSubmit={onSearchSubmit} role="search">
              <SearchIcon />
              <input
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search records…"
                aria-label="Search records"
              />
            </form>

            <div className="shell-headeractions">
              {access.canFile && (
                <Tooltip title="File a form" enterDelay={400}>
                  <button
                    type="button"
                    className="shell-iconbtn"
                    onClick={() => pick("file")}
                    aria-label="File a form"
                  >
                    <NoteAddOutlinedIcon sx={{ fontSize: 18 }} />
                  </button>
                </Tooltip>
              )}

              <Box
                component="button"
                type="button"
                onClick={(event: React.MouseEvent<HTMLElement>) => setProfileAnchor(event.currentTarget)}
                aria-label={`Account: ${displayed}`}
                aria-haspopup="menu"
                aria-controls={profileOpen ? "portal-profile-menu" : undefined}
                aria-expanded={profileOpen}
                sx={{
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  maxWidth: 240,
                  pl: 0.5,
                  pr: { xs: 0.5, sm: 1 },
                  py: 0.5,
                  border: editorialHairline,
                  borderRadius: radius.full,
                  background: profileOpen ? editorial.neutralWash : "transparent",
                  font: "inherit",
                  color: "inherit",
                  cursor: "pointer",
                  transition: "background-color 0.16s ease",
                  "&:hover": { background: editorial.neutralWash },
                }}
              >
                <Avatar sx={{ ...avatarSx, width: 28, height: 28, fontSize: 11.5 }}>{initials}</Avatar>
                <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 0, textAlign: "left" }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }} noWrap>
                    {displayed}
                  </Typography>
                  <Typography sx={{ fontSize: 11, lineHeight: 1.25, color: editorial.muted }} noWrap>
                    {access.readOnly ? "Read only" : roleLabel(role)}
                  </Typography>
                </Box>
                {/* The chevron only appears where the name beside it does. A plain
                    <svg> has no breakpoints, so the responsive part rides on a Box. */}
                <Box sx={{ display: { xs: "none", lg: "block" }, color: editorial.muted }}>
                  <ExpandMoreIcon size={18} />
                </Box>
              </Box>
            </div>
          </div>
        </header>

        <Menu
          id="portal-profile-menu"
          anchorEl={profileAnchor}
          open={profileOpen}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 340 } } }}
        >
          {/* The identity is stated once, in full, before any action — so signing
              out is never done from a guess about which account this is. */}
          <Stack direction="row" spacing={1.5} sx={{ px: 2, pt: 1.75, pb: 1.5, alignItems: "center" }}>
            <Avatar sx={{ ...avatarSx, width: 40, height: 40, fontSize: 14.5 }}>{initials}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800 }} noWrap>
                {displayed}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: editorial.muted }} noWrap>
                {userEmail}
              </Typography>
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  mt: 0.75,
                  px: 0.9,
                  py: 0.3,
                  fontSize: 11,
                  fontWeight: 800,
                  borderRadius: radius.full,
                  border: editorialHairline,
                  backgroundColor: editorial.blueWash,
                  color: editorial.pmwBlueDark,
                }}
              >
                {roleLabel(role)}
              </Box>
            </Box>
          </Stack>
          <Divider />
          <MenuItem onClick={() => pick("settings")} sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}>
            <SettingsOutlinedIcon sx={{ fontSize: 18, color: editorial.muted }} />
            Settings
          </MenuItem>
          <Divider />
          <MenuItem onClick={onSignOut} sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700, color: editorial.error }}>
            <LogoutIcon sx={{ fontSize: 18 }} />
            Sign out
          </MenuItem>
        </Menu>

        {/* Keyed on the screen so the entrance replays on every navigation rather
            than only on first mount — which is the point of it: it marks that the
            content changed, on a phone where there is no other cue. */}
        <main key={screen} className="shell-body oshes-rise">
          {children}
        </main>
      </div>
    </div>
  );
}
