import type { StatFilter } from "../types";

/**
 * The shapes the portal's statistics are drawn in. The dashboard that once
 * computed them is gone; the intake chart and the smoking totals still draw
 * with these.
 */

export interface StatBucket {
  id: StatFilter;
  label: string;
  count: number;
  /** Share of `total`, 0–100. Used for the bars, not for the label. */
  percent: number;
  tone: "ink" | "alert" | "positive" | "muted";
}

export interface DayPoint {
  /** ISO day, for React keys and sorting. */
  key: string;
  /** "12 Aug" */
  label: string;
  /** Single letter for the axis on a narrow screen. */
  short: string;
  count: number;
  /** Height of this bar as a share of the busiest day, 0–100. */
  percent: number;
  isToday: boolean;
}
