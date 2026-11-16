import { useState } from "react";
import { Avatar, Box, Divider, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material";
import { Wrench as BuildOutlinedIcon, ChevronDown as ExpandMoreIcon, HelpCircle as HelpOutlineIcon, LogOut as LogoutIcon, Plus as PlusIcon } from "../ui/Icons";
import { editorialHairline } from "../../theme/editorial";
import { SUN } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import { usePortal } from "../../contexts/PortalContext";
import { portalTabs, roleLabel } from "../../utils/portalRole";
import { builderUrl } from "../../config/oshes";
import Logo from "../Logo";
import FormPickerDialog from "./FormPickerDialog";
import type { PortalScreen } from "../../types";
import "../../styles/shell.css";

/**
 * The shell: a white top bar and the screen beneath it.
 *
 * The bar carries the brand, the three top-level tabs (Home, Submissions and,
 * for those who reach it, Manage), the "File a form" button, and the account.
 * The account pill goes to Settings; its small arrow opens a menu holding the
 * form builder link, the privacy notice and Sign out.
 *
 * Below 760px the tabs drop onto their own row under the brand, which is done
 * in shell.css so first paint is never the wrong layout.
 */

/** The pages that sit under the Manage tab, so the tab stays lit while one is open. */
const MANAGE_SCREENS: PortalScreen[] = ["manage", "people", "audit", "smoking"];

/** Two letters from the display name, or one from the email when there is no name yet. */
function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { access, role, userName, userEmail, screen, setScreen, queue, onSignOut } = usePortal();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const builder = builderUrl();
  const menuOpen = Boolean(menuAnchor);
  const displayed = userName || userEmail;
  const initials = initialsOf(userName, userEmail);
  const tabs = portalTabs(access, queue.length);

  const pick = (next: PortalScreen) => setScreen(next);

  return (
    <div className="shell">
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1100,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            maxWidth: 1160,
            mx: "auto",
            px: { xs: 2, sm: 3 },
            py: 1.5,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={() => pick("home")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              minHeight: 44,
              p: 0,
              border: 0,
              bgcolor: "transparent",
              color: "text.primary",
              font: "inherit",
              cursor: "pointer",
              "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Box
              sx={{
                flex: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: radius.full,
                bgcolor: SUN,
                border: "2.5px solid",
                borderColor: "text.primary",
              }}
            >
              <Logo size={22} />
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>OSHES Forms</Typography>
          </Box>

          <nav className="shell-tabs" aria-label="Portal sections">
            {tabs.map((tab) => {
              const active = tab.screen === "manage" ? MANAGE_SCREENS.includes(screen) : screen === tab.screen;
              return (
                <Box
                  key={tab.screen}
                  component="button"
                  type="button"
                  onClick={() => pick(tab.screen)}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 44,
                    px: 2,
                    border: 0,
                    borderRadius: radius.full,
                    bgcolor: active ? "text.primary" : "transparent",
                    color: active ? "background.paper" : "text.primary",
                    font: "inherit",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "background-color 0.16s ease",
                    "&:hover": { bgcolor: active ? "text.primary" : "action.hover" },
                    "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  }}
                >
                  {tab.label}
                  {tab.badge > 0 && (
                    <Box
                      component="span"
                      aria-label={`${tab.badge} waiting`}
                      sx={{
                        minWidth: 20,
                        height: 20,
                        px: 0.75,
                        borderRadius: radius.full,
                        bgcolor: "error.main",
                        color: "common.white",
                        fontSize: 12,
                        fontWeight: 800,
                        lineHeight: "20px",
                        textAlign: "center",
                      }}
                    >
                      {tab.badge}
                    </Box>
                  )}
                </Box>
              );
            })}
          </nav>

          <span className="shell-spacer" />

          {access.canFile && (
            <Box
              component="button"
              type="button"
              onClick={() => setPickerOpen(true)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                minHeight: 44,
                px: 2,
                border: 0,
                borderRadius: radius.full,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                font: "inherit",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                transition: "filter 0.16s ease",
                "&:hover": { filter: "brightness(0.95)" },
                "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
              }}
            >
              <PlusIcon size={18} />
              File a form
            </Box>
          )}

          <Box
            component="button"
            type="button"
            onClick={() => pick("settings")}
            aria-label={`Account: ${displayed}`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              minHeight: 44,
              maxWidth: 260,
              pl: 0.5,
              pr: 1.5,
              border: 0,
              borderRadius: radius.full,
              bgcolor: "background.default",
              color: "text.primary",
              font: "inherit",
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
              "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: SUN,
                color: "text.primary",
                border: "2.5px solid",
                borderColor: "text.primary",
                fontSize: 12.5,
                fontWeight: 800,
              }}
            >
              {initials}
            </Avatar>
            <Typography
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: 14,
                fontWeight: 700,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayed}
            </Typography>
          </Box>

          <Tooltip title="More account options">
            <Box
              component="button"
              type="button"
              onClick={(event: React.MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
              aria-label="Account options"
              aria-haspopup="menu"
              aria-controls={menuOpen ? "portal-account-menu" : undefined}
              aria-expanded={menuOpen}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                flex: "none",
                border: 0,
                borderRadius: radius.full,
                bgcolor: "transparent",
                color: "text.secondary",
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
              }}
            >
              <ExpandMoreIcon size={18} />
            </Box>
          </Tooltip>
        </Box>

        <Menu
          id="portal-account-menu"
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 340, borderRadius: "16px" } } }}
        >
          {/* The identity is stated once, in full, before any action — so signing
              out is never done from a guess about which account this is. */}
          <Stack direction="row" spacing={1.5} sx={{ px: 2, pt: 1.75, pb: 1.5, alignItems: "center" }}>
            <Avatar sx={{ width: 40, height: 40, fontSize: 14.5, bgcolor: SUN, color: "text.primary", border: "2.5px solid", borderColor: "text.primary", fontWeight: 800 }}>
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800 }} noWrap>
                {displayed}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: "text.secondary" }} noWrap>
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
                  color: "text.primary",
                }}
              >
                {access.readOnly ? "Read only" : roleLabel(role)}
              </Box>
            </Box>
          </Stack>
          <Divider />
          {builder && access.canManageCatalogue && (
            <MenuItem
              component="a"
              href={builder}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuAnchor(null)}
              sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}
            >
              <BuildOutlinedIcon fontSize="small" />
              Form builder
            </MenuItem>
          )}
          <MenuItem
            component="a"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuAnchor(null)}
            sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}
          >
            <HelpOutlineIcon fontSize="small" />
            Privacy notice
          </MenuItem>
          <Divider />
          <MenuItem onClick={onSignOut} sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700, color: "error.main" }}>
            <LogoutIcon fontSize="small" />
            Sign out
          </MenuItem>
        </Menu>
      </Box>

      {/* Keyed on the screen so the entrance replays on every navigation rather
          than only on first mount — which is the point of it: it marks that the
          content changed, on a phone where there is no other cue. */}
      <main key={screen} className="shell-body oshes-rise">
        {children}
      </main>

      <FormPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
