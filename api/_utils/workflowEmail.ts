import {
  ensureListColumns,
  queryListItemById,
  updateListItemFields,
} from "./graphClient.js";
import { logWarn } from "./logger.js";
import { redirectTestMessage, type TestRunRedirect } from "./testRun.js";
import { WORKFLOW_EMAIL_ICONS, type WorkflowEmailIconName } from "./workflowEmailIcons.js";

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
  /** Set for an image the body shows through `cid:<contentId>`. */
  contentId?: string;
  isInline?: boolean;
}

export interface WorkflowEmailContext {
  listTitle: string;
  responseItemId: string | number;
  layer: number;
  /**
   * Set only on a test run, and only by server code that derived it from a
   * verified ticket or the stored row — never from a request body. Carried here
   * because `deliverWorkflowEmail` is the one place every workflow email passes
   * through, so a caller cannot forget to apply it.
   */
  testRun?: TestRunRedirect;
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
              ...(attachment.isInline ? { isInline: true, contentId: attachment.contentId } : {}),
            })),
          } : {}),
        },
        // A layer handled on paper is addressed to the sending mailbox itself.
        // With no Sent Items copy, a message a mailbox sends to itself can
        // leave nothing behind for the owners who watch it, so that one case
        // keeps its copy. Mail to anyone else still leaves none.
        saveToSentItems: recipients.some(
          (recipient) => recipient.trim().toLowerCase() === fromAddress.toLowerCase(),
        ),
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
  const outgoing = context.testRun ? redirectTestMessage(message, context.testRun) : message;
  const recipient = typeof outgoing.to === "string" ? outgoing.to : outgoing.to.join(", ");
  const attemptedAt = new Date().toISOString();
  // Sending the email and noting it on the response row are separate steps, and
  // only the first is the email. A note that cannot be written must not turn a
  // delivered email into a failure (the caller would retry and mail the approver
  // twice), nor replace the reason a send failed with its own.
  const note = async (attempt: WorkflowEmailAttempt): Promise<WorkflowEmailEntry> => {
    try {
      return await persistWorkflowEmailAttempt(token, context, attempt);
    } catch (noteError) {
      logWarn("workflow-email", "Could not record the email attempt on the response row", {
        listTitle: context.listTitle,
        responseItemId: String(context.responseItemId),
        layer: context.layer,
        emailStatus: attempt.status,
        errorMessage: noteError instanceof Error ? noteError.message : String(noteError),
      });
      return recordWorkflowEmailAttempt(undefined, attempt)[String(attempt.layer)];
    }
  };

  try {
    await sendGraphEmail(token, outgoing);
  } catch (error) {
    await note({
      layer: context.layer,
      recipient,
      status: "failed",
      attemptedAt,
      error: "Email delivery failed",
    });
    throw error;
  }
  return note({ layer: context.layer, recipient, status: "sent", attemptedAt });
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

export interface WorkflowEmailFact {
  icon: WorkflowEmailIconName;
  label: string;
  value: string;
}

export interface WorkflowEmailTemplateParams {
  preheader: string;
  /** Shown big under the hero icon: two or three words. */
  title: string;
  heroIcon: WorkflowEmailIconName;
  /** Shown as a badge under the title. Blank omits the badge entirely. */
  referenceNo?: string;
  /** Step tracker. Drawn for 2–6 steps; other counts fall back to a text line. */
  progress?: { current: number; total: number; currentLabel: string; currentTag: string; currentIcon: WorkflowEmailIconName };
  facts: WorkflowEmailFact[];
  /** Public layers: copy → send → sign strip, the link box and the caution note. */
  share?: { url: string; copyHref: string; openHref: string; openLabel: string };
  /** Signed-in layers: the one button and its sign-in hint. */
  primaryAction?: { href: string; label: string; hint: string };
}

export interface RenderedWorkflowEmail {
  html: string;
  /** Inline images the html points at with `cid:`. */
  attachments: WorkflowEmailAttachment[];
}

const EMAIL_FONT_STACK = "'Segoe UI',Arial,Helvetica,sans-serif";
const EMAIL_MONO_STACK = "Consolas,'Courier New',monospace";
const EMAIL_ACCENT = "#0067C0";
const EMAIL_DONE = "#107C41";
const TABLE_ATTRS = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

function spacer(height: number): string {
  return `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0">&nbsp;</td></tr>`;
}

