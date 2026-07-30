import type { EvaluationEmailSchedule } from "../types";

export type ScheduledWorkflowEmailStatus = "scheduled" | "sent" | "failed";

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
