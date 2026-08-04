/**
 * WorkspaceLayout.tsx — page chrome for the approval, evaluation and response
 * routes.
 *
 * These flows are the pmw-hrform workflow verbatim: same layers, same statuses,
 * same actions. What differs here is presentation — they wear the PMW Editorial
 * system the rest of this app uses (MUI theme, `editorial` tokens, 14px panels
 * on a pale blue ground) instead of the standalone grey chrome they arrived in.
 * Anything visual these routes need in common belongs in this file so the three
 * of them cannot drift apart again.
 */
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { editorial, editorialHairline } from "../../theme/editorial";
import { workspacePanelSx } from "./workspaceStyles";

interface WorkspaceHeaderProps {
  /** Small uppercase line above the title — names the workspace, not the page. */
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Signed-in account, rendered as identity rather than as a status banner. */
  account?: string;
  onSignOut?: () => void;
  actions?: React.ReactNode;
}

/**
 * Title block. The signed-in account sits here as quiet metadata — hrform
 * announced it in a green "Signed in" banner above the page, which spent the
 * success colour on something that is never news.
 */
export function WorkspaceHeader({ eyebrow, title, subtitle, account, onSignOut, actions }: WorkspaceHeaderProps) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{ mb: 3, alignItems: { md: "flex-end" }, justifyContent: "space-between" }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.06em", color: editorial.pmwBlueDark, mb: 0.5 }}
        >
          {eyebrow.toUpperCase()}
        </Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 28, md: 34 }, fontWeight: 800, lineHeight: 1.1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.75, maxWidth: 620 }}>{subtitle}</Typography>
        )}
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        {actions}
        {account && (
          <Box sx={{ textAlign: { md: "right" }, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: editorial.muted }}>Signed in as</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700 }} noWrap>
              {account}
            </Typography>
          </Box>
        )}
        {onSignOut && (
          <Button variant="outlined" size="small" onClick={onSignOut} sx={{ minHeight: 36 }}>
            Sign out
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

interface WorkspacePageProps {
  maxWidth?: "md" | "lg" | "xl";
  children: React.ReactNode;
}

/** Content column. The route wrapper in `App.tsx` already paints the ground. */
export function WorkspacePage({ maxWidth = "lg", children }: WorkspacePageProps) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, md: 3 } }}>
      {children}
    </Container>
  );
}

interface WorkspaceNoticeProps {
  icon?: React.ReactNode;
  title: string;
  message?: React.ReactNode;
  /** Warning tone for permission walls, plain ink for waiting states. */
  tone?: "neutral" | "error";
  action?: React.ReactNode;
}

/**
 * Whole-page state: loading, signed out, access denied. One component so the
 * three routes cannot each invent their own version of "you may not be here".
 */
export function WorkspaceNotice({ icon, title, message, tone = "neutral", action }: WorkspaceNoticeProps) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Box sx={{ ...workspacePanelSx, p: { xs: 4, md: 5 }, maxWidth: 460, width: "100%", textAlign: "center" }}>
        {icon && (
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
              backgroundColor: tone === "error" ? "rgba(198, 40, 40, 0.08)" : editorial.blueWash,
              color: tone === "error" ? editorial.error : editorial.pmwBlueDark,
            }}
          >
            {icon}
          </Box>
        )}
        <Typography sx={{ fontSize: 20, fontWeight: 800, color: tone === "error" ? editorial.error : editorial.ink }}>
          {title}
        </Typography>
        {message && (
          <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 1, lineHeight: 1.6 }}>{message}</Typography>
        )}
        {action && <Box sx={{ mt: 3 }}>{action}</Box>}
      </Box>
    </Box>
  );
}

/** Header strip of a panel — the label plus a right-aligned count or hint. */
export function WorkspacePanelHeader({ label, hint }: { label: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.5,
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: editorialHairline,
        backgroundColor: editorial.blueSoft,
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 800, color: editorial.pmwBlueDark }}>{label}</Typography>
      {hint && <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }}>{hint}</Typography>}
    </Stack>
  );
}

/**
 * Filter pill. Square MUI buttons are for actions; a filter is a state toggle,
 * so it keeps the 999px pill shape the portal uses for the same job.
 */
export function WorkspacePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      sx={{
        minHeight: 34,
        px: 2,
        borderRadius: "999px",
        border: `1px solid ${active ? editorial.pmwBlue : editorial.border}`,
        backgroundColor: active ? editorial.pmwBlue : editorial.panel,
        color: active ? editorial.white : editorial.muted,
        font: "inherit",
        fontSize: 12.5,
        fontWeight: 800,
        cursor: "pointer",
        transition: "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
        "&:hover": {
          borderColor: editorial.pmwBlue,
          backgroundColor: active ? editorial.pmwBlueDark : editorial.blueWash,
          color: active ? editorial.white : editorial.pmwBlueDark,
        },
      }}
    >
      {children}
    </Box>
  );
}

const TONE_STYLES = {
  neutral: { bg: editorial.paperSoft, fg: editorial.muted },
  info: { bg: editorial.blueWash, fg: editorial.pmwBlueDark },
  success: { bg: "rgba(16, 124, 16, 0.10)", fg: editorial.success },
  warning: { bg: editorial.yellowSoft, fg: editorial.warning },
  error: { bg: "rgba(198, 40, 40, 0.10)", fg: editorial.error },
} as const;

export type WorkspaceTone = keyof typeof TONE_STYLES;

/** Small status pill. Weight carries severity too, so it survives greyscale. */
export function WorkspaceTag({
  tone = "neutral",
  title,
  children,
}: {
  tone?: WorkspaceTone;
  title?: string;
  children: React.ReactNode;
}) {
  const style = TONE_STYLES[tone];
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: 1,
        py: 0.25,
        borderRadius: "999px",
        fontSize: 10.5,
        fontWeight: 800,
        backgroundColor: style.bg,
        color: style.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}
