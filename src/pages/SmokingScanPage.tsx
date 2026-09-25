import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { smokingMsal } from "../auth/smokingMsal";
import Logo from "../components/Logo";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  QrCode,
  type IconComponent,
} from "../components/ui/Icons";
import { editorial, editorialShadow } from "../theme/editorial";
import { panelSx, radius, sunkenSx } from "../theme/surfaces";
import {
  callSmoking,
  clearStoredPass,
  readStoredPass,
  SmokingApiError,
  storePass,
  type ScanOutcome,
  type SignInResult,
} from "../utils/smoking/api";
import { loadGoogleIdentity, renderGoogleButton } from "../utils/smoking/googleSignIn";
import { describeOutcome, type OutcomeView } from "../utils/smoking/outcome";
import { checkPoster } from "../utils/smoking/poster";
import type { SmokingProfile } from "../utils/smoking/schema";
import { PDPA_CONSENT_LABEL, PDPA_SUMMARY } from "../utils/pdpa";

type Stage = "checking" | "loading" | "signin" | "profile" | "home" | "result" | "error";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * How each result reads at arm's length, outdoors. Every tone carries its own
 * glyph as well as its hue, so IN and OUT still differ on a cracked screen in
 * sunlight or to someone who cannot tell green from blue.
 */
const TONE: Record<OutcomeView["tone"], { ink: string; fill: string; wash: string; icon: IconComponent }> = {
  in: { ink: editorial.success, fill: editorial.successFill, wash: editorial.successWash, icon: LogIn },
  out: { ink: editorial.pmwBlueDark, fill: editorial.pmwBlue, wash: editorial.blueWash, icon: LogOut },
  info: { ink: editorial.ink, fill: editorial.muted, wash: editorial.neutralWash, icon: Clock },
  warn: { ink: editorial.warning, fill: editorial.warningFill, wash: editorial.warningWash, icon: AlertTriangle },
};

