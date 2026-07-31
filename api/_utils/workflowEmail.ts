import {
  ensureListColumns,
  queryListItemById,
  updateListItemFields,
} from "./graphClient.js";

export type WorkflowEmailDeliveryStatus = "sent" | "failed";

export interface WorkflowEmailEntry {
  layer: number;
  recipient: string;
  status: WorkflowEmailDeliveryStatus;
  attempts: number;
  lastAttemptAt: string;
  sentAt?: string;
  error?: string;
}

export type WorkflowEmailLog = Record<string, WorkflowEmailEntry>;
export type WorkflowEmailScheduleMode = "immediate" | "three_months" | "custom_days";
export type WorkflowEmailScheduleStatus = "scheduled" | "sending" | "sent" | "failed";

export interface WorkflowEmailScheduleConfig {
  mode: WorkflowEmailScheduleMode;
  customDays?: number;
}

export interface WorkflowEmailScheduleEntry {
  layer: number;
  recipient: string;
  dueAt: string;
  status: WorkflowEmailScheduleStatus;
  updatedAt: string;
  layerType: "approval" | "evaluation";
  totalLayers: number;
  reviewLink: string;
  submittedBy: string;
}

export type WorkflowEmailScheduleLog = Record<string, WorkflowEmailScheduleEntry>;

interface WorkflowEmailAttempt {
  layer: number;
  recipient: string;
  status: WorkflowEmailDeliveryStatus;
  attemptedAt: string;
  error?: string;
}

export interface WorkflowEmailMessage {
  to: string | string[];
  subject: string;
  body: string;
  attachments?: WorkflowEmailAttachment[];
}

export interface WorkflowEmailAttachment {
  name: string;
  contentType: string;
  /** Base64 payload, without the data: URI prefix. */
  contentBytes: string;
}

export interface WorkflowEmailContext {
  listTitle: string;
  responseItemId: string | number;
  layer: number;
}

export interface WorkflowActionEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  recipient: string;
  layerType: "approval" | "evaluation";
  reviewLink: string;
}

function parseWorkflowEmailLog(raw: unknown): WorkflowEmailLog {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as WorkflowEmailLog
      : {};
  } catch {
    return {};
  }
}

export function parseWorkflowEmailSchedule(raw: unknown): WorkflowEmailScheduleLog {
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

export function resolveWorkflowEmailDueAt(
  schedule: WorkflowEmailScheduleConfig | undefined,
  activatedAt = new Date(),
): string {
  if (!schedule || schedule.mode === "immediate") return activatedAt.toISOString();
  if (schedule.mode === "three_months") {
    return addCalendarMonthsClamped(activatedAt, 3).toISOString();
  }
  const days = Math.max(1, Math.trunc(schedule.customDays ?? 1));
  const result = new Date(activatedAt);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

export function setWorkflowEmailSchedule(
  raw: unknown,
  entry: WorkflowEmailScheduleEntry,
): WorkflowEmailScheduleLog {
  return {
    ...parseWorkflowEmailSchedule(raw),
    [String(entry.layer)]: entry,
  };
}

export function getDueWorkflowEmailSchedules(
  raw: unknown,
  now = new Date(),
): WorkflowEmailScheduleEntry[] {
  const nowTime = now.getTime();
  return Object.values(parseWorkflowEmailSchedule(raw)).filter((entry) => {
    if (entry.status !== "scheduled") return false;
    const dueTime = Date.parse(entry.dueAt);
    return Number.isFinite(dueTime) && dueTime <= nowTime;
  });
}

export function recordWorkflowEmailAttempt(
  raw: unknown,
  attempt: WorkflowEmailAttempt,
): WorkflowEmailLog {
  const log = parseWorkflowEmailLog(raw);
  const key = String(attempt.layer);
  const previous = log[key];
  const next: WorkflowEmailEntry = {
    layer: attempt.layer,
    recipient: attempt.recipient,
    status: attempt.status,
    attempts: (previous?.attempts ?? 0) + 1,
    lastAttemptAt: attempt.attemptedAt,
  };
  if (attempt.status === "sent") {
    next.sentAt = attempt.attemptedAt;
  } else {
    next.error = attempt.error || "Email delivery failed";
  }
  return { ...log, [key]: next };
}

export function resolveOshesFormSender(): string {
  return (
    process.env.OSHES_FORM_EMAIL_FROM_ADDRESS ||
    process.env.VITE_OSHES_FORM_EMAIL_FROM_ADDRESS ||
    process.env.HR_FORM_EMAIL_FROM_ADDRESS ||
    process.env.VITE_HR_FORM_EMAIL_FROM_ADDRESS ||
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.VITE_EMAIL_FROM_ADDRESS ||
    ""
  );
}

export async function sendGraphEmail(
  token: string,
  message: WorkflowEmailMessage,
): Promise<void> {
  const recipients = typeof message.to === "string" ? [message.to] : message.to;
  const fromAddress = resolveOshesFormSender();
  if (!fromAddress) {
    throw new Error("OSHES form email sender is not configured.");
  }

  const graphRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: {
            contentType: "HTML",
            content: message.body,
          },
          toRecipients: recipients.map((recipient) => ({
            emailAddress: { address: recipient },
          })),
          ...(message.attachments?.length ? {
            attachments: message.attachments.map((attachment) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.name,
              contentType: attachment.contentType,
              contentBytes: attachment.contentBytes,
            })),
          } : {}),
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!graphRes.ok) {
    throw new Error(`Graph sendMail failed with status ${graphRes.status}.`);
  }
}

