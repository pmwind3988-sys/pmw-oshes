import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type IPublicClientApplication,
  type SilentRequest,
} from "@azure/msal-browser";
import { setStoredAuthDecision } from "./authDecision";

const STALE_AUTH_ERROR_CODES = new Set([
  "interaction_required",
  "login_required",
  "consent_required",
  "bad_token",
  "no_tokens_found",
  "refresh_token_expired",
  "native_account_unavailable",
  "no_account_in_silent_request",
  "no_account_found",
  "token_refresh_required",
  "invalid_grant",
  "monitor_window_timeout",
]);

const SILENT_TOKEN_TIMEOUT_MS = 20000;
const AUTH_TIMEOUT_RELOGIN_ATTEMPT_KEY = "pmw_auth_timeout_relogin_attempted";
export const AUTH_RECOVERY_REQUIRED_EVENT = "pmw:auth-recovery-required";
let redirectStarted = false;

export type AuthRecoveryEventDetail = {
  reason: "protected_resource_unauthorized";
  message: string;
};

function getErrorField(error: unknown, field: string): string {
  if (!error || typeof error !== "object" || !(field in error)) {
    return "";
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function isStaleAuthError(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) {
    return true;
  }

  const errorCode = getErrorField(error, "errorCode") || getErrorField(error, "code");
  const errorName = getErrorField(error, "name");
  const message = getErrorField(error, "message");

  return (
    STALE_AUTH_ERROR_CODES.has(errorCode) ||
    errorName === "interactionrequiredautherror" ||
    message.includes("interaction_required") ||
    message.includes("login_required") ||
    message.includes("refresh token") ||
    message.includes("no account") ||
    message.includes("token refresh")
  );
}

export function isAuthTimeoutError(error: unknown): boolean {
  const errorCode = getErrorField(error, "errorCode") || getErrorField(error, "code");
  const message = getErrorField(error, "message");

  return (
    errorCode === "monitor_window_timeout" ||
    message.includes("silent token acquisition timed out") ||
    message.includes("authentication is taking too long")
  );
}

export function hasAuthTimeoutReloginAttempted(): boolean {
  try {
    return sessionStorage.getItem(AUTH_TIMEOUT_RELOGIN_ATTEMPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAuthTimeoutReloginAttempted(): void {
  try {
    sessionStorage.setItem(AUTH_TIMEOUT_RELOGIN_ATTEMPT_KEY, "1");
  } catch {
    // Storage can be restricted in private browsing.
  }
}

export function clearAuthTimeoutReloginAttempt(): void {
  try {
    sessionStorage.removeItem(AUTH_TIMEOUT_RELOGIN_ATTEMPT_KEY);
  } catch {
    // Storage can be restricted in private browsing.
  }
}

function createAuthTimeoutReloginRequiredError(): Error {
  const error = new Error("The automatic re-login did not finish. Please re-login to refresh your Microsoft 365 session.");
  const authError = error as Error & { errorCode: string; code: string };
  authError.errorCode = "auth_timeout_relogin_required";
  authError.code = "auth_timeout_relogin_required";
  return error;
}

export function isAuthTimeoutReloginRequiredError(error: unknown): boolean {
  const errorCode = getErrorField(error, "errorCode") || getErrorField(error, "code");
  return errorCode === "auth_timeout_relogin_required";
}

export function notifyAuthRecoveryForResponse(response: Pick<Response, "status">): void {
  if (response.status !== 401 || typeof window === "undefined") return;

  const detail: AuthRecoveryEventDetail = {
    reason: "protected_resource_unauthorized",
    message: "Your Microsoft 365 session expired. Reconnecting...",
  };
  window.dispatchEvent(new CustomEvent<AuthRecoveryEventDetail>(AUTH_RECOVERY_REQUIRED_EVENT, { detail }));
}

export async function fetchWithAuthRecovery(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, init);
  if (response.ok) {
    clearAuthTimeoutReloginAttempt();
  } else {
    notifyAuthRecoveryForResponse(response);
  }
  return response;
}

function preserveCurrentRoute(): void {
  try {
    sessionStorage.setItem("pmw_post_login_redirect", window.location.pathname + window.location.search);
    sessionStorage.removeItem("msal.interaction.status");
    sessionStorage.removeItem("msal.login.error");
  } catch {
    // Storage can be restricted in private browsing.
  }
}

function createSilentTokenTimeoutError(): Error {
  const error = new Error("Silent token acquisition timed out. Please sign in again.");
  const authError = error as Error & { errorCode: string; code: string };
  authError.errorCode = "monitor_window_timeout";
  authError.code = "monitor_window_timeout";
  return error;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createSilentTokenTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function clearCachedAuth(instance: IPublicClientApplication, account?: AccountInfo): Promise<void> {
  try {
    instance.setActiveAccount(null);
    await instance.clearCache({ account: account ?? null });
  } catch {
    // If cache cleanup fails, still attempt the interactive sign-in below.
  }
}

export async function startReauthentication(
  instance: IPublicClientApplication,
  scopes: string[],
  account?: AccountInfo,
  forceFresh = false,
): Promise<never> {
  if (redirectStarted) {
    return new Promise<never>(() => undefined);
  }

  redirectStarted = true;
  setStoredAuthDecision("msal");
  preserveCurrentRoute();

  try {
    if (forceFresh) {
      await clearCachedAuth(instance, account);
    }

    await instance.loginRedirect({
      scopes,
      account: forceFresh ? undefined : account,
      loginHint: account?.username,
      prompt: forceFresh ? "login" : undefined,
      redirectStartPage: window.location.href,
    });
  } catch (error) {
    redirectStarted = false;
    throw error;
  }

  return new Promise<never>(() => undefined);
}

export async function startFreshReauthentication(
  instance: IPublicClientApplication,
  scopes: string[],
  account?: AccountInfo,
): Promise<never> {
  return startReauthentication(instance, scopes, account, true);
}

export async function acquireTokenSilentOrRedirect(
  instance: IPublicClientApplication,
  request: SilentRequest,
): Promise<AuthenticationResult> {
  try {
    return await withTimeout(instance.acquireTokenSilent(request), SILENT_TOKEN_TIMEOUT_MS);
  } catch (error) {
    if (isStaleAuthError(error)) {
      if (isAuthTimeoutError(error)) {
        if (hasAuthTimeoutReloginAttempted()) {
          throw createAuthTimeoutReloginRequiredError();
        }
        markAuthTimeoutReloginAttempted();
      }
      return startFreshReauthentication(instance, request.scopes, request.account);
    }
    throw error;
  }
}

export async function acquireAccessTokenSilentOrRedirect(
  instance: IPublicClientApplication,
  request: SilentRequest,
): Promise<string> {
  const response = await acquireTokenSilentOrRedirect(instance, request);
  return response.accessToken;
}
