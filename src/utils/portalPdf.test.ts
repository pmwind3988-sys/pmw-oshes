import { describe, expect, it } from "vitest";
import { recordLayerResults, recordPdfData } from "./portalPdf";
import { describeWorkflow, resolveFormVisibility } from "./formWorkflow";
import { toPortalRecord } from "./portalRecords";
import type {
  ApprovalLayer,
  CatalogueEntry,
  EvaluationLayerResult,
  LayerConfigItem,
  ListMetaEntry,
  PortalRecord,
  Submission,
} from "../types";

/**
 * What the drawer's "Download PDF" claims about a record that is still moving.
 *
 * The document draws whatever it is handed, so this is where the honesty of the
 * page is decided: a layer that has signed reports its decision and its ink, and
 * a layer that has not reports only that it has not.
 */

const META: ListMetaEntry = { icon: "Description", color: "#000", pale: "#fff", category: "General" };
const NOW = new Date("2026-08-18T15:00:00.000Z");

const LAYERS: LayerConfigItem[] = [
  {
    layerNumber: 1,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "nurul@pmw.gov.my" },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel: "Safety Officer",
  },
  {
    layerNumber: 2,
    type: "evaluation",
    authMode: "365",
    assignee: { type: "user", value: "faizal@pmw.gov.my" },
    roleLabel: "Ops Manager",
    surveyElements: [{ type: "text", name: "ControlsChecked", title: "Controls checked on site" }],
  },
  {
    layerNumber: 3,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "hafiz@pmw.gov.my" },
    confirmationType: "signature",
    allowRejectionReason: true,
    roleLabel: "Yard Manager",
  },
];

function entry(): CatalogueEntry {
  const workflow = describeWorkflow(LAYERS);
  const visibility = resolveFormVisibility({ masterFormIsPublic: false });
  return {
    listTitle: "Permit To Work",
    code: "PTW",
    name: "Permit To Work",
    slug: "permit-to-work",
    chain: LAYERS.map((layer) => layer.roleLabel ?? ""),
    layers: LAYERS,
    workflow,
    hasWorkflow: workflow.hasWorkflow,
    slaDays: 0,
    hasSla: false,
    visibility,
    isPublic: visibility.isPublic,
    volume: 0,
    today: 0,
    firstApprover: "Nurul Aziz",
  };
}

const SIGNED_LAYER: ApprovalLayer = {
  status: "approved",
  outcome: "approved",
  email: "nurul@pmw.gov.my",
  signedAt: "2026-08-18T10:02:00.000Z",
  rejectionReason: null,
  signature: "data:image/png;base64,AAAA",
};

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "16",
    submissionId: "16",
    listTitle: "Permit To Work",
    formId: "PTW",
    formVersion: "2",
    title: "Hot work at Berth 4",
    submittedByEmail: "ashraf@pmw-group.com",
    submittedAt: "2026-08-18T03:30:00.000Z",
    formStatus: "In Review",
    totalLayers: 3,
    layers: [SIGNED_LAYER],
    meta: META,
    submissionData: { Location: "Job Location #2" },
    currentLayer: 2,
    referenceNo: "PTW-180826-0016",
    ...overrides,
  };
}

function record(overrides: Partial<Submission> = {}): PortalRecord {
  return toPortalRecord(submission(overrides), entry(), {}, {}, NOW);
}

