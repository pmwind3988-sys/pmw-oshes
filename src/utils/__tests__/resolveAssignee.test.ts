import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveLayerAssignee,
  stripFieldReference,
  valueToText,
  type AssigneeResolverPorts,
  type ResolvableLayer,
} from "../resolveAssignee";

const NEVER_CALLED: AssigneeResolverPorts = {
  lookupDepartmentApprover: () => {
    throw new Error("directory lookup should not have been called");
  },
  expandDistributionList: () => {
    throw new Error("distribution list expansion should not have been called");
  },
};

function layer(overrides: Partial<ResolvableLayer> & Pick<ResolvableLayer, "assignee">): ResolvableLayer {
  return { layerNumber: 1, authMode: "365", ...overrides };
}

describe("valueToText", () => {
  it("reads a plain string", () => {
    expect(valueToText("  ali@pmw.com ")).toBe("ali@pmw.com");
  });

  it("digs an address out of a choice-style answer object", () => {
    expect(valueToText({ email: "siti@pmw.com" })).toBe("siti@pmw.com");
    expect(valueToText({ value: "Engineering" })).toBe("Engineering");
  });

  it("is empty for blanks rather than 'undefined'", () => {
    expect(valueToText(null)).toBe("");
    expect(valueToText(undefined)).toBe("");
    expect(valueToText({})).toBe("");
  });
});

describe("stripFieldReference", () => {
  it("unwraps the ${field} form and leaves a bare name alone", () => {
    expect(stripFieldReference("${supervisorEmail}")).toBe("supervisorEmail");
    expect(stripFieldReference("supervisorEmail")).toBe("supervisorEmail");
  });
});

describe("resolveLayerAssignee — fixed user", () => {
  it("resolves the configured address as the only actor", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "user", value: " ali@pmw.com " } }),
      {},
      NEVER_CALLED,
    );
    expect(result).toEqual({ email: "ali@pmw.com", name: "", emails: ["ali@pmw.com"] });
  });

  it("blocks a signed-in layer with no usable address", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "user", value: "not-an-email" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toContain("needs a valid assignee email");
    expect(result.emails).toEqual([]);
  });

  it("lets a public layer through, since it acts by token not identity", async () => {
    const result = await resolveLayerAssignee(
      layer({ authMode: "public", assignee: { type: "user", value: "front-desk" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toBeUndefined();
  });

  it("still rejects a non-address on a public layer when asked to", async () => {
    const result = await resolveLayerAssignee(
      layer({ authMode: "public", assignee: { type: "user", value: "front-desk" } }),
      {},
      NEVER_CALLED,
      { rejectNonEmailAlways: true },
    );
    expect(result.error).toContain("is not a valid email address");
  });
});

describe("resolveLayerAssignee — field reference", () => {
  it("reads the address out of the submitted answers", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "field-reference", value: "${supervisorEmail}" } }),
      { supervisorEmail: "siti@pmw.com" },
      NEVER_CALLED,
    );
    expect(result.emails).toEqual(["siti@pmw.com"]);
  });

  it("blocks when the referenced field was left empty", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "field-reference", value: "supervisorEmail" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toContain("needs a valid assignee email");
  });
});

describe("resolveLayerAssignee — several named people", () => {
  it("keeps every address as an actor and the first as primary", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "users", value: "ali@pmw.com; siti@pmw.com\nraj@pmw.com" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.email).toBe("ali@pmw.com");
    expect(result.emails).toEqual(["ali@pmw.com", "siti@pmw.com", "raj@pmw.com"]);
  });

  it("drops entries that are not addresses", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "users", value: "ali@pmw.com, tbc" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.emails).toEqual(["ali@pmw.com"]);
  });

  it("blocks a signed-in layer when none of them are usable", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "users", value: "tbc, tba" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toContain("at least one valid assignee email");
  });
});

