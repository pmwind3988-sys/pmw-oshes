/**
 * Old dashboard addresses, mapped onto the portal. Email links sent before the
 * redesign still use these addresses, so they keep working; the redirects are
 * deliberately not admin-gated, because approvers receive the same links.
 *
 * Returns the portal address to send someone to, or null for any other path.
 */
export function legacyRouteTarget(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const form = params.get("form");
  const item = params.get("item");

  if (pathname === "/admin/submissions" || pathname === "/admin/approvals") {
    const parts = ["screen=subs"];
    if (form) parts.push(`form=${encodeURIComponent(form)}`);
    if (form && item) parts.push(`item=${encodeURIComponent(item)}`);
    return `/portal?${parts.join("&")}`;
  }

  const responsesPrefix = "/admin/responses/";
  if (pathname.startsWith(responsesPrefix) && pathname.length > responsesPrefix.length) {
    let formTitle: string;
    try {
      formTitle = decodeURIComponent(pathname.slice(responsesPrefix.length));
    } catch {
      return null;
    }
    return `/portal?screen=subs&form=${encodeURIComponent(formTitle)}`;
  }

  // Approval routing is set on each form's layers in pmw-hrform now.
  if (pathname === "/admin/routing") return "/portal?screen=manage";

  if (pathname === "/admin/dashboard" || pathname === "/user/dashboard" || pathname === "/adminhomepage") {
    return "/portal";
  }

  return null;
}

/** The same mapping for a stored address that carries its query string, such as a sign-in return path. */
export function legacyRouteTargetForPath(path: string): string | null {
  const queryAt = path.indexOf("?");
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const search = queryAt === -1 ? "" : path.slice(queryAt);
  return legacyRouteTarget(pathname, search);
}
