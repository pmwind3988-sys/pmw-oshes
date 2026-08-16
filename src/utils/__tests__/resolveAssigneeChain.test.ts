/**
 * Reporting-line routing — the cases the old model could not express at all.
 *
 * The fixture is deliberately the org shape that motivated this: an engineer,
 * their HOD, a CFO and a CEO, plus a clerk in another department who reports to
 * the same HOD. Every scenario below comes out of one directory column.
 */
import { describe, it, expect } from "vitest";
import {
  isDeferredAssignee,
  resolveLayerAssignee,
  type AssigneeResolverPorts,
  type ResolvableLayer,
} from "../resolveAssignee";

interface OrgRow {
  name: string;
  department: string;
  position: string;
  approverEmail: string;
}

const ORG: Record<string, OrgRow> = {
  "ali@pmw.com": { name: "Ali", department: "Engineering", position: "Engineer", approverEmail: "siti@pmw.com" },
  "siti@pmw.com": { name: "Siti", department: "Engineering", position: "HOD", approverEmail: "raj@pmw.com" },
  "raj@pmw.com": { name: "Raj", department: "Finance", position: "CFO", approverEmail: "ceo@pmw.com" },
  "ceo@pmw.com": { name: "Wong", department: "Executive", position: "CEO", approverEmail: "" },
  "clerk@pmw.com": { name: "Mei", department: "Accounts", position: "Officer", approverEmail: "siti@pmw.com" },
};

const NO_DIRECTORY: AssigneeResolverPorts = {
  lookupDepartmentApprover: () => {
    throw new Error("not used here");
  },
  expandDistributionList: () => {
    throw new Error("not used here");
  },
};

function directory(org: Record<string, OrgRow> = ORG): AssigneeResolverPorts {
  return {
    ...NO_DIRECTORY,
    lookupPerson: async (email) => {
      const row = org[email.toLowerCase()];
      return row ? { email: email.toLowerCase(), ...row } : null;
    },
    lookupRoleHolder: async (department, role) => {
      const hit = Object.entries(org).find(([, row]) => row.department === department && row.position === role);
      return hit ? { email: hit[0], name: hit[1].name } : null;
    },
  };
}

function chain(overrides: Record<string, unknown> = {}): ResolvableLayer {
  return {
    layerNumber: 1,
    authMode: "365",
    assignee: { type: "chain", startFrom: "submitter", value: "", hops: 1, ...overrides },
  };
}

function roleHolder(overrides: Record<string, unknown> = {}): ResolvableLayer {
  return {
    layerNumber: 1,
    authMode: "365",
    assignee: { type: "role-holder", department: "fixed", value: "Engineering", role: "HOD", ...overrides },
  };
}

