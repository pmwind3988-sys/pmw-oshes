/**
 * The write path has to address the columns the list really has, not the names
 * in the schema. A directory whose column was made by hand as `EmployeeID`
 * reads perfectly — the column map is case-insensitive — and then rejects every
 * save, because SharePoint fails the whole request for one unknown property
 * rather than ignoring it.
 */
import { describe, it, expect } from "vitest";
import { directoryItemBody } from "../approvalDirectory";
import { mapDirectoryColumns, type DirectoryColumnMap } from "../approvalDirectorySchema";
import type { ApprovalDirectoryInput } from "../approvalDirectory";

const INPUT: ApprovalDirectoryInput = {
  personEmail: "  Ali@Example.com ",
  personName: " Ali Bakar ",
  department: " Finance ",
  position: " Officer ",
  employeeId: " E-1042 ",
  approverEmail: " Siti@Example.COM ",
  isActive: true,
};

/** A column map as if the list had exactly these columns, spelled this way. */
function mapOf(...names: string[]): DirectoryColumnMap {
  return mapDirectoryColumns(names.map((name) => ({ key: name, aliases: [name] })));
}

const FULL = mapOf(
  "PersonEmail", "PersonName", "Department", "Position", "EmployeeId", "ApproverEmail", "IsActive",
);

describe("directoryItemBody", () => {
  it("writes every field when the list has every column", () => {
    expect(directoryItemBody(INPUT, false, FULL)).toEqual({
      PersonEmail: "ali@example.com",
      PersonName: "Ali Bakar",
      Department: "Finance",
      Position: "Officer",
      EmployeeId: "E-1042",
      ApproverEmail: "siti@example.com",
      IsActive: true,
    });
  });

  it("uses the list's own spelling of a column", () => {
    // The reported failure: EmployeeID, not EmployeeId.
    const map = mapOf(
      "PersonEmail", "PersonName", "Department", "Position", "EmployeeID", "ApproverEmail", "IsActive",
    );
    const body = directoryItemBody(INPUT, false, map);

    expect(body.EmployeeID).toBe("E-1042");
    expect(body).not.toHaveProperty("EmployeeId");
  });

  it("uses the internal name of a column created with a space in its title", () => {
    const map = mapDirectoryColumns([
      { key: "PersonEmail", aliases: ["PersonEmail"] },
      { key: "Approver_x0020_Email", aliases: ["Approver Email", "Approver_x0020_Email"] },
    ]);

    expect(directoryItemBody(INPUT, false, map)).toEqual({
      PersonEmail: "ali@example.com",
      Approver_x0020_Email: "siti@example.com",
    });
  });

  it("leaves out a field the list has no column for, rather than failing the save", () => {
    const map = mapOf("PersonEmail", "PersonName", "ApproverEmail");
    const body = directoryItemBody(INPUT, false, map);

    expect(body).toEqual({
      PersonEmail: "ali@example.com",
      PersonName: "Ali Bakar",
      ApproverEmail: "siti@example.com",
    });
  });

  it("mirrors the person into Title on create only", () => {
    expect(directoryItemBody(INPUT, true, FULL).Title).toBe("Ali Bakar");
    expect(directoryItemBody(INPUT, false, FULL)).not.toHaveProperty("Title");
  });

  it("falls back to the email for Title when there is no name", () => {
    const body = directoryItemBody({ ...INPUT, personName: "  " }, true, FULL);
    expect(body.Title).toBe("Ali@Example.com");
  });

  it("refuses, in words, when a column routing cannot work without is absent", () => {
    expect(() => directoryItemBody(INPUT, true, mapOf("PersonEmail", "PersonName")))
      .toThrow(/ApproverEmail/);
    expect(() => directoryItemBody(INPUT, true, mapOf("PersonName")))
      .toThrow(/PersonEmail or ApproverEmail/);
  });

  it("stores a switched-off person as inactive", () => {
    expect(directoryItemBody({ ...INPUT, isActive: false }, false, FULL).IsActive).toBe(false);
  });
});
