import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Buffer } from "buffer";
if (typeof globalThis !== "undefined") {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}

// ── Required env var validation ─────────────────────────────────────────
const REQUIRED_VITE_VARS = ["VITE_AZURE_CLIENT_ID", "VITE_AZURE_TENANT_ID", "VITE_SP_SITE_URL"] as const;
const missing = REQUIRED_VITE_VARS.filter((name) => !import.meta.env[name]);
if (missing.length > 0) {
  const msg = `PMW OSHES Forms: Missing required environment variables: ${missing.join(", ")}. Check .env.local or .env.`;
  document.body.textContent = msg;
  throw new Error(msg);
}

import { msalInstance } from "./auth/msalConfig";
import AuthProvider from "./auth/AuthProvider";
import type { AuthenticationResult } from "@azure/msal-browser";
import "./index.css";
import App from "./App";

function setActiveAccount(result: AuthenticationResult | null): void {
  if (result?.account) {
    msalInstance.setActiveAccount(result.account);
    return;
  }

  const activeAccount = msalInstance.getActiveAccount();
  if (activeAccount) return;

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 1) {
    msalInstance.setActiveAccount(accounts[0]);
  }
}

async function initializeMsal() {
  try {
    await msalInstance.initialize();
  } catch {
    return;
  }

  // Handle any redirect response from previous auth flow
  // Cap at 3s so a hung redirect never blocks app render
  try {
    const redirectPromise = msalInstance
      .handleRedirectPromise()
      .then((result) => {
        setActiveAccount(result);
      })
      .catch(() => undefined);

    await Promise.race([
      redirectPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    setActiveAccount(null);
  } catch {
    // no_token_request_cache_error is expected in private/incognito windows
    // where localStorage is restricted or cleared between redirects
  }
}

initializeMsal().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
