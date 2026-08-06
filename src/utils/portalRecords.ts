import type {
  CatalogueEntry,
  LayerConfigItem,
  PortalChainStep,
  PortalRecord,
  PortalStatus,
  SeverityTone,
  Submission,
} from "../types";
import { describeWorkflow } from "./formWorkflow";
import { routedAssigneeEmail } from "./layerAssignees";
import { layerRoleLabel, displayName, firstName, normalizeEmail, type PeopleDirectory } from "./portalPeople";
import { formatAgo, formatHours, hoursBetween, parseDate } from "./portalTime";
import { formatDisplayDayMonthTime } from "./displayDateTime";
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

function resolveStatus(submission: Submission, overdue: boolean, hasWorkflow: boolean): PortalStatus {
  const raw = (submission.formStatus ?? "").toLowerCase();
  if (/return/.test(raw)) return "Returned";
  if (/cancel|withdraw/.test(raw)) return "Cancelled";
  if (/reject/.test(raw)) return "Rejected";
  if (/complete|approved|closed/.test(raw)) return "Approved";
  // Nothing is approving a form that has no approval step. It is filed, and
  // that is the whole of its lifecycle.
  if (!hasWorkflow) return "Recorded";
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
 * The chain to render for one submission.
 *
 * Normally the form's configured layers. When a submission carries workflow
 * columns its form no longer configures — a legacy filing, or a chain removed
 * after the fact — the layers it was filed under are reconstructed, so its
 * history is not silently dropped. When there is neither, there is no chain,
 * and that is a real answer rather than a missing one.
 */
function resolveChainLayers(entry: CatalogueEntry, submission: Submission): LayerConfigItem[] {
  if (entry.layers.length > 0) return entry.layers;

  const inflight = submission.enhancedLayers ?? [];
  const count = Math.max(inflight.length, submission.layers.length, submission.totalLayers, 0);
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index): LayerConfigItem => {
    const step = inflight[index];
    const email = step?.email ?? submission.layers[index]?.email ?? "";
    const base = {
      layerNumber: step?.layerNumber ?? index + 1,
      authMode: "365" as const,
      assignee: email
        ? { type: "user" as const, value: email }
        : { type: "field-reference" as const, value: `L${index + 1}_Email` },
    };
    return step?.type === "evaluation"
      ? { ...base, type: "evaluation", surveyElements: [] }
      : { ...base, type: "approval", confirmationType: "signature", allowRejectionReason: true };
  });
}

/**
 * Project a SharePoint submission into the shape the role dashboards read.
 *
 * Age is measured on the **current layer only** — from the previous layer's
 * signature (or the submission time for layer 1) to now. Overdue is that age
 * against the layer's own SLA, so "overdue" is computable per form type
 * instead of one global constant.
 *
 * A form with no layers gets none of that. It is not on layer 1 of 1, it is not
 * in approval, and it cannot be past an SLA it was never given.
 */
export function toPortalRecord(
  submission: Submission,
  entry: CatalogueEntry,
  directory: PeopleDirectory = {},
  assignmentOverrides: Record<string, string> = {},
  now: Date = new Date(),
): PortalRecord {
  const data = submission.submissionData;
  const layers = resolveChainLayers(entry, submission);
  const workflow = entry.layers.length > 0 ? entry.workflow : describeWorkflow(layers);
  const hasWorkflow = workflow.hasWorkflow;
  const totalLayers = layers.length;
  const at = hasWorkflow
    ? Math.min(Math.max((submission.currentLayer ?? 1) - 1, 0), totalLayers - 1)
    : 0;

  const filedAt = parseDate(submission.submittedAt);
  const hoursSinceFiled = hoursBetween(filedAt, now);
  const layerStartedAt = at > 0 ? layerSignedAt(submission, at - 1) ?? filedAt : filedAt;
  const hoursOnLayer = hasWorkflow ? hoursBetween(layerStartedAt, now) : 0;

  const currentLayerConfig = layers[at];
  const slaDays = !hasWorkflow
    ? 0
    : Number(currentLayerConfig?.slaDays) > 0
      ? Number(currentLayerConfig?.slaDays)
      : entry.slaDays;

  const statusPreview = (submission.formStatus ?? "").toLowerCase();
  const done = /complete|approved|closed|cancel|withdraw|reject/.test(statusPreview);
  const returned = /return/.test(statusPreview);

  const hoursOverdue = hasWorkflow ? hoursOnLayer - slaDays * 24 : 0;
  const overdue = hasWorkflow && !done && !returned && hoursOverdue > 0;
  const status = resolveStatus(submission, overdue, hasWorkflow);

  const chain: PortalChainStep[] = layers.map((layer, index) => {
    const override = assignmentOverrides[String(layer.layerNumber)] ?? "";
    // The stored L{n}_Email comes before the config: on a shared layer that is
    // where the claim lands, and the config names several people, not a holder.
    const email = normalizeEmail(
      override
      || submission.layers[index]?.email
      || routedAssigneeEmail(layer.assignee)
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
          ? formatDisplayDayMonthTime(signedAt)
          : "signed"
        : current
          ? `on this layer ${formatHours(hoursOnLayer)}`
          : "opens when the layer before is signed",
      note: layerNote(submission, index),
    } satisfies PortalChainStep;
  });

  const currentStep = hasWorkflow ? chain[at] : undefined;
  const severity = findField(data, SEVERITY_HINTS);
  const subject = findField(data, DESCRIPTION_HINTS) || submission.title;
  const settled = done || returned;

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
    ageOnLayerLabel: hasWorkflow ? formatHours(hoursOnLayer) : "—",
    at,
    totalLayers,
    hasWorkflow,
    workflowKind: workflow.kind,
    chain,
    layers,
    currentRole: settled ? "" : currentStep?.roleLabel ?? "",
    currentAssignee: settled ? "" : currentStep?.who ?? "",
    currentAssigneeEmail: settled ? "" : currentStep?.email ?? "",
    slaDays,
    overdue,
    hoursOverdue: Math.max(0, hoursOverdue),
    slaNote: !hasWorkflow
      ? "no approval step to wait on"
      : overdue
        ? `${formatHours(hoursOverdue)} past a ${slaDays}-day SLA`
        : `within a ${slaDays}-day SLA`,
    status,
    layerLabel: hasWorkflow ? `Layer ${at + 1} of ${totalLayers}` : "No approval step",
    stage: done
      ? status === "Approved" ? "Complete" : "Withdrawn"
      : returned
        ? "With the submitter"
        : hasWorkflow
          ? `Layer ${at + 1} of ${totalLayers}`
          : "Recorded",
    done,
    returned,
  } satisfies PortalRecord;
}

/** Everything waiting on this person right now, worst wait first. */
export function queueFor(records: PortalRecord[], userEmail: string): PortalRecord[] {
  const email = normalizeEmail(userEmail);
  if (!email) return [];
  return records
    .filter((record) => record.hasWorkflow && !record.done && !record.returned && record.currentAssigneeEmail === email)
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
