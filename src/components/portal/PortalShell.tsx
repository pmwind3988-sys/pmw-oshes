import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Divider, Menu, MenuItem, Stack, Typography } from "@mui/material";
import {
  HelpCircle as HelpOutlineIcon,
  LogOut as LogoutIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  Settings as SettingsOutlinedIcon,
  Wrench as BuildOutlinedIcon,
} from "../ui/Icons";
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
 * The bar carries the brand, the top-level tabs (Your work, Submissions and,
 * for those who reach it, Manage), the search, the "Create" button and the
 * account avatar. The avatar opens a small menu holding Account, the form
 * builder link (for catalogue managers), the privacy notice and Sign out.
 *
 * Layout that depends on width (the tabs and search wrapping onto their own
 * rows below 760px) lives in shell.css so first paint is never the wrong layout.
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

/** True when a keystroke is already going somewhere that takes text. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export default function PortalShell({ children }: { children: React.ReactNode }) {
  const { access, role, userName, userEmail, screen, setScreen, queue, submitSearch, onSignOut } = usePortal();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const builder = builderUrl();
  const menuOpen = Boolean(menuAnchor);
  const displayed = userName || userEmail;
  const initials = initialsOf(userName, userEmail);
  const tabs = portalTabs(access, queue.length);

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

  const pick = (next: PortalScreen) => setScreen(next);

  const onSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = draftQuery.trim();
    if (!query) return;
    submitSearch(query);
  };

  const openAccount = () => {
    setMenuAnchor(null);
    pick("settings");
  };

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
            maxWidth: 1280,
            mx: "auto",
            px: { xs: 2, sm: 3 },
            py: 1,
            minHeight: 60,
            boxSizing: "border-box",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 2.5,
            rowGap: 1,
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
                width: 34,
                height: 34,
                boxSizing: "border-box",
                borderRadius: radius.xs,
                bgcolor: SUN,
                border: "2px solid",
                borderColor: "text.primary",
              }}
            >
              <Logo size={18} />
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
                  aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} need you` : undefined}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    minHeight: 60,
                    px: 1.5,
                    boxSizing: "border-box",
                    border: 0,
                    borderBottom: "3px solid",
                    borderBottomColor: active ? "primary.main" : "transparent",
                    bgcolor: "transparent",
                    color: active ? "primary.main" : "text.primary",
                    font: "inherit",
                    fontSize: 14,
                    fontWeight: active ? 800 : 700,
                    cursor: "pointer",
                    "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: -3 },
                  }}
                >
                  {tab.label}
                  {tab.badge > 0 && (
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        minWidth: 20,
                        height: 20,
                        px: 0.75,
                        boxSizing: "border-box",
                        borderRadius: radius.full,
                        bgcolor: "error.main",
                        color: "common.white",
                        fontSize: 11,
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

          <Box
            component="form"
            role="search"
            onSubmit={onSearchSubmit}
            className="shell-search"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              height: 40,
              px: 1.5,
              boxSizing: "border-box",
              bgcolor: "background.default",
              border: "1.5px solid",
              borderColor: "divider",
              borderRadius: radius.xs,
              color: "text.secondary",
              "&:focus-within": { borderColor: "primary.main" },
            }}
          >
            <SearchIcon size={16} />
            <Box
              component="input"
              type="search"
              ref={searchRef}
              value={draftQuery}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraftQuery(event.target.value)}
              placeholder="Search forms or PTW-0417"
              aria-label="Search forms or records"
              sx={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                bgcolor: "transparent",
                font: "inherit",
                fontSize: 13.5,
                fontWeight: 500,
                color: "text.primary",
                "&::placeholder": { color: "text.secondary", opacity: 1 },
              }}
            />
            <Box
              component="kbd"
              aria-hidden="true"
              sx={{
                font: "inherit",
                fontSize: 11,
                fontWeight: 700,
                color: "text.secondary",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: radius.tag,
                px: 0.875,
                lineHeight: "18px",
              }}
            >
              /
            </Box>
          </Box>

          {access.canFile && (
            <Box
              component="button"
              type="button"
              onClick={() => setPickerOpen(true)}
              sx={{
                flex: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.75,
                position: "relative",
                height: 40,
                px: 2,
                border: 0,
                borderRadius: radius.xs,
                bgcolor: "primary.main",
                // Widens the touch target to 44px without changing the visible 40px button.
                "&::before": { content: '""', position: "absolute", inset: -2 },
                color: "primary.contrastText",
                font: "inherit",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                transition: "filter 0.16s ease",
                "&:hover": { filter: "brightness(0.95)" },
                "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
              }}
            >
              <PlusIcon size={16} />
              Create
            </Box>
          )}

          <Box
            component="button"
            type="button"
            onClick={(event: React.MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
            aria-label={`Account options for ${displayed}`}
            aria-haspopup="menu"
            aria-controls={menuOpen ? "portal-account-menu" : undefined}
            aria-expanded={menuOpen}
            sx={{
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              p: 0,
              border: 0,
              borderRadius: radius.xs,
              bgcolor: "transparent",
              cursor: "pointer",
              "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: SUN,
                color: "text.primary",
                border: "2px solid",
                borderColor: "text.primary",
                fontSize: 12.5,
                fontWeight: 800,
              }}
            >
              {initials}
            </Avatar>
          </Box>
        </Box>

        <Menu
          id="portal-account-menu"
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 340, borderRadius: radius.sm } } }}
        >
          {/* The identity is stated once, in full, before any action — so signing
              out is never done from a guess about which account this is. */}
          <Stack direction="row" spacing={1.5} sx={{ px: 2, pt: 1.75, pb: 1.5, alignItems: "center" }}>
            <Avatar sx={{ width: 40, height: 40, fontSize: 14.5, bgcolor: SUN, color: "text.primary", border: "2px solid", borderColor: "text.primary", fontWeight: 800 }}>
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
          <MenuItem onClick={openAccount} sx={{ gap: 1.25, fontSize: 13.5, fontWeight: 700 }}>
            <SettingsOutlinedIcon fontSize="small" />
            Account
          </MenuItem>
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
