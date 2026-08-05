import type { LayerAssignee, LayerConfigItem } from "../types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Assignee types whose `value` is a question name, never an address. */
const DATA_RESOLVED_TYPES = new Set(["field-reference", "department-approver"]);

/**
 * A layer can name its reviewer directly, either as one mailbox (`user`) or as
 * several in a single semicolon-separated string (`users`). The other declared
 * types — `field-reference`, `department-approver` — resolve from submitted data.
 *
 * Treating `users` as a field reference is what made a form with a multi-name
 * layer unsubmittable: the resolver looked for an answer keyed by the literal
 * "a@x.com; b@x.com", found nothing, and threw before anything was written.
 *
 * Config is authored outside this app, so an assignee type we do not recognise
 * is also read as a roster when its value spells out addresses — a question name
 * never contains "@", so this cannot swallow a genuine data-resolved assignee.
 * Without it, the next variant spelling ("approvers", "group", …) would fail the
 * same way `users` did.
 */
export function isFixedAssignee(assignee: LayerAssignee): boolean {
  const { type, value } = assignee as { type: string; value: string };
  if (type === "user" || type === "users") return true;
  if (DATA_RESOLVED_TYPES.has(type)) return false;
  return parseAssigneeEmails(value ?? "").some((entry) => EMAIL_RE.test(entry));
}

/**
 * Splits a fixed assignee value into addresses. People pickers hand back ";",
 * hand-edited config tends to use "," — accept both, plus newlines.
 */
export function parseAssigneeEmails(value: string): string[] {
  return value
    .split(/[;,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Every mailbox a layer names outright; empty for data-resolved assignees. */
export function fixedAssigneeEmails(assignee: LayerAssignee): string[] {
  return isFixedAssignee(assignee) ? parseAssigneeEmails(assignee.value) : [];
}

/** Named mailboxes that are actually addressable — typos never match a signed-in user. */
export function validFixedAssigneeEmails(assignee: LayerAssignee): string[] {
  return fixedAssigneeEmails(assignee).filter((email) => EMAIL_RE.test(email));
}

/**
 * A layer naming two or more mailboxes is *shared*: it belongs to none of them
 * individually. Nobody holds it until one of them acts on it.
 */
export function isSharedAssigneeLayer(assignee: LayerAssignee): boolean {
  return validFixedAssigneeEmails(assignee).length > 1;
}

/**
 * The address written to `L{n}_Email` when the submission is created.
 *
 * A shared layer routes to nobody, so this is deliberately empty — the column
 * stays blank until whoever picks the layer up completes it, at which point it
 * records who actually signed. Access while it is blank comes from
 * `canActOnLayer`, not from this value.
 */
export function routedAssigneeEmail(assignee: LayerAssignee): string {
  if (isSharedAssigneeLayer(assignee)) return "";
  return fixedAssigneeEmails(assignee)[0] ?? "";
}

/** Back-compat alias: the first named mailbox, shared or not. */
export function primaryFixedAssigneeEmail(assignee: LayerAssignee): string {
  return fixedAssigneeEmails(assignee)[0] ?? "";
}

function normalize(value: unknown): string {
  if (!value) return "";
  const trimmed = String(value).trim().toLowerCase();
  const loginName = trimmed.includes("|") ? trimmed.split("|").pop() ?? trimmed : trimmed;
  return loginName.replace(/^mailto:/, "");
}

/**
 * Who to tell that a layer is waiting. `L{n}_Email` names the holder once there
 * is one; a shared layer has none until somebody claims it, so everyone named on
 * it is told instead.
 */
export function layerRecipients(
  layer: LayerConfigItem | undefined,
  storedLayerEmail: unknown,
): string[] {
  const stored = String(storedLayerEmail ?? "").trim();
  if (EMAIL_RE.test(stored)) return [stored];
  return layer ? validFixedAssigneeEmails(layer.assignee) : [];
}

/**
 * The address to stamp into `L{n}_Email` when someone completes a layer.
 *
 * Only a shared layer that nobody has claimed yet gets stamped — that is the
 * moment "one of these people" becomes "this person", and it is what the record,
 * the PDF and any later reassignment read afterwards. Returns undefined when
 * there is nothing to claim, so callers can leave the column untouched.
 */
export function claimLayerEmail(
  layer: LayerConfigItem | undefined,
  storedLayerEmail: unknown,
  actorEmail: unknown,
): string | undefined {
  if (!layer || !isSharedAssigneeLayer(layer.assignee)) return undefined;
  if (normalize(storedLayerEmail)) return undefined;
  const actor = String(actorEmail ?? "").trim();
  return actor || undefined;
}

/**
 * Whether `signedInEmail` may act on a layer.
 *
 * `L{n}_Email` stays authoritative whenever it holds an address — that covers a
 * single named assignee, a per-submission reassignment, and a shared layer that
 * has already been claimed. Only while it is blank does a shared layer fall back
 * to its roster, so any one of the named people can pick the layer up.
 */
export function canActOnLayer(
  layer: LayerConfigItem | undefined,
  storedLayerEmail: unknown,
  signedInEmail: unknown,
): boolean {
  const signedIn = normalize(signedInEmail);
  if (!signedIn) return false;

  const stored = normalize(storedLayerEmail);
  if (stored) return stored === signedIn;

  if (!layer) return false;
  return validFixedAssigneeEmails(layer.assignee).some((email) => normalize(email) === signedIn);
}
