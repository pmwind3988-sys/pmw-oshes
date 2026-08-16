/**
 * approvalDirectoryHealth.ts — reading an approval directory before it is used.
 *
 * Two jobs, both pure and both working off rows already loaded, so the UI can
 * answer instantly and without further requests:
 *
 *   traceApprovalChain  — "if this person submits, where does it go?"
 *   findDirectoryProblems — "what is wrong with this directory right now?"
 *
 * The tracing rules deliberately match walkChain() in resolveAssignee.ts: same
 * stopping conditions, same hop ceiling. A trace that disagreed with what
 * actually happens at submission would be worse than no trace at all.
 */
import { MAX_CHAIN_HOPS } from "./resolveAssignee";
import { directoryEmailKey, type ApprovalDirectoryRow } from "./approvalDirectorySchema";

export interface ChainStep {
  email: string;
  name: string;
  department: string;
  position: string;
}

/** Why a trace stopped where it did. Only "hop-limit" and "loop" are faults. */
export type ChainStopReason =
  | "top-of-line"
  | "not-listed"
  | "inactive"
  | "no-approver"
  | "loop"
  | "hop-limit";

export interface ChainTrace {
  /** The person asked about, then each approver above them, in order. */
  steps: ChainStep[];
  stoppedBecause: ChainStopReason;
  /** Plain sentence for the UI, naming what an admin would need to fix. */
  summary: string;
}

function toStep(row: ApprovalDirectoryRow): ChainStep {
  return {
    email: row.personEmail,
    name: row.personName,
    department: row.department,
    position: row.position,
  };
}

function describe(step: ChainStep): string {
  const detail = [step.position, step.department].filter(Boolean).join(", ");
  const who = step.name || step.email;
  return detail ? `${who} (${detail})` : who;
}

function indexRows(rows: ApprovalDirectoryRow[]): Map<string, ApprovalDirectoryRow> {
  const byEmail = new Map<string, ApprovalDirectoryRow>();
  for (const row of rows) {
    const key = directoryEmailKey(row.personEmail);
    // First row wins so a duplicate cannot quietly change who a trace resolves
    // to; findDirectoryProblems reports the duplicate separately.
    if (key && !byEmail.has(key)) byEmail.set(key, row);
  }
  return byEmail;
}

/**
 * Walks the reporting line upward from `startEmail`, as far as it goes.
 *
 * Answers the question an admin actually has — "who will this reach?" — before
 * anybody submits anything, rather than after.
 */
export function traceApprovalChain(rows: ApprovalDirectoryRow[], startEmail: string): ChainTrace {
  const byEmail = indexRows(rows);
  const start = byEmail.get(directoryEmailKey(startEmail));

  if (!start) {
    return {
      steps: [],
      stoppedBecause: "not-listed",
      summary: `${startEmail.trim() || "That address"} is not in the directory, so nothing can be routed from them yet.`,
    };
  }
  if (!start.isActive) {
    return {
      steps: [toStep(start)],
      stoppedBecause: "inactive",
      summary: `${describe(toStep(start))} is switched off, so their submissions cannot be routed.`,
    };
  }

  const steps: ChainStep[] = [toStep(start)];
  const seen = new Set<string>([directoryEmailKey(start.personEmail)]);
  let current = start;

  for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
    const nextEmail = current.approverEmail.trim();
    if (!nextEmail) {
      return {
        steps,
        stoppedBecause: "top-of-line",
        summary: `Ends at ${describe(steps[steps.length - 1])}, who has nobody above them.`,
      };
    }

    const nextKey = directoryEmailKey(nextEmail);
    if (seen.has(nextKey)) {
      return {
        steps,
        stoppedBecause: "loop",
        summary: `The line loops back to ${nextEmail}. Approvals following it would never finish — fix one of these rows.`,
      };
    }

    const next = byEmail.get(nextKey);
    if (!next) {
      return {
        steps,
        stoppedBecause: "not-listed",
        summary: `${describe(steps[steps.length - 1])} is approved by ${nextEmail}, who is not in the directory. Add them to continue the line.`,
      };
    }
    if (!next.isActive) {
      return {
        steps,
        stoppedBecause: "inactive",
        summary: `${describe(steps[steps.length - 1])} is approved by ${nextEmail}, who is switched off. Point them at somebody active.`,
      };
    }

    seen.add(nextKey);
    steps.push(toStep(next));
    current = next;
  }

  return {
    steps,
    stoppedBecause: "hop-limit",
    summary: `The line is longer than ${MAX_CHAIN_HOPS} steps, which is further than any approval will walk.`,
  };
}