describe("chain routing", () => {
  it("sends a submission to the submitter's own approver", async () => {
    const result = await resolveLayerAssignee(chain(), {}, directory(), {
      context: { submitterEmail: "ali@pmw.com" },
    });
    expect(result.email).toBe("siti@pmw.com");
    expect(result.name).toBe("Siti");
  });

  it("gives two people in one department different approvers, with no rules", async () => {
    const ports = directory();
    const forAli = await resolveLayerAssignee(chain(), {}, ports, { context: { submitterEmail: "ali@pmw.com" } });
    const forSiti = await resolveLayerAssignee(chain(), {}, ports, { context: { submitterEmail: "siti@pmw.com" } });
    // Siti approves Ali, but Siti's own submissions go up to the CFO. Same
    // layer configuration, different outcome, because the answer is per person.
    expect(forAli.email).toBe("siti@pmw.com");
    expect(forSiti.email).toBe("raj@pmw.com");
  });

  it("walks two hops for a second-level sign-off", async () => {
    const result = await resolveLayerAssignee(chain({ hops: 2 }), {}, directory(), {
      context: { submitterEmail: "ali@pmw.com" },
    });
    expect(result.email).toBe("raj@pmw.com");
  });

  it("routes from whoever actually acted on the previous layer", async () => {
    // The evaluator's evaluator: Siti signed layer 1, so layer 2 goes to hers.
    const result = await resolveLayerAssignee(chain({ startFrom: "previous-actor" }), {}, directory(), {
      context: { submitterEmail: "ali@pmw.com", previousActorEmail: "siti@pmw.com" },
    });
    expect(result.email).toBe("raj@pmw.com");
  });

  it("reads the starting person out of a form answer when asked to", async () => {
    const result = await resolveLayerAssignee(
      chain({ startFrom: "field", value: "staffEmail" }),
      { staffEmail: "clerk@pmw.com" },
      directory(),
      {},
    );
    expect(result.email).toBe("siti@pmw.com");
  });

  it("explains how it got there", async () => {
    const result = await resolveLayerAssignee(chain({ hops: 2 }), {}, directory(), {
      context: { submitterEmail: "ali@pmw.com" },
    });
    expect(result.explanation).toContain("ali@pmw.com → siti@pmw.com → raj@pmw.com");
    expect(result.explanation).toContain("Raj (CFO, Finance)");
  });

  it("does not step over anyone when the hop lands on somebody else", async () => {
    const result = await resolveLayerAssignee(chain({ skipSelf: true }), {}, directory(), {
      context: { submitterEmail: "siti@pmw.com" },
    });
    expect(result.email).toBe("raj@pmw.com");
  });

  it("takes another step rather than letting the submitter approve themselves", async () => {
    const withLoopBack = directory({
      ...ORG,
      "deputy@pmw.com": { name: "Deputy", department: "Engineering", position: "Deputy", approverEmail: "ali@pmw.com" },
    });
    const result = await resolveLayerAssignee(
      chain({ startFrom: "previous-actor", skipSelf: true }),
      {},
      withLoopBack,
      { context: { submitterEmail: "ali@pmw.com", previousActorEmail: "deputy@pmw.com" } },
    );
    // One hop lands back on Ali, who submitted it, so it walks one more.
    expect(result.email).toBe("siti@pmw.com");
  });

  it("parks instead of spinning when the line loops", async () => {
    const looped = directory({
      "a@pmw.com": { name: "A", department: "X", position: "P", approverEmail: "b@pmw.com" },
      "b@pmw.com": { name: "B", department: "X", position: "P", approverEmail: "a@pmw.com" },
    });
    const result = await resolveLayerAssignee(chain({ hops: 5 }), {}, looped, {
      context: { submitterEmail: "a@pmw.com" },
    });
    expect(result.parked?.reason).toContain("loops back");
    expect(result.email).toBe("");
  });

  it("parks at the top of the line rather than inventing an approver", async () => {
    const result = await resolveLayerAssignee(chain({ hops: 3 }), {}, directory(), {
      context: { submitterEmail: "raj@pmw.com" },
    });
    expect(result.parked?.reason).toContain("nobody above them");
  });

  it("parks when the person is not listed yet", async () => {
    // The everyday case while the directory is still being filled in. The
    // submission must survive this, not fail.
    const result = await resolveLayerAssignee(chain(), {}, directory(), {
      context: { submitterEmail: "newcomer@pmw.com" },
    });
    expect(result.parked?.reason).toContain("not in the approval directory");
    expect(result.error).toBeUndefined();
  });

  it("parks a public submission that carries no identity to route from", async () => {
    const result = await resolveLayerAssignee(chain(), {}, directory(), {
      context: { submitterEmail: "GUEST" },
    });
    expect(result.parked?.reason).toContain("no usable email address");
  });

  it("uses a fixed fallback when the line runs out", async () => {
    const result = await resolveLayerAssignee(
      chain({ hops: 3, fallback: { mode: "fixed", email: "hr@pmw.com" } }),
      {},
      directory(),
      { context: { submitterEmail: "raj@pmw.com" } },
    );
    expect(result.email).toBe("hr@pmw.com");
    expect(result.explanation).toContain("Fell back to hr@pmw.com");
    expect(result.parked).toBeUndefined();
  });

  it("falls back to the department head when configured to", async () => {
    const result = await resolveLayerAssignee(
      chain({ fallback: { mode: "department-hod" } }),
      { department: "Engineering" },
      directory(),
      { context: { submitterEmail: "newcomer@pmw.com" } },
    );
    expect(result.email).toBe("siti@pmw.com");
    expect(result.explanation).toContain("head of Engineering");
  });

  it("parks rather than failing where no directory is wired up", async () => {
    const result = await resolveLayerAssignee(chain(), {}, NO_DIRECTORY, {
      context: { submitterEmail: "ali@pmw.com" },
    });
    expect(result.parked?.reason).toContain("not available here");
    expect(result.error).toBeUndefined();
  });
});

describe("role-holder routing", () => {
  it("sends everyone to the same named department head", async () => {
    const ports = directory();
    const fromEngineering = await resolveLayerAssignee(roleHolder(), {}, ports, {
      context: { submitterEmail: "ali@pmw.com" },
    });
    const fromAccounts = await resolveLayerAssignee(roleHolder(), {}, ports, {
      context: { submitterEmail: "clerk@pmw.com" },
    });
    // A safety or HR form goes to that department's head whoever submits it.
    expect(fromEngineering.email).toBe("siti@pmw.com");
    expect(fromAccounts.email).toBe("siti@pmw.com");
  });

  it("can read the department off the submitter's own directory row", async () => {
    const result = await resolveLayerAssignee(roleHolder({ department: "from-submitter", value: "" }), {}, directory(), {
      context: { submitterEmail: "ali@pmw.com" },
    });
    expect(result.email).toBe("siti@pmw.com");
    expect(result.explanation).toContain("submitter's own department");
  });

  it("can read the department off a form answer", async () => {
    const result = await resolveLayerAssignee(
      roleHolder({ department: "from-field", value: "dept", role: "CFO" }),
      { dept: "Finance" },
      directory(),
      {},
    );
    expect(result.email).toBe("raj@pmw.com");
  });

  it("parks when nobody holds the role", async () => {
    const result = await resolveLayerAssignee(roleHolder({ value: "Marketing" }), {}, directory(), {});
    expect(result.parked?.reason).toContain("could not find the HOD for Marketing");
  });
});

describe("mixing the two on one form", () => {
  it("routes layer 1 up the submitter's line and layer 2 to a fixed department head", async () => {
    const ports = directory();
    const context = { submitterEmail: "clerk@pmw.com" };
    const first = await resolveLayerAssignee(chain(), {}, ports, { context });
    const second = await resolveLayerAssignee(
      { ...roleHolder({ value: "Finance", role: "CFO" }), layerNumber: 2 },
      {},
      ports,
      { context },
    );
    expect(first.email).toBe("siti@pmw.com");
    expect(second.email).toBe("raj@pmw.com");
  });
});

describe("isDeferredAssignee", () => {
  it("flags only the assignees needing an earlier layer to finish first", () => {
    expect(isDeferredAssignee({ type: "chain", value: "", startFrom: "previous-actor" })).toBe(true);
    expect(isDeferredAssignee({ type: "chain", value: "", startFrom: "submitter" })).toBe(false);
    expect(isDeferredAssignee({ type: "user", value: "a@b.com" })).toBe(false);
  });
});
