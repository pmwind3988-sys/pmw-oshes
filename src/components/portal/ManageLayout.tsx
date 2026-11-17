import type { ReactNode } from "react";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { usePortal } from "../../contexts/PortalContext";
import { builderUrl } from "../../config/oshes";
import { TINTS } from "../../theme/simple";
import { radius } from "../../theme/surfaces";
import { ExternalLink, GitBranch, History, LayoutGrid, SmokingRoomsOutlined, Users, Wrench, type IconComponent } from "../ui/Icons";

/** Which Manage page is showing, so the sidebar can mark it. */
export type ManageSection = "overview" | "tests" | "people" | "smoking" | "audit";

/** One row of the sidebar. Every row is in the same 40px hit area; the active one takes the tint. */
const itemSx = {
  display: "flex",
  alignItems: "center",
  gap: 1.25,
  width: "100%",
  minHeight: 40,
  px: 1.25,
  borderRadius: radius.xs,
  border: 0,
  background: "none",
  color: "text.primary",
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 700,
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  "&:hover": { bgcolor: "action.hover" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
} as const;

const activeSx = { bgcolor: TINTS.blue, color: "primary.main", fontWeight: 800, "&:hover": { bgcolor: TINTS.blue } } as const;

/**
 * Manage's left column: the admin tools as a list, with the open one tinted.
 * Stacks above its page under 900px, where a side column would squeeze the
 * tables it sits beside.
 */
export default function ManageLayout({ active, children }: { active: ManageSection; children: ReactNode }) {
  const { access, isAdmin, canRunTestRuns, setScreen, setManageView } = usePortal();
  const builder = builderUrl();

  const row = (
    key: ManageSection,
    label: string,
    Icon: IconComponent,
    onClick: () => void,
  ) => (
    <li key={key}>
      <Box component="button" type="button" onClick={onClick} aria-current={active === key ? "page" : undefined} sx={{ ...itemSx, ...(active === key ? activeSx : {}) }}>
        <Icon size={18} aria-hidden="true" />
        {label}
      </Box>
    </li>
  );

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: { md: "flex-start" }, minWidth: 0 }}>
      <Box
        component="nav"
        aria-label="Manage sections"
        sx={{
          flex: { md: "0 0 240px" },
          width: { xs: "100%", md: 240 },
          bgcolor: "background.paper",
          border: "1.5px solid",
          borderColor: "divider",
          borderRadius: radius.sm,
          p: 1.5,
        }}
      >
        <Typography component="p" sx={{ m: "4px 10px 10px", fontSize: 12, fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Manage
        </Typography>
        <Stack component="ul" spacing={0.25} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {row("overview", "Overview", LayoutGrid, () => setScreen("manage"))}
          {access.canSeePeople && row("people", "People and approvers", Users, () => setScreen("people"))}
          {canRunTestRuns && (
            <li>
              <Box component="a" href="/admin/routing" sx={itemSx}>
                <GitBranch size={18} aria-hidden="true" />
                Approval routing
              </Box>
            </li>
          )}
          {(isAdmin || access.isAuditor) && row("smoking", "Smoking log", SmokingRoomsOutlined, () => setScreen("smoking"))}
          {access.canSeeAudit && row("audit", "History", History, () => setScreen("audit"))}
          {canRunTestRuns && row("tests", "Test runs", Wrench, () => {
            setScreen("manage");
            setManageView("tests");
          })}
        </Stack>

        {builder && access.canManageCatalogue && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box component="a" href={builder} target="_blank" rel="noopener noreferrer" sx={itemSx}>
              <ExternalLink size={18} aria-hidden="true" />
              Form builder
            </Box>
          </>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>{children}</Box>
    </Stack>
  );
}
