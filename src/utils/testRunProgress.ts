/**
 * testRunProgress.ts — turns a test run's trail plus its response row into
 * the checklist `TestRunPanel.tsx` shows, and the run's verdict.
 *
 * Browser-only: there is no `api/_utils` mirror of this file, unlike
 * `testRunTrail.ts`. Nothing on the server needs the merged view — only the
 * panel, which is browser code — so there is nothing to keep in step.
 *
 * WHY THIS EXISTS: the trail (`testRunTrail.ts`) is written by the server, and
 * not every path goes through it. `api/submit-form.ts` writes it for the
 * anonymous path; `api/evaluate.ts` writes it for a decision made through a
 * public review link and — since the review page moved its writes to the
 * server — for a signed-in reviewer's decision too.
 *
 * What still does not reach it: a signed-in SUBMISSION, where the browser
 * writes the response row straight to SharePoint and only calls
 * `stamp-test-run`, and a decision made from `ApprovalDashboard.tsx`, which
 * remains browser-driven. So a signed-in run's trail can still be sparse,
 * even though the row itself — `L{n}_Status`, `FormStatus` and friends — is
 * written by every path, always. The row is the true source of truth; the
 * trail only adds detail the row alone cannot carry (a diverted address, a
 * send error). This module treats it that way: it derives checklist steps
 * from the row wherever the trail has none, and it derives the verdict
 * primarily from the row's own lifecycle, not from whether the trail happens
 * to be complete.
 */
import {
  type TestRunStep,
  type TestRunStepStatus,
  type TestRunTrail,
  orderedTestRunSteps,
} from "./testRunTrail";
import { isTerminalLayerStatus } from "./workflowStatus";
import { resolveLifecycleStage } from "./submissionLifecycle";

export type TestRunVerdict = "passed" | "failed" | "running";

export interface TestRunProgressResult {
  /** The checklist to render, already in run order. */
  steps: TestRunStep[];
  /** Whether the rehearsal itself worked — not whether it was approved. */
  outcome: TestRunVerdict;
}

function textField(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * The layer numbers the row has any status evidence for, in order. A layer
 * the workflow never reached has no `L{n}_Status` at all and is omitted —
 * it is not "skipped", it just never came up.
 */
function reachedLayerNumbers(fields: Record<string, unknown>): number[] {
  const numbers: number[] = [];
  for (const key of Object.keys(fields)) {
    const match = /^L(\d+)_Status$/.exec(key);
    if (!match) continue;
    if (textField(fields, key)) numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/**
 * One row-derived step per layer the row has reached. Uses the same step id
 * and order (`layer-{n}-decision`, order `10n + 2`) that `api/evaluate.ts`
 * writes for a decision made through a public review link, so a real trail
 * entry for a signed-in-adjacent decision merges with — rather than
 * duplicates — the row-derived stand-in for the same layer.
 */
function layerStepsFromRow(fields: Record<string, unknown>): TestRunStep[] {
  return reachedLayerNumbers(fields).map((n) => {
    const status = textField(fields, `L${n}_Status`);
    const actor = textField(fields, `L${n}_ActedBy`) || textField(fields, `L${n}_Email`);
    const decided = isTerminalLayerStatus(status);
    const stepStatus: TestRunStepStatus = decided ? "pass" : "pending";
    const label = decided ? `Layer ${n} decision recorded` : `Layer ${n} awaiting decision`;
    const detail = decided
      ? actor ? `${status} by ${actor}` : status
      : actor ? `Routed to ${actor}` : undefined;
    return {
      step: `layer-${n}-decision`,
      label,
      status: stepStatus,
      detail,
      at: textField(fields, `L${n}_SignedAt`) || "",
      order: 10 * n + 2,
    };
  });
}

/**
 * Merges the real trail with the row-derived stand-ins, preferring the trail
 * entry whenever both name the same step id — the trail carries richer
 * detail (diverted addresses, send errors) that a row-derived guess cannot
 * reconstruct.
 */
export function mergeTestRunSteps(trail: TestRunTrail, fields: Record<string, unknown>): TestRunStep[] {
  const merged: TestRunTrail = { ...trail };
  for (const step of layerStepsFromRow(fields)) {
    if (!merged[step.step]) merged[step.step] = step;
  }
  return orderedTestRunSteps(merged);
}

/**
 * Whether the submission itself has reached a terminal lifecycle stage —
 * rejected, approved, or otherwise completed. A rejection is a legitimate,
 * deliberately-chosen outcome for a rehearsal; it counts as terminal the
 * same as an approval, because a rejected run that ran correctly is a
 * finished run, not a broken one. The row's own lifecycle text ("Rejected")
 * already says what the decision was — this only decides run vs. finished.
 */
function rowReachedTerminalStage(fields: Record<string, unknown>): boolean {
  const stage = resolveLifecycleStage({
    formStatus: textField(fields, "FormStatus") || undefined,
    status: textField(fields, "Status") || undefined,
  });
  return stage === "rejected" || stage === "completed";
}

/**
 * Decides whether a run passed, failed, or is still running.
 *
 * - A `fail` step anywhere in the trail always means the run failed — that
 *   is a genuine break in the rehearsal mechanism, whatever the row says.
 * - Otherwise, once the row itself has reached a terminal stage (rejected,
 *   approved, completed), the run is finished — "passed" here means the
 *   rehearsal worked, not that the submission was approved.
 * - Otherwise, fall back to the trail alone: complete and non-empty means
 *   passed, anything else means still running.
 */
export function testRunVerdict(trail: TestRunTrail, fields: Record<string, unknown>): TestRunVerdict {
  const steps = Object.values(trail);
  if (steps.some((step) => step.status === "fail")) return "failed";
  if (rowReachedTerminalStage(fields)) return "passed";
  if (steps.length > 0 && !steps.some((step) => step.status === "pending")) return "passed";
  return "running";
}

/** Convenience wrapper returning both the checklist and the verdict together. */
export function computeTestRunProgress(trail: TestRunTrail, fields: Record<string, unknown>): TestRunProgressResult {
  return {
    steps: mergeTestRunSteps(trail, fields),
    outcome: testRunVerdict(trail, fields),
  };
}

/** True once a run is no longer "running" — passed or failed both count as finished. */
export function isTestRunFinished(trail: TestRunTrail, fields: Record<string, unknown>): boolean {
  return testRunVerdict(trail, fields) !== "running";
}
