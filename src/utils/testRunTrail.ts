/**
 * testRunTrail.ts — the checklist a test run leaves behind.
 *
 * Stored as one JSON object on the response row's `TestRunLog` column, keyed by
 * step id. Keyed rather than appended to an array for the same reason
 * `WorkflowEmailLog` is: a step that runs twice — a pending PDF check that later
 * completes, a retried send — should update its line, and two layers writing at
 * once should merge instead of clobbering.
 *
 * `order` rather than insertion order decides how the checklist reads, because
 * the browser writes the last step (the PDF render) long after the server wrote
 * the ones before it.
 *
 * `api/_utils/testRunTrail.ts` is the server-side copy of this file; `api/`
 * cannot import from `src/`. Keep the two in step.
 */

export const TEST_RUN_LOG_FIELD = "TestRunLog";

export type TestRunStepStatus = "pass" | "fail" | "warn" | "skip" | "pending";

export interface TestRunStep {
  step: string;
  label: string;
  status: TestRunStepStatus;
  detail?: string;
  /** ISO timestamp. */
  at: string;
  /** Position in the run, so the checklist reads in the order things happen. */
  order: number;
}

export type TestRunTrail = Record<string, TestRunStep>;

const STATUSES: TestRunStepStatus[] = ["pass", "fail", "warn", "skip", "pending"];

function toStep(value: unknown): TestRunStep | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.step !== "string" || !record.step) return null;
  if (typeof record.label !== "string") return null;
  if (typeof record.status !== "string" || !STATUSES.includes(record.status as TestRunStepStatus)) return null;
  return {
    step: record.step,
    label: record.label,
    status: record.status as TestRunStepStatus,
    detail: typeof record.detail === "string" ? record.detail : undefined,
    at: typeof record.at === "string" ? record.at : "",
    order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0,
  };
}

export function parseTestRunTrail(raw: unknown): TestRunTrail {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const trail: TestRunTrail = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const step = toStep(value);
      if (step) trail[key] = step;
    }
    return trail;
  } catch {
    return {};
  }
}

export function appendTestRunStep(
  raw: unknown,
  step: Omit<TestRunStep, "at">,
  now: Date = new Date(),
): string {
  const trail = parseTestRunTrail(raw);
  trail[step.step] = { ...step, at: now.toISOString() };
  return JSON.stringify(trail);
}

export function orderedTestRunSteps(trail: TestRunTrail): TestRunStep[] {
  return Object.values(trail).sort((a, b) => a.order - b.order || a.at.localeCompare(b.at));
}

export function testRunOutcome(trail: TestRunTrail): "passed" | "failed" | "running" {
  const steps = Object.values(trail);
  if (steps.some((step) => step.status === "fail")) return "failed";
  // An empty trail means nothing has been recorded yet — not that everything
  // recorded passed. Reporting "passed" here would show a green checkmark for
  // a run whose steps never wrote, which is the worst possible failure mode
  // for a feature whose entire output is a pass/fail verdict.
  if (steps.length === 0) return "running";
  if (steps.some((step) => step.status === "pending")) return "running";
  return "passed";
}
