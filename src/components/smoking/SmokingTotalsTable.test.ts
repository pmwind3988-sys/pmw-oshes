import { describe, expect, it } from "vitest";
import { groupTotalsByDepartment } from "./SmokingTotalsTable";
import type { PersonTotal } from "../../utils/smoking/adminData";

function total(o: Partial<PersonTotal>): PersonTotal {
  return {
    email: "a@gmail.com", fullName: "A", department: "QA/QC",
    breaks: 0, totalMinutes: 0, averageMinutes: 0, flagged: 0, ...o,
  };
}

describe("groupTotalsByDepartment", () => {
  it("sums breaks, minutes and flags per department, and averages from the sums", () => {
    const totals: PersonTotal[] = [
      total({ email: "a@gmail.com", fullName: "A", department: "QA/QC", breaks: 3, totalMinutes: 30, flagged: 1 }),
      total({ email: "b@gmail.com", fullName: "B", department: "QA/QC", breaks: 1, totalMinutes: 20, flagged: 0 }),
      total({ email: "c@gmail.com", fullName: "C", department: "Operations", breaks: 2, totalMinutes: 15, flagged: 2 }),
    ];

    const grouped = groupTotalsByDepartment(totals);

    const qaqc = grouped.find((row) => row.department === "QA/QC")!;
    expect(qaqc.breaks).toBe(4);
    expect(qaqc.totalMinutes).toBe(50);
    expect(qaqc.flagged).toBe(1);
    // 50 / 4 = 12.5, rounded
    expect(qaqc.averageMinutes).toBe(13);

    const ops = grouped.find((row) => row.department === "Operations")!;
    expect(ops.breaks).toBe(2);
    expect(ops.totalMinutes).toBe(15);
    expect(ops.flagged).toBe(2);
    expect(ops.averageMinutes).toBe(8);
  });

  it("groups a blank department under one fallback row instead of dropping it", () => {
    const totals: PersonTotal[] = [
      total({ email: "a@gmail.com", department: "", breaks: 1, totalMinutes: 10 }),
      total({ email: "b@gmail.com", department: "", breaks: 1, totalMinutes: 6 }),
    ];

    const grouped = groupTotalsByDepartment(totals);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].department).toBe("—");
    expect(grouped[0].breaks).toBe(2);
    expect(grouped[0].totalMinutes).toBe(16);
    expect(grouped[0].averageMinutes).toBe(8);
  });

  it("leaves a department with no counted breaks at a zero average, not a division error", () => {
    const totals: PersonTotal[] = [total({ department: "QA/QC", breaks: 0, totalMinutes: 0, flagged: 1 })];
    expect(groupTotalsByDepartment(totals)[0].averageMinutes).toBe(0);
  });
});
