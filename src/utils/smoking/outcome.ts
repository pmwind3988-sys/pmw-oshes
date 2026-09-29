import type { ScanOutcome } from "./api";

export interface OutcomeView {
  tone: "in" | "out" | "info" | "warn";
  headline: string;
  /** The time of a recorded scan, shown large under the headline. */
  time?: string;
  detail: string;
  /** What to do next, when there is a next scan to make. */
  hint?: string;
}

const MYT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatMyt(iso: string): string {
  return MYT.format(new Date(iso));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function describeOutcome(outcome: ScanOutcome): OutcomeView {
  switch (outcome.result) {
    // No outcome mentions a flag: those are for OSHES to follow up, not the smoker.
    case "in":
      return {
        tone: "in",
        headline: "Checked out",
        time: formatMyt(outcome.timeIn),
        detail: outcome.areaName,
        hint: "Scan a poster again when you're back in.",
      };
    case "out":
      return {
        tone: "out",
        headline: "Checked in",
        time: formatMyt(outcome.timeOut),
        detail: `${formatDuration(outcome.durationMinutes)} break · ${outcome.areaName}`,
      };
    case "already-in":
      return { tone: "info", headline: `Already checked out at ${formatMyt(outcome.timeIn)}`, detail: "Scan again when you're back in." };
    case "already-out":
      return { tone: "info", headline: `Already checked in at ${formatMyt(outcome.timeOut)}`, detail: "Scan when you next go out for a break." };
    case "retired-area":
      return { tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." };
    case "no-profile":
      return { tone: "warn", headline: "Finish your profile first", detail: "Then scan again." };
    case "blocked":
      return {
        tone: "warn",
        headline: "Access turned off",
        detail: "Your access to the smoking log has been turned off. Contact OSHES.",
      };
  }
}
