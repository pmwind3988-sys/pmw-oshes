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
import type { SmokingProfile } from "../utils/smoking/schema";
import { PDPA_CONSENT_LABEL, PDPA_SUMMARY } from "../utils/pdpa";

type Stage = "loading" | "signin" | "profile" | "result" | "error";

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
 * The page a smoking-area poster opens. Sign in once, register once, then every
 * scan is IN or OUT — the server decides which.
 */
export default function SmokingScanPage() {
  const [params] = useSearchParams();
  const areaCode = (params.get("area") ?? "").trim().toUpperCase();
  const [stage, setStage] = useState<Stage>(() => {
    if (!areaCode) return "result";
    return readStoredPass() ? "loading" : "signin";
  });
  const [areaName, setAreaName] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<OutcomeView | null>(areaCode ? null : describeOutcome({ result: "retired-area" }));
  const [draft, setDraft] = useState<ProfileDraft>({ fullName: "", department: "", position: "", staffId: "", company: "PMW" });
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentsFromList, setDepartmentsFromList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const shouldAutoScanRef = useRef(readStoredPass() && areaCode);

  const fail = useCallback((e: unknown) => {
    if (e instanceof SmokingApiError && e.code === "signin-required") {
      setStage("signin");
      return;
    }
    setError(e instanceof Error ? e.message : "Something went wrong.");
    setStage("error");
  }, []);

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

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await callSmoking<ScanOutcome>("scan", { areaCode });
      if (outcome.result === "no-profile") {
        await openProfile(null);
        return;
      }
      setView(describeOutcome(outcome));
      setStage("result");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [areaCode, fail, openProfile]);

  const afterSignIn = useCallback(async (provider: "google" | "microsoft", idToken: string) => {
    try {
      const result = await callSmoking<SignInResult>("signin", { provider, idToken });
      storePass(result.pass);
      if (!result.profile) await openProfile(null, result.name);
      else await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setStage("signin");
    }
  }, [openProfile, scan]);

  // Fetch area header.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!areaCode) return;
    callSmoking<{ name: string; active: boolean }>("area", { code: areaCode })
      .then((area) => setAreaName(area.name))
      .catch(() => setAreaName(""));
  }, [areaCode]);

  // Auto-scan if already signed in.
  useEffect(() => {
    if (initializedRef.current && shouldAutoScanRef.current) {
      void scan();
    }
  }, [scan]);

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
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  const editProfile = () => {
    callSmoking<{ profile: SmokingProfile | null }>("profile-get")
      .then(({ profile }) => openProfile(profile))
      .catch(fail);
  };

  const required = draft.fullName.trim() && draft.department.trim() && draft.position.trim();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", px: 2, py: 4, display: "flex", justifyContent: "center" }}>
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 420 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">OSHES · Smoking log</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{areaName || "Smoking area"}</Typography>
        </Box>

        {error && stage !== "error" && <Alert severity="error">{error}</Alert>}

        {stage === "loading" && <Typography color="text.secondary">Recording…</Typography>}

        {stage === "signin" && (
          <Stack spacing={2} sx={{ alignItems: "center" }}>
            <Typography>Sign in once. After that, just scan.</Typography>
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
              Save and record this scan
            </Button>
          </Stack>
        )}

        {stage === "result" && view && (
          <Stack spacing={2}>
            <Typography sx={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: TONE_COLOR[view.tone] }}>
              {view.headline}
            </Typography>
            <Typography variant="h6">{view.detail}</Typography>
            <Stack sx={{ flexDirection: "row" }} spacing={2}>
              <Link component="button" onClick={editProfile}>Edit my profile</Link>
              <Link component="button" onClick={() => { clearStoredPass(); setStage("signin"); }}>Not you?</Link>
            </Stack>
          </Stack>
        )}

        {stage === "error" && (
          <Stack spacing={2}>
            <Alert severity="error">{error}</Alert>
            <Button variant="contained" size="large" disabled={busy} onClick={() => void scan()}>Try again</Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
