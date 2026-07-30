import type { LayerConfigItem, SeverityCapture, Submission } from "./index";

/**
 * Who is looking at the portal. Derived from group membership plus the
 * submission set — never stored on the user.
 */
export type PortalRole = "admin" | "evaluator" | "approver" | "submitter" | "auditor";

/** The screens the portal can show. Which ones a role may reach is decided by PORTAL_NAV. */
export type PortalScreen = "today" | "queue" | "subs" | "file" | "cat" | "people" | "audit";

/** Severity weight — kept as weight, not hue, so it survives greyscale printing. */
export type SeverityTone = "high" | "mid" | "low" | "none";

export type PortalStatus =
  | "In approval"
  | "Past SLA"
  | "Approved"
  | "Returned"
  | "Cancelled"
  | "Rejected";

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
  /** Age measured on the current layer only. */
  hoursOnLayer: number;
  ageOnLayerLabel: string;
  /** Zero-based index of the layer that is waiting. */
  at: number;
  totalLayers: number;
  chain: PortalChainStep[];
  currentRole: string;
  currentAssignee: string;
  currentAssigneeEmail: string;
  slaDays: number;
  overdue: boolean;
  hoursOverdue: number;
  /** "within a 3-day SLA" / "2 d 4 h past a 3-day SLA" */
  slaNote: string;
  status: PortalStatus;
  /** "Layer 2 of 3" */
  layerLabel: string;
  /** "Layer 2 of 3" / "Complete" / "With the submitter" */
  stage: string;
  done: boolean;
  returned: boolean;
}

/** A form type as the catalogue screen and the QR picker see it. */
export interface CatalogueEntry {
  listTitle: string;
  code: string;
  name: string;
  /** Approval roles in order — the chain. */
  chain: string[];
  layers: LayerConfigItem[];
  slaDays: number;
  isPublic: boolean;
  severityCapture: SeverityCapture;
  /** Submissions in the last 30 days. */
  volume: number;
  /** Submissions filed today. */
  today: number;
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

/** Draft persisted to localStorage as the public/staff form is typed. */
export interface PortalFormDraft {
  location: string;
  severity: string;
  description: string;
  name: string;
  email: string;
  photos: number;
}
