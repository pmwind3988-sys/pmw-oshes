import { describe, expect, it } from "vitest";
import {
  findDirectoryProblems,
  formatChainTrace,
  traceApprovalChain,
} from "../approvalDirectoryHealth";
import type { ApprovalDirectoryRow } from "../approvalDirectorySchema";

function person(
  personEmail: string,
  approverEmail: string,
  overrides: Partial<ApprovalDirectoryRow> = {},
): ApprovalDirectoryRow {
  return {
    personEmail,
    personName: personEmail.split("@")[0],
    department: "Engineering",
    position: "Engineer",
    employeeId: "",
    approverEmail,
    isActive: true,
    ...overrides,
  };
}

const ORG: ApprovalDirectoryRow[] = [
  person("ali@pmw.com", "siti@pmw.com"),
  person("siti@pmw.com", "raj@pmw.com", { position: "HOD" }),
  person("raj@pmw.com", "ceo@pmw.com", { department: "Finance", position: "CFO" }),
  person("ceo@pmw.com", "", { department: "Executive", position: "CEO" }),
];

describe("traceApprovalChain", () => {
  it("walks the whole line and says where it ends", () => {
    const trace = traceApprovalChain(ORG, "ali@pmw.com");
    expect(formatChainTrace(trace)).toBe("ali → siti → raj → ceo");
    expect(trace.stoppedBecause).toBe("top-of-line");
    expect(trace.summary).toContain("nobody above them");
  });

  it("starts from the person asked about, not their approver", () => {
    const trace = traceApprovalChain(ORG, "raj@pmw.com");
    expect(formatChainTrace(trace)).toBe("raj → ceo");
  });

  it("ignores case and stray spacing in the address", () => {
    expect(formatChainTrace(traceApprovalChain(ORG, "  ALI@PMW.com "))).toBe("ali → siti → raj → ceo");
  });

  it("names an unlisted person instead of silently returning nothing", () => {
    const trace = traceApprovalChain(ORG, "newcomer@pmw.com");
    expect(trace.stoppedBecause).toBe("not-listed");
    expect(trace.steps).toEqual([]);
    expect(trace.summary).toContain("not in the directory");
  });

  it("stops where the line points at somebody unlisted, and says who", () => {
    const broken = [person("ali@pmw.com", "ghost@pmw.com")];
    const trace = traceApprovalChain(broken, "ali@pmw.com");
    expect(trace.stoppedBecause).toBe("not-listed");
    expect(trace.summary).toContain("ghost@pmw.com");
    expect(trace.summary).toContain("Add them");
  });

  it("stops at a switched-off approver rather than routing to a leaver", () => {
    const withLeaver = [
      person("ali@pmw.com", "gone@pmw.com"),
      person("gone@pmw.com", "", { isActive: false }),
    ];
    const trace = traceApprovalChain(withLeaver, "ali@pmw.com");
    expect(trace.stoppedBecause).toBe("inactive");
    expect(trace.summary).toContain("switched off");
  });

  it("reports a loop instead of walking it forever", () => {
    const looped = [person("a@pmw.com", "b@pmw.com"), person("b@pmw.com", "a@pmw.com")];
    const trace = traceApprovalChain(looped, "a@pmw.com");
    expect(trace.stoppedBecause).toBe("loop");
    expect(trace.summary).toContain("loops back");
  });

  it("stops a line longer than the resolver would ever walk", () => {
    const long = Array.from({ length: 15 }, (_, index) =>
      person(`p${index}@pmw.com`, `p${index + 1}@pmw.com`));
    const trace = traceApprovalChain(long, "p0@pmw.com");
    expect(trace.stoppedBecause).toBe("hop-limit");
  });

  it("refuses to route from somebody switched off", () => {
    const trace = traceApprovalChain([person("ali@pmw.com", "siti@pmw.com", { isActive: false })], "ali@pmw.com");
    expect(trace.stoppedBecause).toBe("inactive");
  });
});

describe("findDirectoryProblems", () => {
  it("finds nothing wrong with a sound directory, beyond the top of the line", () => {
    const problems = findDirectoryProblems(ORG);
    expect(problems.filter((problem) => problem.blocking)).toEqual([]);
    // The CEO has no approver, which is correct rather than broken.
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe("no-approver");
    expect(problems[0].blocking).toBe(false);
  });

  it("flags an approver who is not in the directory", () => {
    const problems = findDirectoryProblems([person("ali@pmw.com", "ghost@pmw.com")]);
    expect(problems[0].kind).toBe("approver-not-listed");
    expect(problems[0].blocking).toBe(true);
  });

  it("flags a duplicate, and says which row actually gets used", () => {
    const problems = findDirectoryProblems([
      person("ali@pmw.com", "siti@pmw.com"),
      person("ali@pmw.com", "raj@pmw.com"),
      person("siti@pmw.com", ""),
    ]);
    const duplicate = problems.find((problem) => problem.kind === "duplicate-person");
    expect(duplicate?.message).toContain("Only the first row is used");
  });

  it("flags somebody listed as their own approver", () => {
    const problems = findDirectoryProblems([person("ali@pmw.com", "ali@pmw.com")]);
    expect(problems[0].kind).toBe("self-approver");
    expect(problems[0].blocking).toBe(true);
  });

  it("flags an unusable address", () => {
    const problems = findDirectoryProblems([person("not-an-email", "siti@pmw.com")]);
    expect(problems[0].kind).toBe("invalid-email");
  });

  it("flags a loop once per person caught in it", () => {
    const problems = findDirectoryProblems([
      person("a@pmw.com", "b@pmw.com"),
      person("b@pmw.com", "a@pmw.com"),
    ]);
    expect(problems.every((problem) => problem.kind === "loop")).toBe(true);
    expect(problems).toHaveLength(2);
  });

  it("ignores rows that are switched off", () => {
    const problems = findDirectoryProblems([person("gone@pmw.com", "ghost@pmw.com", { isActive: false })]);
    expect(problems).toEqual([]);
  });

  it("puts the blocking problems first", () => {
    const problems = findDirectoryProblems([
      person("top@pmw.com", ""),
      person("ali@pmw.com", "ghost@pmw.com"),
    ]);
    expect(problems[0].blocking).toBe(true);
    expect(problems[problems.length - 1].blocking).toBe(false);
  });
});