/** A one-line rendering of a trace: "Ali → Siti → Raj". */
export function formatChainTrace(trace: ChainTrace): string {
  return trace.steps.map((step) => step.name || step.email).join(" → ");
}

export type DirectoryProblemKind =
  | "duplicate-person"
  | "invalid-email"
  | "approver-not-listed"
  | "approver-inactive"
  | "self-approver"
  | "loop"
  | "no-approver";

export interface DirectoryProblem {
  kind: DirectoryProblemKind;
  /** The row an admin should open to fix this. */
  personEmail: string;
  message: string;
  /** Loops and broken links block approvals; the rest are worth knowing. */
  blocking: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Everything wrong with the directory, so an admin can see it here rather than
 * discovering it one stuck submission at a time.
 *
 * "No approver" is reported but never blocking — somebody has to be top of the
 * line, and for them it is the correct state.
 */
export function findDirectoryProblems(rows: ApprovalDirectoryRow[]): DirectoryProblem[] {
  const problems: DirectoryProblem[] = [];
  const byEmail = indexRows(rows);
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const key = directoryEmailKey(row.personEmail);

    if (!key || !EMAIL_RE.test(row.personEmail.trim())) {
      problems.push({
        kind: "invalid-email",
        personEmail: row.personEmail,
        message: `"${row.personEmail}" is not a usable email address, so nothing can match this row.`,
        blocking: true,
      });
      continue;
    }

    if (seenKeys.has(key)) {
      problems.push({
        kind: "duplicate-person",
        personEmail: row.personEmail,
        message: `${row.personEmail} appears more than once. Only the first row is used — delete the extras.`,
        blocking: true,
      });
      continue;
    }
    seenKeys.add(key);

    if (!row.isActive) continue;

    const approver = row.approverEmail.trim();
    if (!approver) {
      problems.push({
        kind: "no-approver",
        personEmail: row.personEmail,
        message: `${row.personName || row.personEmail} has no approver. Correct for the top of the line; otherwise their submissions will park.`,
        blocking: false,
      });
      continue;
    }

    if (directoryEmailKey(approver) === key) {
      problems.push({
        kind: "self-approver",
        personEmail: row.personEmail,
        message: `${row.personName || row.personEmail} is listed as their own approver.`,
        blocking: true,
      });
      continue;
    }

    const target = byEmail.get(directoryEmailKey(approver));
    if (!target) {
      problems.push({
        kind: "approver-not-listed",
        personEmail: row.personEmail,
        message: `${row.personName || row.personEmail} is approved by ${approver}, who is not in the directory.`,
        blocking: true,
      });
      continue;
    }
    if (!target.isActive) {
      problems.push({
        kind: "approver-inactive",
        personEmail: row.personEmail,
        message: `${row.personName || row.personEmail} is approved by ${approver}, who is switched off.`,
        blocking: true,
      });
      continue;
    }

    const trace = traceApprovalChain(rows, row.personEmail);
    if (trace.stoppedBecause === "loop" || trace.stoppedBecause === "hop-limit") {
      problems.push({
        kind: "loop",
        personEmail: row.personEmail,
        message: trace.summary,
        blocking: true,
      });
    }
  }

  // Blocking first: those are the rows costing somebody an approval today.
  return problems.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}
