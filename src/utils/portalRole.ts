import type {
  CatalogueEntry,
  PortalAccess,
  PortalRecord,
  PortalRole,
  PortalScreen,
  PortalTab,
  SubsScope,
} from "../types";
import { normalizeEmail } from "./portalPeople";

export interface PortalRoleInput {
  userEmail: string;
  isAdmin: boolean;
  isAuditor: boolean;
  catalogue: CatalogueEntry[];
  records: PortalRecord[];
}

/** Whether this account is named on any layer, and whether any of them evaluate. */
function assignments({
  userEmail,
  catalogue,
  records,
}: Pick<PortalRoleInput, "userEmail" | "catalogue" | "records">): { isAssignee: boolean; isEvaluator: boolean } {
  const email = normalizeEmail(userEmail);
  if (!email) return { isAssignee: false, isEvaluator: false };

  let isAssignee = false;

  for (const entry of catalogue) {
    for (const layer of entry.layers) {
      if (layer.assignee.type !== "user") continue;
      if (normalizeEmail(layer.assignee.value) !== email) continue;
      if (layer.type === "evaluation") return { isAssignee: true, isEvaluator: true };
      isAssignee = true;
    }
  }

  // Per-submission reassignments put work on people the catalogue never names.
  for (const record of records) {
    for (const step of record.chain) {
      if (step.email !== email) continue;
      if (step.type === "evaluation") return { isAssignee: true, isEvaluator: true };
      isAssignee = true;
    }
  }

  return { isAssignee, isEvaluator: false };
}

/**
 * The role view is derived from group membership plus the submission set — it is
 * never stored on the user. A user who is both an evaluator and an approver
 * resolves to `evaluator` (the superset view); their approval items still appear
 * in the same queue.
 *
 * The role is now a *label*. What an account may reach comes from
 * `derivePortalAccess`, so an administrator who also signs a layer keeps both.
 */
export function derivePortalRole({ userEmail, isAdmin, isAuditor, catalogue, records }: PortalRoleInput): PortalRole {
  if (isAdmin) return "admin";
  if (isAuditor) return "auditor";

  const { isAssignee, isEvaluator } = assignments({ userEmail, catalogue, records });
  if (isEvaluator) return "evaluator";
  return isAssignee ? "approver" : "submitter";
}

/**
 * Resolve every capability once, from group membership and from what the person
 * is actually assigned — not from the role name.
 *
 * This is what the old role buckets could not express: an administrator who is
 * also an approver got no queue at all, and an approver had no route to their
 * own filings. Both are ordinary, and both now hold every capability they earn.
 */
export function derivePortalAccess(input: PortalRoleInput): PortalAccess {
  const role = derivePortalRole(input);
  const { isAssignee, isEvaluator } = assignments(input);
  const isAdmin = input.isAdmin;
  const isAuditor = input.isAuditor && !isAdmin;
  const oversight = isAdmin || isAuditor || isEvaluator;

  return {
    role,
    isAdmin,
    isAuditor,
    readOnly: isAuditor,
    // Read-only is a veto over every write capability, not one more input to
    // them: an audit account that also happens to be named on a layer must
    // still not sign, chase or file.
    isAssignee: !isAuditor && (isAssignee || isEvaluator),
    isEvaluator,
    canSeeEveryRecord: oversight,
    canFile: !isAuditor,
    canManageCatalogue: isAdmin,
    canSeePeople: isAdmin,
    canSeeAudit: isAdmin || isAuditor,
    // Today is a read-only overview, and its two actions are gated by canChase
    // separately — so anyone with oversight gets it, auditors included.
    canSeeOperations: oversight,
    canChase: !isAuditor && (isAdmin || isEvaluator),
    canExport: oversight,
  };
}

/**
 * Withdraw / cancel / delete, decided in one place.
 *
 * These three questions are asked from the record drawer, from the dashboard's
 * waiting table, and inside the confirmation dialogs themselves. Written out at
 * each of those call sites they drifted — one screen offered a withdraw the
 * other refused — so the rule lives here and every button reads it.
 */

/**
 * Withdrawing your own filing is a property of having filed it, not of the role
 * label: an approver who reports a hazard may withdraw their own report. Anyone
 * else needs to be an administrator, and a settled record has nothing to stand
 * down.
 */
