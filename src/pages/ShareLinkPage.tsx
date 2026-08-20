import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ForwardToInboxIcon from "@mui/icons-material/ForwardToInbox";
import LinkIcon from "@mui/icons-material/Link";
import { editorial, editorialHairline } from "../theme/editorial";
import { appBaseUrl } from "../config/appBaseUrl";

/**
 * Only ever hand back a link into this app. The `u` parameter arrives from an
 * email, so treating it as trusted would turn this page into a tidy way to
 * dress up someone else's URL in PMW branding.
 *
 * Two origins count as this app: the one being browsed, and the configured one
 * the email was addressed from. They are normally the same string, and differ
 * only when the page is opened somewhere other than where the link was built —
 * a preview deployment, or a local run pointed at production. Accepting both
 * keeps that case working without widening the check to anybody else's host.
 */
function readOwnOriginLink(raw: string | null): string {
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw, window.location.origin);
  } catch {
    return "";
  }
  const ownOrigins = new Set([window.location.origin]);
  try {
    ownOrigins.add(new URL(appBaseUrl()).origin);
  } catch {
    /* A malformed VITE_APP_BASE_URL widens nothing; the current origin still stands. */
  }
  if (!ownOrigins.has(parsed.origin)) return "";
  return parsed.toString();
}

/**
 * The Clipboard API needs a secure context and a permission that some in-app
 * browsers withhold; the selection fallback keeps the button honest there.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* Fall through to the selection-based copy. */
  }
  try {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(scratch);
    return copied;
  } catch {
    return false;
  }
}

export default function ShareLinkPage() {
  const [searchParams] = useSearchParams();
  const reviewLink = useMemo(
    () => readOwnOriginLink(searchParams.get("u")),
    [searchParams],
  );
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(reviewLink);
    setCopied(ok);
    setCopyFailed(!ok);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2600);
  }, [reviewLink]);

  const mailtoHref = useMemo(() => {
    const subject = "Action required: PMW OSHES Forms review link";
    const body = [
      "Hello,",
      "",
      "Please use the link below to review and record your decision on this submission.",
      "It opens without a sign-in, so no PMW OSHES account is needed.",
      "",
      reviewLink,
      "",
      "Thank you.",
    ].join("\r\n");
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [reviewLink]);

  return (
    <Box sx={{ minHeight: "100dvh", py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            borderRadius: "18px",
            overflow: "hidden",
            border: editorialHairline,
            background: editorial.panel,
          }}
        >
          <Box
            sx={{
              px: { xs: 3, md: 4 },
              py: { xs: 2.5, md: 3 },
              borderBottom: editorialHairline,
              background: editorial.blueSoft,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <LinkIcon sx={{ color: editorial.pmwBlue }} />
              <Typography
                variant="overline"
                sx={{ letterSpacing: "0.08em", fontWeight: 800, color: editorial.pmwBlueDark }}
              >
                PMW OSHES Form
              </Typography>
            </Box>
            <Typography sx={{ mt: 0.5, fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: editorial.ink }}>
              Share the review link
            </Typography>
          </Box>

          <Box sx={{ px: { xs: 3, md: 4 }, py: { xs: 3, md: 3.5 } }}>
            {!reviewLink ? (
              <Alert severity="warning" sx={{ borderRadius: "12px" }}>
                This page did not receive a valid PMW OSHES review link. Open the copy button in
                the workflow email again, or copy the link printed in that email by hand.
              </Alert>
            ) : (
              <Stack spacing={2.5}>
                <Typography sx={{ fontSize: 14.5, lineHeight: 1.7, color: editorial.muted }}>
                  Copy this link and send it to the person who has to complete the step. It opens
                  without a sign-in, and whoever completes it is recorded against this workflow layer.
                </Typography>

                <Box
                  sx={{
                    px: 2,
                    py: 1.75,
                    borderRadius: "12px",
                    border: `1px dashed ${editorial.pmwBlueSoft}`,
                    background: editorial.blueWash,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: editorial.pmwBlueDark,
                    wordBreak: "break-all",
                    userSelect: "all",
                  }}
                >
                  {reviewLink}
                </Box>

                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  onClick={handleCopy}
                  startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 800,
                    borderRadius: "12px",
                    py: 1.4,
                    boxShadow: "none",
                    background: copied ? editorial.success : editorial.pmwBlue,
                    "&:hover": {
                      boxShadow: "none",
                      background: copied ? editorial.success : editorial.pmwBlueDark,
                    },
                  }}
                >
                  {copied ? "Link copied" : "Copy review link"}
                </Button>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    fullWidth
                    variant="outlined"
                    href={mailtoHref}
                    startIcon={<ForwardToInboxIcon />}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: "12px" }}
                  >
                    Forward by email
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    href={reviewLink}
                    startIcon={<OpenInNewIcon />}
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: "12px" }}
                  >
                    Open it myself
                  </Button>
                </Stack>

                <Typography sx={{ fontSize: 12.5, lineHeight: 1.7, color: editorial.softMuted }}>
                  Anyone holding this link can complete the step, so share it only with the person
                  who should sign.
                </Typography>
              </Stack>
            )}
          </Box>
        </Paper>
      </Container>

      <Snackbar
        open={copyFailed}
        autoHideDuration={5000}
        onClose={() => setCopyFailed(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setCopyFailed(false)} sx={{ borderRadius: "12px" }}>
          This browser blocked the clipboard. Select the link above and copy it manually.
        </Alert>
      </Snackbar>
    </Box>
  );
}
