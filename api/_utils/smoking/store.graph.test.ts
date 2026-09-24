import { beforeEach, describe, expect, it, vi } from "vitest";

const queryListItems = vi.fn();
const createListItem = vi.fn();
vi.mock("../graphClient.js", () => ({
  queryListItems: (...args: unknown[]) => queryListItems(...args),
  createListItem: (...args: unknown[]) => createListItem(...args),
  updateListItemFields: vi.fn(),
  deleteListItem: vi.fn(),
  getGraphToken: vi.fn(),
  graphFieldEquals: (column: string, value: string) => `fields/${column} eq '${value}'`,
}));

const { clearLimitsCache, createGraphSmokingStore } = await import("./store.js");

const store = createGraphSmokingStore(async () => "token");

beforeEach(() => {
  queryListItems.mockReset();
  createListItem.mockReset();
  clearLimitsCache();
});

describe("graph smoking store", () => {
  it("asks only for breaks recent enough to matter, then keeps the latest that ended in the window", async () => {
    queryListItems.mockResolvedValue([
      { id: "1", fields: { Email: "a@b.com", TimeIn: "2026-09-24T01:00:00Z", TimeOut: "2026-09-24T01:40:00Z" } },
      { id: "2", fields: { Email: "a@b.com", TimeIn: "2026-09-24T01:50:00Z", TimeOut: "2026-09-24T01:55:00Z" } },
    ]);
    const last = await store.lastClosedBreakFor("a@b.com", new Date("2026-09-24T01:45:00Z"));
    expect(last?.id).toBe("2");
    const [, list, options] = queryListItems.mock.calls[0];
    expect(list).toBe("Smoking Log");
    expect(options.filter).toBe(
      "fields/Email eq 'a@b.com' and fields/Status eq 'closed' and fields/TimeIn ge '2026-09-23T13:45:00.000Z'",
    );
  });

  it("finds nothing when no break ended inside the window", async () => {
    queryListItems.mockResolvedValue([
      { id: "1", fields: { Email: "a@b.com", TimeIn: "2026-09-24T01:00:00Z", TimeOut: "2026-09-24T01:40:00Z" } },
    ]);
    await expect(store.lastClosedBreakFor("a@b.com", new Date("2026-09-24T01:45:00Z"))).resolves.toBeNull();
  });

  it("reads OSHES's limits and does not ask again within a minute", async () => {
    queryListItems.mockResolvedValue([{ id: "1", fields: { IgnoreRepeatSeconds: 30, MinBreakSeconds: 300, RestSeconds: 1800 } }]);
    await expect(store.readLimits()).resolves.toEqual({ ignoreRepeatSeconds: 30, minBreakSeconds: 300, restSeconds: 1800 });
    await store.readLimits();
    expect(queryListItems).toHaveBeenCalledTimes(1);
    expect(queryListItems.mock.calls[0][1]).toBe("Smoking Settings");
  });

  it("uses the usual limits before OSHES has saved any", async () => {
    queryListItems.mockResolvedValue([]);
    await expect(store.readLimits()).resolves.toEqual({ ignoreRepeatSeconds: 60, minBreakSeconds: 0, restSeconds: 0 });
  });

  it("writes a flag onto a break only when it has one", async () => {
    createListItem.mockResolvedValue({ id: "5" });
    const base = {
      email: "a@b.com", fullName: "A", department: "QA/QC", position: "Tech", company: "PMW",
      areaInCode: "AAA111", areaInName: "Block A", timeIn: "2026-09-24T02:00:00.000Z",
    };
    await store.createBreak(base);
    await store.createBreak({ ...base, flagReason: "Started 10 min after the last break (rest is 30 min)" });
    expect(createListItem.mock.calls[0][2]).not.toHaveProperty("FlagReason");
    expect(createListItem.mock.calls[1][2].FlagReason).toBe("Started 10 min after the last break (rest is 30 min)");
  });
});
