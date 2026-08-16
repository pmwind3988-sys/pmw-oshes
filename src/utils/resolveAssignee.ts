/**
 * resolveAssignee.ts — turns one layer's `assignee` into the people who may act.
 *
 * This logic previously existed three times over (`api/submit-form.ts`,
 * `src/pages/DynamicFormPage.tsx`, `src/components/builder/ApprovalDashboard.tsx`)
 * and had already drifted between the copies. It lives here once, as a pure
 * function: everything that needs the network — the directory lookup and
 * distribution-list expansion — arrives through `ports`, because the browser
 * reaches SharePoint over REST while the serverless routes use Graph.
 *
 * Failures are **returned, not thrown**. The submit paths turn `error` into a
 * thrown error that aborts the submission; the dashboard shows it beside the
 * layer. Returning lets both keep their behaviour without the resolver knowing
 * which caller it is serving.
 *
 * `api/_utils/resolveAssignee.ts` is the server-side copy of this file; api/
 * cannot import from src/. Keep the two in step.
 */
import { parseValidEmailList } from "./layerRecipients.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AssigneeAuthMode = "365" | "public";

export interface ResolvableAssignee {
  type: string;
  value: string;
  /** chain: where to start counting, how far to walk, what to do if it runs out. */
  startFrom?: "submitter" | "previous-actor" | "field";
  hops?: number;
  skipSelf?: boolean;
  fallback?: { mode: "department-hod" | "fixed" | "park"; email?: string };
  /** role-holder: where the department comes from, and the role to match. */
  department?: "fixed" | "from-submitter" | "from-field";
  role?: string;
}

/** One row of the `Approval Directory` list: who a person is, and who signs for them. */
export interface DirectoryPerson {
  email: string;
  name: string;
  department: string;
  position: string;
  /** Who approves this person. Empty means top of the line. */
  approverEmail: string;
}

/**
 * What the resolver knows about the submission beyond its answers. Chain
 * routing needs identities that are not in the form body: who submitted, and
 * who actually acted on the preceding layer.
 */
export interface ResolutionContext {
  /** The submitter's address. "GUEST" for public submissions, i.e. unusable. */
  submitterEmail?: string;
  /**
   * Whoever acted on the layer before this one — `L{n-1}_ActedBy`, falling back
   * to `L{n-1}_Email` when the actor was never recorded (public and paper
   * layers historically did not record one).
   */
  previousActorEmail?: string;
}

/** Hard ceiling on chain walking, so a mis-typed directory cannot spin. */
export const MAX_CHAIN_HOPS = 10;

export interface ResolvableLayer {
  layerNumber: number;
  title?: string;
  authMode: AssigneeAuthMode;
  assignee: ResolvableAssignee;
}

/**
 * A layer's resolved actors. `email` is the primary written to `L{n}_Email`, so
 * every existing reader keeps working; `emails` is the full any-one-of set
 * written to `L{n}_Emails`, longer than one for a shared layer or expanded list.
 */
export interface ResolvedLayerActors {
  email: string;
  name: string;
  emails: string[];
  /** Operator-facing reason the layer has no usable actor. */
  error?: string;
  /**
   * Set when routing could not be decided but the submission must still be
   * kept. Distinct from `error`: a parked layer is a question for an admin, not
   * a broken submission, and the record is saved either way.
   */
  parked?: { reason: string };
  /**
   * How this actor was chosen, in plain words — "Ali → Siti (HOD, Engineering)".
   * Shown on the submission so an admin learns the rules by watching them fire
   * rather than by reading configuration.
   */
  explanation?: string;
}

export interface AssigneeResolverPorts {
  /** Department directory lookup. Rejects to signal "no usable approver". */
  lookupDepartmentApprover(
    layer: ResolvableLayer,
    submittedData: Record<string, unknown>,
  ): Promise<{ email: string; name: string }>;
  /**
   * Expands a distribution list to its members. The browser cannot do this —
   * a delegated token lacks Group.Read.All — so it proxies to /api/expand-group.
   */
  expandDistributionList(layer: ResolvableLayer, address: string): Promise<string[]>;
  /**
   * One person's `Approval Directory` row, or null when they are not listed.
   * Absent on callers that predate the directory; a chain layer then parks.
   */
  lookupPerson?(email: string): Promise<DirectoryPerson | null>;
  /** Whoever holds `role` in `department`, or null when nobody does. */
  lookupRoleHolder?(department: string, role: string): Promise<{ email: string; name: string } | null>;
}

