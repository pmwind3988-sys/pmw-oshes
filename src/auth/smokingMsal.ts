import { PublicClientApplication } from "@azure/msal-browser";

/**
 * The smoking page's own Microsoft sign-in, kept apart from the portal's.
 *
 * It only needs an ID token to hand to /api/smoking once; the server then
 * issues the smoking pass. Held in memory, it is gone when the tab closes and
 * never lands in the localStorage cache the portal reads, so signing in to log
 * a break never signs anyone in to OSHES. The portal still asks them to sign in
 * there, under its usual rules.
 */
let instance: Promise<PublicClientApplication> | null = null;

export function smokingMsal(): Promise<PublicClientApplication> {
  instance ??= (async () => {
    const app = new PublicClientApplication({
      auth: {
        clientId: import.meta.env.VITE_AZURE_CLIENT_ID as string,
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "memoryStorage" },
    });
    await app.initialize();
    return app;
  })();
  return instance;
}
