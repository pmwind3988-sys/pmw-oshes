import { describe, expect, it } from "vitest";
import {
  accessSummary,
  allowedScreens,
  canChase,
  canExportCsv,
  derivePortalAccess,
  derivePortalRole,
  isReadOnlyRole,
  portalHome,
  portalTabs,
  subsScopes,
  type PortalRoleInput,
} from "./portalRole";
import type { CatalogueEntry, LayerConfigItem, PortalRecord } from "../types";
import { describeWorkflow, resolveFormVisibility } from "./formWorkflow";

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
  const workflow = describeWorkflow(layers);
  const visibility = resolveFormVisibility({ masterFormIsPublic: false });
  return {
    listTitle: "Incident Report",
    code: "INC",
    name: "Incident Report",
    slug: "incident-report",
    chain: [],
    layers,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays: 3,
    hasSla: workflow.hasWorkflow,
    visibility,
    isPublic: visibility.isPublic,
    volume: 0,
    today: 0,
    firstApprover: "",
  };
}

const NO_RECORDS: PortalRecord[] = [];
const CATALOGUE = [entry([layer(1, "nurul@pmw.gov.my", "evaluation"), layer(2, "faizal@pmw.gov.my", "approval")])];

function input(overrides: Partial<PortalRoleInput> = {}): PortalRoleInput {
  return { userEmail: "", isAdmin: false, isAuditor: false, catalogue: CATALOGUE, records: NO_RECORDS, ...overrides };
}

describe("derivePortalRole", () => {
  it("puts admins first, regardless of what they are assigned", () => {
    expect(derivePortalRole(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true }))).toBe("admin");
  });

  it("puts auditors ahead of any assignment, so they never gain a write path", () => {
    expect(derivePortalRole(input({ userEmail: "nurul@pmw.gov.my", isAuditor: true }))).toBe("auditor");
  });

  it("resolves an evaluation-layer assignee to evaluator", () => {
    expect(derivePortalRole(input({ userEmail: "nurul@pmw.gov.my" }))).toBe("evaluator");
  });

  it("resolves an approval-only assignee to approver", () => {
    expect(derivePortalRole(input({ userEmail: "faizal@pmw.gov.my" }))).toBe("approver");
  });

  it("gives evaluator the superset view when someone is both", () => {
    const both = [entry([layer(1, "nurul@pmw.gov.my", "approval"), layer(2, "nurul@pmw.gov.my", "evaluation")])];
    expect(derivePortalRole(input({ userEmail: "nurul@pmw.gov.my", catalogue: both }))).toBe("evaluator");
  });

  it("falls back to submitter when nothing points at you", () => {
    expect(derivePortalRole(input({ userEmail: "sazali@marinekita.com" }))).toBe("submitter");
  });
});

describe("derivePortalAccess", () => {
  it("keeps an administrator's own assignment, so they still get a queue", () => {
    const access = derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true }));
    expect(access.role).toBe("admin");
    expect(access.isAssignee).toBe(true);
    expect(access.canManageCatalogue).toBe(true);
  });

  it("gives an approver a route to their own filings without widening what they see", () => {
    const access = derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my" }));
    expect(access.isAssignee).toBe(true);
    expect(access.canSeeEveryRecord).toBe(false);
    expect(access.canFile).toBe(true);
  });

  it("never gives an audit account a write path", () => {
    const access = derivePortalAccess(input({ userEmail: "nurul@pmw.gov.my", isAuditor: true }));
    expect(access.readOnly).toBe(true);
    expect(access.canFile).toBe(false);
    expect(access.canChase).toBe(false);
    expect(access.canSeeEveryRecord).toBe(true);
  });

  it("lets admin win over auditor when an account is in both groups", () => {
    const access = derivePortalAccess(input({ userEmail: "nurul@pmw.gov.my", isAdmin: true, isAuditor: true }));
    expect(access.readOnly).toBe(false);
    expect(access.canManageCatalogue).toBe(true);
  });

  it("picks up an assignment that exists only as a per-submission reassignment", () => {
    const record = { chain: [{ email: "hafiz@pmw.gov.my", type: "approval" }] } as PortalRecord;
    const access = derivePortalAccess(input({ userEmail: "hafiz@pmw.gov.my", records: [record] }));
    expect(access.isAssignee).toBe(true);
  });
});

