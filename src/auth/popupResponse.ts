/**
 * Whether this page load is Microsoft handing a popup sign-in back.
 *
 * The smoking page signs in through a popup that returns to the site's root.
 * MSAL v5 expects that page to pass the answer to the window that opened it
 * and close; left to itself the root loads the whole portal inside the popup,
 * which shows its own sign-in — the "sign in, then stuck on the sign-in page
 * in the popup" people saw.
 *
 * It is told apart by what MSAL wrote into the `state` it sent Microsoft,
 * which comes back untouched: `{ id, meta: { interactionType } }`, base64url
 * encoded. `window.opener` cannot be used — Microsoft's sign-in pages cut it
 * (Cross-Origin-Opener-Policy), which is why MSAL v5 answers the opener over a
 * BroadcastChannel instead. A redirect sign-in (the portal's) says "redirect"
 * and is left to handleRedirectPromise.
 */
export function isPopupSignInResponse(win: { location: { hash: string; search: string } }): boolean {
  const params = [win.location.hash.replace(/^#/, ""), win.location.search.replace(/^\?/, "")]
    .map((part) => new URLSearchParams(part));
  return params.some((p) => {
    const state = p.get("state");
    if (!state || !(p.has("code") || p.has("error"))) return false;
    const type = interactionTypeOf(state);
    return type === "popup" || type === "silent";
  });
}

function interactionTypeOf(state: string): string | undefined {
  try {
    const libraryState = state.split("|")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(libraryState), (c) => c.charCodeAt(0)));
    return JSON.parse(json)?.meta?.interactionType;
  } catch {
    return undefined;
  }
}
