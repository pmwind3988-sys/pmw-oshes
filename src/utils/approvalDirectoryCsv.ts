/**
 * approvalDirectoryCsv.ts — moving the directory in and out as a spreadsheet.
 *
 * Nobody types three hundred employees into a web form. HR already keeps this
 * as a spreadsheet, so the import path has to accept the file they already
 * have: their column order, their column spelling, and their habit of leaving
 * cells blank.
 *
 * Everything here is pure. The point is that an admin can be shown exactly what
 * an import would do — row by row, before anything is written — instead of
 * finding out afterwards.
 */
import { csvRow, parseCsv } from "./csv";
import { directoryEmailKey, type ApprovalDirectoryRow } from "./approvalDirectorySchema";
import type { ApprovalDirectoryInput } from "./approvalDirectory";

/** The header we write, and the one an admin gets by exporting first. */
export const DIRECTORY_CSV_HEADER = [
  "PersonEmail",
  "PersonName",
  "Department",
  "Position",
  "EmployeeId",
  "ApproverEmail",
  "IsActive",
] as const;

type DirectoryField = keyof ApprovalDirectoryInput;

/**
 * Header spellings accepted for each field, beyond the canonical name.
 *
 * An HR spreadsheet says "Reports To" or "Approver", not `ApproverEmail`.
 * Rejecting those would send the admin off to rewrite a file they already have,
 * which is exactly the "go here, go there" this page exists to remove.
 */
