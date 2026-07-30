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
  Wallpaper as WallpaperIcon,
} from "@mui/icons-material";
import type { MouseEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleBadge from "./RoleBadge";
import Logo from "../Logo";
import BackgroundPicker from "./BackgroundPicker";
import { useDashboardBackground } from "../../hooks/useDashboardBackground";
import { editorial, editorialHairline } from "../../theme/editorial";

interface HeaderProps {
  userEmail: string;
  isAdmin: boolean;
  onLogout: () => void;
  onSwitch: () => void;
}

export default function Header({
  userEmail,
  isAdmin,
  onLogout,
  onSwitch,
}: HeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [mainMenuAnchorEl, setMainMenuAnchorEl] = useState<null | HTMLElement>(null);
  const {
    error: backgroundError,
    loading: backgroundLoading,
    save: saveBackground,
    saving: backgroundSaving,
    setting: backgroundSetting,
  } = useDashboardBackground(isAdmin);
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

  const openDashboardBackgroundPicker = (closeMenu: () => void) => {
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
                  {isAdmin && (
                    <>
                      <MenuItem onClick={() => openDashboardBackgroundPicker(handleMainMenuClose)} sx={menuItemSx}>
                        <WallpaperIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                        <Typography variant="body2">Dashboard Background</Typography>
                      </MenuItem>
                    </>
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
                backgroundColor: editorial.white,
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
                  {isAdmin && (
                    <>
                      <MenuItem onClick={() => openDashboardBackgroundPicker(handleProfileClose)} sx={menuItemSx}>
                        <WallpaperIcon sx={menuIconSx(editorial.pmwBlueDark)} />
                        <Typography variant="body2">Dashboard Background</Typography>
                      </MenuItem>
                    </>
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

        {isAdmin && (
          <BackgroundPicker
            open={bgPickerOpen}
            onClose={() => setBgPickerOpen(false)}
            setting={backgroundSetting}
            loading={backgroundLoading}
            saving={backgroundSaving}
            error={backgroundError}
            onSave={saveBackground}
          />
        )}
      </Toolbar>
    </AppBar>
  );
}
