import { useState, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import Mascot, { type MascotMood } from "./Mascot";
import { radius } from "../../theme/surfaces";

export interface MessageAction {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Optional mark drawn before the label, such as the Microsoft logo on a sign-in button. */
  icon?: ReactNode;
}

/**
 * A single message with one thing to do: a picture, a title, a sentence and a
 * button. Used for the full-page states (expired link, not found, done) and,
 * with `fullPage={false}`, inside dialogs and lists.
 */
export function MessageCard({
  mood,
  title,
  body,
  primary,
  secondary,
  details,
  fullPage = true,
  role,
}: {
  mood: MascotMood;
  title: string;
  body: ReactNode;
  primary?: MessageAction & { tone?: "primary" | "danger"; disabled?: boolean };
  secondary?: MessageAction;
  details?: string;
  fullPage?: boolean;
  /** "alert" for failures, "status" for neutral notices; announced to screen readers. */
  role?: "alert" | "status";
}) {
  const [showDetails, setShowDetails] = useState(false);

  const card = (
    <Box
      role={role}
      sx={{
        bgcolor: "background.paper",
        borderRadius: radius.xl,
        p: { xs: 3, sm: 4 },
        width: "100%",
        maxWidth: 440,
        mx: "auto",
        textAlign: "center",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Mascot mood={mood} size={128} />
      </Box>
      <Typography
        component={fullPage ? "h1" : "h2"}
        sx={{ mt: 2, fontWeight: 700, fontSize: { xs: 20, sm: 26 }, color: "text.primary", lineHeight: 1.25 }}
      >
        {title}
      </Typography>
      <Typography component="div" sx={{ mt: 1.25, color: "text.secondary", fontSize: 16, lineHeight: 1.5 }}>
        {body}
      </Typography>

      {primary && (
        <Button
          variant="contained"
          color={primary.tone === "danger" ? "error" : "primary"}
          href={primary.href}
          onClick={primary.onClick}
          disabled={primary.disabled}
          startIcon={primary.icon}
          fullWidth
          sx={{ mt: 3, height: 48, borderRadius: radius.full, textTransform: "none", fontWeight: 600, fontSize: 16 }}
        >
          {primary.label}
        </Button>
      )}

      {secondary && (
        <Button
          variant="text"
          href={secondary.href}
          onClick={secondary.onClick}
          sx={{ mt: 1, minHeight: 44, borderRadius: radius.full, textTransform: "none", fontWeight: 600 }}
        >
          {secondary.label}
        </Button>
      )}

      {details && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="text"
            size="small"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((open) => !open)}
            sx={{ minHeight: 44, color: "text.secondary", textTransform: "none", borderRadius: radius.full }}
          >
            {showDetails ? "Hide details" : "Show details"}
          </Button>
          {showDetails && (
            <Typography
              component="pre"
              sx={{
                mt: 1,
                p: 1.5,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 13,
                color: "text.secondary",
                bgcolor: "background.default",
                borderRadius: radius.md,
              }}
            >
              {details}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );

  if (!fullPage) return card;

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "background.default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
      }}
    >
      {card}
    </Box>
  );
}
