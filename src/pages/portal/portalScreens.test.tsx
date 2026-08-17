import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PortalProvider, type PortalContextValue } from "../../contexts/PortalContext";
import { describeWorkflow, resolveFormVisibility } from "../../utils/formWorkflow";
import { toPortalRecord } from "../../utils/portalRecords";
import { derivePortalAccess } from "../../utils/portalRole";
import { DEFAULT_PORTAL_PREFS } from "../../utils/portalPrefs";
import HomeScreen from "./HomeScreen";
import FormHubScreen from "./FormHubScreen";
import RecordsScreen from "./RecordsScreen";
import { OverviewTab } from "../../components/portal/RecordDetail";
import type {
  ApprovalLayerConfig,
  CatalogueEntry,
  PortalRecord,
  SharePointClient,
  Submission,
} from "../../types";

/**
 * Render smoke tests for the portal screens.
 *
 * These exist because the interesting failures in this part of the app are not
 * type errors — a screen that reads a context field that is null, or maps over
 * a list the catalogue no longer has, compiles perfectly and then throws on
 * mount. Static markup rendering is enough to catch that, and it needs neither
 * a DOM nor a signed-in tenant, so it runs in the same pass as everything else.
 *
 * The SLA cases are the point of the fixtures: one form that declares an SLA
 * and one that does not, so "an unset SLA renders nothing" is asserted rather
 * than assumed.
 */

const NOW = new Date("2026-07-30T15:00:00.000Z");
const ME = "sazali@marinekita.com";

function layer(layerNumber: number, email: string, roleLabel: string): ApprovalLayerConfig {
  return {
    layerNumber,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: email },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel,
  };
}

function entry(overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  const layers = overrides.layers ?? [layer(1, "nurul@pmw.gov.my", "Safety Officer")];
  const workflow = describeWorkflow(layers);
  const visibility = resolveFormVisibility({ masterFormIsPublic: true });
  const slaDays = overrides.slaDays ?? 0;
  return {
    listTitle: "Permit To Work",
    code: "PTW",
    name: "Permit To Work",
    slug: "permit-to-work",
    chain: layers.map((item) => item.roleLabel ?? ""),
    layers,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays,
    hasSla: workflow.hasWorkflow && slaDays > 0,
    visibility,
    isPublic: visibility.isPublic,
    severityCapture: "optional",
    volume: 4,
    today: 1,
    firstApprover: "Nurul Aziz",
    ...overrides,
  };
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "142",
    submissionId: "142",
    listTitle: "Permit To Work",
    formId: "PTW",
    formVersion: "1",
    title: "Hot work at Berth 3",
    submittedByEmail: ME,
    submittedAt: "2026-07-29T09:00:00.000Z",
    formStatus: "In Review",
    totalLayers: 1,
    currentLayer: 1,
    layers: [],
    submissionData: { WhatHappened: "Hot work at Berth 3", Location: "Berth 3" },
    ...overrides,
  } as Submission;
}

function contextValue(overrides: Partial<PortalContextValue> = {}): PortalContextValue {
  const catalogue = overrides.catalogue ?? [entry()];
  const records =
    overrides.records ?? [toPortalRecord(submission(), catalogue[0], {}, {}, NOW)];
  const access = derivePortalAccess({
    userEmail: ME,
    isAdmin: true,
    isAuditor: false,
    catalogue,
    records,
  });

  return {
    role: access.role,
    access,
    userEmail: ME,
    userName: "Sazali Rahim",
    userTitle: ME,
    isAdmin: true,
    spClient: {} as SharePointClient,
    directory: {},
    records,
    myRecords: records.filter((record) => record.submitterEmail === ME),
    queue: [],
    catalogue,
    audit: [],
    surveyJsonByForm: {},
    refresh: () => {},
    screen: "home",
    setScreen: () => {},
    focusForm: null,
    focusStatus: null,
    prefs: DEFAULT_PORTAL_PREFS,
    setPrefs: () => {},
    drawerRef: null,
    openDrawer: () => {},
    closeDrawer: () => {},
    nudged: {},
    markNudged: () => {},
    applyPatch: () => {},
    appendAudit: () => {},
    updateCatalogue: () => {},
    toast: () => {},
    onSignOut: () => {},
    ...overrides,
  };
}

