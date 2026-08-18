import { useState } from "react";
import { Avatar, Box, Button, Divider, Drawer, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import TodayOutlinedIcon from "@mui/icons-material/TodayOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import { portalSections, roleLabel } from "../../utils/portalRole";
import { builderUrl } from "../../config/oshe";
import type { PortalNavSection, PortalScreen } from "../../types";

// Capped against the viewport so the nav never fills a small phone edge to edge —
// the sliver of dimmed page behind it is what tells you the drawer is dismissable.
const DRAWER_WIDTH = "min(288px, 85vw)";
const CONTENT_MAX_WIDTH = 1360;
const RAIL_WIDTH = 68;

/**
 * One glyph per screen, so the rail can be read at a glance.
 *
 * The rail shows icons only; the drawer beside it still carries the words. That
 * pairing is deliberate — an icon rail on its own is a memory test, and a screen
 * nobody can name is a screen nobody visits.
 */
const SCREEN_ICON: Partial<Record<PortalScreen, SvgIconComponent>> = {
  home: HomeOutlinedIcon,
  today: TodayOutlinedIcon,
  queue: PendingActionsOutlinedIcon,
  subs: ListAltOutlinedIcon,
  mine: FolderOutlinedIcon,
  file: NoteAddOutlinedIcon,
  cat: CategoryOutlinedIcon,
  people: GroupOutlinedIcon,
  audit: HistoryOutlinedIcon,
  settings: SettingsOutlinedIcon,
};

/** Two letters from the display name, or one from the email when there is no name yet. */
function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

/** A square control on the dark bar — search, alerts, the menu. */
function ShellButton({
  label,
  onClick,
  children,
  tone = "plain",
  badge,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "plain" | "cta";
  badge?: number;
}) {
  return (
    <Tooltip title={label} enterDelay={400}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-label={label}
        sx={{
          position: "relative",
          flex: "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          p: 0,
          border: "none",
          borderRadius: radius.md,
          cursor: "pointer",
          transition: "background-color 0.16s ease",
          backgroundColor: tone === "cta" ? editorial.cta : editorial.shellRaised,
          color: tone === "cta" ? editorial.onCta : editorial.shellInk,
          "&:hover": {
            backgroundColor: tone === "cta" ? editorial.ctaHover : editorial.shellBorder,
          },
          "& .MuiSvgIcon-root": { fontSize: 19 },
        }}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <Box
            component="span"
            sx={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              px: 0.5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.full,
              backgroundColor: editorial.errorFill,
              color: editorial.onStatus,
              fontSize: 10.5,
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {badge}
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}

function NavList({
  sections,
  screen,
  onPick,
}: {
  sections: PortalNavSection[];
  screen: PortalScreen;
  onPick: (next: PortalScreen) => void;
}) {
  return (
    <Stack sx={{ flex: 1, overflowY: "auto", py: 0.5 }}>
      {sections.map((section) => (
        <Box key={section.id} sx={{ mb: 0.5 }}>
          {section.label && (
            <Typography
              sx={{
                px: 2.5,
                pt: 1.75,
                pb: 0.75,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: editorial.softMuted,
              }}
            >
              {section.label}
            </Typography>
          )}
          {section.items.map((item) => {
            const active = screen === item.screen;
            const Icon = SCREEN_ICON[item.screen];
            return (
              <Box
                key={item.screen}
                component="button"
                type="button"
                title={item.hint}
                aria-current={active ? "page" : undefined}
                onClick={() => onPick(item.screen)}
                sx={{
                  width: "calc(100% - 16px)",
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  mx: 1,
                  px: 1.5,
                  py: 1,
                  border: "none",
                  borderRadius: radius.md,
                  background: active ? editorial.blueWash : "transparent",
                  color: active ? editorial.pmwBlueDark : editorial.ink,
                  font: "inherit",
                  fontWeight: active ? 800 : 600,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background-color 0.14s ease",
                  "&:hover": { background: editorial.blueWash },
                }}
              >
                {Icon && <Icon sx={{ fontSize: 18, flex: "none", opacity: active ? 1 : 0.7 }} />}
                <Box component="span" sx={{ flex: 1, fontSize: 13.5 }}>
                  {item.label}
                </Box>
                {item.count !== null && (
                  <Box
                    component="span"
                    sx={{
                      minWidth: 22,
                      textAlign: "center",
                      px: 0.6,
                      py: 0.15,
                      borderRadius: radius.full,
                      fontSize: 11,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      color: active ? editorial.pmwBlueDark : editorial.muted,
                      backgroundColor: active ? editorial.pmwBlueSoft : editorial.neutralWash,
                    }}
                  >
                    {item.count}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * The workspace frame: a dark bar across the top, an icon rail down the side,
 * and the page in the light well between them.
 *
 * The bar is dark in every contrast theme. It is the frame the workspace sits
 * in, and a frame that inverts with the page stops reading as a frame — which is
 * also why the account, the alerts and the one CTA live on it rather than in the
 * page: they belong to the session, not to whatever screen is open.
 *
 * The rail is icons only and appears from `md` up; the drawer behind the
 * hamburger still carries every destination with its words and its count, at
 * every width. An icon rail on its own is a memory test.
 */
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
    onSignOut,
  } = usePortal();
  const [navOpen, setNavOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);

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
  const railItems = sections.flatMap((section) => section.items).filter((item) => SCREEN_ICON[item.screen]);

  const pick = (next: PortalScreen) => {
    setScreen(next);
    setNavOpen(false);
    setProfileAnchor(null);
  };

  const avatarSx = {
    bgcolor: editorial.pmwBlueSoft,
    color: editorial.pmwBlueDark,
    fontWeight: 800,
  } as const;

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        // A column flex container sizes to its widest child, so without this a
        // single wide row would stretch the shell — and the page — past the
        // viewport rather than scrolling inside its own box.
        maxWidth: "100%",
        overflowX: "clip",
        background: editorial.appSurface,
        color: editorial.ink,
      }}
    >
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.75, sm: 1.25 },
          px: { xs: 1.25, sm: 2 },
          py: 1,
          position: "sticky",
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          backgroundColor: editorial.shell,
          color: editorial.shellInk,
        }}
      >
        <ShellButton label="Open portal sections" onClick={() => setNavOpen(true)}>
          <MenuIcon />
        </ShellButton>

        {/* The wordmark is the way back to Home, which is the page that shows
            every other one — so the shortest route out of anywhere is a click
            on the name of the app. */}
        <Box
          component="button"
          type="button"
          onClick={() => pick("home")}
          sx={{
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            textAlign: "left",
            border: "none",
            background: "transparent",
            font: "inherit",
            color: "inherit",
            px: 0.5,
            py: 0.5,
            cursor: "pointer",
            "&:hover .portal-wordmark": { opacity: 0.75 },
          }}
        >
          <Typography
            className="portal-wordmark"
            sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.01em", transition: "opacity 0.16s ease" }}
            noWrap
          >
            PMW OSHE
          </Typography>
          <Box
            component="span"
            sx={{
              display: { xs: "none", md: "inline-flex" },
              alignItems: "center",
              height: 18,
              pl: 1.25,
              borderLeft: `1px solid ${editorial.shellBorder}`,
              fontSize: 12.5,
              fontWeight: 600,
              color: editorial.shellMuted,
              whiteSpace: "nowrap",
            }}
          >
            {roleLabel(role)}
          </Box>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* The one action that is about the session rather than the open screen. */}
        {access.canFile && (
          <ShellButton label="File a form" tone="cta" onClick={() => pick("file")}>
            <NoteAddOutlinedIcon />
          </ShellButton>
        )}

        {queue.length > 0 && screen !== "queue" && (
          <ShellButton label={`${queue.length} waiting on you`} onClick={() => pick("queue")} badge={queue.length}>
            <PendingActionsOutlinedIcon />
          </ShellButton>
        )}

        <Box
          component="button"
          type="button"
          onClick={(event) => setProfileAnchor(event.currentTarget)}
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
            border: `1px solid ${editorial.shellBorder}`,
            borderRadius: radius.full,
            background: profileOpen ? editorial.shellRaised : "transparent",
            font: "inherit",
            color: "inherit",
            cursor: "pointer",
            transition: "background-color 0.16s ease",
            "&:hover": { background: editorial.shellRaised },
          }}
        >
          <Avatar sx={{ ...avatarSx, width: 30, height: 30, fontSize: 12 }}>{initials}</Avatar>
          <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 0, textAlign: "left" }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: editorial.shellInk }} noWrap>
              {displayed}
            </Typography>
            <Typography sx={{ fontSize: 11, lineHeight: 1.25, color: editorial.shellMuted }} noWrap>
              {access.readOnly ? "Read only" : roleLabel(role)}
            </Typography>
          </Box>
          <ExpandMoreIcon sx={{ display: { xs: "none", lg: "block" }, fontSize: 18, color: editorial.shellMuted }} />
        </Box>
      </Box>

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

      <Drawer
        id="portal-nav"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        slotProps={{ paper: { sx: { width: DRAWER_WIDTH, display: "flex", flexDirection: "column" } } }}
      >
        <Box component="nav" aria-label="Portal sections" sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2, pb: 1.75 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 17, fontWeight: 800 }}>PMW OSHE</Typography>
              <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }} noWrap>
                {roleLabel(role)}
              </Typography>
            </Box>
            <IconButton onClick={() => setNavOpen(false)} aria-label="Close portal sections" size="small">
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Stack>

          <NavList sections={sections} screen={screen} onPick={pick} />

          {/* Separated from the nav above because it leaves this app. Opening a
              new tab is the honest signal: the builder is a shared tool writing
              to the OSHE site, not a page of this portal. */}
          {access.canManageCatalogue && builder && (
            <Box sx={{ p: 2.5, borderTop: editorialHairline }}>
              <Button
                component="a"
                href={builder}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="small"
                fullWidth
                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                sx={{ minHeight: 36 }}
              >
                Form builder
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>

      <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
        <Box
          component="nav"
          aria-label="Quick navigation"
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            flex: "none",
            width: RAIL_WIDTH,
            py: 2,
            backgroundColor: editorial.panel,
            borderRight: editorialHairline,
            position: "sticky",
            top: 54,
            alignSelf: "flex-start",
            maxHeight: "calc(100dvh - 54px)",
            overflowY: "auto",
          }}
        >
          {railItems.map((item) => {
            const Icon = SCREEN_ICON[item.screen]!;
            const active = screen === item.screen;
            return (
              <Tooltip key={item.screen} title={item.label} placement="right" enterDelay={300}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => pick(item.screen)}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    p: 0,
                    border: "none",
                    borderRadius: radius.md,
                    cursor: "pointer",
                    backgroundColor: active ? editorial.pmwBlue : "transparent",
                    color: active ? editorial.white : editorial.muted,
                    transition: "background-color 0.16s ease, color 0.16s ease",
                    "&:hover": {
                      backgroundColor: active ? editorial.pmwBlue : editorial.blueWash,
                      color: active ? editorial.white : editorial.pmwBlueDark,
                    },
                    "& .MuiSvgIcon-root": { fontSize: 21 },
                  }}
                >
                  <Icon />
                  {/* The count rides the glyph, because the rail has no room for
                      a word and a number that is never shown is a number nobody
                      acts on. */}
                  {item.count !== null && item.count > 0 && item.screen === "queue" && (
                    <Box
                      component="span"
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 8,
                        height: 8,
                        borderRadius: radius.full,
                        backgroundColor: editorial.errorFill,
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            );
          })}

          <Box sx={{ flex: 1 }} />
          <Tooltip title="Privacy notice" placement="right" enterDelay={300}>
            <Box
              component="a"
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Privacy notice"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: radius.md,
                color: editorial.muted,
                textDecoration: "none",
                "&:hover": { backgroundColor: editorial.blueWash, color: editorial.pmwBlueDark },
              }}
            >
              <HelpOutlineIcon sx={{ fontSize: 21 }} />
            </Box>
          </Tooltip>
        </Box>

        <Box
          component="main"
          sx={{
            flex: 1,
            width: "100%",
            maxWidth: CONTENT_MAX_WIDTH,
            mx: "auto",
            p: { xs: 2, md: 3.5 },
            minWidth: 0,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
