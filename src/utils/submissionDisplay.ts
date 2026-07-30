import type { Submission } from "../types";

const DASHBOARD_DATE_LOCALE = "en-GB";
const DAY_PERIOD_PATTERN = /\b(am|pm)\b/gi;

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "not available",
  "not provided",
  "unknown",
  "unknown submitter",
  "unknown user",
  "guest",
  "authenticated-user",
]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uppercaseDayPeriod(value: string): string {
  return value.replace(DAY_PERIOD_PATTERN, (match) => match.toUpperCase());
}

export function isPlaceholderDisplayValue(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || normalized.startsWith("untitled");
}

export function formatDashboardDate(value: string | null | undefined, fallback = "N/A"): string {
  const parsed = parseDate(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString(DASHBOARD_DATE_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDashboardTime(value: string | null | undefined): string {
  const parsed = parseDate(value);
  if (!parsed) return "";
  return uppercaseDayPeriod(
    parsed.toLocaleTimeString(DASHBOARD_DATE_LOCALE, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

export function formatDashboardDateTime(value: string | null | undefined, fallback = "Not available"): string {
  const parsed = parseDate(value);
  if (!parsed) return fallback;
  return uppercaseDayPeriod(
    parsed.toLocaleString(DASHBOARD_DATE_LOCALE, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

export function coerceFieldDisplayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => coerceFieldDisplayText(entry)).filter(Boolean).join(", ");
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of [
    "Title",
    "title",
    "DisplayName",
    "displayName",
    "FullName",
    "fullName",
    "Name",
    "name",
    "Value",
    "value",
    "Label",
    "label",
    "Text",
    "text",
    "EMail",
    "Email",
    "email",
  ]) {
    const text = coerceFieldDisplayText(record[key]);
    if (text) return text;
  }

  return "";
}

export function getSubmitterDisplayName(item: Submission): string {
  if (!isPlaceholderDisplayValue(item.submitterName)) return item.submitterName?.trim() ?? "";
  if (!isPlaceholderDisplayValue(item.submittedByEmail)) return item.submittedByEmail.trim();
  if (!isPlaceholderDisplayValue(item.createdByName)) return item.createdByName?.trim() ?? "";
  if (!isPlaceholderDisplayValue(item.createdByEmail)) return item.createdByEmail?.trim() ?? "";
  return "Unknown submitter";
}

export function getSubmittedByDisplayName(item: Submission): string {
  if (!isPlaceholderDisplayValue(item.submittedByEmail)) return item.submittedByEmail.trim();
  if (!isPlaceholderDisplayValue(item.createdByName)) return item.createdByName?.trim() ?? "";
  if (!isPlaceholderDisplayValue(item.createdByEmail)) return item.createdByEmail?.trim() ?? "";
  return "Unknown submitter";
}

export function getSubmissionDisplayTitle(item: Submission): string {
  if (!isPlaceholderDisplayValue(item.title)) return item.title.trim();
  const submitterDisplay = getSubmitterDisplayName(item);
  return submitterDisplay === "Unknown submitter" ? "Untitled submission" : submitterDisplay;
}

export function getFormReference(item: Submission): string {
  if (!isPlaceholderDisplayValue(item.formId)) return item.formId.trim();
  return item.listTitle;
}

export function isBranchDecisionPending(item: Submission): boolean {
  const hasManualBranches = (item.layerConfig?.manualBranches?.length ?? 0) > 0;
  const hasSelectedBranch = !isPlaceholderDisplayValue(item.selectedBranch);
  return hasManualBranches && !hasSelectedBranch && (item.currentLayer ?? 0) === 0;
}