/**
 * Shared shell for every workflow email, built to classic Outlook's rules:
 * Outlook draws mail with Word, which ignores flex, grid, positioning, shadows,
 * web fonts, `max-width` and SVG, and squares off rounded corners. So the layout
 * is nested tables with sizes in attributes, corners are small enough that a
 * square one still looks intended, icons are inline PNGs (cid:) that show
 * without the "download pictures" prompt, and a ghost table pins the width to
 * 600px in Outlook while other clients stay fluid down to phone width.
 */
export function renderWorkflowEmail(params: WorkflowEmailTemplateParams): RenderedWorkflowEmail {
  const used = new Set<WorkflowEmailIconName>();
  const icon = (name: WorkflowEmailIconName, alt = "", inline = false): string => {
    used.add(name);
    const { size } = WORKFLOW_EMAIL_ICONS[name];
    const display = inline ? "display:inline-block;vertical-align:-2px" : "display:block";
    return `<img src="cid:${name}" width="${size}" height="${size}" alt="${escapeHtml(alt)}" style="${display};width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none">`;
  };
  const tile = (size: number, background: string, content: string, extra = ""): string =>
    `<table ${TABLE_ATTRS} align="center" style="border-collapse:collapse"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${background}" style="width:${size}px;height:${size}px;border-radius:6px;${extra}">${content}</td></tr></table>`;

  const referenceNo = (params.referenceNo ?? "").trim();
  const referenceHtml = referenceNo
    ? `${spacer(14)}<tr><td align="center">
              <table ${TABLE_ATTRS} style="border-collapse:collapse"><tr>
                <td bgcolor="#F1F5F9" style="padding:6px 14px;border-radius:4px;font-size:14px;line-height:20px;font-weight:700;color:#0B4A80;white-space:nowrap">${icon("ref", "", true)}&nbsp;${escapeHtml(referenceNo)}</td>
              </tr></table>
            </td></tr>`
    : "";

  let progressHtml = "";
  const progress = params.progress;
  if (progress && progress.total >= 2 && progress.total <= 6) {
    const width = Math.floor(100 / progress.total);
    const columns = Array.from({ length: progress.total }, (_, index) => {
      const step = index + 1;
      const done = step < progress.current;
      const current = step === progress.current;
      const badge = done
        ? tile(40, EMAIL_DONE, icon("step-done", "Done"))
        : current
          ? tile(40, EMAIL_ACCENT, icon(progress.currentIcon))
          : tile(38, "#FFFFFF", String(step), "border:1px solid #CBD5E1;font-size:15px;line-height:18px;font-weight:700;color:#5B6573");
      const name = current ? progress.currentLabel : `Step ${step}`;
      const tag = done ? "Done" : current ? progress.currentTag : "Waiting";
      const colour = done ? "#0E6B38" : current ? "#0B4A80" : "#5B6573";
      const tagColour = done ? "#0E6B38" : current ? EMAIL_ACCENT : "#5B6573";
      const bar = done ? EMAIL_DONE : current ? EMAIL_ACCENT : "#E1E8F0";
      return `<td width="${width}%" align="center" valign="top" style="padding:0 4px">
                  <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse">
                    <tr><td align="center">${badge}</td></tr>
                    <tr><td align="center" style="padding-top:8px;font-size:13px;line-height:18px;font-weight:${current ? 700 : 600};color:${colour}">${escapeHtml(name)}</td></tr>
                    <tr><td align="center" style="font-size:12px;line-height:16px;font-weight:${current ? 700 : 400};color:${tagColour}">${escapeHtml(tag)}</td></tr>
                    <tr><td style="padding-top:8px"><table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse"><tr><td height="4" bgcolor="${bar}" style="height:4px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
                  </table>
                </td>`;
    }).join("");
    progressHtml = `${spacer(24)}<tr><td><table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse;table-layout:fixed"><tr>${columns}</tr></table></td></tr>`;
  } else if (progress && progress.total > 6) {
    progressHtml = `${spacer(16)}<tr><td align="center" style="font-size:13px;line-height:18px;font-weight:600;color:#5B6573">Step ${progress.current} of ${progress.total}</td></tr>`;
  }

  const facts = params.facts.filter((fact) => fact.value.trim());
  const factsHtml = facts.length
    ? `${spacer(24)}<tr><td style="border-top:1px solid #E5EAF1;border-bottom:1px solid #E5EAF1;padding:12px 0">
              <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse">
                ${facts.map((fact, index) => `${index ? `<tr><td colspan="3" height="12" style="height:12px;font-size:0;line-height:0">&nbsp;</td></tr>` : ""}<tr>
                  <td width="36" height="36" align="center" valign="middle" bgcolor="#F1F5F9" style="width:36px;height:36px;border-radius:4px">${icon(fact.icon, fact.label)}</td>
                  <td width="14" style="width:14px;font-size:0;line-height:0">&nbsp;</td>
                  <td valign="middle" style="font-size:15px;line-height:22px;font-weight:600;color:#111827;word-break:break-word">${escapeHtml(fact.value)}</td>
                </tr>`).join("")}
              </table>
            </td></tr>`
    : "";

  // Outlook ignores padding on <a>, so the button's size comes from the cell's
  // mso-padding-alt there and from the link's own padding everywhere else.
  const button = (href: string, label: string): string =>
    `<tr><td><table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse"><tr>
              <td align="center" bgcolor="${EMAIL_ACCENT}" style="border-radius:6px;mso-padding-alt:15px 24px"><a href="${escapeHtml(href)}" style="display:block;padding:15px 24px;font-size:16px;line-height:22px;font-weight:700;color:#FFFFFF;text-decoration:none">${escapeHtml(label)}</a></td>
            </tr></table></td></tr>`;

  let actionHtml = "";
  if (params.share) {
    const step = (name: WorkflowEmailIconName, label: string): string => `<td width="30%" align="center" valign="top">
                  ${tile(38, "#FFFFFF", icon(name), "border:1px solid #D7E3F0")}
                  <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse"><tr><td align="center" style="padding-top:8px;font-size:13px;line-height:18px;font-weight:600;color:#243B53">${label}</td></tr></table>
                </td>`;
    const arrow = `<td width="5%" align="center" valign="top" style="padding-top:10px;font-size:18px;line-height:18px;color:#94A3B8">&#8594;</td>`;
    actionHtml = `${spacer(24)}<tr><td bgcolor="#F7FAFF" style="padding:16px 12px;border:1px solid #E1E8F0;border-radius:6px">
              <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse;table-layout:fixed"><tr>
                ${step("how-copy", "Copy link")}${arrow}${step("how-send", "Send to signer")}${arrow}${step("how-sign", "They sign")}
              </tr></table>
            </td></tr>
            ${spacer(24)}<tr><td bgcolor="#F1F7FE" style="padding:12px 14px;border:1px dashed #A9CDF0;border-radius:6px;font-family:${EMAIL_MONO_STACK};font-size:12px;line-height:18px;word-break:break-all"><a href="${escapeHtml(params.share.url)}" style="color:#0B4A80;text-decoration:none">${escapeHtml(params.share.url)}</a></td></tr>
            ${spacer(12)}${button(params.share.copyHref, "Copy link to share")}
            <tr><td align="center" style="padding:12px 0;font-size:14px;line-height:20px;font-weight:600"><a href="${escapeHtml(params.share.openHref)}" style="color:${EMAIL_ACCENT};text-decoration:underline">${escapeHtml(params.share.openLabel)}</a></td></tr>
            <tr><td bgcolor="#FFF7ED" style="padding:10px 14px;border:1px solid #FED7AA;border-radius:6px">
              <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse"><tr>
                <td width="18" valign="top" style="width:18px;padding-top:1px">${icon("caution", "Caution")}</td>
                <td width="10" style="width:10px;font-size:0;line-height:0">&nbsp;</td>
                <td valign="top" style="font-size:13px;line-height:19px;color:#7C2D12"><b>No sign-in needed</b> — anyone with this link can sign. Send it to one person only.</td>
              </tr></table>
            </td></tr>`;
  } else if (params.primaryAction) {
    actionHtml = `${spacer(24)}${button(params.primaryAction.href, params.primaryAction.label)}
            ${spacer(12)}<tr><td align="center" style="font-size:13px;line-height:18px;color:#5B6573">${icon("lock", "", true)}&nbsp;${escapeHtml(params.primaryAction.hint)}</td></tr>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(params.title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,a,span,h1,b{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  @media only screen and (max-width:600px) {
    .shell { padding:16px 8px !important; }
    .pad { padding-left:18px !important; padding-right:18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#EEF2F6;font-family:${EMAIL_FONT_STACK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(params.preheader)}</div>
<table ${TABLE_ATTRS} width="100%" bgcolor="#EEF2F6" style="background:#EEF2F6;border-collapse:collapse">
  <tr>
    <td class="shell" align="center" style="padding:32px 16px">
      <!--[if mso]><table ${TABLE_ATTRS} width="600" align="center"><tr><td width="600"><![endif]-->
      <table ${TABLE_ATTRS} width="100%" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #DDE3EA;border-radius:6px;border-collapse:separate">
        <tr><td height="4" bgcolor="${EMAIL_ACCENT}" style="height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr>
          <td class="pad" style="padding:16px 32px;border-bottom:1px solid #E5EAF1">
            <table ${TABLE_ATTRS} style="border-collapse:collapse"><tr>
              <td width="18" valign="middle" style="width:18px">${icon("brand")}</td>
              <td width="8" style="width:8px;font-size:0;line-height:0">&nbsp;</td>
              <td valign="middle" style="font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;color:#0B4A80">PMW OSHES</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td class="pad" align="center" style="padding:32px 32px 28px">
            <table ${TABLE_ATTRS} width="100%" style="border-collapse:collapse">
              <tr><td align="center">${tile(64, "#E6F0FA", icon(params.heroIcon), "border-radius:8px")}</td></tr>
              ${spacer(14)}<tr><td align="center"><h1 style="margin:0;font-size:26px;line-height:32px;font-weight:700;color:#111827">${escapeHtml(params.title)}</h1></td></tr>
              ${referenceHtml}
              ${progressHtml}
              ${factsHtml}
              ${actionHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" align="center" bgcolor="#F8FAFC" style="padding:14px 32px;border-top:1px solid #E5EAF1;font-size:12px;line-height:18px;color:#5B6573">Automated message from PMW OSHES · Files and history are in the portal</td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

  const attachments: WorkflowEmailAttachment[] = [...used].map((name) => ({
    name: `${name}.png`,
    contentType: "image/png",
    contentBytes: WORKFLOW_EMAIL_ICONS[name].data,
    contentId: name,
    isInline: true,
  }));
  return { html, attachments };
}

export function buildWorkflowActionEmail(
  params: WorkflowActionEmailParams,
): WorkflowEmailMessage {
  const isEvaluation = params.layerType === "evaluation";
  const actionNoun = isEvaluation ? "evaluation" : "approval";
  const isPublic = params.authMode
    ? params.authMode === "public"
    : isPublicReviewLink(params.reviewLink);
  const submissionId = `#${params.responseItemId}`;

  // The reference is the ID people search their mailbox for, so it rides in the
  // subject and the badge. Both disappear on forms that do not issue references.
  const referenceNo = (params.referenceNo ?? "").trim();
  const referenceSuffix = referenceNo ? ` · ${referenceNo}` : "";
  const subjectLead = isPublic ? "Share to sign" : isEvaluation ? "To evaluate" : "To approve";

  const rendered = renderWorkflowEmail({
    // The line the inbox shows next to the subject.
    preheader: isPublic
      ? `${params.formTitle} ${referenceNo || submissionId}: pass the ${actionNoun} link to the signer.`
      : `${params.formTitle} ${referenceNo || submissionId} is waiting for your ${actionNoun}.`,
    title: isPublic
      ? `Share the ${actionNoun} link`
      : isEvaluation ? "Please evaluate" : "Please approve",
    heroIcon: isPublic ? "hero-link" : isEvaluation ? "hero-evaluate" : "hero-approve",
    referenceNo,
    progress: {
      current: params.layer,
      total: params.totalLayers,
      currentLabel: isEvaluation ? "Evaluate" : "Approve",
      currentTag: isPublic ? "Now" : "Your step",
      currentIcon: isEvaluation ? "step-evaluate" : "step-approve",
    },
    facts: [
      { icon: "fact-form", label: "Form", value: params.formTitle },
      { icon: "fact-user", label: "Submitted by", value: params.submittedBy },
      { icon: "fact-clock", label: "Submitted on", value: formatSubmittedAt(params.submittedAt) },
    ],
    ...(isPublic
      ? {
        share: {
          url: params.reviewLink,
          copyHref: buildShareLinkUrl(params.reviewLink),
          openHref: params.reviewLink,
          openLabel: "Or open it myself",
        },
      }
      : {
        primaryAction: {
          href: params.reviewLink,
          label: `Open ${actionNoun} →`,
          hint: "Sign in with your PMW account",
        },
      }),
  });

  return {
    to: toRecipientList(params.recipient),
    subject: `${subjectLead}: ${params.formTitle}${referenceSuffix}`,
    body: rendered.html,
    attachments: rendered.attachments,
  };
}

export function getApplicationBaseUrl(): string {
  const configured = process.env.APP_BASE_URL || process.env.VITE_APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return process.env.VITE_APP_BASE_URL || "http://localhost:3000";
}