export interface ResolveAssigneeOptions {
  /**
   * Tail of the operator-facing message. The public submit path says
   * "before this form can be submitted."; the workflow paths say
   * "before the workflow can start."
   */
  blockedSuffix?: string;
  /**
   * Also reject a non-empty value that is not an address, even on a public
   * layer. The dashboard does this; the submit paths only check under "365".
   */
  rejectNonEmailAlways?: boolean;
  /**
   * Keep an unusable distribution-list address as the primary rather than
   * clearing it, so the dashboard can still show what was configured.
   */
  keepInvalidDistributionListAddress?: boolean;
  /** Wording when a list expands to nobody; the server names the Graph grant. */
  emptyDistributionListError?: (label: string, address: string) => string;
  /** Identities chain routing needs that the form body does not carry. */
  context?: ResolutionContext;
}

/** Field references are stored as `${fieldName}` in some published configs. */
export function stripFieldReference(value: string): string {
  return value.replace(/^\$\{/, "").replace(/\}$/, "");
}

/**
 * Coerces a submitted answer to text. SurveyJS hands back bare strings for most
 * questions but objects for choice-style ones, hence the key sweep.
 */
export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "Email", "value", "Value", "text", "Title"]) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return "";
}

function toResolvedActors(email: string, name: string): ResolvedLayerActors {
  const trimmed = email.trim();
  return { email: trimmed, name, emails: trimmed ? [trimmed] : [] };
}

