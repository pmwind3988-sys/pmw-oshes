import type { LayerConfigItem, SeverityCapture, Submission } from "./index";

/**
 * Who is looking at the portal. Derived from group membership plus the
 * submission set — never stored on the user.
 *
 * The role is a label, not a gate. What a person may reach is decided by
 * `PortalAccess`, because one account is routinely several of these at once:
 * an administrator who also signs a layer, an evaluator who files their own
 * reports. Role-exclusive navigation hid each of those from the other.
 */
export type PortalRole = "admin" | "evaluator" | "approver" | "submitter" | "auditor";

/**
 * Every capability the portal gates on, resolved once per session.
 * Nothing downstream re-derives permission from the role name.
 */
export interface PortalAccess {
  role: PortalRole;
  isAdmin: boolean;
  isAuditor: boolean;
  /** Audit accounts render no action anywhere. */
  readOnly: boolean;
  /** Named on at least one layer — approval or evaluation, configured or in-flight. */
  isAssignee: boolean;
  isEvaluator: boolean;
  canSeeEveryRecord: boolean;
  canFile: boolean;
  canManageCatalogue: boolean;
  canSeePeople: boolean;
  canSeeAudit: boolean;
  canSeeOperations: boolean;
  /** Chase an approver: nudge and reassign. */
  canChase: boolean;
  canExport: boolean;
}

/** The pages the portal can show. Which ones an account may reach comes from `PortalAccess`. */
export type PortalScreen =
  | "home"
  | "queue"
  | "mine"
  | "file"
  | "today"
  | "subs"
  | "cat"
  | "people"
  | "audit"
  | "settings";

export interface PortalNavItem {
  screen: PortalScreen;
  label: string;
  /** Rendered right-aligned; null when the item carries no count. */
  count: number | null;
  /** One line of what the page is for — the home cards and the nav share it. */
  hint: string;
}

/** Nav items under one heading. A blank heading renders without one. */
export interface PortalNavSection {
  id: string;
  label: string;
  items: PortalNavItem[];
}

// ── Form shape ───────────────────────────────────────────────────────────────

/** What a form does after submit. "none" means submitting it is the end of it. */
export type WorkflowKind = "none" | "approval" | "evaluation" | "mixed";

export interface WorkflowShape {
  kind: WorkflowKind;
  hasWorkflow: boolean;
  approvalLayers: number;
  evaluationLayers: number;
  totalLayers: number;
  label: string;
  shortLabel: string;
}

/** Whether a form's link actually opens for someone who is not signed in. */
export interface FormVisibility {
  isPublic: boolean;
  /** What an administrator explicitly set, or null when nothing ever was. */
  declared: boolean | null;
  unset: boolean;
  /** The catalogue flag disagrees with the column the form page reads. */
  mismatch: boolean;
  label: string;
  note: string;
}

/** Severity weight — kept as weight, not hue, so it survives greyscale printing. */
export type SeverityTone = "high" | "mid" | "low" | "none";

export type PortalStatus =
  | "In approval"
  | "Past SLA"
  | "Approved"
  | "Returned"
  | "Cancelled"
  | "Rejected"
  /** Filed on a form with no approval step. Complete on arrival, and never overdue. */
  | "Recorded";

/** One step of a record's approval chain, ready to render as a timeline. */
export interface PortalChainStep {
  layerNumber: number;
  /** Role the layer points at, e.g. "Safety Officer". */
  roleLabel: string;
  /** Person currently holding the layer (assignee, or the per-submission reassignment). */
  who: string;
  email: string;
  type: "approval" | "evaluation";
  state: "signed" | "current" | "pending";
  /** "Signed" / "Awaiting you" / "Awaiting Nurul" / "Not started" */
  statusText: string;
  /** Signature timestamp, "on this layer 2 d 4 h", or the opens-later line. */
  subText: string;
  note: string;
}

/**
 * A submission projected into the shape the role dashboards read. Everything
 * here is derived — nothing is stored in this shape.
 */
export interface PortalRecord {
  /** Stable identity back to SharePoint. */
  submission: Submission;
  listTitle: string;
  itemId: string;
  /** Human reference, e.g. "INC-2607-0142". */
  reference: string;
  code: string;
  formName: string;
  subject: string;
  location: string;
  source: string;
  submitter: string;
  submitterEmail: string;
  severity: string;
  tone: SeverityTone;
  photos: number;
  filedAt: Date | null;
  /** "41 min ago" */
  filedLabel: string;
  hoursSinceFiled: number;
  /** Age measured on the current layer only. Zero when there is no chain. */
  hoursOnLayer: number;
  ageOnLayerLabel: string;
  /** Zero-based index of the layer that is waiting. */
  at: number;
  totalLayers: number;
  /** False when the form has no approval or evaluation step at all. */
  hasWorkflow: boolean;
  workflowKind: WorkflowKind;
  chain: PortalChainStep[];
  currentRole: string;
  currentAssignee: string;
  currentAssigneeEmail: string;
  slaDays: number;
  overdue: boolean;
  hoursOverdue: number;
  /** "within a 3-day SLA" / "2 d 4 h past a 3-day SLA" / "no approval step to wait on" */
  slaNote: string;
  status: PortalStatus;
  /** "Layer 2 of 3", or "No approval step" when there is no chain. */
  layerLabel: string;
  /** "Layer 2 of 3" / "Complete" / "With the submitter" / "Recorded" */
  stage: string;
  done: boolean;
  returned: boolean;
}

/** A form type as the catalogue screen and the QR picker see it. */
export interface CatalogueEntry {
  listTitle: string;
  code: string;
  name: string;
  /** Public form route slug, when the form has one. */
  slug: string;
  /** Approval roles in order — the chain. Empty when the form has no workflow. */
  chain: string[];
  layers: LayerConfigItem[];
  /** What this form does after submit, decided from the layers themselves. */
  workflow: WorkflowShape;
  /** Shorthand for `workflow.hasWorkflow` — the check most call sites want. */
  hasWorkflow: boolean;
  slaDays: number;
  /** Whether the link opens for an anonymous visitor, and whether that was intended. */
  visibility: FormVisibility;
  /** Shorthand for `visibility.isPublic`. */
  isPublic: boolean;
  severityCapture: SeverityCapture;
  /** Submissions in the last 30 days. */
  volume: number;
  /** Submissions filed today. */
  today: number;
  /** Blank when the form has no approval chain to route to. */
  firstApprover: string;
}

/** One append-only audit row. */
export interface AuditEntry {
  at: string;
  whenLabel: string;
  reference: string;
  who: string;
  event: string;
}

/** A row of the People & roles table. */
export interface PortalPerson {
  name: string;
  email: string;
  approvalRole: string;
  systemRole: string;
  openItems: number;
  sees: string;
}
