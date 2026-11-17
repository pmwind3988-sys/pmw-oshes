import { describe, expect, it } from "vitest";
import type { CatalogueEntry } from "../types";
import { overviewCards, type OverviewRecord } from "./manageOverview";

const NOW = new Date("2026-07-30T06:00:00.000Z");
const DAY = 86_400_000;

function record(overrides: Partial<OverviewRecord>): OverviewRecord {
  return {
    status: "In approval",
    done: false,
    returned: false,
    hasWorkflow: true,
    overdue: false,
    filedAt: NOW,
    ...overrides,
  } as OverviewRecord;
}

const withSla = [{ hasSla: true }] as CatalogueEntry[];
const withoutSla = [{ hasSla: false }] as CatalogueEntry[];

describe("overviewCards", () => {
  it("counts today's filings, what is waiting for a signature, and what is past its SLA", () => {
    const records = [
      record({}),
      record({ status: "Past SLA", overdue: true, filedAt: new Date(NOW.getTime() - 2 * DAY) }),
      record({ status: "Approved", done: true }),
    ];
    const cards = overviewCards(records, withSla, NOW);
    const value = (key: string) => cards.find((card) => card.key === key)?.value;
    expect(value("filed")).toBe(2);
    expect(value("waiting")).toBe(2);
    expect(value("late")).toBe(1);
  });

  it("sends each count to the list it counted, by status", () => {
    const cards = overviewCards([record({})], withSla, NOW);
    expect(cards.find((card) => card.key === "waiting")?.status).toBe("open");
    expect(cards.find((card) => card.key === "late")?.status).toBe("Past SLA");
    expect(cards.find((card) => card.key === "filed")?.status).toBe("all");
  });

  it("drops the late count where no form declares an SLA", () => {
    const cards = overviewCards([record({ overdue: true })], withoutSla, NOW);
    expect(cards.map((card) => card.key)).toEqual(["filed", "waiting"]);
  });

  it("does not count a settled record as waiting", () => {
    const cards = overviewCards([record({ done: true, status: "Approved" })], withoutSla, NOW);
    expect(cards.find((card) => card.key === "waiting")?.value).toBe(0);
  });
});

