/**
 * TestRunLauncher.tsx — "Test workflow" for one form.
 *
 * Mints a signed test ticket (`mint-test-ticket` on `/api/submit-form`) and
 * opens the form's one route with that ticket in the query string — "Fill in
 * myself" — or with `simulate=1` as well — "Simulate submission" — which has
 * the form fill itself with sample answers and submit once, leaving the tester
 * only the approval or evaluation to do. Every email
 * the run generates is then redirected server-side to the address entered here;
 * once the ticket is minted nothing about the redirect comes from the browser —
 * the server reads it out of the signed ticket, never out of the URL.
 *
 * Only a form builder can mint a ticket; the server checks, this dialog merely
 * asks. Ported from pmw-hrform's builder dialog, where the form builder lives;
 * OSHES has no builder of its own, so it is opened from the dashboard's form
 * cards instead.
 */
import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, TextField, Typography } from "@mui/material";
import { useMsal } from "@azure/msal-react";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { testRunFormUrl, testRunSharePointScope } from "../../utils/testRunLaunch";
import { editorial } from "../../theme/editorial";
import { radius } from "../../theme/surfaces";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface TestRunLauncherProps {
  open: boolean;
  onClose: () => void;
  form: { Title: string; Slug?: string };
}

export default function TestRunLauncher({ open, onClose, form }: TestRunLauncherProps) {
  const { instance, accounts } = useMsal();
  const [email, setEmail] = useState(accounts[0]?.username || "");
  /** Which button started the run in flight, so only that one says "Starting…". */
  const [busy, setBusy] = useState<"" | "fill" | "simulate">("");
  const [error, setError] = useState("");
  const [blockedUrl, setBlockedUrl] = useState("");

  const slug = form.Slug || "";

  const startTestRun = async (simulate: boolean) => {
    setError("");
    setBlockedUrl("");
    if (!slug) {
      setError("This form has no published link yet — publish it before starting a test run.");
      return;
    }
    const testEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(testEmail)) {
      setError("Enter a valid email address to receive the test run.");
      return;
    }
    setBusy(simulate ? "simulate" : "fill");
    try {
      const delegatedToken = await acquireAccessTokenSilentOrRedirect(instance, {
        scopes: [testRunSharePointScope()],
        account: accounts[0],
      });
      const res = await fetch("/api/submit-form", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
        body: JSON.stringify({ action: "mint-test-ticket", slug, testEmail, delegatedToken }),
      });
      const data = await res.json().catch(() => ({})) as { ticket?: string; error?: string };
      if (!res.ok || !data.ticket) {
        setError(data.error || `Could not start a test run (${res.status}).`);
        return;
      }
      // `testEmail` in the URL is only for the banner; the server never reads it.
      const url = `${testRunFormUrl({ slug, ticket: data.ticket, simulate })}&testEmail=${encodeURIComponent(testEmail)}`;
      const popup = window.open(url, "_blank", "noopener");
      if (!popup) {
        // The run is minted and the columns exist — only the new tab failed.
        // Closing here would strand the tester, so hand them the link instead.
        setBlockedUrl(url);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a test run.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onClose={busy !== "" ? undefined : onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: radius.lg } } }}>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>Test workflow</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13.5, color: editorial.muted, lineHeight: 1.55, mb: 2 }}>
          Rehearse &ldquo;{form.Title}&rdquo;&rsquo;s approval workflow. Every email this run sends goes only to the address
          below — no real approver is contacted — and the run stays out of normal submission lists.
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: editorial.muted, lineHeight: 1.55, mb: 2 }}>
          <strong>Simulate submission</strong> fills every question with sample answers and submits for you, so you only
          do the approval or evaluation. <strong>Fill in myself</strong> opens the form pre-filled for you to check first.
        </Typography>
        <TextField
          label="Send all test emails to"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy !== ""}
          size="small"
          fullWidth
        />
        {error && <Alert severity="error" sx={{ mt: 2, borderRadius: radius.sm }}>{error}</Alert>}
        {blockedUrl && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: radius.sm }}>
            The test run started, but your browser blocked the new tab. Open it yourself:{" "}
            <Box component="span" sx={{ wordBreak: "break-all" }}>
              <Link href={blockedUrl} target="_blank" rel="noopener noreferrer">{blockedUrl}</Link>
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={busy !== ""} sx={{ textTransform: "none", fontWeight: 700 }}>Cancel</Button>
        <Button variant="outlined" onClick={() => void startTestRun(false)} disabled={busy !== ""} sx={{ textTransform: "none", fontWeight: 800 }}>
          {busy === "fill" ? "Starting…" : "Fill in myself"}
        </Button>
        <Button variant="contained" onClick={() => void startTestRun(true)} disabled={busy !== ""} sx={{ textTransform: "none", fontWeight: 800 }}>
          {busy === "simulate" ? "Starting…" : "Simulate submission"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
