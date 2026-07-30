/**
 * Duration and clock formatting shared by every portal screen.
 * The prototype's `hrs()` — kept verbatim in behaviour so the copy reads the same.
 */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  const total = Math.round(hours);
  const days = Math.floor(total / 24);
  const rest = total % 24;
  if (days > 0) return rest > 0 ? `${days} d ${rest} h` : `${days} d`;
  return `${total} h`;
}

/** "41 min ago" / "3 h ago" / "3 d ago" */
export function formatAgo(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0.05) return "just now";
  return `${formatHours(hours)} ago`;
}

export function hoursBetween(from: Date | null, to: Date = new Date()): number {
  if (!from) return 0;
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "Today 09:14" / "Yest. 16:40" / "27 Jul 14:05" — the audit trail's When column. */
export function formatAuditWhen(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseDate(typeof value === "string" ? value : null);
  if (!date) return "—";

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);

  if (dayDelta === 0) return `Today ${time}`;
  if (dayDelta === 1) return `Yest. ${time}`;
  return `${pad(date.getDate())} ${date.toLocaleString("en-GB", { month: "short" })} ${time}`;
}

/** "Thursday 30 July" — the Today header's date. */
export function formatTodayDate(now: Date = new Date()): string {
  return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** "HH:MM" — the public confirmation's "Received HH:MM". */
export function formatClockTime(now: Date = new Date()): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
