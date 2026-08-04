import { useState } from "react";
import { Avatar, Box, Button, Divider, Drawer, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { portalSections, roleLabel } from "../../utils/portalRole";
import { builderUrl } from "../../config/oshes";
import type { PortalNavSection, PortalScreen } from "../../types";

const DRAWER_WIDTH = 288;
const CONTENT_MAX_WIDTH = 1360;

/** Two letters from the display name, or one from the email when there is no name yet. */
function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
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
            return (
              <Box
                key={item.screen}
                component="button"
                type="button"
                title={item.hint}
                aria-current={active ? "page" : undefined}
                onClick={() => onPick(item.screen)}
                sx={{
                  width: "100%",
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2.5,
                  py: 1,
                  border: "none",
                  borderLeft: `2px solid ${active ? editorial.pmwBlue : "transparent"}`,
                  background: active ? editorial.blueWash : "transparent",
                  color: active ? editorial.pmwBlueDark : editorial.ink,
                  font: "inherit",
                  fontWeight: active ? 800 : 600,
                  textAlign: "left",
                  cursor: "pointer",
                  "&:hover": { background: editorial.blueWash },
                }}
              >
                <Box component="span" sx={{ flex: 1, fontSize: 13.5 }}>
                  {item.label}
                </Box>
                {item.count !== null && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: 11.5,
                      color: editorial.muted,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 800,
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
 * One header bar over one page, with the nav behind a hamburger.
 *
 * The sidebar used to be permanent on desktop and a drawer on a phone, which
 * meant two layouts to keep honest and an account block wedged into the bottom
 * of the nav — the one place nobody looks for their own name. Now the nav is a
 * drawer at every width and the account lives where people reach for it: top
 * right, as a profile menu holding the identity, settings and sign out.
 *
 * The drawer still carries every page this account can reach, grouped by whose
 * question each one answers. Sections appear only when the account has
 * something in them, so a submitter sees three items and an administrator nine
 * — without either being on a different app, and without a role switch anywhere.
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
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: editorial.skySoft,
        color: editorial.ink,
      }}
    >
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.75, sm: 1.25 },
          px: { xs: 1.25, sm: 2, md: 2.5 },
          py: 1,
          position: "sticky",
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          backgroundColor: editorial.panel,
          borderBottom: editorialHairline,
        }}
      >
        <IconButton
          onClick={() => setNavOpen(true)}
          aria-label="Open portal sections"
          aria-controls={navOpen ? "portal-nav" : undefined}
          aria-expanded={navOpen}
        >
          <MenuIcon />
        </IconButton>

        {/* The wordmark is the way back to Home, which is the page that shows
            every other one — so the shortest route out of anywhere is a click
            on the name of the app. */}
        <Box
          component="button"
          type="button"
          onClick={() => pick("home")}
          sx={{
            minWidth: 0,
            display: "block",
            textAlign: "left",
            border: "none",
            background: "transparent",
            font: "inherit",
            color: "inherit",
            px: 0.5,
            py: 0.5,
            cursor: "pointer",
            "&:hover .portal-wordmark": { color: editorial.pmwBlueDark },
          }}
        >
          <Typography className="portal-wordmark" sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            PMW OSHES
          </Typography>
          <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {roleLabel(role)}
          </Typography>
        </Box>

        <Box sx={{ flex: 1 }} />

        {queue.length > 0 && screen !== "queue" && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => pick("queue")}
            sx={{ flex: "none", minHeight: 36, px: { xs: 1.25, sm: 1.75 } }}
          >
            {queue.length}
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" }, ml: 0.5 }}>
              to sign
            </Box>
          </Button>
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
            maxWidth: 260,
            pl: 0.5,
            pr: { xs: 0.5, sm: 1 },
            py: 0.5,
            border: editorialHairline,
            borderRadius: "999px",
            background: profileOpen ? editorial.blueWash : editorial.panel,
            font: "inherit",
            color: "inherit",
            cursor: "pointer",
            "&:hover": { background: editorial.blueWash, borderColor: editorial.pmwBlue },
          }}
        >
          <Avatar sx={{ ...avatarSx, width: 32, height: 32, fontSize: 12.5 }}>{initials}</Avatar>
          <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 0, textAlign: "left" }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }} noWrap>
              {displayed}
            </Typography>
            <Typography sx={{ fontSize: 11, color: editorial.muted, lineHeight: 1.25 }} noWrap>
              {access.readOnly ? "Read only" : roleLabel(role)}
            </Typography>
          </Box>
          <ExpandMoreIcon sx={{ display: { xs: "none", sm: "block" }, fontSize: 18, color: editorial.muted }} />
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
                borderRadius: "999px",
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
              <Typography sx={{ fontSize: 17, fontWeight: 700 }}>PMW OSHES</Typography>
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
              to the OSHES site, not a page of this portal. */}
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

      <Box
        component="main"
        sx={{
          flex: 1,
          width: "100%",
          maxWidth: CONTENT_MAX_WIDTH,
          mx: "auto",
          p: { xs: 2, md: 4 },
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
