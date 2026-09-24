import { DOUBLE_SCAN_WINDOW_MS, decideScan } from "./scanRules.js";
import type { SmokingStore } from "./store.js";

export type ScanOutcome =
  | { result: "in"; timeIn: string; areaName: string; previousMissedScanOut?: true }
  | { result: "out"; timeIn: string; timeOut: string; areaName: string; durationMinutes: number; flagged: boolean }
  | { result: "already-in"; timeIn: string; areaName: string }
  | { result: "already-out"; timeOut: string; areaName: string }
  | { result: "retired-area" }
  | { result: "no-profile" }
  | { result: "blocked" };

/**
 * One scan, decided on the server's clock. At most one open break per person:
 * if another scan opened one between our create and re-check, the newer row is
 * removed and this scan reports "already in".
 */
export async function recordScan(
  store: SmokingStore,
  input: { email: string; areaCode: string; now: Date },
): Promise<ScanOutcome> {
  const area = await store.findArea(input.areaCode.trim().toUpperCase());
  if (!area || !area.active) return { result: "retired-area" };

  const profile = await store.findProfile(input.email);
  if (!profile) return { result: "no-profile" };
  if (profile.blocked) return { result: "blocked" };

  const [oldestOpen] = await store.openBreaksFor(input.email);
  const decision = decideScan(oldestOpen ?? null, input.now);
  const nowIso = input.now.toISOString();

  if (decision.kind === "already-in") {
    return { result: "already-in", timeIn: decision.openBreak.timeIn, areaName: decision.openBreak.areaInName };
  }

  if (decision.kind === "open") {
    const lastClosed = await store.lastClosedBreakFor(input.email);
    if (lastClosed?.timeOut && input.now.getTime() - new Date(lastClosed.timeOut).getTime() < DOUBLE_SCAN_WINDOW_MS) {
      return { result: "already-out", timeOut: lastClosed.timeOut, areaName: lastClosed.areaOutName };
    }
  }

  if (decision.kind === "close") {
    await store.closeBreak(decision.openBreak.id, {
      timeOut: nowIso,
      areaOutCode: area.code,
      areaOutName: area.name,
      durationMinutes: decision.durationMinutes,
      flagReason: decision.flagReason,
    });
    return {
      result: "out",
      timeIn: decision.openBreak.timeIn,
      timeOut: nowIso,
      areaName: area.name,
      durationMinutes: decision.durationMinutes,
      flagged: decision.flagReason !== "",
    };
  }

  if (decision.kind === "close-stale-and-open") {
    await store.closeBreak(decision.openBreak.id, {
      timeOut: nowIso,
      areaOutCode: area.code,
      areaOutName: area.name,
      durationMinutes: decision.durationMinutes,
      flagReason: decision.flagReason,
    });
    const outcome = await openNewBreak(store, profile, area, nowIso);
    return outcome.result === "in" ? { ...outcome, previousMissedScanOut: true } : outcome;
  }

  return openNewBreak(store, profile, area, nowIso);
}

async function openNewBreak(
  store: SmokingStore,
  profile: { email: string; fullName: string; department: string; position: string; company: string },
  area: { code: string; name: string },
  nowIso: string,
): Promise<ScanOutcome> {
  const createdId = await store.createBreak({
    email: profile.email,
    fullName: profile.fullName,
    department: profile.department,
    position: profile.position,
    company: profile.company,
    areaInCode: area.code,
    areaInName: area.name,
    timeIn: nowIso,
  });

  const open = await store.openBreaksFor(profile.email);
  const keeper = open[0];
  if (keeper && keeper.id !== createdId) {
    await store.deleteBreak(createdId);
    return { result: "already-in", timeIn: keeper.timeIn, areaName: keeper.areaInName };
  }
  return { result: "in", timeIn: nowIso, areaName: area.name };
}
