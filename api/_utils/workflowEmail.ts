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
  /** Optional — entries persisted before this field existed infer it from the link shape. */
  authMode?: WorkflowLayerAuthMode;
  submittedAt?: string;
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

export type WorkflowLayerAuthMode = "365" | "public";

export interface WorkflowActionEmailParams {
  formTitle: string;
  submittedBy: string;
  responseItemId: string | number;
  layer: number;
  totalLayers: number;
  /**
   * One address, several, or the "a@x.com; b@x.com" string a shared layer's
   * schedule entry stores — a shared layer has no single holder to address.
   */
  recipient: string | string[];
  layerType: "approval" | "evaluation";
  reviewLink: string;
  /**
   * How the layer is reached. A public layer's link opens without a sign-in and
   * is meant to be passed on, so its email leads with the link rather than a
   * "this is your task" call to action. Omitted for schedule entries written
   * before the field existed — the link shape then decides.
   */
  authMode?: WorkflowLayerAuthMode;
  submittedAt?: string;
  /**
   * The reference the reporter was given. Leads the detail table and is echoed
   * in the subject, because that is the ID people search their mailbox for.
   */
  referenceNo?: string;
}

/** Splits a recipient field into addresses, whichever shape it arrived in. */
export function toRecipientList(recipient: string | string[]): string[] {
  const entries = Array.isArray(recipient) ? recipient : recipient.split(/[;,\n]/);
  return entries.map((entry) => entry.trim()).filter(Boolean);
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
  ).trim();
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
    throw new Error(await describeSendMailFailure(graphRes, fromAddress));
  }
}

/**
 * Graph reports an unresolvable sender as a bare 404, which reads like a wrong
 * URL rather than the configuration error it is. The status alone sent whoever
 * read the log looking for a broken endpoint, so name the sender and quote what
 * Graph actually said.
 */
async function describeSendMailFailure(response: Response, fromAddress: string): Promise<string> {
  let detail = "";
  let code = "";
  try {
    const text = await response.text();
    try {
      code = String((JSON.parse(text) as { error?: { code?: unknown } })?.error?.code ?? "");
    } catch {
      /* Graph returned something other than its usual error envelope. */
    }
    detail = text.slice(0, 300);
  } catch {
    /* Body already consumed or unreadable — the status still says something. */
  }

  // 404 is never transient, and it does not necessarily mean the address is
  // wrong: sendMail only accepts a user or shared mailbox. A Microsoft 365 group
  // or distribution list — which people reasonably call a shared mailbox — is
  // rejected identically, as ErrorInvalidUser. Retrying cannot fix either case.
  if (response.status === 404) {
    return (
      `Graph sendMail failed with status 404: Graph could not resolve "${fromAddress}" as a sending mailbox. ` +
      `Either it does not exist in this tenant, or it is a Microsoft 365 group or distribution list rather ` +
      `than a user or shared mailbox, which cannot send app-only mail. Check with: ` +
      `Get-Recipient <address> | Format-List RecipientTypeDetails. ${detail}`
    );
  }
  if (response.status === 403) {
    return (
      `Graph sendMail failed with status 403: the app is not allowed to send as "${fromAddress}". ` +
      `Check the Mail.Send application permission and any Exchange application access policy. ${detail}`
    );
  }
  return `Graph sendMail failed with status ${response.status}${code ? ` (${code})` : ""}. ${detail}`;
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

/**
 * A public layer is reached by token — `/eval/<token>` — while a 365 layer
 * carries the form slug, item and layer in the path. Schedule entries written
 * before `authMode` was persisted still have the link, so read it back from
 * there rather than defaulting everyone to the sign-in wording.
 */
export function isPublicReviewLink(reviewLink: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(reviewLink).pathname;
  } catch {
    return false;
  }
  const marker = pathname.indexOf("/eval/");
  if (marker < 0) return false;
  return pathname.slice(marker + "/eval/".length).split("/").filter(Boolean).length === 1;
}

/**
 * Mail clients strip scripts, so the email cannot copy anything itself. The
 * copy button points at this page instead, which holds the link and does the
 * clipboard write on click.
 */
