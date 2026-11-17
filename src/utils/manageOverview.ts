import type { CatalogueEntry, PortalRecord, StatFilter } from "../types";
import { anySla, filedWithin, matchesStatusChoice } from "./portalRecords";

/** The fields the overview counts read. */
export type OverviewRecord = Pick<PortalRecord, "status" | "done" | "returned" | "hasWorkflow" | "overdue" | "filedAt">;

export interface OverviewCard {
  key: "filed" | "waiting" | "late";
  label: string;
  value: number;
  /** The Submissions status the card opens on: what it counted, so the list matches the number. */
  status: StatFilter;
}

/**
 * The three numbers at the top of Manage. Each one names the status it counted,
 * so pressing it opens the same rows. "Waiting too long" exists only where a
 * form declares an SLA; without one there is nothing to be late against.
 */
export function overviewCards(
  records: OverviewRecord[],
  catalogue: Pick<CatalogueEntry, "hasSla">[],
  now: Date = new Date(),
): OverviewCard[] {
  const cards: OverviewCard[] = [
    {
      key: "filed",
      label: "Filed today",
      value: records.filter((record) => filedWithin(record, "today", now)).length,
      status: "all",
    },
    {
      key: "waiting",
      label: "Waiting for a signature",
      value: records.filter((record) => matchesStatusChoice(record, "open")).length,
      status: "open",
    },
  ];
  if (anySla(catalogue)) {
    cards.push({
      key: "late",
      label: "Waiting too long",
      value: records.filter((record) => record.overdue).length,
      status: "Past SLA",
    });
  }
  return cards;
}