describe("navigation", () => {
  const tabLabels = (roleInput: PortalRoleInput, needsCount = 0) =>
    portalTabs(derivePortalAccess(roleInput), needsCount).map((tab) => tab.label);

  it("gives everyone Home and Submissions, and nothing else", () => {
    expect(tabLabels(input({ userEmail: "sazali@marinekita.com" }))).toEqual(["Home", "Submissions"]);
  });

  it("adds Manage for an administrator", () => {
    expect(tabLabels(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true }))).toEqual(["Home", "Submissions", "Manage"]);
  });

  it("shows the number waiting on the Submissions tab", () => {
    const tabs = portalTabs(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my" })), 4);
    expect(tabs.find((tab) => tab.screen === "subs")?.badge).toBe(4);
    expect(tabs.find((tab) => tab.screen === "home")?.badge).toBe(0);
  });

  it("opens Manage to an auditor, who sees the audit trail and smoking log but not people", () => {
    expect(tabLabels(input({ userEmail: "aud@pmw.gov.my", isAuditor: true }))).toContain("Manage");
    const screens = allowedScreens(derivePortalAccess(input({ userEmail: "aud@pmw.gov.my", isAuditor: true })));
    expect(screens).toEqual(expect.arrayContaining(["manage", "audit", "smoking"]));
    expect(screens).not.toContain("people");
  });

  it("offers the needs-me framing only to accounts that sign or evaluate", () => {
    expect(subsScopes(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my" })))).toEqual(["all", "mine", "needs"]);
    expect(subsScopes(derivePortalAccess(input({ userEmail: "nurul@pmw.gov.my" })))).toContain("needs");
    expect(subsScopes(derivePortalAccess(input({ userEmail: "aud@pmw.gov.my", isAuditor: true })))).not.toContain("needs");
    expect(subsScopes(derivePortalAccess(input({ userEmail: "sazali@marinekita.com" })))).toEqual(["all", "mine"]);
  });

  it("lets a fresh account reach Submissions even before anything is assigned to it", () => {
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "sazali@marinekita.com" })))).toEqual(
      expect.arrayContaining(["home", "subs", "settings"]),
    );
  });

  it("keeps an account out of the pages it has no way to open", () => {
    const approver = allowedScreens(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my" })));
    expect(approver).not.toContain("people");
    expect(approver).not.toContain("audit");
    expect(approver).not.toContain("manage");

    const admin = allowedScreens(derivePortalAccess(input({ userEmail: "aisyah@pmw.gov.my", isAdmin: true })));
    expect(admin).toContain("people");
  });

  it("shows the smoking log to admins and auditors only", () => {
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true })))).toContain("smoking");
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "aud@pmw.gov.my", isAuditor: true })))).toContain("smoking");
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "nurul@pmw.gov.my" })))).not.toContain("smoking");
    expect(allowedScreens(derivePortalAccess(input({ userEmail: "sazali@marinekita.com" })))).not.toContain("smoking");
  });

  it("lands everyone on the page that shows all the others", () => {
    expect(portalHome()).toBe("home");
  });
});

describe("capability gates", () => {
  it("summarises what an account can do in one line", () => {
    expect(accessSummary(derivePortalAccess(input({ userEmail: "sazali@marinekita.com", isAuditor: true })))).toContain(
      "Read only",
    );
    expect(accessSummary(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true })))).toBe(
      "Sees every record, signs on assigned layers, manages the form catalogue.",
    );
  });

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
