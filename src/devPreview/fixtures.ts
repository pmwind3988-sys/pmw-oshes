/* Dev-only design harness fixtures — see src/devPreview/README.md. */
import { describeWorkflow, resolveFormVisibility } from "../utils/formWorkflow";
import { toPortalRecord } from "../utils/portalRecords";
import { derivePortalAccess } from "../utils/portalRole";
import { DEFAULT_PORTAL_PREFS } from "../utils/portalPrefs";
import type { PortalContextValue } from "../contexts/PortalContext";
import type {
  ApprovalLayerConfig,
  AuditEntry,
  CatalogueEntry,
  PortalRole,
  SharePointClient,
  Submission,
} from "../types";

export const NOW = new Date();
export const ME = "sazali@marinekita.com";

const PEOPLE = [
  { name: "Nurul Aziz", email: "nurul@pmw.gov.my", role: "Safety Officer" },
  { name: "Hafiz Rahman", email: "hafiz@pmw.gov.my", role: "Shift Supervisor" },
  { name: "Chan Wei Ling", email: "weiling@pmw.gov.my", role: "OSHES Manager" },
  { name: "Sazali Rahim", email: ME, role: "Yard Lead" },
];

function layer(layerNumber: number, who: number, slaDays?: number): ApprovalLayerConfig {
  return {
    layerNumber,
    type: layerNumber === 1 ? "evaluation" : "approval",
    authMode: "365",
    assignee: { type: "user", value: PEOPLE[who].email },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel: PEOPLE[who].role,
    ...(slaDays ? { slaDays } : {}),
  } as ApprovalLayerConfig;
}

function entry(
  overrides: Partial<CatalogueEntry> & Pick<CatalogueEntry, "listTitle" | "code" | "name">,
): CatalogueEntry {
  const layers = overrides.layers ?? [layer(1, 0), layer(2, 2)];
  const workflow = describeWorkflow(layers);
  const visibility = resolveFormVisibility({ masterFormIsPublic: overrides.isPublic ?? false });
  const slaDays = overrides.slaDays ?? 0;
  return {
    slug: overrides.name.toLowerCase().replace(/\s+/g, "-"),
    chain: layers.map((item) => item.roleLabel ?? ""),
    layers,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays,
    hasSla: workflow.hasWorkflow && slaDays > 0,
    visibility,
    isPublic: visibility.isPublic,
    severityCapture: "optional",
    volume: 0,
    today: 0,
    firstApprover: PEOPLE[0].name,
    ...overrides,
  } as CatalogueEntry;
}

const CATALOGUE: CatalogueEntry[] = [
  entry({ listTitle: "Permit To Work", code: "PTW", name: "Permit To Work", slaDays: 3, today: 4, volume: 22 }),
  entry({ listTitle: "Incident Report", code: "IR", name: "Incident Report", isPublic: true, slaDays: 2, today: 6, volume: 31 }),
  entry({ listTitle: "Chemical Spill", code: "CS", name: "Chemical Spill Report", slaDays: 1, today: 2, volume: 9 }),
  entry({ listTitle: "Toolbox Talk", code: "TBT", name: "Toolbox Talk Record", layers: [], today: 3, volume: 14 }),
  entry({ listTitle: "Hot Work Clearance", code: "HWC", name: "Hot Work Clearance", today: 1, volume: 7 }),
  entry({ listTitle: "Confined Space Entry", code: "CSE", name: "Confined Space Entry", slaDays: 2, today: 0, volume: 4 }),
];

const SUBJECTS = [
  "Hot work at Berth 3",
  "Slip near the paint store",
  "Hydraulic oil on Dock 2",
  "Scaffold inspection, Bay 7",
  "Near miss — forklift aisle",
  "Ammonia smell, cold store",
  "Grinder guard missing",
  "Blocked fire exit, Block C",
  "Crane load test overdue",
  "Welding fume extraction fault",
  "Chemical drum unlabelled",
  "Fall arrest anchor damaged",
];
const LOCATIONS = ["Berth 3", "Dock 2", "Block C", "Bay 7", "Cold store", "Paint store", "Yard North"];
const SEVERITIES = ["High", "Medium", "Low", ""];
const STATUSES = ["In Review", "Approved", "Rejected", "Cancelled", "Returned"] as const;

