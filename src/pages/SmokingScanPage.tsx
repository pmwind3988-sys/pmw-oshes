import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Checkbox, FormControlLabel, Link, Stack, TextField, Typography } from "@mui/material";
import { msalInstance } from "../auth/msalConfig";
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

const TONE_COLOR: Record<OutcomeView["tone"], string> = {
  in: "success.main",
  out: "info.main",
  info: "text.primary",
  warn: "warning.main",
};

interface ProfileDraft {
  fullName: string;
  department: string;
  position: string;
  staffId: string;
  company: string;
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
  const [blocked, setBlocked] = useState(false);
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

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
    try {
      const result = await msalInstance.loginPopup({ scopes: ["openid", "profile", "email"], prompt: "select_account" });
      await afterSignIn("microsoft", result.idToken);
    } catch {
      setError("Microsoft sign-in was cancelled or blocked.");
    }
  };

  const saveProfile = async () => {
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
    <Stack sx={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
      <Link component="button" onClick={editProfile}>Edit my profile</Link>
      <Link component="button" onClick={signOut}>Not you?</Link>
    </Stack>
  );

  const required = draft.fullName.trim() && draft.department.trim() && draft.position.trim();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", px: 2, py: 4, display: "flex", justifyContent: "center" }}>
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 420 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">OSHES · Smoking log</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {areaCode ? areaName || "Smoking area" : "Welcome"}
          </Typography>
        </Box>

        {error && stage !== "error" && <Alert severity="error">{error}</Alert>}

        {stage === "checking" && <Typography color="text.secondary">Checking this poster…</Typography>}

        {stage === "loading" && (
          <Typography color="text.secondary">{areaCode ? "Recording…" : "Loading…"}</Typography>
        )}

        {stage === "signin" && (
          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <Typography>
              {areaCode ? "Sign in once. After that, just scan." : "Sign in once, then scan the poster at your smoking area."}
            </Typography>
            <div ref={googleButton} />
            {!GOOGLE_CLIENT_ID && <Alert severity="warning">Google sign-in is not set up yet. Tell OSHES.</Alert>}
            <Link component="button" onClick={signInMicrosoft} underline="hover">
              Or sign in with a PMW Microsoft account
            </Link>
          </Stack>
        )}

        {stage === "profile" && (
          <Stack spacing={2}>
            <Typography variant="h6">About you</Typography>
            <TextField label="Full name" required value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
            {departmentsFromList ? (
              <Autocomplete options={departments} value={draft.department || null}
                onChange={(_, value) => setDraft({ ...draft, department: value ?? "" })}
                renderInput={(p) => <TextField {...p} label="Department" required />} />
            ) : (
              <TextField label="Department" required helperText="The department list is unavailable — type yours."
                value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            )}
            <TextField label="Position" required value={draft.position}
              onChange={(e) => setDraft({ ...draft, position: e.target.value })} />
            <TextField label="Staff ID" helperText="Optional" value={draft.staffId}
              onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} />
            <TextField label="Company" required value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={pdpaAccepted} onChange={(e) => setPdpaAccepted(e.target.checked)} />}
              label={
                <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.6 }}>
                  <strong>{PDPA_CONSENT_LABEL}</strong>
                  <br />
                  {PDPA_SUMMARY}{" "}
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                    View Privacy Notice
                  </Link>
                </Typography>
              }
            />
            <Button variant="contained" size="large" disabled={!required || !pdpaAccepted || busy} onClick={saveProfile}>
              {editingProfile || !areaCode ? "Save" : "Save and record this scan"}
            </Button>
          </Stack>
        )}

        {stage === "home" && (
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>
              {homeName ? `You're signed in, ${homeName}.` : "You're signed in."}
            </Typography>
            <Typography variant="h6">
              To start, scan the QR poster at your smoking area with your phone camera.
            </Typography>
            {accountLinks}
          </Stack>
        )}

        {stage === "result" && view && (
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: TONE_COLOR[view.tone] }}>
              {view.headline}
            </Typography>
            <Typography variant="h6">{view.detail}</Typography>
            {/* Only someone signed in has a profile to edit or an account to leave. */}
            {!blocked && readStoredPass() && accountLinks}
          </Stack>
        )}

        {stage === "error" && (
          <Stack spacing={2}>
            <Alert severity="error">{error}</Alert>
            <Button variant="contained" size="large" disabled={busy} onClick={retry}>Try again</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