function render(node: React.ReactNode, value: PortalContextValue): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PortalProvider {...value}>{node}</PortalProvider>
    </MemoryRouter>,
  );
}

describe("HomeScreen", () => {
  it("lists each form type as a way in", () => {
    const html = render(<HomeScreen />, contextValue());
    expect(html).toContain("Your forms");
    expect(html).toContain("Permit To Work");
    expect(html).toContain("PTW");
  });

  it("renders for an account with nothing filed and no forms published", () => {
    const html = render(<HomeScreen />, contextValue({ catalogue: [], records: [], myRecords: [] }));
    expect(html).toContain("No form types are published yet");
  });

  it("shows no SLA statistic when no form declares one", () => {
    const html = render(<HomeScreen />, contextValue());
    expect(html).not.toContain("Past SLA");
  });

  it("shows the SLA statistic once a form declares one", () => {
    const withSla = entry({ slaDays: 3 });
    const records = [toPortalRecord(submission(), withSla, {}, {}, NOW)];
    const html = render(<HomeScreen />, contextValue({ catalogue: [withSla], records }));
    expect(html).toContain("Past SLA");
  });
});

describe("FormHubScreen", () => {
  it("offers the three doors for the form in focus", () => {
    const html = render(<FormHubScreen />, contextValue({ focusForm: "Permit To Work" }));
    expect(html).toContain("New Permit To Work");
    expect(html).toContain("My Permit To Work");
    expect(html).toContain("All Permit To Work");
  });

  it("states what happens after submit", () => {
    const html = render(<FormHubScreen />, contextValue({ focusForm: "Permit To Work" }));
    expect(html).toContain("What happens after you submit");
    expect(html).toContain("Safety Officer");
  });

  it("advertises no SLA badge for a form that declares none", () => {
    const html = render(<FormHubScreen />, contextValue({ focusForm: "Permit To Work" }));
    expect(html).not.toContain("SLA");
  });

  it("advertises the SLA for a form that declares one", () => {
    const withSla = entry({ slaDays: 2 });
    const records = [toPortalRecord(submission(), withSla, {}, {}, NOW)];
    const html = render(
      <FormHubScreen />,
      contextValue({ catalogue: [withSla], records, focusForm: "Permit To Work" }),
    );
    expect(html).toContain("2-day SLA per layer");
  });

  it("falls back to the picker when the form in focus is gone", () => {
    const html = render(<FormHubScreen />, contextValue({ focusForm: "Deleted Form" }));
    expect(html).toContain("not in the catalogue any more");
  });
});

describe("RecordsScreen", () => {
  it("opens pre-filtered to the form and status it was sent with", () => {
    const html = render(
      <RecordsScreen scope="all" />,
      contextValue({ focusForm: "Permit To Work", focusStatus: "open" }),
    );
    expect(html).toContain("All Permit To Work");
  });

  it("drops the Past SLA filter option where no form has an SLA", () => {
    const html = render(<RecordsScreen scope="all" />, contextValue());
    expect(html).not.toContain("Past SLA");
  });
});

describe("OverviewTab", () => {
  function recordFor(slaDays: number): PortalRecord {
    return toPortalRecord(submission(), entry({ slaDays }), {}, {}, NOW);
  }

  it("renders no SLA card when the form declared none", () => {
    const html = renderToStaticMarkup(<OverviewTab record={recordFor(0)} />);
    expect(html).toContain("What was reported");
    expect(html).not.toContain("SLA target");
  });

  it("renders the SLA card when the form declared one", () => {
    const html = renderToStaticMarkup(<OverviewTab record={recordFor(3)} />);
    expect(html).toContain("SLA target");
    expect(html).toContain("On target");
  });
});
