import {
  AppBar,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Person as PersonIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  PrivacyTip as PrivacyIcon,
  Palette as PaletteIcon,
  OpenInNew as OpenInNewIcon,
  AccountTree as AccountTreeIcon,
} from "@mui/icons-material";
import type { MouseEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleBadge from "./RoleBadge";
import Logo from "../Logo";
import AppearancePicker from "./AppearancePicker";
import { editorial, editorialHairline } from "../../theme/editorial";
import { builderUrl } from "../../config/oshes";

interface HeaderProps {
  userEmail: string;
  isAdmin: boolean;
  /**
   * Whether this account owns the shared form builder. Being an OSHES admin and
   * being allowed to author forms are separate grants — the builder writes to a
   * site this app only reads — so the link is gated on the second, not the first.
   */
  canUseFormBuilder?: boolean;
  onLogout: () => void;
  onSwitch: () => void;
  /**
   * Accepted for parity with pmw-hrform, where the builder is a route inside the
   * app. Here it lives in pmw-hrform, so the menu opens `builderUrl()` instead
   * and this is not called.
   */
  onOpenBuilder?: () => void;
}

export default function Header({
  userEmail,
  isAdmin,
  canUseFormBuilder = false,
  onLogout,
  onSwitch,
}: HeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const builder = builderUrl();
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [mainMenuAnchorEl, setMainMenuAnchorEl] = useState<null | HTMLElement>(null);
  const profileOpen = Boolean(profileAnchorEl);
  const mainMenuOpen = Boolean(mainMenuAnchorEl);
  const menuPaperSx = {
    minWidth: { xs: 230, sm: 260 },
    borderRadius: "12px",
    boxShadow: "0 14px 32px rgba(16, 16, 16, 0.12)",
    border: editorialHairline,
    mt: 1,
  } as const;
  const menuItemSx = { py: 1.25, px: 2.5 } as const;
  const menuIconSx = (color: string) => ({
    mr: 1.5,
    fontSize: 20,
    color,
  });
  const iconButtonSx = {
    borderRadius: "10px",
    color: editorial.pmwBlueDark,
    backgroundColor: editorial.blueWash,
    border: `1px solid ${editorial.pmwBlueSoft}`,
    transition: "background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
    "&:hover": {
      backgroundColor: editorial.pmwBlueSoft,
      borderColor: editorial.pmwBlue,
    },
    "&:active": {
      transform: "scale(0.96)",
    },
    "&:focus-visible": {
      outline: `3px solid ${editorial.pmwBlueSoft}`,
      outlineOffset: 2,
    },
  } as const;

  const handleProfileOpen = (event: MouseEvent<HTMLElement>) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchorEl(null);
  };

  const handleMainMenuOpen = (event: MouseEvent<HTMLElement>) => {
    setMainMenuAnchorEl(event.currentTarget);
  };

  const handleMainMenuClose = () => {
    setMainMenuAnchorEl(null);
  };

  const openAppearancePicker = (closeMenu: () => void) => {
    closeMenu();
    setBgPickerOpen(true);
  };

  const navigateFromMenu = (path: string, closeMenu: () => void) => {
    closeMenu();
    navigate(path);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(18px)",
        borderBottom: editorialHairline,
        boxShadow: "none",
        zIndex: theme.zIndex.drawer + 1,
        minHeight: isMobile ? 56 : isCompact ? 60 : 68,
      }}
    >
      <Toolbar
        sx={{
          gap: { xs: 1, sm: 1.5, md: 2 },
          minHeight: "inherit",
          width: "100%",
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 1.5, sm: 2.5, md: 4 },
        }}
      >
        {/* Brand mark */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.25, md: 1.5 }, minWidth: 0 }}>
          <Logo size={{ xs: 32, sm: 36, md: 42 }} />
          <Stack direction="column" spacing={0}>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 800,
                color: editorial.ink,
                letterSpacing: 0,
                lineHeight: 1.2,
                fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.25rem" },
                whiteSpace: "nowrap",
              }}
            >
              PMW Group
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: editorial.muted,
                textTransform: "uppercase",
                letterSpacing: 0,
                fontSize: "0.7rem",
                fontWeight: 600,
                lineHeight: 1,
                display: { xs: "none", sm: "block" },
              }}
            >
              OSHES Forms
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {isCompact ? (
          <>
            {/* ── Mobile: Single hamburger menu ── */}
            <IconButton
              onClick={handleMainMenuOpen}
              size="small"
              sx={iconButtonSx}
            >
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={mainMenuAnchorEl}
              open={mainMenuOpen}
              onClose={handleMainMenuClose}
              slotProps={{
                paper: {
                  sx: menuPaperSx,
                },
              }}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            >
              {/* 1. Profile */}
              <MenuItem disabled sx={{ cursor: "default", px: 2.5, py: 1.5 }}>
                <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </Typography>
              </MenuItem>

              <Divider sx={{ my: 0.5 }} />

              {/* 2. RoleBadge */}
              <Box sx={{ px: 2.5, py: 1 }}>
                <RoleBadge isAdmin={isAdmin} />
              </Box>

              <Divider sx={{ my: 0.5 }} />

              {/* 3. Privileged items */}
              {isAdmin && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem onClick={() => openAppearancePicker(handleMainMenuClose)} sx={menuItemSx}>
                    <PaletteIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                    <Typography variant="body2">Appearance</Typography>
                  </MenuItem>
                  {builder && (
                    <MenuItem
                      component="a"
                      href={builder}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleMainMenuClose}
                      sx={menuItemSx}
                    >
                      <OpenInNewIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                      <Typography variant="body2">Form builder</Typography>
                    </MenuItem>
                  )}
                </>
              )}

              <Divider sx={{ my: 0.5 }} />

              <MenuItem onClick={() => { handleMainMenuClose(); navigate("/privacy"); }} sx={menuItemSx}>
                <PrivacyIcon sx={menuIconSx(editorial.muted)} />
                <Typography variant="body2">Privacy Notice</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleMainMenuClose(); onSwitch(); }} sx={menuItemSx}>
                <PersonIcon sx={menuIconSx(editorial.muted)} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleMainMenuClose(); onLogout(); }} sx={menuItemSx}>
                <LogoutIcon sx={menuIconSx(editorial.error)} />
                <Typography variant="body2" sx={{ color: editorial.error }}>Sign out</Typography>
              </MenuItem>
            </Menu>
          </>
        ) : (
          <>
            {/* ── Desktop: separate controls ── */}
            <RoleBadge isAdmin={isAdmin} />

            <IconButton
              onClick={handleProfileOpen}
              size="small"
              sx={{
                ml: 0.5,
                p: 0.75,
                borderRadius: "12px",
                backgroundColor: editorial.panel,
                border: `1px solid ${editorial.pmwBlueSoft}`,
                transition: "background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                "&:hover": {
                  backgroundColor: editorial.blueWash,
                  borderColor: editorial.pmwBlue,
                },
                "&:active": {
                  transform: "scale(0.96)",
                },
                "&:focus-visible": {
                  outline: `3px solid ${editorial.pmwBlueSoft}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Box sx={{ width: 32, height: 32, borderRadius: "8px", backgroundColor: editorial.blueWash, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PersonIcon sx={{ fontSize: 18, color: editorial.pmwBlueDark }} />
              </Box>
            </IconButton>

            <Menu
              anchorEl={profileAnchorEl}
              open={profileOpen}
              onClose={handleProfileClose}
              slotProps={{
                paper: {
                  sx: menuPaperSx,
                },
              }}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            >
              <MenuItem disabled sx={{ cursor: "default", px: 2.5, py: 1.5 }}>
                <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </Typography>
              </MenuItem>
              {isAdmin && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <MenuItem onClick={() => openAppearancePicker(handleProfileClose)} sx={menuItemSx}>
                    <PaletteIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                    <Typography variant="body2">Appearance</Typography>
                  </MenuItem>
                  <MenuItem onClick={() => navigateFromMenu("/admin/routing", handleProfileClose)} sx={menuItemSx}>
                    <AccountTreeIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                    <Typography variant="body2">Approval routing</Typography>
                  </MenuItem>
                  {/* Leaves this app: the builder is shared with pmw-hrform and
                      writes to the OSHES site. Same tenant, so SSO is silent.
                      Offered only to accounts that actually own it, so the rest
                      are not sent to a page that will refuse them. */}
                  {builder && canUseFormBuilder && (
                    <MenuItem
                      component="a"
                      href={builder}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleProfileClose}
                      sx={menuItemSx}
                    >
                      <OpenInNewIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                      <Typography variant="body2">Form builder</Typography>
                    </MenuItem>
                  )}
                </>
              )}
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => navigateFromMenu("/privacy", handleProfileClose)} sx={menuItemSx}>
                <PrivacyIcon sx={menuIconSx(editorial.muted)} />
                <Typography variant="body2">Privacy Notice</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleProfileClose(); onSwitch(); }} sx={menuItemSx}>
                <PersonIcon sx={menuIconSx(editorial.muted)} />
                <Typography variant="body2">Switch account</Typography>
              </MenuItem>
              <MenuItem onClick={() => { handleProfileClose(); onLogout(); }} sx={menuItemSx}>
                <LogoutIcon sx={menuIconSx(editorial.error)} />
                <Typography variant="body2" sx={{ color: editorial.error }}>Sign out</Typography>
              </MenuItem>
            </Menu>
          </>
        )}

        <AppearancePicker open={bgPickerOpen} onClose={() => setBgPickerOpen(false)} isAdmin={isAdmin} />
      </Toolbar>
    </AppBar>
  );
}
