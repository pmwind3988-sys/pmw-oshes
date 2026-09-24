/**
 * Whether this page load is Microsoft handing a popup sign-in back.
 *
 * The smoking page signs in through a popup that returns to the site's root.
 * MSAL v5 expects that page to pass the answer to the window that opened it
 * and close; left to itself the root loads the whole portal inside the popup,
 * which shows its own sign-in — the "second sign-in, then stuck" people saw.
 *
 * A redirect sign-in (the portal's) has no opener, so it is never mistaken
 * for one of these.
 */
export function isPopupSignInResponse(win: { opener: unknown; location: { hash: string; search: string } }): boolean {
  if (!win.opener) return false;
  const params = [win.location.hash.replace(/^#/, ""), win.location.search.replace(/^\?/, "")]
    .map((part) => new URLSearchParams(part));
  return params.some((p) => p.has("state") && (p.has("code") || p.has("error")));
}