async function persistWorkflowEmailAttempt(
  token: string,
  context: WorkflowEmailContext,
  attempt: WorkflowEmailAttempt,
): Promise<WorkflowEmailEntry> {
  await ensureListColumns(token, context.listTitle, [
    {
      name: "WorkflowEmailLog",
      displayName: "WorkflowEmailLog",
      type: "note",
    },
  ]);
  const item = await queryListItemById(
    token,
    context.listTitle,
    String(context.responseItemId),
  );
  const log = recordWorkflowEmailAttempt(item?.fields.WorkflowEmailLog, attempt);
  const schedule = parseWorkflowEmailSchedule(item?.fields.WorkflowEmailSchedule);
  const scheduledEntry = schedule[String(context.layer)];
  const fields: Record<string, unknown> = { WorkflowEmailLog: JSON.stringify(log) };
  if (scheduledEntry) {
    fields.WorkflowEmailSchedule = JSON.stringify(setWorkflowEmailSchedule(schedule, {
      ...scheduledEntry,
      status: attempt.status,
      updatedAt: attempt.attemptedAt,
    }));
  }
  await updateListItemFields(
    token,
    context.listTitle,
    String(context.responseItemId),
    fields,
  );
  return log[String(context.layer)];
}

export async function persistWorkflowEmailSchedule(
  token: string,
  context: WorkflowEmailContext,
  entry: WorkflowEmailScheduleEntry,
): Promise<WorkflowEmailScheduleEntry> {
  await ensureListColumns(token, context.listTitle, [
    { name: "WorkflowEmailSchedule", displayName: "WorkflowEmailSchedule", type: "note" },
    { name: "WorkflowEmailLog", displayName: "WorkflowEmailLog", type: "note" },
  ]);
  const item = await queryListItemById(token, context.listTitle, String(context.responseItemId));
  const schedule = setWorkflowEmailSchedule(item?.fields.WorkflowEmailSchedule, entry);
  await updateListItemFields(token, context.listTitle, String(context.responseItemId), {
    WorkflowEmailSchedule: JSON.stringify(schedule),
  });
  return schedule[String(entry.layer)];
}

export async function scheduleOrDeliverWorkflowEmail(
  token: string,
  message: WorkflowEmailMessage,
  context: WorkflowEmailContext,
  config: WorkflowEmailScheduleConfig | undefined,
  details: Omit<WorkflowEmailScheduleEntry, "recipient" | "dueAt" | "status" | "updatedAt">,
): Promise<WorkflowEmailScheduleEntry> {
  const now = new Date();
  const recipient = typeof message.to === "string" ? message.to : message.to.join(", ");
  const entry: WorkflowEmailScheduleEntry = {
    ...details,
    layer: context.layer,
    recipient,
    dueAt: resolveWorkflowEmailDueAt(config, now),
    status: "scheduled",
    updatedAt: now.toISOString(),
  };
  await persistWorkflowEmailSchedule(token, context, entry);
  if (!config || config.mode === "immediate") {
    await deliverWorkflowEmail(token, message, context);
    return { ...entry, status: "sent", updatedAt: new Date().toISOString() };
  }
  return entry;
}

export async function deliverWorkflowEmail(
  token: string,
  message: WorkflowEmailMessage,
  context: WorkflowEmailContext,
): Promise<WorkflowEmailEntry> {
  const recipient = typeof message.to === "string" ? message.to : message.to.join(", ");
  const attemptedAt = new Date().toISOString();
  try {
    await sendGraphEmail(token, message);
    return await persistWorkflowEmailAttempt(token, context, {
      layer: context.layer,
      recipient,
      status: "sent",
      attemptedAt,
    });
  } catch (error) {
    await persistWorkflowEmailAttempt(token, context, {
      layer: context.layer,
      recipient,
      status: "failed",
      attemptedAt,
      error: "Email delivery failed",
    });
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildWorkflowActionEmail(
  params: WorkflowActionEmailParams,
): WorkflowEmailMessage {
  const actionNoun = params.layerType === "evaluation" ? "evaluation review" : "approval";
  const actionVerb = params.layerType === "evaluation" ? "review" : "approve";
  return {
    to: params.recipient,
    subject: `Action required: ${params.formTitle} needs your ${actionNoun}`,
    body: `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f3f6fa;font-family:'Segoe UI',Arial,sans-serif;color:#111827">
  <div style="max-width:584px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px">
    <div style="font-size:12px;font-weight:700;color:#0078d4;text-transform:uppercase;letter-spacing:.08em">PMW OSHES Form</div>
    <h1 style="font-size:22px;line-height:28px;margin:12px 0 8px">${escapeHtml(params.formTitle)} needs your ${escapeHtml(actionNoun)}</h1>
    <p style="font-size:14px;line-height:22px;color:#4b5563">A submission is waiting for you to ${escapeHtml(actionVerb)}.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr><td style="padding:8px 0;color:#6b7280">Submission ID</td><td style="padding:8px 0;font-weight:600">#${escapeHtml(String(params.responseItemId))}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Submitted by</td><td style="padding:8px 0;font-weight:600">${escapeHtml(params.submittedBy)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Workflow stage</td><td style="padding:8px 0;font-weight:600">Layer ${params.layer} of ${params.totalLayers}</td></tr>
    </table>
    <a href="${escapeHtml(params.reviewLink)}" style="display:inline-block;background:#0078d4;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open ${params.layerType === "evaluation" ? "evaluation" : "approval"}</a>
  </div>
</body>
</html>`,
  };
}

export function getApplicationBaseUrl(): string {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return process.env.VITE_APP_BASE_URL || "http://localhost:3000";
}