export function canWithdrawRecord(record: PortalRecord, access: PortalAccess, userEmail: string): boolean {
  if (access.readOnly || record.done) return false;
  if (access.isAdmin) return true;
  return record.submitterEmail === normalizeEmail(userEmail) && record.at === 0;
}

/** The same action by two different people: you withdraw yours, you cancel theirs. */
export function withdrawLabel(record: PortalRecord, userEmail: string): string {
  return record.submitterEmail === normalizeEmail(userEmail) ? "Withdraw" : "Cancel submission";
}

/**
 * Deletion is administrators only, and stays available on a settled record — a
 * wrongly filed report is usually noticed after it has been signed, and "cancel
 * it instead" is not an answer when the objection is that the photos and
 * signatures should not exist at all.
 */
export function canDeleteRecord(access: PortalAccess): boolean {
  return !access.readOnly && access.isAdmin;
}

/**
 * Whether the typed text names this record. The delete stays disabled until it
 * does: a record with signatures and photos against it is worth more than one
 * misplaced click. Case and surrounding spaces are forgiven; nothing else is.
 */
export function canConfirmDelete(typed: string, reference: string): boolean {
  const target = reference.trim().toLowerCase();
  return target !== "" && typed.trim().toLowerCase() === target;
}

/**
 * The three top-level destinations, in the order the navigation shows them.
 * Manage appears only for an account that reaches one of its pages.
 */
export function portalTabs(access: PortalAccess, needsCount: number): PortalTab[] {
  const tabs: PortalTab[] = [
    { screen: "home", label: "Your work", badge: 0 },
    { screen: "subs", label: "Submissions", badge: needsCount },
  ];
  if (showsManage(access)) tabs.push({ screen: "manage", label: "Manage", badge: 0 });
  return tabs;
}

function showsManage(access: PortalAccess): boolean {
  return access.canSeeOperations || access.canSeePeople || access.canSeeAudit || access.isAdmin;
}

/** The pages inside Manage that this account may open. The sidebar and allowedScreens both read this. */
export function manageScreens(access: PortalAccess): PortalScreen[] {
  const screens: PortalScreen[] = [];
  if (access.canSeePeople) screens.push("people");
  if (access.canSeeAudit) screens.push("audit");
  if (access.isAdmin || access.isAuditor) screens.push("smoking");
  return screens;
}

/**
 * Screens this account may reach — keeps deep links and saved preferences honest.
 *
 * Each page is gated where it leads as well; this only decides which screens a
 * link or a saved preference may name without bouncing back to Home.
 */
export function allowedScreens(access: PortalAccess): PortalScreen[] {
  const screens: PortalScreen[] = ["home", "subs", "settings", "record"];
  if (showsManage(access)) screens.push("manage", ...manageScreens(access));
  return screens;
}

/** The framings of the submissions screen this account may open. */
export function subsScopes(access: PortalAccess): SubsScope[] {
  const scopes: SubsScope[] = ["all", "mine"];
  if (!access.readOnly && access.isAssignee) scopes.push("needs");
  return scopes;
}

/**
 * Landing page. Home for everyone: it is the page that shows all the others,
 * which is what lets one landing page work for every kind of account.
 */
export function portalHome(): PortalScreen {
  return "home";
}

export function roleLabel(role: PortalRole): string {
  const labels: Record<PortalRole, string> = {
    admin: "Administrator",
    evaluator: "Evaluator · Safety Officer",
    approver: "Approver",
    submitter: "Staff / submitter",
    auditor: "Auditor — read only",
  };
  return labels[role];
}

/** One line naming what this account can see and do — the header and settings share it. */
export function accessSummary(access: PortalAccess): string {
  if (access.readOnly) return "Read only. Sees every record and the audit trail, and takes no action.";

  const parts = [access.canSeeEveryRecord ? "Sees every record" : "Sees their own filings"];
  if (access.isAssignee) parts.push(access.isEvaluator ? "evaluates on assigned layers" : "signs on assigned layers");
  if (access.canManageCatalogue) parts.push("manages the form catalogue");
  return `${parts.join(", ")}.`;
}

/** Audit accounts never render an action — there are no new write paths for them. */
export function isReadOnlyRole(role: PortalRole): boolean {
  return role === "auditor";
}

export function canExportCsv(role: PortalRole): boolean {
  return role === "admin" || role === "evaluator" || role === "auditor";
}

/** Who may chase an approver: nudge and reassign. */
export function canChase(role: PortalRole): boolean {
  return role === "admin" || role === "evaluator";
}
