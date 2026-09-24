import { beforeEach, describe, expect, it } from "vitest";
import { recordScan } from "./scan.js";
import type { SmokingArea, SmokingBreak, SmokingProfile } from "./schema.js";
import type { BreakClose, NewBreak, SmokingStore } from "./store.js";

class FakeStore implements SmokingStore {
  profiles = new Map<string, SmokingProfile & { id: string; blocked: boolean }>();
  areas: SmokingArea[] = [
    { id: "1", code: "AAA111", name: "Block A", active: true },
    { id: "2", code: "BBB222", name: "Block B", active: true },
    { id: "3", code: "OLD999", name: "Old shed", active: false },
  ];
  breaks: SmokingBreak[] = [];
  nextId = 100;
  /** Simulates a second phone's scan landing between our create and re-check. */
  racer: NewBreak | null = null;

  async findProfile(email: string) { return this.profiles.get(email) ?? null; }
  async saveProfile() {}
  async touchProfile() {}
  async findArea(code: string) { return this.areas.find((a) => a.code === code) ?? null; }
  async openBreaksFor(email: string) {
    return this.breaks.filter((b) => b.email === email && !b.timeOut)
      .sort((a, b) => a.timeIn.localeCompare(b.timeIn) || Number(a.id) - Number(b.id));
  }
  async lastClosedBreakFor(email: string) {
    const closed = this.breaks.filter((b) => b.email === email && b.timeOut)
      .sort((a, b) => (b.timeOut as string).localeCompare(a.timeOut as string));
    return closed[0] ?? null;
  }
  async createBreak(input: NewBreak) {
    if (this.racer) {
      const r = this.racer;
      this.racer = null;
      await this.createBreak(r);
    }
    const id = String(this.nextId++);
    this.breaks.push({ ...input, id, areaOutCode: "", areaOutName: "", timeOut: null, durationMinutes: null, flagReason: "" });
    return id;
  }
  async closeBreak(id: string, close: BreakClose) {
    Object.assign(this.breaks.find((b) => b.id === id)!, close);
  }
  async deleteBreak(id: string) { this.breaks = this.breaks.filter((b) => b.id !== id); }
}

const ALI: SmokingProfile & { id: string; blocked: boolean } = {
  id: "p1", email: "ali@gmail.com", fullName: "Ali", department: "QA/QC", departmentFromList: true,
  position: "Technician", staffId: "", company: "PMW", signInMethod: "google", blocked: false,
};
const at = (iso: string) => new Date(iso);

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
  store.profiles.set(ALI.email, ALI);
});

describe("recordScan", () => {
  it("scans in, copying the profile onto the break", async () => {
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    expect(outcome).toEqual({ result: "in", timeIn: "2026-09-24T02:42:00.000Z", areaName: "Block A" });
    expect(store.breaks[0]).toMatchObject({ department: "QA/QC", position: "Technician", company: "PMW", areaInCode: "AAA111" });
  });

  it("scans out at a different area", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "BBB222", now: at("2026-09-24T02:49:00Z") });
    expect(outcome).toEqual({
      result: "out", timeIn: "2026-09-24T02:42:00.000Z", timeOut: "2026-09-24T02:49:00.000Z",
      areaName: "Block B", durationMinutes: 7, flagged: false,
    });
    expect(store.breaks[0]).toMatchObject({ areaOutCode: "BBB222", areaOutName: "Block B", durationMinutes: 7 });
  });

  it("does not clock out on a re-scan inside a minute", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:20Z") });
    expect(outcome).toEqual({ result: "already-in", timeIn: "2026-09-24T02:42:00.000Z", areaName: "Block A" });
    expect(store.breaks[0].timeOut).toBeNull();
  });

  it("closes a break left open overnight as stale and flagged, then opens a fresh one", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-23T02:00:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:00:00Z") });
    expect(outcome).toEqual({
      result: "in", timeIn: "2026-09-24T02:00:00.000Z", areaName: "Block A", previousMissedScanOut: true,
    });
    expect(store.breaks).toHaveLength(2);
    expect(store.breaks[0]).toMatchObject({
      timeOut: "2026-09-24T02:00:00.000Z", durationMinutes: 1440, flagReason: "Lasted over 12 hours",
      areaOutCode: "AAA111", areaOutName: "Block A",
    });
    expect(store.breaks[1]).toMatchObject({ timeIn: "2026-09-24T02:00:00.000Z", timeOut: null, areaInCode: "AAA111" });
  });

  it("closes a break left open 13 hours as stale and flagged, then opens a fresh one", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:00:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "BBB222", now: at("2026-09-24T15:00:00Z") });
    expect(outcome).toEqual({
      result: "in", timeIn: "2026-09-24T15:00:00.000Z", areaName: "Block B", previousMissedScanOut: true,
    });
    expect(store.breaks).toHaveLength(2);
    expect(store.breaks[0]).toMatchObject({
      timeOut: "2026-09-24T15:00:00.000Z", durationMinutes: 780, flagReason: "Lasted over 12 hours",
    });
    expect(store.breaks[1]).toMatchObject({ timeIn: "2026-09-24T15:00:00.000Z", timeOut: null, areaInCode: "BBB222" });
  });

  it("records nothing on a retired or unknown poster", async () => {
    await expect(recordScan(store, { email: ALI.email, areaCode: "OLD999", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "retired-area" });
    await expect(recordScan(store, { email: ALI.email, areaCode: "NOPE00", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "retired-area" });
    expect(store.breaks).toHaveLength(0);
  });

  it("asks for a profile first", async () => {
    await expect(recordScan(store, { email: "new@gmail.com", areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "no-profile" });
  });

  it("refuses a blocked person, recording nothing", async () => {
    store.profiles.set(ALI.email, { ...ALI, blocked: true });
    await expect(recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") }))
      .resolves.toEqual({ result: "blocked" });
    expect(store.breaks).toHaveLength(0);
  });

  it("records nothing on a re-scan soon after scanning out — a shaky-hand double tap, not a new break", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:00:00Z") });
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:10:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:10:20Z") });
    expect(outcome).toEqual({ result: "already-out", timeOut: "2026-09-24T02:10:00.000Z", areaName: "Block A" });
    expect(store.breaks).toHaveLength(1);
  });

  it("opens a fresh break on a re-scan well after scanning out", async () => {
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:00:00Z") });
    await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:10:00Z") });
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "BBB222", now: at("2026-09-24T02:12:00Z") });
    expect(outcome).toEqual({ result: "in", timeIn: "2026-09-24T02:12:00.000Z", areaName: "Block B" });
    expect(store.breaks).toHaveLength(2);
  });

  it("leaves one open break when two scans race", async () => {
    store.racer = {
      email: ALI.email, fullName: "Ali", department: "QA/QC", position: "Technician", company: "PMW",
      areaInCode: "AAA111", areaInName: "Block A", timeIn: "2026-09-24T02:42:00.000Z",
    };
    const outcome = await recordScan(store, { email: ALI.email, areaCode: "AAA111", now: at("2026-09-24T02:42:00Z") });
    expect(outcome.result).toBe("already-in");
    expect(store.breaks.filter((b) => !b.timeOut)).toHaveLength(1);
  });
});
