import type { CatalogueEntry, FiledScope, PortalRecord, StatFilter, SubsScope } from "../types";
import { anySla, filedWithin, matchesStatusChoice } from "./portalRecords";

/** The fields the overview counts read. */
export type OverviewRecord = Pick<PortalRecord, "status" | "done" | "returned" | "hasWorkflow" | "overdue" | "filedAt">;

/**
 * The Submissions list a card opens. It is the same filter the card counted, so
 * the rows behind a number are exactly the rows the number adds up.
 */
export interface OverviewTarget {
  status: StatFilter;
  subsScope: SubsScope;
  filedScope: FiledScope | null;
}

export interface OverviewCard {
  key: "filed" | "waiting" | "late";
  label: string;
  value: number;
  target: OverviewTarget;
}

/**
 * The three numbers at the top of Manage. Each one names the list it counted,
 * so pressing it opens the same rows. "Waiting too long" exists only where a
 * form declares an SLA; without one there is nothing to be late against.
 *
 * "Filed today" uses filedWithin, the same rule the Filed filter on Submissions
 * uses, so the number and the list cannot disagree.
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
      target: { status: "all", subsScope: "all", filedScope: "today" },
    },
    {
      key: "waiting",
      label: "Waiting for a signature",
      value: records.filter((record) => matchesStatusChoice(record, "open")).length,
      target: { status: "open", subsScope: "all", filedScope: null },
    },
  ];
  if (anySla(catalogue)) {
    cards.push({
      key: "late",
      label: "Waiting too long",
      value: records.filter((record) => record.overdue).length,
      target: { status: "Past SLA", subsScope: "all", filedScope: null },
    });
  }
  return cards;
}
