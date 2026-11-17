import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PortalProvider, type PortalContextValue } from "../../contexts/PortalContext";
import { greetingFor } from "../../utils/portalWork";
import { describeWorkflow, resolveFormVisibility } from "../../utils/formWorkflow";
import { toPortalRecord } from "../../utils/portalRecords";
import { derivePortalAccess } from "../../utils/portalRole";
import { DEFAULT_PORTAL_PREFS } from "../../utils/portalPrefs";
import HomeScreen from "./HomeScreen";
import RecordsScreen from "./RecordsScreen";
import SmokingSettingsTab from "../../components/smoking/SmokingSettingsTab";
import { OverviewTab } from "../../components/portal/RecordDetail";
import PortalShell from "../../components/portal/PortalShell";
import { FormPickerList } from "../../components/portal/FormPickerDialog";
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
    focusSubsScope: null,
    searchSeed: "",
    searchSeedAt: 0,
    submitSearch: () => {},
    prefs: DEFAULT_PORTAL_PREFS,
    setPrefs: () => {},
    drawerRef: null,
    openDrawer: () => {},
    closeDrawer: () => {},
    nudged: {},
    markNudged: () => {},
    applyPatch: () => {},
    removeRecord: () => {},
    appendAudit: () => {},
    updateCatalogue: () => {},
    recentRefs: [],
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
  it("offers each form to start, with its sign-off count", () => {
    const html = render(<HomeScreen />, contextValue());
    expect(html).toContain("Start a form");
    expect(html).toContain("Permit To Work");
    expect(html).toContain("1 sign-off");
  });

  it("opens Filed by you with an empty state for an account with nothing filed", () => {
    const html = render(<HomeScreen />, contextValue({ catalogue: [], records: [], myRecords: [] }));
    expect(html).toContain("Nothing here yet");
    expect(html).not.toContain("Start a form");
  });

  it("greets the signed-in person by first name with nothing waiting", () => {
    const html = render(<HomeScreen />, contextValue());
    expect(html).toContain(`${greetingFor(new Date())}, Sazali.`);
    expect(html).not.toContain("waiting for your signature");
  });

  it("says how many forms are waiting and opens Needs you when there are some", () => {
    const queue = [
      toPortalRecord(submission(), entry(), {}, {}, NOW),
      toPortalRecord(submission({ id: "143", title: "Second permit" }), entry(), {}, {}, NOW),
    ];
    const base = contextValue();
    const html = render(<HomeScreen />, contextValue({ queue, access: { ...base.access, isAssignee: true } }));
    expect(html).toContain("2 forms are waiting for your signature.");
    expect(html).toContain("Review");
  });

  it("hides Needs you from a read-only account", () => {
    const base = contextValue();
    const html = render(<HomeScreen />, contextValue({ access: { ...base.access, readOnly: true } }));
    expect(html).not.toContain("Needs you");
    expect(html).toContain("Viewed recently");
  });

  it("hides Needs you from an account that is named on no layer, even with a queue", () => {
    const base = contextValue();
    const queue = [toPortalRecord(submission(), entry(), {}, {}, NOW)];
    const html = render(
      <HomeScreen />,
      contextValue({ queue, access: { ...base.access, readOnly: false, isAssignee: false } }),
    );
    expect(html).not.toContain("Needs you");
    expect(html).not.toContain("waiting for your signature");
    expect(html).toContain("Filed by you");
  });

  it("drops the statistics the page used to carry", () => {
    const withSla = entry({ slaDays: 3 });
    const records = [toPortalRecord(submission(), withSla, {}, {}, NOW)];
    const html = render(<HomeScreen />, contextValue({ catalogue: [withSla], records }));
    expect(html).not.toContain("Where records stand");
    expect(html).not.toContain("Intake, last 14 days");
  });
});

