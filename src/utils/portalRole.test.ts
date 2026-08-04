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
  portalNav,
  portalSections,
  type PortalNavCounts,
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
    visibility,
    isPublic: visibility.isPublic,
    severityCapture: "none",
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
  const counts: PortalNavCounts = { queue: 4, allRecords: 12, myRecords: 3, catalogue: 10, audit: 9 };
  const labels = (roleInput: PortalRoleInput, override: Partial<PortalNavCounts> = {}) =>
    portalNav(derivePortalAccess(roleInput), { ...counts, ...override }).map((item) => item.label);

  it("gives everyone Home, their own work and settings", () => {
    // Nothing is assigned to this account, so its queue is empty and every
    // record it can see is one it filed.
    expect(labels(input({ userEmail: "sazali@marinekita.com" }), { queue: 0, allRecords: 3 })).toEqual([
      "Home",
      "My submissions",
      "File a form",
      "Settings",
    ]);
  });

  it("gives an approver the records they are on, not just the ones they filed", () => {
    // Without this an approver loses sight of everything the moment they sign
    // it: it leaves their queue, and their own filings never contained it.
    const approver = labels(input({ userEmail: "faizal@pmw.gov.my" }));
    expect(approver).toContain("Records you are on");
    expect(approver).not.toContain("Form catalogue");
  });

  it("gives an administrator oversight without taking their own work away", () => {
    expect(labels(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true }))).toEqual([
      "Home",
      "To approve",
      "My submissions",
      "File a form",
      "Today",
      "All submissions",
      "Form catalogue",
      "People & roles",
      "Audit trail",
      "Settings",
    ]);
  });

  it("names the queue for what the account does on it", () => {
    expect(labels(input({ userEmail: "nurul@pmw.gov.my" }))).toContain("To evaluate");
    expect(labels(input({ userEmail: "faizal@pmw.gov.my" }))).toContain("To approve");
  });

  it("leaves an audit account with no queue and no way to file, even when a layer names it", () => {
    // nurul is an evaluation-layer assignee, and read-only still wins.
    const audit = labels(input({ userEmail: "nurul@pmw.gov.my", isAuditor: true }));
    expect(audit).not.toContain("To approve");
    expect(audit).not.toContain("File a form");
    expect(audit).toEqual(["Home", "My submissions", "Today", "Records", "Audit trail", "Settings"]);
  });

  it("counts each item against its own set", () => {
    const nav = portalNav(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true })), counts);
    expect(nav.find((item) => item.label === "To approve")?.count).toBe(4);
    expect(nav.find((item) => item.label === "My submissions")?.count).toBe(3);
    expect(nav.find((item) => item.label === "All submissions")?.count).toBe(12);
  });

  it("groups the nav so oversight never sits inside your own work", () => {
    const sections = portalSections(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my", isAdmin: true })), counts);
    expect(sections.map((section) => section.id)).toEqual(["start", "yours", "oversight", "account"]);
  });

  it("lands everyone on the page that shows all the others", () => {
    expect(portalHome()).toBe("home");
  });

  it("keeps an account out of screens it has no nav item for", () => {
    const approver = allowedScreens(derivePortalAccess(input({ userEmail: "faizal@pmw.gov.my" })));
    expect(approver).not.toContain("cat");
    expect(approver).not.toContain("audit");
    expect(approver).toContain("queue");

    const admin = allowedScreens(derivePortalAccess(input({ userEmail: "aisyah@pmw.gov.my", isAdmin: true })));
    expect(admin).toContain("people");
  });

  it("still reaches the queue when a reassignment arrives mid-session", () => {
    // Nothing is assigned to this account yet, so the queue carries no nav item —
    // but a reassignment can land at any time and must not bounce back to Home.
    const fresh = allowedScreens(derivePortalAccess(input({ userEmail: "sazali@marinekita.com" })));
    expect(fresh).toContain("queue");
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