const HEADER_ALIASES: Record<DirectoryField, string[]> = {
  personEmail: ["personemail", "email", "emailaddress", "useremail", "staffemail", "upn"],
  personName: ["personname", "name", "fullname", "staffname", "employeename", "displayname"],
  department: ["department", "dept", "division"],
  position: ["position", "role", "jobtitle", "title", "designation"],
  employeeId: ["employeeid", "empid", "staffid", "staffno", "userid", "employeenumber"],
  approverEmail: ["approveremail", "approver", "reportsto", "reportingto", "manager", "manageremail", "supervisor", "evaluator"],
  isActive: ["isactive", "active", "status", "enabled"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** Which column index holds each field; -1 when the file does not have it. */
export type DirectoryCsvColumns = Record<DirectoryField, number>;

function matchColumns(header: string[]): DirectoryCsvColumns {
  const normalized = header.map(normalizeHeader);
  const find = (field: DirectoryField): number => {
    for (const alias of HEADER_ALIASES[field]) {
      const index = normalized.indexOf(alias);
      if (index !== -1) return index;
    }
    return -1;
  };

  return {
    personEmail: find("personEmail"),
    personName: find("personName"),
    department: find("department"),
    position: find("position"),
    employeeId: find("employeeId"),
    approverEmail: find("approverEmail"),
    isActive: find("isActive"),
  };
}

/**
 * Reads a spreadsheet cell as yes/no.
 *
 * Blank means active: a file that simply has no such column, or a row somebody
 * left empty, must not read as "this person has left the company".
 */
function parseActive(value: string | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return true;
  return !["no", "n", "false", "0", "inactive", "disabled", "off", "left", "leaver"].includes(text);
}

/** What importing one line would do, and anything wrong with it. */
export type DirectoryImportAction = "create" | "update" | "unchanged" | "error";

export interface DirectoryImportRow {
  /** 1-based line number in the file, header included, for pointing at a row. */
  line: number;
  input: ApprovalDirectoryInput;
  action: DirectoryImportAction;
  /** The existing row this would overwrite, when action is update/unchanged. */
  existingId?: number;
  /** Which fields differ from the existing row. Empty for a create. */
  changedFields: string[];
  problems: string[];
}

export interface DirectoryImportPlan {
  rows: DirectoryImportRow[];
  /** Wrong with the file as a whole rather than any one row. */
  fileProblems: string[];
  counts: Record<DirectoryImportAction, number>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMPARED_FIELDS: Array<{ field: DirectoryField; label: string }> = [
  { field: "personName", label: "Name" },
  { field: "department", label: "Department" },
  { field: "position", label: "Position" },
  { field: "employeeId", label: "Employee ID" },
  { field: "approverEmail", label: "Approver" },
  { field: "isActive", label: "Active" },
];

function differences(input: ApprovalDirectoryInput, existing: ApprovalDirectoryRow): string[] {
  return COMPARED_FIELDS
    .filter(({ field }) => {
      if (field === "isActive") return input.isActive !== existing.isActive;
      if (field === "approverEmail") {
        return directoryEmailKey(input.approverEmail) !== directoryEmailKey(existing.approverEmail);
      }
      return String(input[field]).trim() !== String(existing[field as keyof ApprovalDirectoryRow] ?? "").trim();
    })
    .map(({ label }) => label);
}

/**
 * Works out what a file would do to the directory, without doing any of it.
 *
 * Rows are matched to existing people by email, so re-importing an edited
 * spreadsheet updates rather than duplicates — which is how an admin will
 * actually keep this list current.
 */
export function planDirectoryImport(
  text: string,
  existing: ApprovalDirectoryRow[],
): DirectoryImportPlan {
  const empty: DirectoryImportPlan = {
    rows: [],
    fileProblems: [],
    counts: { create: 0, update: 0, unchanged: 0, error: 0 },
  };

  const lines = parseCsv(text);
  if (lines.length === 0) {
    return { ...empty, fileProblems: ["That file has no rows in it."] };
  }

  const columns = matchColumns(lines[0]);
  if (columns.personEmail === -1) {
    return {
      ...empty,
      fileProblems: [
        "No email column found. The first row must be a header, and one of its columns must be the person's email — name it PersonEmail, or just Email.",
      ],
    };
  }
  if (columns.approverEmail === -1) {
    return {
      ...empty,
      fileProblems: [
        "No approver column found. Add a column named ApproverEmail (or Reports To) holding the email of whoever approves each person.",
      ],
    };
  }

  const byEmail = new Map<string, ApprovalDirectoryRow>();
  for (const row of existing) {
    const key = directoryEmailKey(row.personEmail);
    if (key && !byEmail.has(key)) byEmail.set(key, row);
  }

  const seenInFile = new Map<string, number>();
  const rows: DirectoryImportRow[] = [];

  for (let index = 1; index < lines.length; index++) {
    const cells = lines[index];
    const at = (column: number): string => (column === -1 ? "" : (cells[column] ?? "").trim());
    const personEmail = at(columns.personEmail).toLowerCase();
    const known = byEmail.get(directoryEmailKey(personEmail));

    /**
     * A column the file does not have leaves that field alone.
     *
     * The everyday import is two columns — who, and who approves them. Reading
     * the six absent columns as empty would wipe every department and job title
     * in the list, which is a destructive surprise from a file that visibly
     * says nothing about them.
     */
    const text = (column: number, field: keyof ApprovalDirectoryRow): string =>
      (column === -1 ? String(known?.[field] ?? "") : at(column));

    const input: ApprovalDirectoryInput = {
      personEmail,
      personName: text(columns.personName, "personName"),
      department: text(columns.department, "department"),
      position: text(columns.position, "position"),
      employeeId: text(columns.employeeId, "employeeId"),
      approverEmail: at(columns.approverEmail).toLowerCase(),
      isActive: columns.isActive === -1 ? (known?.isActive ?? true) : parseActive(at(columns.isActive)),
    };

    const problems: string[] = [];
    const key = directoryEmailKey(input.personEmail);

    if (!key) {
      problems.push("No email in this row, so there is nobody to add.");
    } else if (!EMAIL_RE.test(input.personEmail)) {
      problems.push(`"${input.personEmail}" is not a valid email address.`);
    } else if (seenInFile.has(key)) {
      problems.push(`Already listed on line ${seenInFile.get(key)} of this file.`);
    }

    if (input.approverEmail && !EMAIL_RE.test(input.approverEmail)) {
      problems.push(`"${input.approverEmail}" is not a valid approver email address.`);
    }
    if (input.approverEmail && key && directoryEmailKey(input.approverEmail) === key) {
      problems.push("This person is listed as their own approver.");
    }

    const line = index + 1;
    if (problems.length > 0) {
      rows.push({ line, input, action: "error", changedFields: [], problems });
      continue;
    }

    seenInFile.set(key, line);
    const match = byEmail.get(key);
    if (!match) {
      rows.push({ line, input, action: "create", changedFields: [], problems });
      continue;
    }

    const changedFields = differences(input, match);
    rows.push({
      line,
      input,
      action: changedFields.length > 0 ? "update" : "unchanged",
      existingId: match.id,
      changedFields,
      problems,
    });
  }

  const counts = { create: 0, update: 0, unchanged: 0, error: 0 } as Record<DirectoryImportAction, number>;
  for (const row of rows) counts[row.action]++;

  return { rows, fileProblems: [], counts };
}

/** The directory as a file the admin can edit and import straight back. */
export function directoryToCsv(rows: ApprovalDirectoryRow[]): string {
  const lines = [csvRow([...DIRECTORY_CSV_HEADER])];
  for (const row of rows) {
    lines.push(csvRow([
      row.personEmail,
      row.personName,
      row.department,
      row.position,
      row.employeeId,
      row.approverEmail,
      row.isActive ? "Yes" : "No",
    ]));
  }
  return lines.join("\r\n");
}

/** A header-only file, so an admin starting from nothing has something to fill. */
export function directoryCsvTemplate(): string {
  return [
    csvRow([...DIRECTORY_CSV_HEADER]),
    csvRow(["ali@example.com", "Ali bin Ahmad", "Engineering", "Engineer", "E1024", "siti@example.com", "Yes"]),
    csvRow(["siti@example.com", "Siti Nurhaliza", "Engineering", "HOD", "E0310", "raj@example.com", "Yes"]),
    csvRow(["raj@example.com", "Raj Kumar", "Finance", "CFO", "E0044", "", "Yes"]),
  ].join("\r\n");
}