export function buildShareLinkUrl(reviewLink: string, baseUrl = getApplicationBaseUrl()): string {
  return `${baseUrl}/share-link?u=${encodeURIComponent(reviewLink)}`;
}

function formatSubmittedAt(value: string | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const formatted = parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kuala_Lumpur",
  });
  return `${formatted} (MYT)`;
}

export interface WorkflowEmailDetail {
  label: string;
  value: string | number;
}

export interface WorkflowEmailTemplateParams {
  preheader: string;
  statusLabel: string;
  title: string;
  subtitle: string;
  /**
   * Shown as a badge under the subtitle. Blank omits the badge entirely, so a
   * form that issues no reference is not given an empty box.
   */
  referenceNo?: string;
  progress?: { current: number; total: number };
  details: WorkflowEmailDetail[];
  instructions?: string[];
  primaryAction?: { href: string; label: string };
  /** Renders the copy-link card a public step needs before its button. */
  shareLink?: { url: string; href: string };
  secondaryAction?: { href: string; label: string };
  note?: string;
}

const EMAIL_FONT_STACK =
  "Inter,'Segoe UI','Aptos','Helvetica Neue',Arial,sans-serif";
const EMAIL_MONO_STACK =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/**
 * Shared shell for every workflow email. Table-based and inline-styled because
 * Outlook ignores most of anything else; the `@media` block only has to sharpen
 * what already reads acceptably at 584px.
 */
export function renderWorkflowEmail(params: WorkflowEmailTemplateParams): string {
  const detailRows = params.details
    .filter((detail) => String(detail.value).trim())
    .map((detail) => `<tr>
              <td class="stack" style="padding:10px 0 0;font-size:12px;line-height:18px;color:#6B7280;width:150px;vertical-align:top">${escapeHtml(detail.label)}</td>
              <td class="stack" style="padding:10px 0;font-size:14px;line-height:20px;color:#111827;font-weight:600;vertical-align:top;word-break:break-word">${escapeHtml(String(detail.value))}</td>
            </tr>`)
    .join("");

  // The reference is the handle people quote back, so it gets its own badge
  // above the details rather than sitting as one grey row among nine. Tables and
  // inline styles, like the rest of the shell, because Outlook drops the
  // alternatives.
  const referenceHtml = (params.referenceNo ?? "").trim()
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#EDF7FE;border:1px solid #D7ECFA;border-radius:8px">
              <tr><td style="padding:9px 14px">
                <div style="font-size:12px;line-height:16px;font-weight:800;color:#0B4A80;text-transform:uppercase;letter-spacing:0.08em">Reference no.</div>
                <div style="margin-top:2px;font-size:20px;line-height:26px;font-weight:800;color:#005A9E;letter-spacing:0.02em">${escapeHtml(params.referenceNo!.trim())}</div>
              </td></tr>
            </table>`
    : "";

  const progressHtml = params.progress && params.progress.total > 1 && params.progress.total <= 12
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${
      Array.from({ length: params.progress.total }, (_, index) => {
        const done = index + 1 <= params.progress!.current;
        return `<td style="padding-right:${index + 1 === params.progress!.total ? 0 : 4}px"><div style="height:6px;border-radius:999px;background:${done ? "#0078D4" : "#E1E8F0"};font-size:0;line-height:0">&nbsp;</div></td>`;
      }).join("")
    }</tr></table>`
    : "";

  const instructionsHtml = params.instructions?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;background:#F7FAFF;border:1px solid #E1E8F0;border-radius:12px">
              <tr><td style="padding:18px 20px 6px;font-size:12px;line-height:16px;font-weight:800;color:#0B4A80;text-transform:uppercase;letter-spacing:0.06em">What you need to do</td></tr>
              <tr><td style="padding:0 20px 18px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${params.instructions.map((step, index) => `<tr>
                    <td style="padding:8px 10px 0 0;width:24px;vertical-align:top"><div style="width:22px;height:22px;border-radius:999px;background:#0078D4;color:#FFFFFF;font-size:12px;line-height:22px;font-weight:800;text-align:center">${index + 1}</div></td>
                    <td style="padding:8px 0 0;font-size:14px;line-height:21px;color:#243B53">${escapeHtml(step)}</td>
                  </tr>`).join("")}
                </table>
              </td></tr>
            </table>`
    : "";

  const shareHtml = params.shareLink
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0">
              <tr><td style="padding:0 0 8px;font-size:12px;line-height:16px;font-weight:800;color:#0B4A80;text-transform:uppercase;letter-spacing:0.06em">Shareable review link</td></tr>
              <tr><td style="padding:14px 16px;background:#F1F7FE;border:1px dashed #A9CDF0;border-radius:12px">
                <a href="${escapeHtml(params.shareLink.url)}" style="font-family:${EMAIL_MONO_STACK};font-size:12px;line-height:19px;color:#0B4A80;text-decoration:none;word-break:break-all">${escapeHtml(params.shareLink.url)}</a>
              </td></tr>
            </table>`
    : "";

  const primaryHtml = params.primaryAction
    ? `<tr><td align="center" style="padding:22px 0 0">
                <a class="btn" href="${escapeHtml(params.primaryAction.href)}" style="display:inline-block;background:#0078D4;color:#FFFFFF;padding:14px 30px;border-radius:10px;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;box-shadow:0 2px 6px rgba(0,120,212,0.28)">${escapeHtml(params.primaryAction.label)}</a>
              </td></tr>`
    : "";

  const secondaryHtml = params.secondaryAction
    ? `<tr><td align="center" style="padding:12px 0 0;font-size:13px;line-height:19px;color:#6B7280">
                <a href="${escapeHtml(params.secondaryAction.href)}" style="color:#0078D4;text-decoration:underline;font-weight:600">${escapeHtml(params.secondaryAction.label)}</a>
              </td></tr>`
    : "";

  const noteHtml = params.note
    ? `<tr><td style="padding:22px 0 0;font-size:12px;line-height:19px;color:#6B7280">${escapeHtml(params.note)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(params.title)}</title>
