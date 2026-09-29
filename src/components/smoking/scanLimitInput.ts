export type SpanUnit = "seconds" | "minutes" | "hours";

export interface SpanInput {
  value: string;
  unit: SpanUnit;
}

const UNIT_SECONDS: Record<SpanUnit, number> = { seconds: 1, minutes: 60, hours: 3600 };

/** Shows a stored number of seconds in the largest unit it divides evenly into, so 3600 reads as 1 hour and 1800 as 30 minutes. */
export function toSpanInput(seconds: number): SpanInput {
  if (seconds > 0 && seconds % 3600 === 0) return { value: String(seconds / 3600), unit: "hours" };
  if (seconds > 0 && seconds % 60 === 0) return { value: String(seconds / 60), unit: "minutes" };
  return { value: String(seconds), unit: "seconds" };
}

/** What the admin typed, in whole seconds — or why it cannot be saved. */
export function readSpanInput(input: SpanInput, maxSeconds: number): { seconds: number } | { error: string } {
  const text = input.value.trim();
  if (!/^\d+$/.test(text)) return { error: "Enter a whole number (0 turns it off)." };
  const seconds = Number(text) * UNIT_SECONDS[input.unit];
  if (seconds > maxSeconds) {
    const max =
      maxSeconds % 3600 === 0 ? `${maxSeconds / 3600} hours` : maxSeconds % 60 === 0 ? `${maxSeconds / 60} minutes` : `${maxSeconds} seconds`;
    return { error: `At most ${max}.` };
  }
  return { seconds };
}
