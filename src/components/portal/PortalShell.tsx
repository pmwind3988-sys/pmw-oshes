import { Box, Button, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { editorial, editorialHairline } from "../../theme/editorial";
import { usePortal } from "../../contexts/PortalContext";
import { portalNav, roleLabel } from "../../utils/portalRole";
import { builderUrl } from "../../config/oshes";

/**
 * Sidebar plus main column. The sidebar carries exactly the items the current
 * role gets, in the order the handoff sets — nothing is hidden behind a
 * permission check at render time, because the role decides the list itself.
 */
export default function PortalShell({ children }: { children: React.ReactNode }) {
  const {
    role,
    userName,
    userTitle,
    userEmail,
    screen,
    setScreen,
    records,
    visibleRecords,
    queue,
    catalogue,
    audit,
    onSignOut,
  } = usePortal();

  const builder = builderUrl();

  const items = portalNav(role, {
    queue: queue.length,
    allRecords: records.length,
    visibleRecords: visibleRecords.length,
    catalogue: catalogue.length,
    audit: audit.length,
  });

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "244px minmax(0, 1fr)" },
        background: editorial.skySoft,
        color: editorial.ink,
      }}
    >
      <Box
        component="nav"
        aria-label="Portal sections"
        sx={{
          borderRight: { md: editorialHairline },
          borderBottom: { xs: editorialHairline, md: "none" },
          backgroundColor: editorial.panel,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          position: { md: "sticky" },
          top: 0,
          alignSelf: "start",
          maxHeight: { md: "100vh" },
        }}
      >
        <Box sx={{ p: 2.5, pb: 2 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>PMW OSHES</Typography>
          <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }}>{roleLabel(role)}</Typography>
        </Box>

        <Stack sx={{ flex: 1, overflowY: "auto" }}>
          {items.map((item) => {
            const active = screen === item.screen;
            return (
              <Box
                key={item.screen}
                component="button"
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setScreen(item.screen)}
                sx={{
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
                    sx={{ fontSize: 11.5, color: editorial.muted, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}
                  >
                    {item.count}
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>

        <Box sx={{ p: 2.5, borderTop: editorialHairline }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }} noWrap>
            {userName || userEmail}
          </Typography>
          <Typography sx={{ fontSize: 11, color: editorial.muted }} noWrap>
            {userTitle || userEmail}
          </Typography>
          <Stack spacing={0.75} sx={{ mt: 1.5 }}>
            {/* Separated from the nav above because it leaves this app. Opening a
                new tab is the honest signal: the builder is a shared tool writing
                to the OSHES site, not a screen of this portal. */}
            {role === "admin" && builder && (
              <Button
                component="a"
                href={builder}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                sx={{ minHeight: 36 }}
              >
                Form builder
              </Button>
            )}
            <Button variant="outlined" size="small" onClick={onSignOut} sx={{ minHeight: 36 }}>
              Sign out
            </Button>
          </Stack>
        </Box>
      </Box>

      <Box component="main" sx={{ p: { xs: 2, md: 4 }, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