const riseIn = keyframes`
  from { transform: translateY(6px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

/** The primary action's size: a glove-sized target, per DESIGN.md's public QR flow. */
const TAP = { minHeight: 48 } as const;

interface ProfileDraft {
  fullName: string;
  department: string;
  position: string;
  staffId: string;
  company: string;
}

/** Microsoft's four-square mark, as its sign-in branding asks. Its colours are Microsoft's, not a theme's. */
function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function Heading({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, textWrap: "balance", ...sx }}>
      {children}
    </Typography>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 15, color: editorial.muted, lineHeight: 1.55, mt: 1 }}>{children}</Typography>;
}

/** A wait the smoker can see: a spinner and the one thing being done, announced to screen readers. */
function Pending({ label }: { label: string }) {
  return (
    <Stack role="status" aria-live="polite" sx={{ alignItems: "center", justifyContent: "center", gap: 2, minHeight: 200 }}>
      <CircularProgress size={32} thickness={4} sx={{ color: editorial.pmwBlue }} />
      <Typography sx={{ fontSize: 15, color: editorial.muted }}>{label}</Typography>
    </Stack>
  );
}

/**
 * The page a smoking-area poster opens, and the smoking log's front door.
 *
 * From a poster (`/smoke?area=CODE`) the poster is checked first: a retired or
 * unknown one says so before anyone is asked to sign in. A live one asks for a
 * sign-in once and a profile once, then every scan is IN or OUT — the server
 * decides which.
 *
 * Opened directly (`/smoke`) there is nothing to record: the page signs the
 * smoker in, takes their profile, and tells them to scan a poster to start.
 */
export default function SmokingScanPage() {
  const [params] = useSearchParams();
  const areaCode = (params.get("area") ?? "").trim().toUpperCase();
  const [stage, setStage] = useState<Stage>(() => {
    if (areaCode) return "checking";
    return readStoredPass() ? "loading" : "signin";
  });
  const [areaName, setAreaName] = useState("");
  const [posterOpen, setPosterOpen] = useState(false);
  const [homeName, setHomeName] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<OutcomeView | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ fullName: "", department: "", position: "", staffId: "", company: "PMW" });
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentsFromList, setDepartmentsFromList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const previous = document.title;
    document.title = "Smoking log · PMW OSHES";
    return () => {
      document.title = previous;
    };
  }, []);

  /** The server refused because OSHES turned this person's access off. Never a retryable failure. */
  const showBlocked = useCallback(() => {
    setView(describeOutcome({ result: "blocked" }));
    setBlocked(true);
    setStage("result");
  }, []);

  const fail = useCallback((e: unknown) => {
    if (e instanceof SmokingApiError && e.code === "signin-required") {
      setStage("signin");
      return;
    }
    if (e instanceof SmokingApiError && e.code === "blocked") {
      showBlocked();
      return;
    }
    setError(e instanceof Error ? e.message : "Something went wrong.");
    setStage("error");
  }, [showBlocked]);

  const openProfile = useCallback(async (profile: SmokingProfile | null, nameHint = "") => {
    const list = await callSmoking<{ departments: string[]; fromList: boolean }>("departments");
    setDepartments(list.departments);
    setDepartmentsFromList(list.fromList);
    setDraft({
      fullName: profile?.fullName || nameHint,
      department: profile?.department ?? "",
      position: profile?.position ?? "",
      staffId: profile?.staffId ?? "",
      company: profile?.company || "PMW",
    });
    setStage("profile");
  }, []);

  const goHome = useCallback((fullName: string) => {
    setHomeName(fullName);
    setStage("home");
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    setStage("loading");
    try {
      const outcome = await callSmoking<ScanOutcome>("scan", { areaCode });
      if (outcome.result === "no-profile") {
        await openProfile(null);
        return;
      }
      setBlocked(false);
      setView(describeOutcome(outcome));
      setStage("result");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [areaCode, fail, openProfile]);

  /** Opened without a poster: confirm the saved pass still holds, then greet or ask for a profile. */
  const loadHome = useCallback(async () => {
    try {
      const { profile } = await callSmoking<{ profile: SmokingProfile | null }>("profile-get");
      if (profile) goHome(profile.fullName);
      else await openProfile(null);
    } catch (e) {
      fail(e);
    }
  }, [fail, goHome, openProfile]);

  /** Opened from a poster: a retired poster says so before anyone is asked to sign in. */
  const checkThenScan = useCallback(async () => {
    try {
      const poster = await checkPoster(areaCode);
      if (poster.kind === "retired") {
        setView(describeOutcome({ result: "retired-area" }));
        setStage("result");
        return;
      }
      setAreaName(poster.name);
      setPosterOpen(true);
      if (readStoredPass()) await scan();
      else setStage("signin");
    } catch (e) {
      fail(e);
    }
  }, [areaCode, fail, scan]);

  const afterSignIn = useCallback(async (provider: "google" | "microsoft", idToken: string) => {
    try {
      const result = await callSmoking<SignInResult>("signin", { provider, idToken });
      storePass(result.pass);
      if (!result.profile) await openProfile(null, result.name);
      else if (areaCode) await scan();
      else goHome(result.profile.fullName);
    } catch (e) {
      if (e instanceof SmokingApiError && e.code === "blocked") {
        showBlocked();
        return;
      }
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setStage("signin");
    }
  }, [areaCode, goHome, openProfile, scan, showBlocked]);

  // Once per page load, whichever way the smoker came in. The first stage was
  // already set to match, so neither call needs to set it again.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = areaCode ? checkThenScan : readStoredPass() ? loadHome : null;
    if (start) void start();
  }, [areaCode, checkThenScan, loadHome]);

  /** "Try again" repeats whatever failed: the poster check, the scan, or loading the home screen. */
  const retry = () => {
    setError("");
    if (!areaCode) {
      setStage("loading");
      void loadHome();
    } else if (posterOpen) {
      void scan();
    } else {
      setStage("checking");
      void checkThenScan();
    }
  };

  // Google's button needs the element on screen before it can draw into it.
  useEffect(() => {
    if (stage !== "signin" || !googleButton.current || !GOOGLE_CLIENT_ID) return;
    loadGoogleIdentity()
      .then(() => renderGoogleButton(googleButton.current!, GOOGLE_CLIENT_ID, (t) => void afterSignIn("google", t)))
      .catch((e: Error) => setError(e.message));
  }, [stage, afterSignIn]);

  const signInMicrosoft = async () => {
    setError("");
    setMicrosoftBusy(true);
    try {
      // Its own in-memory sign-in, never the portal's: see smokingMsal.ts.
      const msal = await smokingMsal();
      const result = await msal.loginPopup({ scopes: ["openid", "profile", "email"], prompt: "select_account" });
      await afterSignIn("microsoft", result.idToken);
    } catch {
      setError("Microsoft sign-in was cancelled or blocked.");
    } finally {
      setMicrosoftBusy(false);
    }
  };

  const saveProfile = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!required || !pdpaAccepted || busy) return;
    setBusy(true);
    setError("");
    try {
      await callSmoking("profile-save", { ...draft, departmentFromList: departmentsFromList });
      // An edit only saves: going back must not record a second scan. A first
      // registration from a poster records the scan that brought them here.
      if (editingProfile) {
        setEditingProfile(false);
        if (areaCode) setStage("result");
        else goHome(draft.fullName);
      } else if (areaCode) {
        await scan();
      } else {
        goHome(draft.fullName);
      }
    } catch (e) {
      if (e instanceof SmokingApiError && e.code === "blocked") {
        showBlocked();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  /** Leave an edit unsaved and go back to the screen it was opened from. */
  const cancelEdit = () => {
    setEditingProfile(false);
    setError("");
    setStage(areaCode ? "result" : "home");
  };

  const editProfile = () => {
    callSmoking<{ profile: SmokingProfile | null }>("profile-get")
      .then(({ profile }) => {
        setEditingProfile(Boolean(profile));
        return openProfile(profile);
      })
      .catch(fail);
  };

  const signOut = () => {
    clearStoredPass();
    setError("");
    setStage("signin");
  };

  const accountLinks = (
    <Stack
      sx={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 1,
        mt: 3,
        pt: 1.5,
        borderTop: `1px solid ${editorial.border}`,
        mx: { xs: -1, sm: -1.5 },
      }}
    >
      <Button onClick={editProfile} startIcon={<Pencil size={16} />} sx={{ minHeight: 44, px: 1.5, color: editorial.pmwBlueDark }}>
        Edit my profile
      </Button>
      <Button onClick={signOut} sx={{ minHeight: 44, px: 1.5, color: editorial.muted }}>
        Not you? Sign out
      </Button>
    </Stack>
  );

  const required = draft.fullName.trim() && draft.department.trim() && draft.position.trim();
  const tone = view ? TONE[view.tone] : null;
  const ToneIcon = blocked ? Ban : tone?.icon;

  const pendingLabel = stage === "checking"
    ? "Checking this poster…"
    : areaCode ? "Recording your scan…" : "Loading…";

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        backgroundColor: editorial.skySoft,
        px: 2,
        pt: { xs: 2, sm: 5 },
        pb: 4,
        "& ::selection": { backgroundColor: editorial.pmwBlueSoft, color: editorial.ink },
      }}
    >
      <Box sx={{ maxWidth: 440, mx: "auto" }}>
        <Stack component="header" sx={{ flexDirection: "row", alignItems: "center", gap: 1.5, mb: 2, px: 0.5 }}>
          <Logo size={32} alt="PMW" />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>Smoking log</Typography>
            {areaCode && areaName ? (
              <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 0.5, color: editorial.muted }}>
                <MapPin size={13} style={{ flex: "none" }} />
                <Typography noWrap sx={{ fontSize: 13, color: "inherit", lineHeight: 1.35 }}>{areaName}</Typography>
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13, color: editorial.muted, lineHeight: 1.35 }}>PMW OSHES</Typography>
            )}
          </Box>
        </Stack>

        <Box
          component="main"
          key={stage}
          sx={{
            ...panelSx,
            boxShadow: editorialShadow,
            p: { xs: 2.5, sm: 3.5 },
            animation: `${riseIn} 180ms cubic-bezier(0.16, 1, 0.3, 1)`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          {error && stage !== "error" && stage !== "profile" && (
            <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>
          )}

          {(stage === "checking" || stage === "loading") && <Pending label={pendingLabel} />}

          {stage === "signin" && (
            <>
              <Heading>{areaCode ? "Sign in to record your break" : "Sign in to the smoking log"}</Heading>
              <Lede>
                {areaCode
                  ? "You only do this once on this phone. After that, scanning the poster records your break straight away."
                  : "Sign in once on this phone, then scan the QR poster at your smoking area."}
              </Lede>
              <Stack sx={{ alignItems: "center", gap: 2, mt: 3 }}>
                {GOOGLE_CLIENT_ID ? (
                  <Box ref={googleButton} sx={{ minHeight: 44, display: "flex", justifyContent: "center", width: "100%" }} />
                ) : (
                  <Alert severity="warning" sx={{ width: "100%" }}>Google sign-in is not set up yet. Tell OSHES.</Alert>
                )}
                <Divider flexItem sx={{ fontSize: 13, color: editorial.muted }}>or</Divider>
                <Button
                  variant="outlined"
                  onClick={() => void signInMicrosoft()}
                  disabled={microsoftBusy}
                  startIcon={microsoftBusy ? <CircularProgress size={16} thickness={5} color="inherit" /> : <MicrosoftMark />}
                  sx={{
                    ...TAP,
                    width: "100%",
                    maxWidth: 300,
                    color: editorial.ink,
                    borderColor: editorial.border,
                    backgroundColor: editorial.panel,
                    "&:hover": { borderColor: editorial.ink, backgroundColor: editorial.paper },
                  }}
                >
                  {microsoftBusy ? "Waiting for Microsoft…" : "Sign in with PMW Microsoft"}
                </Button>
              </Stack>
            </>
          )}

          {stage === "profile" && (
            <Box component="form" noValidate onSubmit={(e: FormEvent) => void saveProfile(e)}>
              <Heading>{editingProfile ? "Edit your profile" : "About you"}</Heading>
              <Lede>
                {editingProfile
                  ? "Saving only updates your details. It does not record a scan."
                  : "OSHES uses this to put a name to each break. You only fill it in once."}
              </Lede>
              <Stack sx={{ gap: 2, mt: 3 }}>
                <TextField label="Full name" required autoComplete="name" value={draft.fullName}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
                {departmentsFromList ? (
                  <Autocomplete options={departments} value={draft.department || null}
                    onChange={(_, value) => setDraft({ ...draft, department: value ?? "" })}
                    renderInput={(p) => <TextField {...p} label="Department" required />} />
                ) : (
                  <TextField label="Department" required helperText="The department list is unavailable — type yours."
                    value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
                )}
                <TextField label="Position" required autoComplete="organization-title" value={draft.position}
                  onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
                <TextField label="Staff ID (optional)" value={draft.staffId}
                  onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} />
                <TextField label="Company" required autoComplete="organization" value={draft.company}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
                <Box sx={{ ...sunkenSx, p: 1.5, pl: 0.5 }}>
                  <FormControlLabel
                    sx={{ alignItems: "flex-start", m: 0 }}
                    control={
                      <Checkbox checked={pdpaAccepted} onChange={(e) => setPdpaAccepted(e.target.checked)} sx={{ mt: -0.75 }} />
                    }
                    label={
                      <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.6 }}>
                        <Box component="strong" sx={{ color: editorial.ink }}>{PDPA_CONSENT_LABEL}</Box>
                        <br />
                        {PDPA_SUMMARY}{" "}
                        <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                          View Privacy Notice
                        </Link>
                      </Typography>
                    }
                  />
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!required || !pdpaAccepted || busy}
                  startIcon={busy ? <CircularProgress size={16} thickness={5} color="inherit" /> : undefined}
                  sx={TAP}
                >
                  {busy ? "Saving…" : editingProfile || !areaCode ? "Save" : "Save and record this scan"}
                </Button>
                {!required || !pdpaAccepted ? (
                  <Typography sx={{ fontSize: 13, color: editorial.muted, textAlign: "center", mt: -1 }}>
                    {!required ? "Fill in the fields marked *, then tick the consent box." : "Tick the consent box to continue."}
                  </Typography>
                ) : null}
                {editingProfile && (
                  <Button onClick={cancelEdit} disabled={busy} sx={{ ...TAP, color: editorial.muted }}>
                    Cancel
                  </Button>
                )}
              </Stack>
            </Box>
          )}

          {stage === "home" && (
            <>
              <Heading>{homeName ? `You're signed in, ${homeName}.` : "You're signed in."}</Heading>
              <Stack sx={{ ...sunkenSx, flexDirection: "row", alignItems: "center", gap: 2, p: 2, mt: 3 }}>
                <Box
                  sx={{
                    flex: "none",
                    display: "grid",
                    placeItems: "center",
                    width: 52,
                    height: 52,
                    borderRadius: radius.md,
                    backgroundColor: editorial.blueWash,
                    color: editorial.pmwBlueDark,
                  }}
                >
                  <QrCode size={28} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>
                  To start, scan the QR poster at your smoking area with your phone camera.
                </Typography>
              </Stack>
              {accountLinks}
            </>
          )}

          {stage === "result" && view && tone && ToneIcon && (
            <>
              <Stack
                role="status"
                aria-live="polite"
                sx={{
                  alignItems: "center",
                  textAlign: "center",
                  gap: 1.5,
                  px: 2,
                  py: 3.5,
                  borderRadius: radius.base,
                  backgroundColor: tone.wash,
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 64,
                    height: 64,
                    borderRadius: radius.full,
                    backgroundColor: tone.fill,
                    color: editorial.onStatus,
                    boxShadow: `0 6px 16px color-mix(in srgb, ${tone.fill} 28%, transparent)`,
                  }}
                >
                  <ToneIcon size={30} />
                </Box>
                <Heading
                  sx={{
                    fontSize: view.tone === "in" || view.tone === "out" ? 44 : 26,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: tone.ink,
                    fontVariantNumeric: "tabular-nums",
                    mt: 0.5,
                  }}
                >
                  {view.headline}
                </Heading>
                <Typography sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.45, maxWidth: "32ch" }}>{view.detail}</Typography>
              </Stack>

              {view.note && (
                <Stack
                  sx={{
                    flexDirection: "row",
                    gap: 1.25,
                    mt: 2,
                    p: 1.5,
                    borderRadius: radius.base,
                    border: `1px solid color-mix(in srgb, ${editorial.warning} 35%, transparent)`,
                    backgroundColor: editorial.warningWash,
                  }}
                >
                  <AlertCircle size={18} style={{ flex: "none", color: editorial.warning, marginTop: 2 }} />
                  <Typography sx={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>{view.note}</Typography>
                </Stack>
              )}

              {view.hint && (
                <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1, mt: 2, color: editorial.muted }}>
                  <QrCode size={16} style={{ flex: "none" }} />
                  <Typography sx={{ fontSize: 14, color: "inherit" }}>{view.hint}</Typography>
                </Stack>
              )}

              {/* Only someone signed in has a profile to edit or an account to leave. */}
              {!blocked && readStoredPass() && accountLinks}
            </>
          )}

          {stage === "error" && (
            <Stack role="alert" sx={{ alignItems: "center", textAlign: "center", gap: 1.5, py: 2 }}>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 56,
                  height: 56,
                  borderRadius: radius.full,
                  backgroundColor: editorial.errorWash,
                  color: editorial.error,
                }}
              >
                <AlertCircle size={28} />
              </Box>
              <Heading>That didn't go through</Heading>
              <Typography sx={{ fontSize: 15, color: editorial.muted, lineHeight: 1.55, maxWidth: "34ch" }}>{error}</Typography>
              <Button
                variant="contained"
                size="large"
                disabled={busy}
                onClick={retry}
                sx={{ ...TAP, width: "100%", mt: 1.5 }}
              >
                Try again
              </Button>
            </Stack>
          )}
        </Box>

        <Typography component="footer" sx={{ fontSize: 12.5, color: editorial.muted, textAlign: "center", mt: 2.5 }}>
          PMW OSHES ·{" "}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" sx={{ color: "inherit" }}>
            Privacy notice
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
