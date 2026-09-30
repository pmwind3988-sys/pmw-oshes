/**
 * formBuilderAccess.ts — the server's answer to "may this person author forms?"
 *
 * Mirrors the browser's `resolveFormBuilderAccess` (`src/utils/spConfig.ts`)
 * exactly, because the two must agree: the dashboard only offers "Test workflow"
 * to an account the browser believes is a form builder, and this is what the
 * server then holds that account to.
 *
 *   - `VITE_OSHES_FORM_BUILDER_GROUP` set  → membership of that group.
 *   - blank                               → membership of the admin group
 *                                           (`VITE_OSHES_ADMIN_GROUP`).
 *
 * The `OSHES_`-prefixed names are server-only aliases, matching the convention
 * `dashboard-background.ts` already uses for the admin group.
 *
 * Checked with the caller's DELEGATED SharePoint token, so the answer is the
 * one SharePoint itself gives for that person. Every failure — no group
 * configured, the group missing on the site, SharePoint unreachable — denies.
 */
import { logWarn } from "./logger.js";

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

export function formBuilderGroupName(env: Record<string, string | undefined> = process.env): string {
  const builder = (env.VITE_OSHES_FORM_BUILDER_GROUP || env.OSHES_FORM_BUILDER_GROUP || "").trim();
  if (builder) return builder;
  return (env.VITE_OSHES_ADMIN_GROUP || env.OSHES_ADMIN_GROUP || "").trim();
}

interface SharePointUser {
  Email?: string;
  LoginName?: string;
  UserPrincipalName?: string;
}

export type DelegatedGet = <T>(accessToken: string, path: string) => Promise<T>;

async function delegatedSharePointGet<T>(accessToken: string, path: string): Promise<T> {
  if (!SP_SITE_URL) throw new Error("SharePoint site URL is not configured");
  const response = await fetch(`${SP_SITE_URL}${path}`, {
    headers: {
      Accept: "application/json;odata=nometadata",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`SharePoint GET ${response.status}`);
  return (await response.json()) as T;
}

/** The claim part of `i:0#.f|membership|someone@x.com`, lowercased. */
function loginNameEmail(loginName: string): string {
  const tail = loginName.split("|").pop() || "";
  return tail.includes("@") ? tail.toLowerCase() : "";
}

/**
 * Resolves the caller to their sign-in address when they are a form builder,
 * or `null`.
 *
 * The address returned prefers the sign-in name (the UPN inside `LoginName`)
 * over the mailbox `Email`, because it is the same string MSAL puts in
 * `accounts[0].username` — which is what the signed-in submission path writes
 * as `SubmittedBy`, and what `stamp-test-run` later compares against.
 */
export async function resolveFormBuilder(
  accessToken: string,
  options: { group?: string; get?: DelegatedGet } = {},
): Promise<string | null> {
  const group = options.group ?? formBuilderGroupName();
  const get: DelegatedGet = options.get ?? delegatedSharePointGet;
  if (!accessToken.trim()) return null;
  if (!group) {
    logWarn("api:form-builder-access", "No form builder or admin group configured — refusing every test run", {
      fix: "Set VITE_OSHES_FORM_BUILDER_GROUP (or VITE_OSHES_ADMIN_GROUP) to the SharePoint group title, in the browser and the server alike.",
    });
    return null;
  }

  let currentUser: SharePointUser;
  try {
    currentUser = await get<SharePointUser>(accessToken, "/_api/web/currentuser?$select=Email,LoginName");
  } catch (error) {
    logWarn("api:form-builder-access", "Could not read the signed-in SharePoint user", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  let members: { value?: SharePointUser[] };
  try {
    members = await get<{ value?: SharePointUser[] }>(
      accessToken,
      `/_api/web/sitegroups/getByName('${encodeURIComponent(group)}')/users?$select=LoginName,Email,UserPrincipalName`,
    );
  } catch (error) {
    logWarn("api:form-builder-access", "Could not read form builder group membership", {
      group,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const currentEmail = String(currentUser.Email || "").trim().toLowerCase();
  const currentLogin = String(currentUser.LoginName || "").trim().toLowerCase();
  const currentLoginEmail = loginNameEmail(currentLogin);

  const isMember = (members.value || []).some((member) => {
    const email = String(member.Email || "").trim().toLowerCase();
    const upn = String(member.UserPrincipalName || "").trim().toLowerCase();
    const login = String(member.LoginName || "").trim().toLowerCase();
    const memberLoginEmail = loginNameEmail(login);
    return (
      (currentLogin !== "" && login === currentLogin) ||
      (currentEmail !== "" && (email === currentEmail || upn === currentEmail || memberLoginEmail === currentEmail)) ||
      (currentLoginEmail !== "" && (email === currentLoginEmail || upn === currentLoginEmail || memberLoginEmail === currentLoginEmail))
    );
  });

  if (!isMember) {
    logWarn("api:form-builder-access", "Account is not in the form builder group", { group });
    return null;
  }

  return currentLoginEmail || currentEmail || null;
}
