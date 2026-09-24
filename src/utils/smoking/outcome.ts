import type { ScanOutcome } from "./api";

export interface OutcomeView {
  tone: "in" | "out" | "info" | "warn";
  headline: string;
  detail: string;
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
    case "in":
      return { tone: "in", headline: `IN · ${formatMyt(outcome.timeIn)}`, detail: outcome.areaName };
    case "out": {
      const parts = [formatDuration(outcome.durationMinutes), outcome.areaName];
      if (outcome.flagged) parts.push("OSHES will check this one — you may have missed a scan-out");
      return { tone: "out", headline: `OUT · ${formatMyt(outcome.timeOut)}`, detail: parts.join(" · ") };
    }
    case "already-in":
      return { tone: "info", headline: `Already in since ${formatMyt(outcome.timeIn)}`, detail: "Scan again when you leave." };
    case "retired-area":
      return { tone: "warn", headline: "This poster is no longer in use", detail: "Nothing was recorded. Use the poster at your smoking area." };
    case "no-profile":
      return { tone: "warn", headline: "Finish your profile first", detail: "Then scan again." };
  }
}