/** Deterministic pseudo-random, so the harness looks the same on every reload. */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function buildSubmissions(): Submission[] {
  const random = seeded(20260817);
  const rows: Submission[] = [];

  for (let index = 0; index < 46; index += 1) {
    const form = CATALOGUE[Math.floor(random() * CATALOGUE.length)];
    const daysAgo = Math.floor(random() ** 2 * 15);
    const filed = new Date(NOW.getTime() - daysAgo * 86_400_000 - Math.floor(random() * 20) * 3_600_000);
    const status = STATUSES[Math.floor(random() * (index % 3 === 0 ? 2 : STATUSES.length))];
    const total = form.layers.length;
    const mine = index % 4 === 0;
    // A third of the open ones sit on the signed-in account's own layer, so the
    // queue, the "waiting on you" tile and the to-do widget all have rows.
    const onMe = total > 0 && status === "In Review" && index % 3 === 0;

    rows.push({
      id: String(1000 + index),
      submissionId: String(1000 + index),
      listTitle: form.listTitle,
      formId: form.code,
      formVersion: "1",
      title: SUBJECTS[index % SUBJECTS.length],
      submittedByEmail: mine ? ME : PEOPLE[index % 3].email,
      submittedBy: mine ? "Sazali Rahim" : PEOPLE[index % 3].name,
      submittedAt: filed.toISOString(),
      formStatus: status,
      totalLayers: total,
      currentLayer: total === 0 ? 0 : onMe ? total : 1,
      layers: [],
      submissionData: {
        WhatHappened: SUBJECTS[index % SUBJECTS.length],
        Location: LOCATIONS[index % LOCATIONS.length],
        Severity: SEVERITIES[index % SEVERITIES.length],
      },
    } as unknown as Submission);
  }

  return rows;
}

const AUDIT: AuditEntry[] = Array.from({ length: 9 }, (_, index) => ({
  at: new Date(NOW.getTime() - index * 5_400_000).toISOString(),
  whenLabel: `${index * 2 + 1} h ago`,
  reference: `IR-2026-${String(120 + index).padStart(4, "0")}`,
  who: PEOPLE[index % PEOPLE.length].name,
  event: ["Signed layer 1", "Nudged approver", "Reassigned to Chan Wei Ling", "Filed", "Cancelled — duplicate"][index % 5],
}));

export function fixtureContext(role: PortalRole, overrides: Partial<PortalContextValue> = {}): PortalContextValue {
  const catalogue = CATALOGUE;
  const records = buildSubmissions().map((submission) => {
    const form = catalogue.find((item) => item.listTitle === submission.listTitle)!;
    // Assignment overrides are keyed by layer number, which is what puts items
    // on this account's layer without a signed-in SharePoint session.
    const onMe = submission.totalLayers > 0 && submission.currentLayer === submission.totalLayers;
    return toPortalRecord(submission, form, {}, onMe ? { [String(submission.currentLayer)]: ME } : {}, NOW);
  });

  const access = derivePortalAccess({
    userEmail: ME,
    isAdmin: role === "admin",
    isAuditor: role === "auditor",
    catalogue,
    records,
  });

  return {
    role,
    access,
    userEmail: ME,
    userName: "Sazali Rahim",
    userTitle: "Yard Lead",
    isAdmin: role === "admin",
    spClient: {} as SharePointClient,
    // PeopleDirectory is Record<email, name> — a plain string, not an object.
    directory: Object.fromEntries(PEOPLE.map((person) => [person.email, person.name])),
    records,
    myRecords: records.filter((record) => record.submitterEmail === ME),
    queue: records.filter(
      (record) => record.hasWorkflow && !record.done && !record.returned && record.currentAssigneeEmail === ME,
    ),
    catalogue,
    audit: AUDIT,
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
    removeRecord: () => {},
    appendAudit: () => {},
    updateCatalogue: () => {},
    toast: () => {},
    onSignOut: () => {},
    ...overrides,
  } as PortalContextValue;
}
