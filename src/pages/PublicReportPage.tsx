import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { editorial, editorialHairline } from "../theme/editorial";
import QuickReportForm from "../components/portal/QuickReportForm";
import { usePortalDraft } from "../hooks/usePortalDraft";
import { submitQuickReport } from "../utils/portalSubmit";
import { formatClockTime } from "../utils/portalTime";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY as string | undefined;

const riseIn = keyframes`
  from { transform: translateY(6px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

/**
 * The flow is strictly linear. There is no stage picker: you get to the
 * confirmation by filing a valid report, and to tracking from the confirmation
 * or the sign-in screen — never by jumping.
 */
type Stage = "qr" | "form" | "done" | "trackEntry" | "track";

const STAGE_LABEL: Record<Stage, string> = {
  qr: "Step 1 of 3 · choose a form",
  form: "Step 2 of 3 · no sign-in needed",
  done: "Step 3 of 3 · keep the reference",
  trackEntry: "Tracking",
  track: "Tracking",
};

interface PublicForm {
  listTitle: string;
  slug: string;
  code: string;
  name: string;
  layerCount: number;
  severityCapture: string;
}

interface TrackStep {
  label: string;
  when: string;
  done: boolean;
}

function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
  };
}

function Shell({ stage, children, onExit }: { stage: Stage; children: React.ReactNode; onExit: () => void }) {
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: editorial.skySoft, py: { xs: 2, md: 4 }, px: 2 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ maxWidth: 430, mx: "auto", alignItems: "center", justifyContent: "space-between", mb: 2 }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>PMW OSHES</Typography>
        <Typography sx={{ fontSize: 11, color: editorial.muted }}>{STAGE_LABEL[stage]}</Typography>
        <Button onClick={onExit} sx={{ minHeight: 44, color: editorial.muted, px: 1 }}>
          Exit
        </Button>
      </Stack>

      <Box
        key={stage}
        sx={{
          maxWidth: 430,
          mx: "auto",
          backgroundColor: editorial.panel,
          border: editorialHairline,
          borderRadius: "14px",
          p: 2.5,
          animation: `${riseIn} 160ms ease-out`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default function PublicReportPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const posterCode = params.get("poster") ?? "";
  const posterLocation = params.get("location") ?? "";

  const [stage, setStage] = useState<Stage>(() => (pathname === "/track" ? "trackEntry" : "qr"));
  const [forms, setForms] = useState<PublicForm[]>([]);
  const [formsLoaded, setFormsLoaded] = useState(false);
  const [formsError, setFormsError] = useState("");
  const [picked, setPicked] = useState<PublicForm | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [emailGiven, setEmailGiven] = useState("");

  const [trackInput, setTrackInput] = useState("");
  const [trackError, setTrackError] = useState("");
  const [tracked, setTracked] = useState<{ reference: string; subject: string; steps: TrackStep[] } | null>(null);

  const { draft, setField, reset, savedLabel } = usePortalDraft(
    picked?.listTitle ?? "public",
    posterLocation ? { location: posterLocation } : undefined,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/public-forms", { headers: apiHeaders() });
        const data = (await response.json().catch(() => ({}))) as { forms?: PublicForm[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data.forms)) {
          throw new Error(data.error || "Could not load the form list.");
        }
        setForms(data.forms);
        setFormsLoaded(true);
      } catch (error) {
        if (!cancelled) setFormsError(error instanceof Error ? error.message : "Could not load the form list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = useCallback(() => navigate("/"), [navigate]);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      const result = await submitQuickReport({ listTitle: picked.listTitle, surveyJson: null, draft });
      const stamp = new Date();
      setReference(`${picked.code}-${String(stamp.getFullYear() % 100).padStart(2, "0")}${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(Number(result.id) || 0).padStart(4, "0")}`);
      setReceivedAt(formatClockTime(stamp));
      setEmailGiven(draft.email.trim());
      reset();
      setStage("done");
    } catch (error) {
      setFormsError(error instanceof Error ? error.message : "Could not file the report.");
    } finally {
      setSubmitting(false);
    }
  };

  const lookUp = async () => {
    const wanted = trackInput.trim().toUpperCase();
    if (!wanted) return;
    setTrackError("");
    try {
      const response = await fetch(`/api/track?reference=${encodeURIComponent(wanted)}`, { headers: apiHeaders() });
      const data = (await response.json().catch(() => ({}))) as {
        reference?: string;
        subject?: string;
        steps?: TrackStep[];
        error?: string;
      };
      if (!response.ok) {
        setTrackError(data.error || "No report with that reference. Check the letters and dashes.");
        return;
      }
      setTracked({ reference: data.reference ?? wanted, subject: data.subject ?? "", steps: data.steps ?? [] });
      setStage("track");
    } catch {
      setTrackError("Could not look that up right now. Please try again.");
    }
  };

  if (stage === "qr") {
    return (
      <Shell stage={stage} onExit={exit}>
        {posterCode && (
          <Typography sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: editorial.pmwBlueDark, fontWeight: 800 }}>
            Poster scanned · code {posterCode}
          </Typography>
        )}
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, mt: 0.5 }}>
          {posterLocation || "Report something"}
        </Typography>
        <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.5 }}>
          {posterLocation ? "PMW Port Klang · location filled in for you" : "PMW Port Klang · tell us where it happened"}
        </Typography>

        <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 3, mb: 1 }}>What are you reporting?</Typography>

        {formsError && (
          <Typography sx={{ fontSize: 12, color: editorial.error, mb: 1 }}>{formsError}</Typography>
        )}

        {forms.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: editorial.muted }}>
            {formsError
              ? "You can still report this by phone — call the duty safety officer."
              : formsLoaded
                ? "No form can be filed from a poster yet. Call the duty safety officer instead."
                : "Loading the form list…"}
          </Typography>
        ) : (
          <Stack>
            {forms.map((form, index) => (
              <Box
                key={form.listTitle}
                component="button"
                type="button"
                onClick={() => {
                  setPicked(form);
                  setStage("form");
                }}
                sx={{
                  minHeight: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  px: 1.5,
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderTop: index === 0 ? "none" : editorialHairline,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  "&:hover": { background: editorial.blueWash },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{form.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>
                    {form.severityCapture === "required" ? "Severity is asked · " : ""}
                    {form.layerCount} approval layer{form.layerCount === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Typography sx={{ color: editorial.muted, flex: "none" }}>→</Typography>
              </Box>
            ))}
          </Stack>
        )}

        <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 3, pt: 2, borderTop: editorialHairline }}>
          A poster can encode one specific form and skip this step. Anything urgent — call 999 first, then file.
        </Typography>
      </Shell>
    );
  }

  if (stage === "form" && picked) {
    return (
      <Shell stage={stage} onExit={exit}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
          <Button onClick={() => setStage("qr")} sx={{ color: editorial.muted, px: 0, minWidth: 0, minHeight: 44 }}>
            ← Change form
          </Button>
          <Typography sx={{ fontSize: 11, color: editorial.muted }}>{savedLabel}</Typography>
        </Stack>

        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, mb: 2 }}>
          {picked.name}
        </Typography>

        {formsError && (
          <Typography sx={{ fontSize: 12, color: editorial.error, mb: 1.5 }}>{formsError}</Typography>
        )}

        <QuickReportForm
          draft={draft}
          setField={setField}
          askSeverity={picked.severityCapture !== "none"}
          askIdentity
          submitLabel="Submit report"
          submitting={submitting}
          onSubmit={() => void submit()}
          footnote="Saved on this device as you type, so a dropped signal at the jetty does not lose the entry."
        />
      </Shell>
    );
  }

  if (stage === "done") {
    return (
      <Shell stage={stage} onExit={exit}>
        <Typography sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: editorial.pmwBlueDark, fontWeight: 800 }}>
          Received {receivedAt}
        </Typography>
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, mt: 0.5 }}>
          Your report is with the safety team.
        </Typography>

        <Box sx={{ border: editorialHairline, borderRadius: "12px", p: 2, my: 3, textAlign: "center" }}>
          <Typography sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: editorial.muted, fontWeight: 800 }}>
            Reference — photograph this
          </Typography>
          <Typography sx={{ fontSize: 34, fontWeight: 700, mt: 1, fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>
            {reference}
          </Typography>
        </Box>

        <Stack spacing={1}>
          <Button
            variant="outlined"
            onClick={() => window.print()}
            sx={{ minHeight: 44, width: "100%" }}
          >
            Download a PDF of what you sent
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setTrackInput(reference);
              void lookUp();
            }}
            sx={{ minHeight: 44, width: "100%" }}
          >
            Track this report
          </Button>
        </Stack>

        <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 2.5 }}>
          {emailGiven
            ? `A copy is on its way to ${emailGiven}.`
            : "You did not leave an email, so the reference above is the only way back in — photograph it."}
        </Typography>
      </Shell>
    );
  }

  if (stage === "track" && tracked) {
    return (
      <Shell stage={stage} onExit={exit}>
        <Typography sx={{ fontSize: 11, color: editorial.muted, fontWeight: 700 }}>{tracked.reference}</Typography>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, mt: 0.5, mb: 2.5 }}>
          {tracked.subject || "Your report"}
        </Typography>

        <Stack>
          {tracked.steps.map((step, index) => {
            const last = index === tracked.steps.length - 1;
            return (
              <Stack key={`${step.label}-${index}`} direction="row" spacing={1.5} sx={{ alignItems: "stretch" }}>
                <Stack sx={{ alignItems: "center", flex: "none", width: 12 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      mt: 0.5,
                      border: `1px solid ${step.done ? editorial.pmwBlue : editorial.border}`,
                      backgroundColor: step.done ? editorial.pmwBlue : "transparent",
                    }}
                  />
                  {!last && <Box sx={{ flex: 1, width: "1px", backgroundColor: editorial.border, my: 0.5 }} />}
                </Stack>
                <Box sx={{ pb: last ? 0 : 2 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: step.done ? editorial.ink : editorial.muted }}>
                    {step.label}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: editorial.muted }}>{step.when}</Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>

        <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 3, pt: 2, borderTop: editorialHairline }}>
          Only the stage is public — approver names are not shown here.
        </Typography>
      </Shell>
    );
  }

  return (
    <Shell stage="trackEntry" onExit={exit}>
      <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
        Track a report
      </Typography>
      <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5, mb: 2.5 }}>
        Enter the reference you were given. No sign-in, and no names of approvers are shown.
      </Typography>

      <TextField
        label="Reference"
        placeholder="INC-2607-0142"
        value={trackInput}
        onChange={(event) => {
          setTrackInput(event.target.value);
          setTrackError("");
        }}
        fullWidth
      />

      {trackError && (
        <Typography sx={{ fontSize: 12, color: editorial.error, mt: 1 }}>{trackError}</Typography>
      )}

      <Button variant="contained" onClick={() => void lookUp()} sx={{ minHeight: 48, width: "100%", mt: 2 }}>
        Look it up
      </Button>
    </Shell>
  );
}
