import { describe, expect, it } from "vitest";

import {
  directoryKey,
  findDepartmentConflict,
  validateDepartmentApproverEntry,
  type DepartmentApproverEntry,
} from "./departmentApproverDirectory";

const entries: DepartmentApproverEntry[] = [
  { id: 4, department: "Finance", approverName: "Aina", approverEmail: "aina@pmw.com", role: "HOD" },
  { id: 7, department: "Human Resources", approverName: "Bala", approverEmail: "bala@pmw.com", role: "HOD" },
];

describe("directoryKey", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(directoryKey("  Finance ")).toBe("finance");
  });
});

describe("findDepartmentConflict", () => {
  it("finds an existing approver for the same department", () => {
    expect(findDepartmentConflict(entries, " finance ")?.id).toBe(4);
  });

  it("ignores the row being edited", () => {
    expect(findDepartmentConflict(entries, "Finance", 4)).toBeUndefined();
  });

  it("treats a blank department as no conflict", () => {
    expect(findDepartmentConflict(entries, "   ")).toBeUndefined();
  });
});

describe("validateDepartmentApproverEntry", () => {
  const valid = { department: "Operations", approverName: "Chan", approverEmail: "chan@pmw.com" };

  it("accepts a complete, unique row", () => {
    expect(validateDepartmentApproverEntry(valid, entries, "HOD")).toBeNull();
  });

  it("requires a department", () => {
    expect(validateDepartmentApproverEntry({ ...valid, department: " " }, entries, "HOD"))
      .toMatch(/department/i);
  });

  it("requires an email", () => {
    expect(validateDepartmentApproverEntry({ ...valid, approverEmail: "" }, entries, "HOD"))
      .toMatch(/email/i);
  });

  it("rejects a malformed email", () => {
    expect(validateDepartmentApproverEntry({ ...valid, approverEmail: "chan.pmw" }, entries, "HOD"))
      .toMatch(/not a valid email/i);
  });

  it("rejects a second approver for a department already covered by the role", () => {
    expect(validateDepartmentApproverEntry({ ...valid, department: "finance" }, entries, "HOD"))
      .toMatch(/already exists/i);
  });

  it("allows editing the row that owns the department", () => {
    expect(validateDepartmentApproverEntry({ ...valid, department: "Finance" }, entries, "HOD", 4)).toBeNull();
  });
});