describe("recordLayerResults", () => {
  it("reports each layer as far as the record has actually got", () => {
    const results = recordLayerResults(record());

    expect(results.map((layer) => layer.status)).toEqual(["Approved", "Pending", "Not started"]);
    expect(results[0].signedAt).toBe("2026-08-18T10:02:00.000Z");
    expect(results[0].signature).toBe("data:image/png;base64,AAAA");
  });

  it("puts nothing on an unsigned layer but the name it is waiting on", () => {
    const [, awaiting, notReached] = recordLayerResults(record());

    // A date, a reason or an ink well against a step nobody has taken is a
    // claim the record cannot support — and an empty signature well reads as a
    // signature that failed to load rather than as one that was never given.
    expect(awaiting.signedAt).toBeUndefined();
    expect(awaiting.signature).toBeUndefined();
    expect(awaiting.rejection).toBeUndefined();
    expect(awaiting.evaluationFields).toBeUndefined();
    expect(awaiting.email).toBe("faizal@pmw.gov.my");
    expect(notReached.email).toBe("hafiz@pmw.gov.my");
  });

  it("carries a finished evaluation's answers, and the questions they answer", () => {
    const confirmed: EvaluationLayerResult = {
      layerNumber: 2,
      type: "evaluation",
      status: "confirmed",
      email: "faizal@pmw.gov.my",
      confirmedAt: "2026-08-18T12:20:00.000Z",
      fields: { ControlsChecked: "Gas test done, fire watch posted" },
    };
    const results = recordLayerResults(record({
      currentLayer: 3,
      layers: [SIGNED_LAYER, { status: "confirmed", outcome: undefined, email: "faizal@pmw.gov.my", signedAt: "2026-08-18T12:20:00.000Z", rejectionReason: null, signature: null }],
      enhancedLayers: [null, confirmed],
    }));

    expect(results[1].status).toBe("Confirmed");
    expect(results[1].evaluationFields).toEqual({ ControlsChecked: "Gas test done, fire watch posted" });
    expect(results[1].evaluationSurveyElements).toHaveLength(1);
    expect(results[1].signedAt).toBe("2026-08-18T12:20:00.000Z");
  });

  it("finds the ink an evaluation kept inside its own stored entry", () => {
    // An approval writes `L{n}_Signature`; an evaluation confirmed from the
    // review page writes `EvaluationData[n].signatureUrl` and leaves that column
    // empty. Reading only the column printed a signed evaluation as a layer that
    // had signed nothing, under an empty rule with the evaluator's name on it.
    const confirmed: EvaluationLayerResult = {
      layerNumber: 2,
      type: "evaluation",
      status: "confirmed",
      email: "faizal@pmw.gov.my",
      confirmedAt: "2026-08-18T12:20:00.000Z",
      fields: { ControlsChecked: "Gas test done" },
      signatureUrl: "/sites/oshes/Signature%20Images/eval-2.png",
    };
    const results = recordLayerResults(record({
      currentLayer: 3,
      layers: [SIGNED_LAYER, { status: "confirmed", outcome: undefined, email: "faizal@pmw.gov.my", signedAt: "2026-08-18T12:20:00.000Z", rejectionReason: null, signature: null }],
      enhancedLayers: [null, confirmed],
    }));

    expect(results[1].signature).toBe("/sites/oshes/Signature%20Images/eval-2.png");
  });

  it("claims no ink for an evaluation that never gave any", () => {
    const confirmed: EvaluationLayerResult = {
      layerNumber: 2,
      type: "evaluation",
      status: "confirmed",
      email: "faizal@pmw.gov.my",
      confirmedAt: "2026-08-18T12:20:00.000Z",
      fields: { ControlsChecked: "Gas test done" },
      signatureUrl: null,
    };
    const results = recordLayerResults(record({
      currentLayer: 3,
      layers: [SIGNED_LAYER, { status: "confirmed", outcome: undefined, email: "faizal@pmw.gov.my", signedAt: "2026-08-18T12:20:00.000Z", rejectionReason: null, signature: null }],
      enhancedLayers: [null, confirmed],
    }));

    expect(results[1].signature).toBeUndefined();
  });

  it("prints a withdrawal on the layer it stopped, with the reason given for it", () => {
    const results = recordLayerResults(record({
      formStatus: "Cancelled",
      layers: [SIGNED_LAYER, {
        status: "cancelled",
        outcome: undefined,
        email: "faizal@pmw.gov.my",
        signedAt: null,
        rejectionReason: "Withdrawn by Ashraf Azahari — duplicate of PTW-180826-0015",
        signature: null,
      }],
      currentLayer: 2,
    }));

    expect(results[1].status).toBe("Cancelled");
    expect(results[1].rejection).toContain("duplicate of PTW-180826-0015");
    expect(results[2].status).toBe("Not started");
  });

  it("treats a layer the chain has moved past as signed, even with no status stored", () => {
    // Older filings advanced CurrentLayer without always writing L{n}_Status.
    // Reporting those as pending would say the chain went backwards.
    const results = recordLayerResults(record({ layers: [], currentLayer: 3 }));

    expect(results.map((layer) => layer.status)).toEqual(["Approved", "Confirmed", "Pending"]);
  });
});

describe("recordPdfData", () => {
  it("hands the document the record's reference, status and answers", () => {
    const data = recordPdfData(record(), null);

    expect(data.meta.referenceNo).toBe("PTW-180826-0016");
    expect(data.meta.formStatus).toBe("In approval");
    expect(data.meta.formVersion).toBe("2");
    expect(data.responseData).toEqual({ Location: "Job Location #2" });
    expect(data.layerResults).toHaveLength(3);
  });
});
