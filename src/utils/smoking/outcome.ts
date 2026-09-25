import type { ScanOutcome } from "./api";

export interface OutcomeView {
  tone: "in" | "out" | "info" | "warn";
  headline: string;
  detail: string;
  /** Something OSHES will follow up, shown apart from the result so it is not missed. */
  note?: string;
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
    case "in": {
      const view: OutcomeView = {
        tone: "in",
        headline: `IN · ${formatMyt(outcome.timeIn)}`,
        detail: outcome.areaName,
        hint: "Scan this poster again when you leave.",
      };
      if (outcome.previousMissedScanOut) view.note = "Your last break had no scan-out — OSHES will check it.";
      return view;
    }
    case "out": {
      const view: OutcomeView = {
        tone: "out",
        headline: `OUT · ${formatMyt(outcome.timeOut)}`,
        detail: `${formatDuration(outcome.durationMinutes)} · ${outcome.areaName}`,
      };
      if (outcome.flagged) view.note = "OSHES will check this one — you may have missed a scan-out.";
      return view;
    }
    case "already-in":
      return { tone: "info", headline: `Already in since ${formatMyt(outcome.timeIn)}`, detail: "Scan again when you leave." };
    case "already-out":
      return { tone: "info", headline: `Already out at ${formatMyt(outcome.timeOut)}`, detail: "Scan when you next arrive." };
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