/** The page's words, without the markup or the comments React leaves between text pieces. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, "");
}

describe("RecordsScreen", () => {
  it("opens pre-filtered to the form it was sent with", () => {
    const html = render(
      <RecordsScreen />,
      contextValue({ focusForm: "Permit To Work", focusStatus: "open" }),
    );
    expect(html).toContain("Submissions");
    expect(visibleText(html)).toContain("Permit To Work");
  });

  it("drops the Past SLA filter option where no form has an SLA", () => {
    const html = render(<RecordsScreen />, contextValue());
    expect(html).not.toContain("Past SLA");
  });

  it("shows the list as a table with a Reference column", () => {
    const html = render(<RecordsScreen />, contextValue());
    expect(html).toContain("<table");
    expect(html).toContain("Reference");
    expect(html).toContain("Updated");
  });

  it("pages 60 records 25 at a time", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      toPortalRecord(submission({ id: String(200 + index), title: `Permit ${index}` }), entry(), {}, {}, NOW),
    );
    const html = render(<RecordsScreen />, contextValue({ records: many }));
    expect(visibleText(html)).toContain("Showing 1–25 of 60");
  });

  it("hides Needs me from an auditor", () => {
    const base = contextValue();
    const auditor = derivePortalAccess({
      userEmail: ME,
      isAdmin: false,
      isAuditor: true,
      catalogue: base.catalogue,
      records: base.records,
    });
    const html = render(<RecordsScreen />, contextValue({ access: auditor }));
    expect(html).not.toContain("Needs me");
    expect(html).toContain("All");
    expect(html).toContain("Mine");
  });

  it("offers Needs me to an account that sits on a layer", () => {
    const onMyLayer = entry({ layers: [layer(1, ME, "Approver")] });
    const records = [toPortalRecord(submission(), onMyLayer, {}, {}, NOW)];
    const access = derivePortalAccess({ userEmail: ME, isAdmin: false, isAuditor: false, catalogue: [onMyLayer], records });
    const html = render(<RecordsScreen />, contextValue({ access, catalogue: [onMyLayer], records, queue: records }));
    expect(html).toContain("Needs me");
  });

  it("draws the board with its four columns when the view is set to board", () => {
    const html = render(
      <RecordsScreen />,
      contextValue({ prefs: { ...DEFAULT_PORTAL_PREFS, subsView: "board" } }),
    );
    expect(html).not.toContain("<table");
    for (const title of ["Waiting for you", "In approval", "Returned", "Done"]) {
      expect(html).toContain(title);
    }
  });

  it("says nothing matches when the search finds nothing", () => {
    const html = render(<RecordsScreen />, contextValue({ searchSeed: "no-such-record-xyz" }));
    expect(html).toContain("Nothing matches");
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

describe("SmokingSettingsTab", () => {
  it("shows the three scan limits, with Save for an admin", () => {
    const html = render(<SmokingSettingsTab />, contextValue());
    expect(html).toContain("Settings");
    expect(html).toContain("Save");
    expect(html).toContain("0 turns a limit off");
  });

  it("offers no Save to a read-only account", () => {
    const value = contextValue();
    const html = render(<SmokingSettingsTab />, { ...value, access: { ...value.access, readOnly: true } });
    expect(html).not.toContain(">Save<");
  });
});

describe("PortalShell", () => {
  it("shows Your work, Submissions and Manage with a Create button to an administrator", () => {
    const html = render(<PortalShell><span /></PortalShell>, contextValue());
    expect(html).toContain("Your work");
    expect(html).toContain("Submissions");
    expect(html).toContain("Manage");
    expect(html).toContain("Create");
  });

  it("shows the search box with its placeholder", () => {
    const html = render(<PortalShell><span /></PortalShell>, contextValue());
    expect(html).toContain('placeholder="Search forms or PTW-0417"');
  });

  it("shows no Manage tab to a submitter, but keeps Create", () => {
    const catalogue = [entry()];
    const records = [toPortalRecord(submission(), catalogue[0], {}, {}, NOW)];
    const access = derivePortalAccess({ userEmail: ME, isAdmin: false, isAuditor: false, catalogue, records });
    const html = render(
      <PortalShell><span /></PortalShell>,
      contextValue({ access, role: access.role, isAdmin: false, catalogue, records }),
    );
    expect(html).toContain("Submissions");
    expect(html).not.toContain("Manage");
    expect(html).toContain("Create");
  });

  it("offers no Create to a read-only account", () => {
    const catalogue = [entry()];
    const records = [toPortalRecord(submission(), catalogue[0], {}, {}, NOW)];
    const access = derivePortalAccess({ userEmail: ME, isAdmin: false, isAuditor: true, catalogue, records });
    const html = render(
      <PortalShell><span /></PortalShell>,
      contextValue({ access, role: access.role, isAdmin: false, catalogue, records }),
    );
    expect(html).not.toContain("Create");
  });
});

describe("FormPickerList", () => {
  it("lists each published form by name", () => {
    const catalogue = [entry(), entry({ listTitle: "Hot Work", name: "Hot Work", code: "HW", slug: "hot-work" })];
    const html = render(<FormPickerList catalogue={catalogue} onPick={() => {}} />, contextValue());
    expect(html).toContain("Permit To Work");
    expect(html).toContain("Hot Work");
  });

  it("says no forms are published when the catalogue is empty", () => {
    const html = render(<FormPickerList catalogue={[]} onPick={() => {}} />, contextValue());
    expect(html).toContain("No forms yet");
    expect(html).toContain("Forms appear here once they are published.");
  });
});
