import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Skeleton, Stack, TextField, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { editorial, editorialShadow } from "../theme/editorial";
import { FileText, Search, WifiOff } from "../components/ui/Icons";

const API_KEY = import.meta.env.VITE_API_SECRET_KEY as string | undefined;

const riseIn = keyframes`
  from { transform: translateY(6px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

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
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: editorial.ink }}>PMW OSHES</Typography>
        <Typography sx={{ fontSize: 12, color: editorial.muted }}>{STAGE_LABEL[stage]}</Typography>
        <Button onClick={onExit} sx={{ minHeight: 44, color: editorial.muted, px: 1.5, borderRadius: 999 }}>
          Exit
        </Button>
      </Stack>

      <Box
        key={stage}
        sx={{
          maxWidth: 430,
          mx: "auto",
          backgroundColor: editorial.panel,
          boxShadow: editorialShadow,
          borderRadius: "32px",
          p: { xs: 2.5, sm: 3 },
          animation: `${riseIn} 160ms ease-out`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** A round, tinted glyph: the one picture an empty or error state carries. */
function RoundIcon({ tone, children }: { tone: "blue" | "amber"; children: React.ReactNode }) {
  const colours = tone === "blue"
    ? { bg: editorial.pmwBlueSoft, fg: editorial.pmwBlueDark }
    : { bg: editorial.warningWash, fg: editorial.warning };
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: "grid",
        placeItems: "center",
        width: 112,
        height: 112,
        mx: "auto",
        mb: 2,
        borderRadius: 999,
        backgroundColor: colours.bg,
        color: colours.fg,
      }}
    >
      {children}
    </Box>
  );
}

/** The pill-shaped reference search, shared by the entry screen. */
const PILL_FIELD = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 999,
    backgroundColor: editorial.neutralWash,
    "& fieldset": { border: "none" },
  },
  "& input": { fontFamily: MONO, fontWeight: 600, letterSpacing: "0.02em" },
} as const;

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

  // A printed permit's QR code opens /track?ref=<reference>, so the reference
  // arrives filled in and is looked up without anyone typing it.
  const linkedReference = pathname === "/track" ? (params.get("ref") ?? "").trim() : "";
  const [trackInput, setTrackInput] = useState(linkedReference);
  const [trackError, setTrackError] = useState("");
  const [looking, setLooking] = useState(false);
  const [tracked, setTracked] = useState<{ reference: string; subject: string; steps: TrackStep[] } | null>(null);

  /** Loads the public form list. Also the "Try again" action, so a failed load is never a dead end. */
  const loadForms = useCallback(async () => {
    setFormsError("");
    try {
      const response = await fetch("/api/public-forms", { headers: apiHeaders() });
      const data = (await response.json().catch(() => ({}))) as { forms?: PublicForm[]; error?: string };
      if (!response.ok || !Array.isArray(data.forms)) {
        throw new Error(data.error || "Could not load the form list.");
      }
      setForms(data.forms);
      setFormsLoaded(true);
    } catch (error) {
      setFormsError(error instanceof Error ? error.message : "Could not load the form list.");
    }
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

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

  const lookUp = async (reference: string = trackInput) => {
    const wanted = reference.trim().toUpperCase();
    if (!wanted) return;
    setTrackError("");
    setLooking(true);
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
    } finally {
      setLooking(false);
    }
  };

  const lookedUpLink = useRef(false);
  useEffect(() => {
    if (!linkedReference || lookedUpLink.current) return;
    lookedUpLink.current = true;
    void lookUp(linkedReference);
    // Runs once for the reference the link carried; later lookups are typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedReference]);

  if (stage === "qr") {
    const formCount = forms.filter((form) => form.slug).length;
    return (
      <Shell stage={stage} onExit={exit}>
        {posterCode && (
          <Typography sx={{ fontSize: 11, color: editorial.pmwBlueDark, fontWeight: 700 }}>
            Poster scanned · code {posterCode}
          </Typography>
        )}
        <Typography component="h1" sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, mt: 0.5, color: editorial.ink }}>
          {posterLocation || "Report something"}
        </Typography>
        <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5 }}>
          {posterLocation ? "PMW Port Klang · location filled in for you" : "PMW Port Klang · tell us where it happened"}
        </Typography>

        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, color: editorial.ink, mt: 3, mb: 1.5 }}>
          What are you reporting?
        </Typography>

        {formsError && forms.length === 0 ? (
          <Box
            role="alert"
            sx={{ textAlign: "center", borderRadius: "24px", backgroundColor: editorial.paper, p: 3, mb: 1 }}
          >
            <RoundIcon tone="amber">
              <WifiOff size={44} />
            </RoundIcon>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: editorial.ink }}>
              We couldn't load the form list.
            </Typography>
            <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 1, mb: 2.5 }}>
              You can still report this by phone — call the duty safety officer.
            </Typography>
            <Button
              variant="contained"
              onClick={() => void loadForms()}
              sx={{ minHeight: 48, px: 3.5, borderRadius: 999 }}
            >
              Try again
            </Button>
          </Box>
        ) : formCount === 0 ? (
          <Box
            sx={{ borderRadius: "24px", backgroundColor: editorial.paper, p: 2.5 }}
          >
            <Typography sx={{ fontSize: 13, color: editorial.muted, textAlign: "center" }}>
              {formsLoaded
                ? "No form can be filed from a poster yet. Call the duty safety officer instead."
                : "Loading the form list…"}
            </Typography>
            {!formsLoaded && (
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 1.5 }}>
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} variant="rounded" animation="wave" sx={{ height: 150, borderRadius: "24px" }} />
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, p: 1, borderRadius: "32px", backgroundColor: editorial.paper }}>
            {forms.filter((form) => form.slug).map((form) => (
              <Box
                key={form.listTitle}
                component="button"
                type="button"
                onClick={() => openForm(form)}
                sx={{
                  minHeight: 150,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 1.5,
                  p: 2,
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: "24px",
                  backgroundColor: editorial.panel,
                  boxShadow: "0 1px 3px rgba(22,27,36,.08)",
                  color: "inherit",
                  font: "inherit",
                  transition: "transform 0.12s ease, box-shadow 0.2s ease, background-color 0.2s ease",
                  "&:hover": { boxShadow: "0 1px 3px rgba(22,27,36,.14), 0 6px 16px rgba(22,27,36,.08)" },
                  "&:active": { transform: "scale(.97)" },
                  "&:focus-visible": { outline: "3px solid #9DBDF5", outlineOffset: 2 },
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: editorial.pmwBlueSoft,
                    color: editorial.pmwBlueDark,
                  }}
                >
                  <FileText size={22} />
                </Box>
                <Box sx={{ minWidth: 0, width: "100%" }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: editorial.ink, lineHeight: 1.3 }}>{form.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.5 }}>
                    {form.layerCount === 0
                      ? "no approval step"
                      : `${form.layerCount} approval layer${form.layerCount === 1 ? "" : "s"}`}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Box
          role="note"
          sx={{
            mt: 3,
            borderRadius: "24px",
            backgroundColor: editorial.errorWash,
            color: editorial.error,
            px: 2.25,
            py: 1.75,
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: "inherit" }}>
            Someone hurt? Call 999 first, then file.
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: editorial.muted, mt: 1.5, px: 0.5 }}>
          A poster can encode one specific form and skip this step.
        </Typography>
      </Shell>
    );
  }

  if (stage === "track" && tracked) {
    return (
      <Shell stage={stage} onExit={exit}>
        <Box
          component="span"
          sx={{
            display: "inline-block",
            whiteSpace: "nowrap",
            px: 1.25,
            py: 0.25,
            borderRadius: 999,
            backgroundColor: editorial.neutralWash,
            color: editorial.muted,
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {tracked.reference}
        </Box>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, mt: 1.25, mb: 2.5, color: editorial.ink }}>
          {tracked.subject || "Your report"}
        </Typography>

        <Stack>
          {tracked.steps.map((step, index) => {
            const last = index === tracked.steps.length - 1;
            return (
              <Stack key={`${step.label}-${index}`} direction="row" spacing={1.5} sx={{ alignItems: "stretch" }}>
                <Stack sx={{ alignItems: "center", flex: "none", width: 14 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      mt: 0.6,
                      borderRadius: 999,
                      border: `2px solid ${step.done ? editorial.pmwBlue : editorial.border}`,
                      backgroundColor: step.done ? editorial.pmwBlue : editorial.panel,
                    }}
                  />
                  {!last && <Box sx={{ flex: 1, width: 2, borderRadius: 999, backgroundColor: editorial.border, my: 0.5 }} />}
                </Stack>
                <Box sx={{ pb: last ? 0 : 2.5 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: step.done ? editorial.ink : editorial.muted }}>
                    {step.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: editorial.muted }}>{step.when}</Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>

        <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 3, px: 0.5 }}>
          Only the stage is public — approver names are not shown here.
        </Typography>
      </Shell>
    );
  }

  return (
    <Shell stage="trackEntry" onExit={exit}>
      {!looking && !trackInput.trim() && (
        <RoundIcon tone="blue">
          <Search size={44} />
        </RoundIcon>
      )}
      <Typography component="h1" sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, color: editorial.ink, textAlign: looking ? "left" : "center" }}>
        Track a report
      </Typography>
      <Typography sx={{ fontSize: 13, color: editorial.muted, mt: 0.5, mb: 2.5, textAlign: "center" }}>
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
        onKeyDown={(event) => {
          if (event.key === "Enter") void lookUp();
        }}
        fullWidth
        sx={PILL_FIELD}
      />

      {trackError && (
        <Typography sx={{ fontSize: 12, color: editorial.error, mt: 1, px: 1.5 }}>{trackError}</Typography>
      )}

      {looking ? (
        <Stack role="status" aria-live="polite" sx={{ gap: 1.25, mt: 2.5 }}>
          <Typography sx={{ fontSize: 12, color: editorial.muted, px: 1.5 }}>Looking up your report…</Typography>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" animation="wave" sx={{ height: 44, borderRadius: 999 }} />
          ))}
        </Stack>
      ) : (
        <Button
          variant="contained"
          onClick={() => void lookUp()}
          sx={{ minHeight: 48, width: "100%", mt: 2, borderRadius: 999 }}
        >
          Look it up
        </Button>
      )}
    </Shell>
  );
}
