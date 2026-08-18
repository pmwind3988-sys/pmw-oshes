import { describe, expect, it } from "vitest";
import { buildPdfLayerResults } from "./generateFormPdf";

describe("where a layer keeps its signature", () => {
  const layerConfig = JSON.stringify({
    layers: [{ layerNumber: 3, type: "evaluation", surveyElements: [{ type: "text", name: "Safe", title: "Area is safe" }] }],
  });

  it("finds the ink an evaluation stored inside its own JSON entry", () => {
    // An approval writes `L{n}_Signature`. An evaluation confirmed from the
    // review page writes `EvaluationData[n].signatureUrl` and leaves that column
    // empty, so a signed evaluation printed as a layer that signed nothing.
    const [layer] = buildPdfLayerResults({
      L3_Status: "Confirmed",
      L3_Email: "ashraf@example.com",
      L3_SignedAt: "2026-08-18T10:46:00",
      EvaluationData: JSON.stringify({
        3: {
          status: "confirmed",
          confirmerEmail: "ashraf@example.com",
          confirmerName: "Muhammad Ashraf Bin Azahari",
          confirmedAt: "2026-08-18T10:46:00",
          fields: { Safe: "Yes" },
          signatureUrl: "/sites/oshes/Signature%20Images/eval-3.png",
        },
      }),
    }, 3, layerConfig);

    expect(layer?.signature).toBe("/sites/oshes/Signature%20Images/eval-3.png");
    expect(layer?.confirmerName).toBe("Muhammad Ashraf Bin Azahari");
  });

  it("still prefers the column when the column is the one that was written", () => {
    const [layer] = buildPdfLayerResults({
      L3_Status: "Confirmed",
      L3_Signature: "/sites/oshes/Signature%20Images/column.png",
      EvaluationData: JSON.stringify({
        3: { status: "confirmed", fields: {}, signatureUrl: "/sites/oshes/Signature%20Images/json.png" },
      }),
    }, 3, layerConfig);

    expect(layer?.signature).toBe("/sites/oshes/Signature%20Images/column.png");
  });

  it("claims no signature for an evaluation that stored none", () => {
    const [layer] = buildPdfLayerResults({
      L3_Status: "Confirmed",
      EvaluationData: JSON.stringify({ 3: { status: "confirmed", fields: { Safe: "Yes" }, signatureUrl: null } }),
    }, 3, layerConfig);

    expect(layer?.signature).toBeUndefined();
  });
});
