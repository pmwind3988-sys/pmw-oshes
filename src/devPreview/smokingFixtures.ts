/* Dev-only — sample smoking breaks for the design harness. Never imported by the app. */
import type { SmokingBreak } from "../utils/smoking/schema";

const PEOPLE = [
  { email: "ali@gmail.com", fullName: "Ali Hassan", department: "Civil", company: "PMW" },
  { email: "siti@pmw-group.com", fullName: "Siti Aminah", department: "QA/QC", company: "PMW" },
  { email: "raj@gmail.com", fullName: "Rajesh Kumar", department: "Mechanical", company: "Acme Scaffold" },
  { email: "tan@gmail.com", fullName: "Tan Wei Ming", department: "Electrical", company: "Voltline" },
  { email: "farid@gmail.com", fullName: "Farid Osman", department: "Civil", company: "Acme Scaffold" },
  { email: "lim@pmw-group.com", fullName: "Lim Chee Keong", department: "Stores", company: "PMW" },
  { email: "nora@gmail.com", fullName: "Nora Aziz", department: "QA/QC", company: "Voltline" },
];
const AREAS = ["Block A smoking area", "Gate 2 shelter", "Workshop yard"];
// Hours people tend to step out, weighted towards tea break and after lunch.
const HOURS = [8, 9, 10, 10, 10, 11, 12, 13, 14, 15, 15, 15, 16, 17, 21];

/** A deterministic week of breaks up to `now`, so screenshots are repeatable. */
export function sampleBreaks(fromIso: string, now: Date): SmokingBreak[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const from = new Date(fromIso).getTime();
  const out: SmokingBreak[] = [];
  for (let i = 0; i < 140; i++) {
    const person = PEOPLE[Math.floor(rand() * PEOPLE.length)];
    const day = Math.floor(rand() * 7);
    const hour = HOURS[Math.floor(rand() * HOURS.length)];
    const start = from + day * 86_400_000 + hour * 3_600_000 + Math.floor(rand() * 60) * 60_000;
    if (start > now.getTime()) continue;
    const minutes = 3 + Math.floor(rand() * 12);
    const area = AREAS[Math.floor(rand() * AREAS.length)];
    const flagged = i % 37 === 5;
    out.push({
      id: String(i + 1), ...person, position: "Technician",
      areaInCode: "AAA111", areaInName: area, areaOutCode: "AAA111", areaOutName: area,
      timeIn: new Date(start).toISOString(),
      timeOut: new Date(start + (flagged ? 790 : minutes) * 60_000).toISOString(),
      durationMinutes: flagged ? 790 : minutes,
      flagReason: flagged ? "Lasted over 12 hours" : "",
    });
  }
  return out.sort((a, b) => b.timeIn.localeCompare(a.timeIn));
}
