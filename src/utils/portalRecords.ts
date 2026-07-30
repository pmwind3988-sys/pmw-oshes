import type {
  CatalogueEntry,
  PortalChainStep,
  PortalRecord,
  PortalStatus,
  SeverityTone,
  Submission,
} from "../types";
import { layerRoleLabel, displayName, firstName, normalizeEmail, type PeopleDirectory } from "./portalPeople";
import { formatAgo, formatHours, hoursBetween, parseDate } from "./portalTime";
import { coerceFieldDisplayText, isPlaceholderDisplayValue } from "./submissionDisplay";

function normalizeFieldKey(key: string): string {
  return key.replace(/_x[0-9a-f]{4}_/gi, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** First non-placeholder value whose normalized key contains one of the hints. */
function findField(data: Record<string, unknown>, hints: string[]): string {
  for (const [key, value] of Object.entries(data)) {
    const normalized = normalizeFieldKey(key);
    if (!hints.some((hint) => normalized.includes(hint))) continue;
    const text = coerceFieldDisplayText(value);
    if (!isPlaceholderDisplayValue(text)) return text;
  }
  return "";
}

const LOCATION_HINTS = ["location", "wherehappened", "where", "site", "area", "berth", "jetty", "place", "premise"];
const DESCRIPTION_HINTS = ["whathappened", "description", "details", "narrative", "summary", "incident", "remark"];
const SEVERITY_HINTS = ["severity", "outcome", "howbad", "consequence", "injury", "risklevel"];
const SOURCE_HINTS = ["source", "channel", "submittedvia", "reportedvia"];
const PHOTO_HINTS = ["photo", "image", "attachment", "evidence", "picture"];

/**
 * Severity is encoded by weight, not hue — a high-tone pill stays legible in
 * greyscale, which matters because these get printed and pinned up.
 */
export function severityTone(severity: string): SeverityTone {
  const text = severity.toLowerCase();
  if (!text.trim()) return "none";
  if (/(major|lti|lost time|fatal|amputat|catastroph)/.test(text)) return "high";
  if (/(serious|high potential|medical|hospital)/.test(text)) return "mid";
  if (/(minor|first aid|no one was hurt|near.?miss)/.test(text)) return "low";
  return "low";
}

function countPhotos(data: Record<string, unknown>): number {
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    const normalized = normalizeFieldKey(key);
    if (!PHOTO_HINTS.some((hint) => normalized.includes(hint))) continue;
    if (Array.isArray(value)) count += value.length;
    else if (typeof value === "string" && value.trim()) count += value.split(/[,;\n]/).filter((part) => part.trim()).length;
    else if (value) count += 1;
  }
  return count;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}

/** "INC-2607-0142" — code, year/month of filing, then the SharePoint item id. */
export function buildReference(code: string, submission: Submission): string {
  const filed = parseDate(submission.submittedAt) ?? parseDate(submission.modifiedAt);
  const stamp = filed ? `${pad(filed.getFullYear() % 100, 2)}${pad(filed.getMonth() + 1, 2)}` : "0000";
  return `${code}-${stamp}-${pad(Number(submission.id) || 0, 4)}`;
}

function resolveStatus(submission: Submission, overdue: boolean): PortalStatus {
  const raw = (submission.formStatus ?? "").toLowerCase();
  if (/return/.test(raw)) return "Returned";
  if (/cancel|withdraw/.test(raw)) return "Cancelled";
  if (/reject/.test(raw)) return "Rejected";
  if (/complete|approved|closed/.test(raw)) return "Approved";
  return overdue ? "Past SLA" : "In approval";
}

function layerSignedAt(submission: Submission, index: number): Date | null {
  const layer = submission.layers[index];
  return parseDate(layer && "signedAt" in layer ? layer.signedAt : null);
}

function layerIsSigned(submission: Submission, index: number): boolean {
  const status = submission.layers[index]?.status;
  return status === "approved" || status === "confirmed" || status === "skipped";
}

function layerNote(submission: Submission, index: number): string {
  const enhanced = submission.enhancedLayers?.[index];
  if (enhanced?.type === "evaluation") return enhanced.notes ?? "";
  const layer = submission.layers[index];
  return layer?.rejectionReason ?? "";
}

/**
 * Project a SharePoint submission into the shape the role dashboards read.
 *
 * Age is measured on the **current layer only** — from the previous layer's
 * signature (or the submission time for layer 1) to now. Overdue is that age
 * against the layer's own SLA, so "overdue" is computable per form type
 * instead of one global constant.
 */
export function toPortalRecord(
  submission: Submission,
  entry: CatalogueEntry,
  directory: PeopleDirectory = {},
  assignmentOverrides: Record<string, string> = {},
  now: Date = new Date(),
): PortalRecord {
  const data = submission.submissionData;
  const layers = entry.layers;
  const totalLayers = Math.max(layers.length, submission.totalLayers, 1);
  const at = Math.min(Math.max((submission.currentLayer ?? 1) - 1, 0), Math.max(totalLayers - 1, 0));

  const filedAt = parseDate(submission.submittedAt);
  const hoursSinceFiled = hoursBetween(filedAt, now);
  const layerStartedAt = at > 0 ? layerSignedAt(submission, at - 1) ?? filedAt : filedAt;
  const hoursOnLayer = hoursBetween(layerStartedAt, now);

  const currentLayerConfig = layers[at];
  const slaDays = Number(currentLayerConfig?.slaDays) > 0
    ? Number(currentLayerConfig?.slaDays)
    : entry.slaDays;

  const statusPreview = (submission.formStatus ?? "").toLowerCase();
  const done = /complete|approved|closed|cancel|withdraw|reject/.test(statusPreview);
  const returned = /return/.test(statusPreview);

  const hoursOverdue = hoursOnLayer - slaDays * 24;
  const overdue = !done && !returned && hoursOverdue > 0;
  const status = resolveStatus(submission, overdue);

  const chain: PortalChainStep[] = layers.map((layer, index) => {
    const override = assignmentOverrides[String(layer.layerNumber)] ?? "";
    const email = normalizeEmail(
      override
      || (layer.assignee.type === "user" ? layer.assignee.value : "")
      || submission.layers[index]?.email
      || "",
    );
    const who = email ? displayName(email, directory) : layerRoleLabel(layer, index);
    const signed = layerIsSigned(submission, index) || index < at;
    const current = index === at && !done && !returned;
    const signedAt = layerSignedAt(submission, index);

    return {
      layerNumber: layer.layerNumber,
      roleLabel: layerRoleLabel(layer, index),
      who,
      email,
      type: layer.type,
      state: signed ? "signed" : current ? "current" : "pending",
      statusText: signed ? "Signed" : current ? `Awaiting ${firstName(who)}` : "Not started",
      subText: signed
        ? signedAt
          ? signedAt.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "signed"
        : current
          ? `on this layer ${formatHours(hoursOnLayer)}`
          : "opens when the layer before is signed",
      note: layerNote(submission, index),
    } satisfies PortalChainStep;
  });

  const currentStep = chain[at];
  const severity = findField(data, SEVERITY_HINTS);
  const subject = findField(data, DESCRIPTION_HINTS) || submission.title;

  return {
    submission,
    listTitle: submission.listTitle,
    itemId: submission.id,
    reference: buildReference(entry.code, submission),
    code: entry.code,
    formName: entry.name,
    subject,
    location: findField(data, LOCATION_HINTS),
    source: findField(data, SOURCE_HINTS) || (submission.submittedByEmail ? "Staff app" : "Public link"),
    submitter: submission.submitterName || submission.createdByName || submission.submittedByEmail || "Anonymous",
    submitterEmail: normalizeEmail(submission.submittedByEmail || submission.createdByEmail || ""),
    severity,
    tone: severityTone(severity),
    photos: countPhotos(data),
    filedAt,
    filedLabel: filedAt ? formatAgo(hoursSinceFiled) : "—",
    hoursSinceFiled,
    hoursOnLayer,
    ageOnLayerLabel: formatHours(hoursOnLayer),
    at,
    totalLayers,
    chain,
    currentRole: done || returned ? "" : currentStep?.roleLabel ?? "",
    currentAssignee: done || returned ? "" : currentStep?.who ?? "",
    currentAssigneeEmail: done || returned ? "" : currentStep?.email ?? "",
    slaDays,
    overdue,
    hoursOverdue: Math.max(0, hoursOverdue),
    slaNote: overdue
      ? `${formatHours(hoursOverdue)} past a ${slaDays}-day SLA`
      : `within a ${slaDays}-day SLA`,
    status,
    layerLabel: `Layer ${at + 1} of ${totalLayers}`,
    stage: done
      ? status === "Approved" ? "Complete" : "Withdrawn"
      : returned ? "With the submitter" : `Layer ${at + 1} of ${totalLayers}`,
    done,
    returned,
  } satisfies PortalRecord;
}

/** Everything waiting on this person right now, worst wait first. */
export function queueFor(records: PortalRecord[], userEmail: string): PortalRecord[] {
  const email = normalizeEmail(userEmail);
  if (!email) return [];
  return records
    .filter((record) => !record.done && !record.returned && record.currentAssigneeEmail === email)
    .sort((a, b) => b.hoursOnLayer - a.hoursOnLayer);
}

/** High-severity, filed in the last 24 hours, not closed. */
export function severeRecords(records: PortalRecord[]): PortalRecord[] {
  return records
    .filter((record) => (record.tone === "high" || record.tone === "mid") && record.hoursSinceFiled <= 24 && !record.done)
    .sort((a, b) => a.hoursSinceFiled - b.hoursSinceFiled);
}

/** Past SLA, oldest first. Age is measured on the current layer only. */
export function stuckRecords(records: PortalRecord[]): PortalRecord[] {
  return records.filter((record) => record.overdue).sort((a, b) => b.hoursOnLayer - a.hoursOnLayer);
}

export interface BottleneckRow {
  name: string;
  role: string;
  open: number;
  breached: number;
  worstHours: number;
  worstLabel: string;
  /** Width proportional to the worst wait in the set. */
  barPercent: number;
}

/** Approvers ranked by the longest wait on their current layer. */
export function bottlenecks(records: PortalRecord[], limit = 4): BottleneckRow[] {
  const byPerson = new Map<string, Omit<BottleneckRow, "worstLabel" | "barPercent">>();

  for (const record of records) {
    if (record.done || record.returned || !record.currentAssignee) continue;
    const key = `${record.currentAssignee}||${record.currentRole}`;
    const row = byPerson.get(key) ?? {
      name: record.currentAssignee,
      role: record.currentRole,
      open: 0,
      breached: 0,
      worstHours: 0,
    };
    row.open += 1;
    if (record.overdue) row.breached += 1;
    row.worstHours = Math.max(row.worstHours, record.hoursOnLayer);
    byPerson.set(key, row);
  }

  const rows = [...byPerson.values()].sort((a, b) => b.worstHours - a.worstHours).slice(0, limit);
  const worstMax = Math.max(1, ...rows.map((row) => row.worstHours));

  return rows.map((row) => ({
    ...row,
    worstLabel: formatHours(row.worstHours),
    barPercent: Math.round((row.worstHours / worstMax) * 100),
  }));
}
