import type {
  CatalogueEntry,
  PortalAccess,
  PortalNavItem,
  PortalNavSection,
  PortalRecord,
  PortalRole,
  PortalScreen,
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

export interface PortalNavCounts {
  queue: number;
  allRecords: number;
  myRecords: number;
  catalogue: number;
  audit: number;
}

/**
 * The whole portal in one nav, grouped by whose question each page answers.
 *
 * Sections appear when the account has something in them, and only then — the
 * nav is short for a submitter and long for an administrator without either of
 * them being on a different app. Every page an account can reach is reachable
 * from here, so nothing lives behind a role switch.
 */
export function portalSections(access: PortalAccess, counts: PortalNavCounts): PortalNavSection[] {
  const sections: PortalNavSection[] = [
    {
      id: "start",
      label: "",
      items: [{ screen: "home", label: "Home", count: null, hint: "Everything waiting on you, in one place" }],
    },
  ];

  const yours: PortalNavItem[] = [];
  // Shown to anyone ever assigned, so it does not appear and vanish with the
  // queue count, and so an admin who also approves is not left without it.
  if (!access.readOnly && (access.isAssignee || counts.queue > 0)) {
    yours.push({
      screen: "queue",
      label: access.isEvaluator ? "To evaluate" : "To approve",
      count: counts.queue,
      hint: access.isEvaluator
        ? "On your layer now — evaluate, and it routes onward"
        : "On your layer now — signing releases it to the next approver",
    });
  }
  yours.push({
    screen: "mine",
    label: "My submissions",
    count: counts.myRecords,
    hint: "Forms you filed, including ones sent from a QR poster with this email",
  });
  if (access.canFile) {
    yours.push({ screen: "file", label: "File a form", count: null, hint: "Pick a form type and fill it in" });
  }
  sections.push({ id: "yours", label: "Your work", items: yours });

  // An approver sees more than their own filings — everything they are on a
  // layer of — so they get the records page too, even without full oversight.
  // Without it, anything they had already signed became unreachable.
  const seesBeyondOwn = access.canSeeEveryRecord || counts.allRecords > counts.myRecords;

  if (seesBeyondOwn) {
    const oversight: PortalNavItem[] = [];
    if (access.canSeeOperations) {
      oversight.push({
        screen: "today",
        label: "Today",
        count: null,
        hint: "High severity, stuck approvals, and where work is sitting",
      });
    }
    oversight.push({
      screen: "subs",
      label: access.isAuditor ? "Records" : access.canSeeEveryRecord ? "All submissions" : "Records you are on",
      count: counts.allRecords,
      hint: access.canSeeEveryRecord
        ? "Every form instance, whichever door it came through"
        : "Everything you are on a layer of, including what you have already signed",
    });
    if (access.canManageCatalogue) {
      oversight.push({
        screen: "cat",
        label: "Form catalogue",
        count: counts.catalogue,
        hint: "What each form does after submit, its SLA, and who can reach it",
      });
    }
    if (access.canSeePeople) {
      oversight.push({ screen: "people", label: "People & roles", count: null, hint: "Who holds which approval role" });
    }
    if (access.canSeeAudit) {
      oversight.push({
        screen: "audit",
        label: "Audit trail",
        count: counts.audit,
        hint: "Append-only: every signature, nudge, reassignment and cancellation",
      });
    }
    sections.push({
      id: "oversight",
      label: access.canSeeEveryRecord ? "Oversight" : "Beyond your own filings",
      items: oversight,
    });
  }

  sections.push({
    id: "account",
    label: "Account",
    items: [
      { screen: "settings", label: "Settings", count: null, hint: "Your account, what you can see, and where you land" },
    ],
  });

  return sections;
}

/** Flat nav, for anything that wants items without their headings. */
export function portalNav(access: PortalAccess, counts: PortalNavCounts): PortalNavItem[] {
  return portalSections(access, counts).flatMap((section) => section.items);
}

/**
 * Counts that make every count-conditional nav item appear.
 *
 * `allowedScreens` asks what an account *may* reach, not what it happens to
 * have right now — a queue that is empty this second can fill from a
 * reassignment, and reaching the page then must not bounce back to Home.
 */
const ANY_COUNTS: PortalNavCounts = { queue: 1, allRecords: 1, myRecords: 0, catalogue: 0, audit: 0 };

/**
 * Screens this account may reach — keeps deep links and saved preferences honest.
 *
 * The form hub is reachable by everyone and appears in no nav section: it is
 * the page Home opens when you pick a form type, and it shows only that form's
 * own doors. Each door is gated where it leads, not here.
 */
export function allowedScreens(access: PortalAccess): PortalScreen[] {
  return [...portalNav(access, ANY_COUNTS).map((item) => item.screen), "form"];
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
