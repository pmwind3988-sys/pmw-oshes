/**
 * Distribution-list expansion for workflow layers.
 *
 * A layer whose assignee is a distribution list / mail-enabled group is
 * expanded to its individual members at submit time, so the layer's actor list
 * is concrete addresses that the 365 access check can match against. Nested
 * groups are flattened via `transitiveMembers`.
 *
 * Requires **`Group.Read.All`** as a *Microsoft Graph* Application permission
 * (admin consent) on the `SYSTEM_CLIENT_ID` app registration — not SharePoint.
 * This runs on the `getGraphToken()` token, so granting it under the SharePoint
 * API has no effect. Without it Graph returns 403 and the caller surfaces a
 * configuration error rather than silently assigning nobody.
 */
import { escapeGraphODataString, graphGet } from "./graphClient.js";
import { parseValidEmailList } from "./layerRecipients.js";

const MEMBER_PAGE_SIZE = 200;
/** Guards against a runaway nested group; far above any realistic approver DL. */
const MAX_MEMBERS = 500;

interface GraphGroupRef {
  id?: string;
  mail?: string;
}

interface GraphMember {
  mail?: string;
  userPrincipalName?: string;
  accountEnabled?: boolean;
}

interface GraphCollection<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

function memberAddress(member: GraphMember): string {
  return (member.mail || member.userPrincipalName || "").trim();
}

/**
 * Resolves the group's object id from its mail address. Covers M365 groups,
 * mail-enabled security groups and classic distribution groups, all of which
 * live under `/groups`.
 */
async function findGroupIdByMail(token: string, address: string): Promise<string> {
  const escaped = escapeGraphODataString(address);
  const response = await graphGet(
    token,
    `/groups?$filter=mail eq '${encodeURIComponent(escaped)}' or proxyAddresses/any(p:p eq 'smtp:${encodeURIComponent(escaped)}')&$select=id,mail&$top=1`,
  ) as GraphCollection<GraphGroupRef>;
  return response.value?.[0]?.id?.trim() || "";
}

/**
 * Expands a distribution list address into its member addresses.
 *
 * Returns `[]` when the address is not a group — callers decide whether that is
 * a hard error (365 layers) or a fallback to mailing the address itself.
 * Throws only on a Graph failure, so a missing permission is never mistaken for
 * an empty group.
 */
export async function expandDistributionList(token: string, address: string): Promise<string[]> {
  const normalized = address.trim();
  if (!normalized) return [];

  const groupId = await findGroupIdByMail(token, normalized);
  if (!groupId) return [];

  const members: string[] = [];
  let path: string | null =
    `/groups/${encodeURIComponent(groupId)}/transitiveMembers/microsoft.graph.user`
    + `?$select=mail,userPrincipalName,accountEnabled&$top=${MEMBER_PAGE_SIZE}`;

  while (path && members.length < MAX_MEMBERS) {
    const page = await graphGet(token, path) as GraphCollection<GraphMember>;
    for (const member of page.value ?? []) {
      if (member.accountEnabled === false) continue;
      const email = memberAddress(member);
      if (email) members.push(email);
    }
    const next = page["@odata.nextLink"];
    // Graph returns an absolute nextLink; graphGet prepends the base itself.
    path = next ? next.replace("https://graph.microsoft.com/v1.0", "") : null;
  }

  return parseValidEmailList(members).slice(0, MAX_MEMBERS);
}
