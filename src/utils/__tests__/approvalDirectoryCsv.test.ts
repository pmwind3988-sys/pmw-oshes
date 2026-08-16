import { describe, expect, it } from "vitest";
import { directoryToCsv, planDirectoryImport } from "../approvalDirectoryCsv";
import type { ApprovalDirectoryRow } from "../approvalDirectorySchema";

function person(overrides: Partial<ApprovalDirectoryRow> = {}): ApprovalDirectoryRow {
  return {
    id: 1,
    personEmail: "ali@pmw.com",
    personName: "Ali",
    department: "Engineering",
    position: "Engineer",
    employeeId: "E1",
    approverEmail: "siti@pmw.com",
    isActive: true,
    ...overrides,
  };
}

describe("planDirectoryImport", () => {
  it("adds people the directory does not have yet", () => {
    const plan = planDirectoryImport(
      "PersonEmail,PersonName,ApproverEmail\nali@pmw.com,Ali,siti@pmw.com",
      [],
    );
    expect(plan.fileProblems).toEqual([]);
    expect(plan.counts.create).toBe(1);
    expect(plan.rows[0].input.personName).toBe("Ali");
  });

  it("matches an existing person by email so a re-import updates rather than duplicates", () => {
    const plan = planDirectoryImport(
      "PersonEmail,PersonName,ApproverEmail\nALI@PMW.COM,Ali,raj@pmw.com",
      [person()],
    );
    expect(plan.counts.update).toBe(1);
    expect(plan.rows[0].existingId).toBe(1);
    expect(plan.rows[0].changedFields).toEqual(["Approver"]);
  });

  it("leaves fields alone when the file has no column for them", () => {
    // The everyday import is two columns. Reading the absent ones as empty
    // would wipe every department and job title in the directory.
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail\nali@pmw.com,raj@pmw.com",
      [person()],
    );
    expect(plan.rows[0].changedFields).toEqual(["Approver"]);
    expect(plan.rows[0].input.department).toBe("Engineering");
    expect(plan.rows[0].input.personName).toBe("Ali");
    expect(plan.rows[0].input.employeeId).toBe("E1");
  });

  it("does not switch a person off just because the file omits the active column", () => {
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail\nali@pmw.com,siti@pmw.com",
      [person({ isActive: false })],
    );
    expect(plan.rows[0].input.isActive).toBe(false);
    expect(plan.counts.unchanged).toBe(1);
  });

  it("marks a row that changes nothing, so an admin can see the file is a no-op", () => {
    const plan = planDirectoryImport(
      "PersonEmail,PersonName,Department,Position,EmployeeId,ApproverEmail,IsActive\n"
      + "ali@pmw.com,Ali,Engineering,Engineer,E1,siti@pmw.com,Yes",
      [person()],
    );
    expect(plan.counts.unchanged).toBe(1);
    expect(plan.counts.update).toBe(0);
  });

  it("accepts the column names an HR spreadsheet actually uses", () => {
    const plan = planDirectoryImport(
      "Email,Full Name,Dept,Job Title,Staff No,Reports To\n"
      + "ali@pmw.com,Ali bin Ahmad,Engineering,Engineer,E1024,siti@pmw.com",
      [],
    );
    expect(plan.fileProblems).toEqual([]);
    const row = plan.rows[0].input;
    expect(row.personName).toBe("Ali bin Ahmad");
    expect(row.department).toBe("Engineering");
    expect(row.employeeId).toBe("E1024");
    expect(row.approverEmail).toBe("siti@pmw.com");
  });

  it("keeps a quoted department containing a comma in one cell", () => {
    const plan = planDirectoryImport(
      'PersonEmail,Department,ApproverEmail\nali@pmw.com,"Safety, Health & Environment",siti@pmw.com',
      [],
    );
    expect(plan.rows[0].input.department).toBe("Safety, Health & Environment");
  });

  it("says what is wrong with a row rather than importing it", () => {
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail\nnot-an-email,siti@pmw.com\nali@pmw.com,ali@pmw.com",
      [],
    );
    expect(plan.counts.error).toBe(2);
    expect(plan.rows[0].problems[0]).toContain("not a valid email");
    expect(plan.rows[1].problems[0]).toContain("their own approver");
  });

  it("points at the earlier line when the same person appears twice", () => {
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail\nali@pmw.com,siti@pmw.com\nali@pmw.com,raj@pmw.com",
      [],
    );
    expect(plan.counts.create).toBe(1);
    expect(plan.rows[1].problems[0]).toContain("line 2");
  });

  it("treats a blank active cell as active, not as a leaver", () => {
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail,IsActive\nali@pmw.com,siti@pmw.com,",
      [],
    );
    expect(plan.rows[0].input.isActive).toBe(true);
  });

  it("reads the spellings of no that a spreadsheet produces", () => {
    const plan = planDirectoryImport(
      "PersonEmail,ApproverEmail,Active\na@pmw.com,s@pmw.com,No\nb@pmw.com,s@pmw.com,FALSE\nc@pmw.com,s@pmw.com,0",
      [],
    );
    expect(plan.rows.map((row) => row.input.isActive)).toEqual([false, false, false]);
  });

  it("allows a blank approver, which is how the top of the line is written", () => {
    const plan = planDirectoryImport("PersonEmail,ApproverEmail\nceo@pmw.com,", []);
    expect(plan.counts.create).toBe(1);
    expect(plan.rows[0].problems).toEqual([]);
  });

  it("refuses a file with no email column instead of importing blanks", () => {
    const plan = planDirectoryImport("Name,Department\nAli,Engineering", []);
    expect(plan.rows).toEqual([]);
    expect(plan.fileProblems[0]).toContain("No email column");
  });

  it("refuses a file with no approver column, which carries no reporting line", () => {
    const plan = planDirectoryImport("PersonEmail,Department\nali@pmw.com,Engineering", []);
    expect(plan.fileProblems[0]).toContain("No approver column");
  });

  it("says so when the file is empty", () => {
    expect(planDirectoryImport("", []).fileProblems[0]).toContain("no rows");
  });
});

describe("directoryToCsv", () => {
  it("round-trips through the importer as a no-op", () => {
    const rows = [person(), person({ id: 2, personEmail: "siti@pmw.com", personName: "Siti", approverEmail: "" })];
    const plan = planDirectoryImport(directoryToCsv(rows), rows);
    expect(plan.counts.unchanged).toBe(2);
    expect(plan.counts.error).toBe(0);
  });

  it("writes active as a word a person can read in Excel", () => {
    const csv = directoryToCsv([person({ isActive: false })]);
    expect(csv.split("\r\n")[1].endsWith('"No"')).toBe(true);
  });
});
