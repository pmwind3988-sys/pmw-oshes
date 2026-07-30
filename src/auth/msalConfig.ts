import { type Configuration, PublicClientApplication } from "@azure/msal-browser";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

let spScope: string[] = ["openid", "profile"];
try {
  const origin = new URL(SP_SITE_URL).origin;
  spScope = [`${origin}/AllSites.Manage`];
} catch {
  // SP_SITE_URL not configured, fall back to basic sign-in scopes
}

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID as string,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: "localStorage" },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: spScope,
};

export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
};