<style>
  @media only screen and (max-width:600px) {
    .shell { padding:16px 10px !important; }
    .pad { padding:22px 20px !important; }
    .title { font-size:20px !important; line-height:27px !important; }
    .stack { display:block !important; width:100% !important; padding-bottom:0 !important; }
    .btn { display:block !important; width:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#F3F6FA;font-family:${EMAIL_FONT_STACK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6FA">
  <tr>
    <td class="shell" align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(17,24,39,0.06),0 12px 32px rgba(17,24,39,0.08)">
        <tr><td style="height:4px;background:#0078D4;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td class="pad" style="padding:22px 28px;border-bottom:1px solid #E5EAF1">
            <div style="font-size:12px;line-height:16px;color:#0B4A80;font-weight:800;text-transform:uppercase;letter-spacing:0.08em">PMW OSHES Form</div>
            <div style="margin-top:4px;font-size:13px;line-height:18px;color:#6B7280">Automated workflow notification</div>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:28px">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:999px">
              <tr><td style="padding:6px 12px;font-size:11px;line-height:14px;font-weight:800;color:#1E40AF;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(params.statusLabel)}</td></tr>
            </table>
            <h1 class="title" style="margin:0 0 8px;font-size:23px;line-height:30px;color:#111827;font-weight:750">${escapeHtml(params.title)}</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#4B5563">${escapeHtml(params.subtitle)}</p>
            ${referenceHtml}
            ${progressHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E5EAF1;border-bottom:1px solid #E5EAF1">
              ${detailRows}
            </table>
            ${instructionsHtml}
            ${shareHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${primaryHtml}
              ${secondaryHtml}
              ${noteHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E5EAF1;font-size:12px;line-height:18px;color:#6B7280">
            This is an automated notification. Attachments, comments and the full audit history stay in PMW OSHES Forms.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function buildWorkflowActionEmail(
  params: WorkflowActionEmailParams,
): WorkflowEmailMessage {
  const isEvaluation = params.layerType === "evaluation";
  const actionNoun = isEvaluation ? "evaluation review" : "approval";
  const actionVerb = isEvaluation ? "review" : "approve";
  const openLabel = isEvaluation ? "Open evaluation" : "Open approval";
  const isPublic = params.authMode
    ? params.authMode === "public"
    : isPublicReviewLink(params.reviewLink);
  const submissionId = `#${params.responseItemId}`;

  // The reference gets the badge under the subtitle and the subject suffix, so
  // it is deliberately *not* repeated as a detail row. Both disappear on forms
  // that do not issue references.
  const referenceNo = (params.referenceNo ?? "").trim();
  const referenceSuffix = referenceNo ? ` [${referenceNo}]` : "";

  const details: WorkflowEmailDetail[] = [
    { label: "Form", value: params.formTitle },
    { label: "Submission ID", value: submissionId },
    { label: "Submitted by", value: params.submittedBy },
    { label: "Submitted on", value: formatSubmittedAt(params.submittedAt) },
    { label: "Workflow stage", value: `Layer ${params.layer} of ${params.totalLayers}` },
    { label: "Step type", value: isEvaluation ? "Evaluation" : "Approval" },
    {
      label: "Action needed",
      value: isEvaluation ? "Complete the evaluation" : "Approve or reject",
    },
    {
      label: "Access",
      value: isPublic ? "Public link — no sign-in needed" : "PMW OSHES account sign-in",
    },
  ];

  const instructions = isPublic
    ? [
      `Copy the review link below — use the "Copy review link" button if you would rather not select it by hand.`,
      `Send the link to whoever must ${actionVerb} this submission. It opens without a sign-in, so they do not need a PMW OSHES account.`,
      `They review the submission and record the decision. Whoever completes it is recorded against Layer ${params.layer}, and the workflow then moves on by itself.`,
    ]
    : [
      `Open the ${isEvaluation ? "evaluation" : "approval"} with the button below and sign in with your PMW OSHES account.`,
      "Check the submission details, earlier layers' decisions and any attachments.",
      `Record your decision. Layer ${params.layer} of ${params.totalLayers} closes and the workflow moves to the next step automatically.`,
    ];

  return {
    to: toRecipientList(params.recipient),
    subject: isPublic
      ? `Action required: share the ${actionNoun} link for ${params.formTitle}${referenceSuffix}`
      : `Action required: ${params.formTitle} needs your ${actionNoun}${referenceSuffix}`,
    body: renderWorkflowEmail({
      // The preheader is the line the inbox shows next to the subject, so it
      // leads with the reference where there is one and only falls back to the
      // item id where there is not.
      preheader: isPublic
        ? `${params.formTitle} ${referenceNo || submissionId} needs its ${actionNoun} link passed on.`
        : `${params.formTitle} ${referenceNo || submissionId} is waiting for your ${actionNoun}.`,
      statusLabel: "Action required",
      referenceNo,
      title: isPublic
        ? `${params.formTitle} needs an ${actionNoun}`
        : `${params.formTitle} needs your ${actionNoun}`,
      subtitle: isPublic
        ? `This step is reached through a link that anyone can open, so it can be passed to the right person.`
        : `A submission is waiting for you to ${actionVerb} it.`,
      progress: { current: params.layer, total: params.totalLayers },
      details,
      instructions,
      ...(isPublic
        ? {
          shareLink: {
            url: params.reviewLink,
            href: buildShareLinkUrl(params.reviewLink),
          },
          primaryAction: {
            href: buildShareLinkUrl(params.reviewLink),
            label: "Copy review link",
          },
          secondaryAction: { href: params.reviewLink, label: `${openLabel} myself` },
        }
        : {
          primaryAction: { href: params.reviewLink, label: openLabel },
        }),
      note: isPublic
        ? "Anyone holding this link can complete the step, so share it only with the person who should sign."
        : "Only the assigned reviewer or an authorised superuser should act on this workflow step.",
    }),
  };
}

export function getApplicationBaseUrl(): string {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return process.env.VITE_APP_BASE_URL || "http://localhost:3000";
}