describe("resolveLayerAssignee — distribution list", () => {
  const expanding = (members: string[]): AssigneeResolverPorts => ({
    ...NEVER_CALLED,
    expandDistributionList: async () => members,
  });

  it("makes every member an actor", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "safety@pmw.com" } }),
      {},
      expanding(["ali@pmw.com", "siti@pmw.com"]),
    );
    expect(result.email).toBe("ali@pmw.com");
    expect(result.emails).toEqual(["ali@pmw.com", "siti@pmw.com"]);
  });

  it("blocks a signed-in layer when the list expands to nobody", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "safety@pmw.com" } }),
      {},
      expanding([]),
    );
    expect(result.error).toContain("returned no members");
  });

  it("uses the caller's wording for an empty list when given one", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "safety@pmw.com" } }),
      {},
      expanding([]),
      { emptyDistributionListError: (_label, address) => `Group.Read.All missing for ${address}` },
    );
    expect(result.error).toBe("Group.Read.All missing for safety@pmw.com");
  });

  it("falls back to mailing the list itself on a public layer", async () => {
    const result = await resolveLayerAssignee(
      layer({ authMode: "public", assignee: { type: "distribution-list", value: "safety@pmw.com" } }),
      {},
      expanding([]),
    );
    expect(result.emails).toEqual(["safety@pmw.com"]);
    expect(result.error).toBeUndefined();
  });

  it("reports a bad list address without calling out to expand it", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "not-a-list" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toContain("valid distribution list address");
    expect(result.email).toBe("");
  });

  it("can keep the bad address visible for the dashboard", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "not-a-list" } }),
      {},
      NEVER_CALLED,
      { keepInvalidDistributionListAddress: true },
    );
    expect(result.email).toBe("not-a-list");
  });

  it("surfaces an expansion failure instead of assigning nobody silently", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "distribution-list", value: "safety@pmw.com" } }),
      {},
      { ...NEVER_CALLED, expandDistributionList: async () => { throw new Error("Graph 403"); } },
    );
    expect(result.error).toBe("Graph 403");
    expect(result.emails).toEqual([]);
  });
});

describe("resolveLayerAssignee — department directory", () => {
  it("uses the address the directory returned", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "department-approver", value: "department" } }),
      { department: "Engineering" },
      { ...NEVER_CALLED, lookupDepartmentApprover: async () => ({ email: "siti@pmw.com", name: "Siti" }) },
    );
    expect(result).toEqual({ email: "siti@pmw.com", name: "Siti", emails: ["siti@pmw.com"] });
  });

  it("reports a directory miss rather than throwing at the caller", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "department-approver", value: "department" } }),
      { department: "Marketing" },
      {
        ...NEVER_CALLED,
        lookupDepartmentApprover: async () => { throw new Error('No HOD for department "Marketing".'); },
      },
    );
    expect(result.error).toBe('No HOD for department "Marketing".');
    expect(result.emails).toEqual([]);
  });
});

describe("wording", () => {
  it("takes the caller's sentence tail so submit and workflow paths read right", async () => {
    const result = await resolveLayerAssignee(
      layer({ assignee: { type: "user", value: "" } }),
      {},
      NEVER_CALLED,
      { blockedSuffix: "before this form can be submitted." },
    );
    expect(result.error).toBe("Layer 1 needs a valid assignee email before this form can be submitted.");
  });

  it("names the layer by its title when it has one", async () => {
    const result = await resolveLayerAssignee(
      layer({ title: "Head of Department", assignee: { type: "user", value: "" } }),
      {},
      NEVER_CALLED,
    );
    expect(result.error).toContain("Head of Department needs");
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n").split("\n");

    const client = read("src/utils/resolveAssignee.ts");
    const server = read("api/_utils/resolveAssignee.ts");

    expect(server.length).toBe(client.length);
    const differing = client
      .map((line, index) => (line === server[index] ? null : index))
      .filter((index): index is number => index !== null);

    // Only the "this is the other copy" line may differ. Anything else means
    // the pair has drifted, which is exactly what this module exists to stop.
    expect(differing.length).toBe(1);
    expect(client[differing[0]]).toContain("api/_utils/resolveAssignee.ts");
    expect(server[differing[0]]).toContain("src/utils/resolveAssignee.ts");
  });
});
