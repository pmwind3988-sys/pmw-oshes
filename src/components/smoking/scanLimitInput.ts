export type SpanUnit = "seconds" | "minutes";

export interface SpanInput {
  value: string;
  unit: SpanUnit;
}

/** Shows a stored number of seconds in minutes when it divides evenly, so 1800 reads as "30 minutes". */
export function toSpanInput(seconds: number): SpanInput {
  if (seconds > 0 && seconds % 60 === 0) return { value: String(seconds / 60), unit: "minutes" };
  return { value: String(seconds), unit: "seconds" };
}

/** What the admin typed, in whole seconds — or why it cannot be saved. */
export function readSpanInput(input: SpanInput, maxSeconds: number): { seconds: number } | { error: string } {
  const text = input.value.trim();
  if (!/^\d+$/.test(text)) return { error: "Enter a whole number (0 turns it off)." };
  const seconds = Number(text) * (input.unit === "minutes" ? 60 : 1);
  if (seconds > maxSeconds) {
    const max = maxSeconds % 60 === 0 ? `${maxSeconds / 60} minutes` : `${maxSeconds} seconds`;
    return { error: `At most ${max}.` };
  }
  return { seconds };
}
