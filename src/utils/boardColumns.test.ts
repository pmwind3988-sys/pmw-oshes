import { describe, expect, it } from "vitest";
import type { PortalRecord } from "../types";
import { boardColumns, doneBeyondWindow, lastMovedAt } from "./boardColumns";
import { filedWithin } from "./portalRecords";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const DAY = 86_400_000;
const ME = "sazali@marinekita.com";

/** A record with only the fields the board reads. Defaults describe a form in approval. */
function record(overrides: Partial<PortalRecord> & { id: string }): PortalRecord {
  return {
    listTitle: "Permit To Work",
    itemId: overrides.id,
    reference: `PTW-${overrides.id}`,
    subject: `Subject ${overrides.id}`,
    formName: "Permit to work",
    submission: { layers: [] },
    filedAt: new Date(NOW.getTime() - 2 * DAY),
    hasWorkflow: true,
    currentAssigneeEmail: "nurul@pmw.gov.my",
    done: false,
    returned: false,
    status: "In approval",
    ...overrides,
  } as unknown as PortalRecord;
}

function ids(columnId: string, records: PortalRecord[], now: Date = NOW): string[] {
  const column = boardColumns(records, ME, now).find((item) => item.id === columnId);
  return (column?.items ?? []).map((item) => item.itemId);
}

describe("boardColumns", () => {
  it("names the four columns in order", () => {
    const titles = boardColumns([], ME, NOW).map((column) => column.title);
    expect(titles).toEqual(["Waiting for you", "In approval", "Returned", "Done"]);
  });

  it("puts a record on your layer under Waiting for you", () => {
    const mine = record({ id: "1", currentAssigneeEmail: ME.toUpperCase() });
    expect(ids("you", [mine])).toEqual(["1"]);
    expect(ids("progress", [mine])).toEqual([]);
  });

  it("puts a returned record under Returned, whoever holds it", () => {
    const returned = record({ id: "2", returned: true, status: "Returned" });
    expect(ids("returned", [returned])).toEqual(["2"]);
    expect(ids("progress", [returned])).toEqual([]);
  });

  it("keeps a record still moving between other people under In approval", () => {
    expect(ids("progress", [record({ id: "3" })])).toEqual(["3"]);
  });

  it("shows an approved record under Done when it settled 3 days ago", () => {
    const approved = record({
      id: "4",
      done: true,
      status: "Approved",
      submission: { layers: [{ status: "approved", signedAt: new Date(NOW.getTime() - 3 * DAY).toISOString() }] } as never,
    });
    expect(ids("done", [approved])).toEqual(["4"]);
  });

  it("leaves an approved record from 20 days ago off the board entirely", () => {
    const old = record({
      id: "5",
      done: true,
      status: "Approved",
      submission: { layers: [{ status: "approved", signedAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }] } as never,
    });
    const columns = boardColumns([old], ME, NOW);
    expect(columns.flatMap((column) => column.items)).toEqual([]);
    expect(doneBeyondWindow([old], NOW)).toBe(1);
  });

  it("counts settled records older than 14 days so the board can point at the list", () => {
    const recent = record({ id: "6", done: true, status: "Approved", filedAt: new Date(NOW.getTime() - 1 * DAY) });
    const old = record({ id: "7", done: true, status: "Approved", filedAt: new Date(NOW.getTime() - 30 * DAY) });
    expect(doneBeyondWindow([recent, old], NOW)).toBe(1);
  });
});

describe("lastMovedAt", () => {
  it("uses the latest signed layer date", () => {
    const earlier = new Date(NOW.getTime() - 5 * DAY);
    const later = new Date(NOW.getTime() - 1 * DAY);
    const moved = record({
      id: "8",
      submission: {
        layers: [
          { status: "approved", signedAt: earlier.toISOString() },
          { status: "approved", signedAt: later.toISOString() },
        ],
      } as never,
    });
    expect(lastMovedAt(moved)?.getTime()).toBe(later.getTime());
  });

  it("falls back to the filing date when nothing is signed", () => {
    const filed = record({ id: "9" });
    expect(lastMovedAt(filed)).toEqual(filed.filedAt);
  });
});

describe("filedWithin", () => {
  const now = new Date(2026, 10, 17, 15, 0); // local 17 Nov 2026, 15:00

  it("accepts anything under Any time", () => {
    expect(filedWithin(record({ id: "10", filedAt: new Date(2020, 0, 1) }), "any", now)).toBe(true);
  });

  it("keeps a record filed earlier today under Today, and drops yesterday's", () => {
    expect(filedWithin(record({ id: "11", filedAt: new Date(2026, 10, 17, 8, 0) }), "today", now)).toBe(true);
    expect(filedWithin(record({ id: "12", filedAt: new Date(2026, 10, 16, 23, 0) }), "today", now)).toBe(false);
  });

  it("keeps the last 7 and 30 days, and drops older filings", () => {
    const tenDays = record({ id: "13", filedAt: new Date(now.getTime() - 10 * DAY) });
    expect(filedWithin(tenDays, "7d", now)).toBe(false);
    expect(filedWithin(tenDays, "30d", now)).toBe(true);
  });

  it("drops a record with no filing date from any dated range", () => {
    expect(filedWithin(record({ id: "14", filedAt: null }), "7d", now)).toBe(false);
  });
});
