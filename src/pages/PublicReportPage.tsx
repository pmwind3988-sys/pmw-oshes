import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { editorial, editorialHairline } from "../theme/editorial";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY as string | undefined;

const riseIn = keyframes`
  from { transform: translateY(6px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

/**
 * Two things happen here and nothing else: choosing which public form to file,
 * and looking one up by reference. Filling a form in is not one of them —
 * that belongs to the published form itself, at /form/{slug}.
 *
 * This page used to render a built-in five-question report for whichever form
 * you picked, and post it by guessing which of that form's columns the five
 * answers belonged in. The form named at the top and the form actually being
 * filled in were two different things, and only the questions the built-in
 * one happened to ask were ever collected.
 */
type Stage = "qr" | "trackEntry" | "track";

const STAGE_LABEL: Record<Stage, string> = {
  qr: "Choose a form",
  trackEntry: "Tracking",
  track: "Tracking",
};

interface PublicForm {
  listTitle: string;
  slug: string;
  code: string;
  name: string;
  /** Zero is a real answer: plenty of these forms are records, not requests. */
  layerCount: number;
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
    <Box sx={{ minHeight: "100dvh", backgroundColor: editorial.skySoft, py: { xs: 2, md: 4 }, px: 2 }}>
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

  const [trackInput, setTrackInput] = useState("");
  const [trackError, setTrackError] = useState("");
  const [tracked, setTracked] = useState<{ reference: string; subject: string; steps: TrackStep[] } | null>(null);

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

  /**
   * Hand off to the published form. The poster's location rides along as a
   * query parameter; the form page resolves it against its own schema, because
   * only the form knows what it calls that field.
   */
  const openForm = useCallback(
    (form: PublicForm) => {
      const params = new URLSearchParams();
      if (posterLocation) params.set("location", posterLocation);
      if (posterCode) params.set("poster", posterCode);
      const query = params.toString();
      navigate(`/form/${encodeURIComponent(form.slug)}${query ? `?${query}` : ""}`);
    },
    [navigate, posterCode, posterLocation],
  );

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
            {forms.filter((form) => form.slug).map((form, index) => (
              <Box
                key={form.listTitle}
                component="button"
                type="button"
                onClick={() => openForm(form)}
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
                    {form.layerCount === 0
                      ? "no approval step"
                      : `${form.layerCount} approval layer${form.layerCount === 1 ? "" : "s"}`}
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
