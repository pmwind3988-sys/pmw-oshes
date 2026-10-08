import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Divider, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import { Wrench as BuildOutlinedIcon, LayoutGrid as CategoryOutlinedIcon, X as CloseIcon, ChevronDown as ExpandMoreIcon, Folder as FolderOutlinedIcon, Users as GroupOutlinedIcon, HelpCircle as HelpOutlineIcon, History as HistoryOutlinedIcon, Home as HomeOutlinedIcon, ListChecks as ListAltOutlinedIcon, LogOut as LogoutIcon, Menu as MenuIcon, FilePlus as NoteAddOutlinedIcon, Plus as PlusIcon, ExternalLink as OpenInNewIcon, ClipboardClock as PendingActionsOutlinedIcon, Search as SearchIcon, Settings as SettingsOutlinedIcon, SmokingRoomsOutlined as SmokingRoomsOutlinedIcon, CalendarDays as TodayOutlinedIcon } from "../ui/Icons";
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
 * The shell: a narrow icon rail of destinations on the page ground, a white
 * sheet holding the search bar and the screen, and an account pill in the bar.
 *
 * On a desktop the rail is always visible: each destination is a pill holding
 * its glyph with the word under it, so the label and the target stay together.
 * Below 1024px the same element is an off-canvas drawer behind a hamburger —
 * switched by CSS in shell.css rather than by a width check here, so first
 * paint is never the wrong layout.
 *
 * The footer links (Form builder, Privacy notice) and sign-out live in the
 * account menu, not in the rail.
 */

/** One glyph per screen. The rail carries the word too — this is not a memory test. */
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

/** True when a keystroke is already going somewhere that takes text. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
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
  const searchRef = useRef<HTMLInputElement>(null);

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

  // A form's own workspace has no rail item of its own; it is the "file" area
  // it was reached from, so that is the destination that stays lit.
  const activeScreen: PortalScreen = screen === "form" ? "file" : screen;

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

  // "/" moves the cursor to the search box, as the key hint in it says — unless
  // the person is already typing somewhere, or the search box is not on screen.
  useEffect(() => {
    const onSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener("keydown", onSlash);
    return () => document.removeEventListener("keydown", onSlash);
  }, []);

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
        className={`shell-nav${navOpen ? " open" : ""}`}
      >
        <div className="shell-brand">
          {/* The logo is the way back Home, which is the screen that shows every
              other one — so the shortest route out of anywhere is a click on it. */}
          <button type="button" className="shell-brand-link" onClick={() => pick("home")}>
            <span className="shell-logo-chip">
              <Logo size={22} />
            </span>
            <span className="shell-brand-words">
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

        {access.canFile && (
          <button
            type="button"
            className="shell-newbtn"
            onClick={() => pick("file")}
            aria-label="File a form"
            title="File a form"
          >
            <PlusIcon />
          </button>
        )}

        <nav className="shell-navlist">
          {sections.map((section) => (
            <div key={section.id} className="shell-navgroup">
              {section.items.map((item) => {
                const Icon = SCREEN_ICON[item.screen];
                const active = activeScreen === item.screen;
                // On a desktop the "+" button above is the way in to filing, so
                // this row would only repeat it. The row stays for the drawer.
                const className = [
                  "shell-navitem",
                  active ? "active" : "",
                  item.screen === "file" ? "shell-navitem-file" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={item.screen}
                    type="button"
                    className={className}
                    onClick={() => pick(item.screen)}
                    aria-current={active ? "page" : undefined}
                    title={item.hint}
                  >
                    <span className="shell-navpill">{Icon && <Icon fontSize="small" />}</span>
                    <span className="shell-navlabel">{item.label}</span>
                    {item.count !== null && item.count > 0 && item.screen === "queue" && (
                      <span className="shell-navcount">{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
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

            {/* The rail's brand mark is behind the drawer on a phone, so the bar
                carries one of its own. */}
            <button type="button" className="shell-headerbrand" onClick={() => pick("home")}>
              <Logo size={22} />
              <span>{OSHES_APP.department}</span>
            </button>

            <form className="shell-search" onSubmit={onSearchSubmit} role="search">
              <SearchIcon />
              <input
                ref={searchRef}
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search records…"
                aria-label="Search records"
              />
              <kbd className="shell-searchkey" aria-hidden="true">/</kbd>
            </form>

            <div className="shell-headeractions">
              {access.canFile && (
                <Tooltip title="File a form" enterDelay={400}>
                  <button
                    type="button"
                    className="shell-iconbtn shell-headerfile"
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
                  height: 46,
                  pl: 0.5,
                  pr: { xs: 0.5, lg: 1.5 },
                  border: 0,
                  borderRadius: radius.full,
                  background: profileOpen ? editorial.blueWash : editorial.neutralWash,
                  font: "inherit",
                  color: "inherit",
                  cursor: "pointer",
                  transition: "background-color 0.16s ease, transform 0.12s ease",
                  "&:hover": { background: editorial.blueWash },
                  "&:active": { transform: "scale(0.97)" },
                  "&:focus-visible": { outline: "3px solid #9DBDF5", outlineOffset: 2 },
                }}
              >
                <Avatar sx={{ ...avatarSx, width: 36, height: 36, fontSize: 12.5 }}>{initials}</Avatar>
                <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 0, textAlign: "left" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }} noWrap>
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
          slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 340, borderRadius: "16px" } } }}
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
          {/* Authoring lives in pmw-hrform. The link is only offered when
              VITE_BUILDER_URL is set, and it carries ?site=oshes so the operator
              lands on THIS site's forms rather than HR's. */}
          {builder && access.canManageCatalogue && (
            <MenuItem
              component="a"
              href={builder}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setProfileAnchor(null)}
              sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}
            >
              <BuildOutlinedIcon fontSize="small" />
              Form builder
              <OpenInNewIcon sx={{ fontSize: 12, ml: "auto" }} />
            </MenuItem>
          )}
          <MenuItem
            component="a"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setProfileAnchor(null)}
            sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}
          >
            <HelpOutlineIcon fontSize="small" />
            Privacy notice
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