function failure(error: string, email = ""): ResolvedLayerActors {
  return { email, name: "", emails: [], error };
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function layerLabel(layer: ResolvableLayer): string {
  return layer.title || `Layer ${layer.layerNumber}`;
}

function parked(reason: string): ResolvedLayerActors {
  return { email: "", name: "", emails: [], parked: { reason } };
}

/** "GUEST" is what the public submit path writes when there is no tenant identity. */
function usableIdentity(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return EMAIL_RE.test(trimmed) ? trimmed : "";
}

function describePerson(person: DirectoryPerson): string {
  const detail = [person.position, person.department].filter(Boolean).join(", ");
  const who = person.name || person.email;
  return detail ? `${who} (${detail})` : who;
}

/** Where a chain begins: the submitter, the previous layer's actor, or a field. */
function chainStart(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  context: ResolutionContext,
): { email: string; description: string } {
  if (assignee.startFrom === "previous-actor") {
    return { email: usableIdentity(context.previousActorEmail), description: "the previous approver" };
  }
  if (assignee.startFrom === "field") {
    const field = stripFieldReference(assignee.value);
    return { email: usableIdentity(valueToText(submittedData[field])), description: `the person named in "${field}"` };
  }
  return { email: usableIdentity(context.submitterEmail), description: "the submitter" };
}

/**
 * Walks the reporting line `hops` steps up from `startEmail`.
 *
 * Stops early — and says so — on three conditions the directory will eventually
 * hit in practice: a person who is not listed, a person with no approver (the
 * top of the line), and a loop. None of these existed as guards before, and a
 * loop would otherwise walk forever.
 */
async function walkChain(
  startEmail: string,
  hops: number,
  ports: AssigneeResolverPorts,
  options: { skipSelf?: boolean; submitterEmail?: string },
): Promise<
  | { ok: true; person: DirectoryPerson; trail: string[] }
  | { ok: false; reason: string; trail: string[] }
> {
  const lookupPerson = ports.lookupPerson;
  if (!lookupPerson) return { ok: false, reason: "the approval directory is not available here", trail: [] };

  const submitter = (options.submitterEmail ?? "").trim().toLowerCase();
  const seen = new Set<string>([startEmail.toLowerCase()]);
  const trail: string[] = [startEmail];
  let current = startEmail;
  let resolved: DirectoryPerson | null = null;

  const ceiling = Math.min(Math.max(hops, 1), MAX_CHAIN_HOPS);
  for (let step = 0; step < MAX_CHAIN_HOPS; step++) {
    const person = await lookupPerson(current);
    if (!person) {
      return { ok: false, reason: `${current} is not in the approval directory`, trail };
    }
    const next = person.approverEmail.trim();
    if (!next) {
      return { ok: false, reason: `${person.name || current} has nobody above them in the directory`, trail };
    }
    if (seen.has(next.toLowerCase())) {
      return { ok: false, reason: `the approval line loops back to ${next}`, trail: [...trail, next] };
    }
    seen.add(next.toLowerCase());
    trail.push(next);

    const nextPerson = await lookupPerson(next);
    if (!nextPerson) {
      return { ok: false, reason: `${next} is not in the approval directory`, trail };
    }
    current = next;
    resolved = nextPerson;

    const reachedRequestedHop = step + 1 >= ceiling;
    // Only keep walking past the requested hop to step over the submitter
    // themselves — the "approved by their own submission" case.
    const landedOnSubmitter = options.skipSelf && submitter && next.toLowerCase() === submitter;
    if (reachedRequestedHop && !landedOnSubmitter) {
      return { ok: true, person: nextPerson, trail };
    }
  }

  return resolved
    ? { ok: false, reason: `the approval line is longer than ${MAX_CHAIN_HOPS} steps`, trail }
    : { ok: false, reason: "the approval line could not be followed", trail };
}

async function applyChainFallback(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  label: string,
  reason: string,
): Promise<ResolvedLayerActors> {
  const fallback = assignee.fallback;

  if (fallback?.mode === "fixed") {
    const email = (fallback.email ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      return parked(`${label} could not be routed (${reason}), and its fallback address is not valid.`);
    }
    return {
      ...toResolvedActors(email, ""),
      explanation: `Fell back to ${email} because ${reason}.`,
    };
  }

  if (fallback?.mode === "department-hod" && ports.lookupRoleHolder) {
    const department = valueToText(submittedData.Department) || valueToText(submittedData.department);
    if (department) {
      const holder = await ports.lookupRoleHolder(department, "HOD");
      if (holder?.email) {
        return {
          ...toResolvedActors(holder.email, holder.name),
          explanation: `Fell back to the head of ${department} because ${reason}.`,
        };
      }
    }
  }

  return parked(`${label} could not be routed: ${reason}.`);
}

async function resolveChain(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const assignee = layer.assignee;
  const start = chainStart(assignee, submittedData, context);

  if (!start.email) {
    return applyChainFallback(assignee, submittedData, ports, label, `${start.description} has no usable email address`);
  }

  const walked = await walkChain(start.email, assignee.hops ?? 1, ports, {
    skipSelf: assignee.skipSelf,
    submitterEmail: context.submitterEmail,
  });

  if (!walked.ok) {
    return applyChainFallback(assignee, submittedData, ports, label, walked.reason);
  }
  if (!EMAIL_RE.test(walked.person.email)) {
    return parked(`${label} resolved to "${walked.person.email}", which is not a valid email address.`);
  }

  return {
    ...toResolvedActors(walked.person.email, walked.person.name),
    explanation: `Followed the approval line from ${start.description}: ${walked.trail.join(" → ")}.`
      + ` Resolved to ${describePerson(walked.person)}.`,
  };
}

/** Which department a role-holder layer should look in, and how it was decided. */
async function resolveRoleHolderDepartment(
  assignee: ResolvableAssignee,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<{ department: string; source: string }> {
  if (assignee.department === "fixed") {
    const department = assignee.value.trim();
    return { department, source: `the ${department} department` };
  }

  if (assignee.department === "from-field") {
    const field = stripFieldReference(assignee.value);
    return { department: valueToText(submittedData[field]), source: `the department answered in "${field}"` };
  }

  const submitter = usableIdentity(context.submitterEmail);
  const person = submitter && ports.lookupPerson ? await ports.lookupPerson(submitter) : null;
  return { department: person?.department ?? "", source: "the submitter's own department" };
}

async function resolveRoleHolder(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  context: ResolutionContext,
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const assignee = layer.assignee;
  const role = (assignee.role || "HOD").trim();

  const { department, source } = await resolveRoleHolderDepartment(assignee, submittedData, ports, context);

  if (!department) {
    return parked(`${label} could not tell which department to use for ${source}.`);
  }
  if (!ports.lookupRoleHolder) {
    return parked(`${label} needs the approval directory, which is not available here.`);
  }

  const holder = await ports.lookupRoleHolder(department, role);
  if (!holder?.email || !EMAIL_RE.test(holder.email)) {
    return parked(`${label} could not find the ${role} for ${department}.`);
  }

  return {
    ...toResolvedActors(holder.email, holder.name),
    explanation: `${holder.name || holder.email} is the ${role} of ${department}, taken from ${source}.`,
  };
}

/**
 * True when a layer cannot be resolved until an earlier one completes, so the
 * submit path must defer it rather than writing an empty actor and moving on.
 */
export function isDeferredAssignee(assignee: ResolvableAssignee): boolean {
  return assignee.type === "chain" && assignee.startFrom === "previous-actor";
}

/**
 * Resolves who may act on `layer`, given the submitted answers.
 *
 * Note this reads the submitted data only — it cannot express "whoever acted on
 * the previous layer", because every layer is resolved before layer 1 has an
 * actor. Lifting that restriction is what the reporting-line work adds next.
 */
export async function resolveLayerAssignee(
  layer: ResolvableLayer,
  submittedData: Record<string, unknown>,
  ports: AssigneeResolverPorts,
  options: ResolveAssigneeOptions = {},
): Promise<ResolvedLayerActors> {
  const label = layerLabel(layer);
  const suffix = options.blockedSuffix ?? "before the workflow can start.";
  const context = options.context ?? {};

  if (layer.assignee.type === "chain") {
    return resolveChain(layer, submittedData, ports, context);
  }

  if (layer.assignee.type === "role-holder") {
    return resolveRoleHolder(layer, submittedData, ports, context);
  }

  if (layer.assignee.type === "department-approver") {
    try {
      const resolved = await ports.lookupDepartmentApprover(layer, submittedData);
      return toResolvedActors(resolved.email, resolved.name);
    } catch (error) {
      return failure(errorText(error, `${label} could not resolve the department approver.`));
    }
  }

  if (layer.assignee.type === "users") {
    const emails = parseValidEmailList(layer.assignee.value);
    if (layer.authMode === "365" && emails.length === 0) {
      return { ...failure(`${label} needs at least one valid assignee email ${suffix}`), emails };
    }
    return { email: emails[0] ?? "", name: "", emails };
  }

  if (layer.assignee.type === "distribution-list") {
    const address = layer.assignee.value.trim();
    if (!EMAIL_RE.test(address)) {
      return failure(
        `${label} needs a valid distribution list address ${suffix}`,
        options.keepInvalidDistributionListAddress ? address : "",
      );
    }
    try {
      const members = await ports.expandDistributionList(layer, address);
      if (members.length === 0) {
        if (layer.authMode === "365") {
          return failure(
            options.emptyDistributionListError?.(label, address)
              ?? `${label}: the distribution list ${address} returned no members.`,
          );
        }
        // Public layers act through a token rather than an identity check, so
        // mailing the list address itself is still a workable delivery target.
        return toResolvedActors(address, "");
      }
      return { email: members[0], name: "", emails: members };
    } catch (error) {
      return failure(errorText(error, `${label} could not read the distribution list members.`));
    }
  }

  const email = layer.assignee.type === "user"
    ? layer.assignee.value.trim()
    : valueToText(submittedData[stripFieldReference(layer.assignee.value)]);

  if (layer.authMode === "365" && !EMAIL_RE.test(email)) {
    return failure(`${label} needs a valid assignee email ${suffix}`, email);
  }
  if (options.rejectNonEmailAlways && email && !EMAIL_RE.test(email)) {
    return failure(`${label} resolved to "${email}", which is not a valid email address.`, email);
  }

  return toResolvedActors(email, "");
}
