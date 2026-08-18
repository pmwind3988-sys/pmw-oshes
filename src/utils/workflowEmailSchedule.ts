import type { EvaluationEmailSchedule } from "../types";

export type ScheduledWorkflowEmailStatus = "scheduled" | "sent" | "failed" | "cancelled";

export interface ScheduledWorkflowEmail {
  layer: number;
  recipient: string;
  dueAt: string;
  status: ScheduledWorkflowEmailStatus;
  updatedAt: string;
  layerType?: "approval" | "evaluation";
  totalLayers?: number;
  reviewLink?: string;
  submittedBy?: string;
  /** Lets the cron rebuild the same public/365 email the immediate send would have produced. */
  authMode?: "365" | "public";
  submittedAt?: string;
}

export type WorkflowEmailScheduleLog = Record<string, ScheduledWorkflowEmail>;

function parseScheduleLog(raw: unknown): WorkflowEmailScheduleLog {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as WorkflowEmailScheduleLog;
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as WorkflowEmailScheduleLog
      : {};
  } catch {
    return {};
  }
}

function addCalendarMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const targetDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDay));
  return result;
}

export function resolveEvaluationEmailDueAt(
  schedule: EvaluationEmailSchedule | undefined,
  activatedAt = new Date(),
): string {
  if (!schedule || schedule.mode === "immediate") return activatedAt.toISOString();
  if (schedule.mode === "three_months") {
    return addCalendarMonthsClamped(activatedAt, 3).toISOString();
  }
  const customDays = Math.max(1, Math.trunc(schedule.customDays ?? 1));
  const result = new Date(activatedAt);
  result.setUTCDate(result.getUTCDate() + customDays);
  return result.toISOString();
}

export function setScheduledWorkflowEmail(
  raw: unknown,
  entry: ScheduledWorkflowEmail,
): WorkflowEmailScheduleLog {
  return {
    ...parseScheduleLog(raw),
    [String(entry.layer)]: entry,
  };
}

/**
 * Stand every queued reminder down.
 *
 * The cron only ever sends entries still marked `scheduled`, and it does not
 * look at FormStatus — so a withdrawn record whose schedule is left alone keeps
 * chasing an approver for a signature nobody wants any more. Cancelling the
 * record has to cancel the post as well; entries already sent are left as the
 * record of what went out.
 */
export function cancelScheduledWorkflowEmails(
  raw: unknown,
  updatedAt: string,
): WorkflowEmailScheduleLog {
  const schedule = parseScheduleLog(raw);
  const next: WorkflowEmailScheduleLog = {};
  for (const [layer, entry] of Object.entries(schedule)) {
    next[layer] = entry.status === "scheduled" ? { ...entry, status: "cancelled", updatedAt } : entry;
  }
  return next;
}

export function getScheduledWorkflowEmail(
  raw: unknown,
  layerNumber: number,
): ScheduledWorkflowEmail | null {
  return parseScheduleLog(raw)[String(layerNumber)] ?? null;
}

export function updateScheduledWorkflowEmailRecipient(
  raw: unknown,
  layerNumber: number,
  recipient: string,
  updatedAt: string,
): WorkflowEmailScheduleLog {
  const schedule = parseScheduleLog(raw);
  const existing = schedule[String(layerNumber)];
  if (!existing) return schedule;
  return setScheduledWorkflowEmail(schedule, {
    ...existing,
    recipient: recipient.trim(),
    updatedAt,
  });
}

export function isValidFutureScheduleDate(
  value: string,
  now = new Date(),
): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= now.getTime();
}
