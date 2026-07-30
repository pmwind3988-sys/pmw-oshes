import { describe, expect, it } from "vitest";
import { allowedScreens, canChase, canExportCsv, derivePortalRole, isReadOnlyRole, portalHome, portalNav } from "./portalRole";
import type { CatalogueEntry, LayerConfigItem, PortalRecord } from "../types";

function layer(layerNumber: number, email: string, type: "approval" | "evaluation"): LayerConfigItem {
  const base = {
    layerNumber,
    authMode: "365" as const,
    assignee: { type: "user" as const, value: email },
  };
  return type === "evaluation"
    ? { ...base, type: "evaluation", surveyElements: [] }
    : { ...base, type: "approval", confirmationType: "signature", allowRejectionReason: true };
}

function entry(layers: LayerConfigItem[]): CatalogueEntry {
  return {
    listTitle: "Incident Report",
    code: "INC",
    name: "Incident Report",
    chain: [],
    layers,
    slaDays: 3,
    isPublic: false,
    severityCapture: "none",
    volume: 0,
    today: 0,
    firstApprover: "",
  };
}

const NO_RECORDS: PortalRecord[] = [];

describe("derivePortalRole", () => {
  const catalogue = [entry([layer(1, "nurul@pmw.gov.my", "evaluation"), layer(2, "faizal@pmw.gov.my", "approval")])];

  it("puts admins first, regardless of what they are assigned", () => {
    const role = derivePortalRole({ userEmail: "faizal@pmw.gov.my", isAdmin: true, isAuditor: false, catalogue, records: NO_RECORDS });
    expect(role).toBe("admin");
  });

  it("puts auditors ahead of any assignment, so they never gain a write path", () => {
    const role = derivePortalRole({ userEmail: "nurul@pmw.gov.my", isAdmin: false, isAuditor: true, catalogue, records: NO_RECORDS });
    expect(role).toBe("auditor");
  });

  it("resolves an evaluation-layer assignee to evaluator", () => {
    const role = derivePortalRole({ userEmail: "nurul@pmw.gov.my", isAdmin: false, isAuditor: false, catalogue, records: NO_RECORDS });
    expect(role).toBe("evaluator");
  });

  it("resolves an approval-only assignee to approver", () => {
    const role = derivePortalRole({ userEmail: "faizal@pmw.gov.my", isAdmin: false, isAuditor: false, catalogue, records: NO_RECORDS });
    expect(role).toBe("approver");
  });

  it("gives evaluator the superset view when someone is both", () => {
    const both = [entry([layer(1, "nurul@pmw.gov.my", "approval"), layer(2, "nurul@pmw.gov.my", "evaluation")])];
    const role = derivePortalRole({ userEmail: "nurul@pmw.gov.my", isAdmin: false, isAuditor: false, catalogue: both, records: NO_RECORDS });
    expect(role).toBe("evaluator");
  });

  it("falls back to submitter when nothing points at you", () => {
    const role = derivePortalRole({ userEmail: "sazali@marinekita.com", isAdmin: false, isAuditor: false, catalogue, records: NO_RECORDS });
    expect(role).toBe("submitter");
  });
});

describe("navigation", () => {
  const counts = { queue: 4, allRecords: 12, visibleRecords: 3, catalogue: 10, audit: 9 };

  it("gives each role exactly its items, in order", () => {
    expect(portalNav("admin", counts).map((item) => item.label)).toEqual([
      "Today",
      "Submissions",
      "Form catalogue",
      "People & roles",
      "Audit trail",
    ]);
    expect(portalNav("evaluator", counts).map((item) => item.label)).toEqual(["Today", "To evaluate", "Submissions"]);
    expect(portalNav("approver", counts).map((item) => item.label)).toEqual(["My approvals", "All records"]);
    expect(portalNav("submitter", counts).map((item) => item.label)).toEqual(["My submissions", "File a form"]);
    expect(portalNav("auditor", counts).map((item) => item.label)).toEqual(["Records", "Audit trail"]);
  });

  it("counts the submitter's own rows, not everything", () => {
    expect(portalNav("submitter", counts)[0].count).toBe(3);
    expect(portalNav("approver", counts)[0].count).toBe(4);
  });

  it("lands each role where its work is", () => {
    expect(portalHome("admin")).toBe("today");
    expect(portalHome("evaluator")).toBe("today");
    expect(portalHome("approver")).toBe("queue");
    expect(portalHome("submitter")).toBe("subs");
    expect(portalHome("auditor")).toBe("subs");
  });

  it("keeps a role out of screens it has no nav item for", () => {
    expect(allowedScreens("approver")).not.toContain("cat");
    expect(allowedScreens("auditor")).not.toContain("queue");
    expect(allowedScreens("admin")).toContain("people");
  });
});

describe("capability gates", () => {
  it("lets only audit accounts be read-only", () => {
    expect(isReadOnlyRole("auditor")).toBe(true);
    expect(isReadOnlyRole("admin")).toBe(false);
  });

  it("allows chasing for admin and evaluator only", () => {
    expect(canChase("admin")).toBe(true);
    expect(canChase("evaluator")).toBe(true);
    expect(canChase("approver")).toBe(false);
    expect(canChase("submitter")).toBe(false);
    expect(canChase("auditor")).toBe(false);
  });

  it("allows CSV export for admin, evaluator and auditor", () => {
    expect(canExportCsv("auditor")).toBe(true);
    expect(canExportCsv("submitter")).toBe(false);
  });
});
